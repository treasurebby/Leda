"""The Sabi engine: an LLM turns a transcript and/or photo plus the business's catalog into a structured order
with per-line confidence and explicit flags for anything ambiguous.

Two interchangeable implementations share the same prompt and DecodedOrder schema: ClaudeDecoder (Anthropic)
and OpenAIDecoder. Pick with the DECODER setting; "auto" uses whichever key is configured."""

import base64
import json
import re
from dataclasses import dataclass, field
from typing import Literal, Protocol

from pydantic import BaseModel, Field

from app.core.config import settings


class DecodedLine(BaseModel):
    sku: str = Field(description="SKU from the catalog. Use the closest match; never invent a SKU.")
    quantity: int = Field(ge=1)
    confidence: int = Field(ge=0, le=100, description="How sure you are about BOTH the product and the quantity.")
    reasoning: str = Field(description="One sentence: which words in the message led to this line.")


class DecodedOption(BaseModel):
    label: str = Field(description="Human-readable option, e.g. '55 bags of Royal Stallion 50kg'.")
    sku: str | None = Field(default=None, description="Set when the option changes the product.")
    quantity: int | None = Field(default=None, description="Set when the option changes the quantity.")


class DecodedFlag(BaseModel):
    kind: Literal["voice", "photo", "slang"]
    line_index: int | None = Field(description="Index into lines this flag is about, or null if none.")
    issue: str = Field(description="Short headline, e.g. 'Quantity unclear (54% confidence)'.")
    quote: str = Field(description="The exact words or a description of the image region that caused doubt.")
    why: str = Field(description="Plain-language explanation a distributor can act on, including the money at stake.")
    options: list[DecodedOption] = Field(min_length=2, max_length=4)
    confidence: int = Field(ge=0, le=100)


class DecodedInquiry(BaseModel):
    """A 'do you have X?' style question, matched to the catalog where possible."""

    query: str = Field(description="What the retailer asked about, in their words.")
    sku: str | None = Field(description="Matching catalog SKU, or null if nothing in the catalog fits.")


class DecodedOrder(BaseModel):
    intent: Literal["order", "inquiry", "mixed", "other"] = Field(
        description="order = they want to buy; inquiry = asking availability/price; mixed = both; other = greeting, "
        "complaint, or unrelated."
    )
    retailer_guess: str | None = Field(description="Retailer or shop name if the message says it, else null.")
    lines: list[DecodedLine] = Field(description="Items they want to buy. Empty for a pure inquiry.")
    inquiries: list[DecodedInquiry] = Field(default_factory=list, description="Availability/price questions.")
    unmatched: list[str] = Field(
        default_factory=list, description="Items mentioned that are not in the catalog (e.g. 'cucumber')."
    )
    flags: list[DecodedFlag]
    summary: str = Field(description="One sentence summary of what the retailer wants.")


class DecodedCatalogItem(BaseModel):
    name: str = Field(description="Product name as a distributor would list it, e.g. 'Royal Stallion Parboiled Rice'.")
    unit: str | None = Field(description="Pack size / unit if stated, e.g. 'Bag 50kg', 'Keg 25L', 'Carton 70'.")
    price: float | None = Field(description="Selling price in naira as a number, or null if not stated.")
    aliases: list[str] = Field(default_factory=list, description="Short names or slang for this product, if any.")
    confidence: int = Field(ge=0, le=100, description="How sure you are about name, unit AND price together.")
    note: str | None = Field(default=None, description="Why confidence is low, e.g. 'two prices listed'.")


class DecodedCatalog(BaseModel):
    items: list[DecodedCatalogItem]
    summary: str = Field(description="One sentence, e.g. '14 products with prices, 2 without a price'.")


CATALOG_PROMPT = """You are Sabi, helping a Nigerian wholesale distributor set up their product catalog on Leda.
They have sent their price list: typed text, a photo of a price board or supplier sheet, or a voice note reading it.
Extract every product with its pack size and selling price in naira. Rules:
- One item per product + pack size ("Rice 50kg" and "Rice 25kg" are two items).
- Prices like "78,500", "78.5k", "₦78500", "78500 naira" all mean 78500. If a line has no price, set price null.
- Keep the distributor's naming; put obvious nicknames in aliases.
- Never invent products or prices. Lower confidence when handwriting or audio is unclear and say why in note."""


@dataclass
class CatalogInput:
    text: str | None = None
    transcript: str | None = None
    image: tuple[bytes, str] | None = None


@dataclass
class DecodeInput:
    catalog: list[dict]  # [{sku, name, unit, price, aliases}]
    retailer_name: str | None
    recent_skus: list[str]
    transcript: str | None = None
    text: str | None = None
    image: tuple[bytes, str] | None = None  # (bytes, mime)


class Decoder(Protocol):
    async def decode(self, data: DecodeInput) -> DecodedOrder: ...
    async def extract_catalog(self, data: CatalogInput) -> DecodedCatalog: ...


SYSTEM_PROMPT = """You are Sabi, the order-decoding engine for Leda, used by wholesale distributors in Nigeria.
Retailers send orders over WhatsApp as voice notes (transcribed for you), short texts in English or Nigerian Pidgin,
or photos of handwritten order slips and products. Your job: turn the message into structured order lines against
the distributor's catalog, and be honest about uncertainty.

Rules:
- Only use SKUs from the catalog. If nothing fits, leave the item out and raise a flag with the closest options.
- Quantities: "like fifty" means about 50; "make e remain small" means leave a little extra, so 50 vs 55 is a
  genuine ambiguity — raise a flag with both options rather than guessing. "Half bag" is not a catalog unit unless
  the catalog has one; flag it.
- Slang and nicknames (e.g. "the yellow one") are listed under each product's aliases. If two products share a
  nickname, raise a 'slang' flag with both as options.
- For photos of handwritten slips, read every line; for product photos, match by label, colour and pack size and
  raise a 'photo' flag when the match is below 85.
- Confidence below 85 on a line means a human must check it; the distributor's money is on the line, so prefer a
  flag over a confident guess. Mention the naira difference between options in 'why' when you can compute it.
- Never invent products, retailers, or prices.
- Distinguish intent. "Do you have onion?" or "how much is rice?" is an inquiry: put it in inquiries with the
  matching SKU (or null). "Send me 20 bags" is an order line. A message can be both. Anything requested that is not
  in the catalog goes in unmatched, in the retailer's words, so the reply can say it is not stocked."""


def _catalog_block(catalog: list[dict]) -> str:
    rows = []
    for p in catalog:
        alias = f" (also called: {', '.join(p['aliases'])})" if p.get("aliases") else ""
        rows.append(f"- {p['sku']}: {p['name']}, {p.get('unit') or 'unit'}, ₦{float(p['price']):,.0f}{alias}")
    return "\n".join(rows)


class ClaudeDecoder:
    def __init__(self, api_key: str, model: str):
        from anthropic import AsyncAnthropic

        self.client = AsyncAnthropic(api_key=api_key)
        self.model = model

    async def decode(self, data: DecodeInput) -> DecodedOrder:
        context = f"Catalog:\n{_catalog_block(data.catalog)}"
        if data.retailer_name:
            context += f"\n\nSender is a known retailer: {data.retailer_name}."
        if data.recent_skus:
            context += f"\nThey usually order: {', '.join(data.recent_skus)}."
        content: list[dict] = []
        if data.image:
            b, mime = data.image
            content.append(
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": mime, "data": base64.standard_b64encode(b).decode()},
                }
            )
        message_parts = []
        if data.transcript:
            message_parts.append(f'Voice note transcript (Whisper, may contain errors):\n"""{data.transcript}"""')
        if data.text:
            message_parts.append(f'Text message:\n"""{data.text}"""')
        if data.image:
            message_parts.append("The image above was sent with the order.")
        content.append({"type": "text", "text": "\n\n".join(message_parts) + "\n\nDecode this into order lines."})

        response = await self.client.beta.messages.parse(
            model=self.model,
            max_tokens=16000,
            system=[
                {"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}},
                {"type": "text", "text": context, "cache_control": {"type": "ephemeral"}},
            ],
            messages=[{"role": "user", "content": content}],
            output_format=DecodedOrder,
            thinking={"type": "adaptive"},
            output_config={"effort": "high"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        if response.stop_reason == "refusal":
            raise RuntimeError(f"Decoder refused: {getattr(response.stop_details, 'explanation', '')}")
        parsed = response.parsed_output
        if parsed is None:
            text = next((b.text for b in response.content if b.type == "text"), "{}")
            parsed = DecodedOrder.model_validate(json.loads(text))
        return parsed

    async def extract_catalog(self, data: CatalogInput) -> DecodedCatalog:
        content: list[dict] = []
        if data.image:
            b, mime = data.image
            content.append(
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": mime, "data": base64.standard_b64encode(b).decode()},
                }
            )
        content.append({"type": "text", "text": _catalog_user_text(data)})
        response = await self.client.beta.messages.parse(
            model=self.model,
            max_tokens=16000,
            system=[{"type": "text", "text": CATALOG_PROMPT, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": content}],
            output_format=DecodedCatalog,
            thinking={"type": "adaptive"},
            output_config={"effort": "high"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        if response.stop_reason == "refusal":
            raise RuntimeError(f"Decoder refused: {getattr(response.stop_details, 'explanation', '')}")
        parsed = response.parsed_output
        if parsed is None:
            text = next((b.text for b in response.content if b.type == "text"), "{}")
            parsed = DecodedCatalog.model_validate(json.loads(text))
        return parsed


def _catalog_user_text(data: CatalogInput) -> str:
    parts = []
    if data.transcript:
        parts.append(f'Voice note transcript (Whisper, may contain errors):\n"""{data.transcript}"""')
    if data.text:
        parts.append(f'Price list text:\n"""{data.text}"""')
    if data.image:
        parts.append("The image above is the price list.")
    return "\n\n".join(parts) + "\n\nExtract the catalog."


def _user_text(data: DecodeInput) -> str:
    parts = []
    if data.transcript:
        parts.append(f'Voice note transcript (Whisper, may contain errors):\n"""{data.transcript}"""')
    if data.text:
        parts.append(f'Text message:\n"""{data.text}"""')
    if data.image:
        parts.append("The image above was sent with the order.")
    return "\n\n".join(parts) + "\n\nDecode this into order lines."


def _context(data: DecodeInput) -> str:
    context = f"Catalog:\n{_catalog_block(data.catalog)}"
    if data.retailer_name:
        context += f"\n\nSender is a known retailer: {data.retailer_name}."
    if data.recent_skus:
        context += f"\nThey usually order: {', '.join(data.recent_skus)}."
    return context


class OpenAIDecoder:
    """Same job as ClaudeDecoder via the OpenAI Responses API with a Pydantic-typed structured output."""

    def __init__(self, api_key: str, model: str):
        from openai import AsyncOpenAI

        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model

    async def decode(self, data: DecodeInput) -> DecodedOrder:
        content: list[dict] = []
        if data.image:
            b, mime = data.image
            content.append(
                {"type": "input_image", "image_url": f"data:{mime};base64,{base64.standard_b64encode(b).decode()}"}
            )
        content.append({"type": "input_text", "text": _user_text(data)})
        response = await self.client.responses.parse(
            model=self.model,
            instructions=SYSTEM_PROMPT + "\n\n" + _context(data),
            input=[{"role": "user", "content": content}],
            text_format=DecodedOrder,
            reasoning={"effort": "medium"},
        )
        parsed = response.output_parsed
        if parsed is None:
            raise RuntimeError(f"OpenAI decoder returned no parsable output (status={response.status})")
        return parsed

    async def extract_catalog(self, data: CatalogInput) -> DecodedCatalog:
        content: list[dict] = []
        if data.image:
            b, mime = data.image
            content.append(
                {"type": "input_image", "image_url": f"data:{mime};base64,{base64.standard_b64encode(b).decode()}"}
            )
        content.append({"type": "input_text", "text": _catalog_user_text(data)})
        response = await self.client.responses.parse(
            model=self.model,
            instructions=CATALOG_PROMPT,
            input=[{"role": "user", "content": content}],
            text_format=DecodedCatalog,
            reasoning={"effort": "medium"},
        )
        parsed = response.output_parsed
        if parsed is None:
            raise RuntimeError(f"OpenAI decoder returned no parsable output (status={response.status})")
        return parsed


@dataclass
class FakeDecoder:
    """Deterministic decoder for tests and local dev. Reproduces the demo's LE-1041 scenario:
    a clear rice line, a quantity flag on it, and a slang flag on 'the yellow one'."""

    calls: list[DecodeInput] = field(default_factory=list)
    result: DecodedOrder | None = None

    async def decode(self, data: DecodeInput) -> DecodedOrder:
        self.calls.append(data)
        if self.result is not None:
            return self.result
        skus = {p["sku"] for p in data.catalog}
        aliases = [(a.lower(), p) for p in data.catalog for a in p.get("aliases", [])]
        text = " ".join(filter(None, [data.transcript, data.text])).lower()
        lines: list[DecodedLine] = []
        flags: list[DecodedFlag] = []
        if "royal stallion" in text and "RSR-50" in skus:
            lines.append(
                DecodedLine(sku="RSR-50", quantity=50, confidence=54, reasoning="'like fifty bags of Royal Stallion'")
            )
            if "remain small" in text:
                flags.append(
                    DecodedFlag(
                        kind="voice",
                        line_index=0,
                        issue="Quantity unclear (54% confidence)",
                        quote="Send me like fifty, make e remain small.",
                        why=(
                            "'Like fifty' with 'make e remain small' could mean 50 bags or 55 bags. "
                            "The difference is ₦392,500."
                        ),
                        options=[
                            DecodedOption(label="50 bags of Royal Stallion 50kg", quantity=50),
                            DecodedOption(label="55 bags of Royal Stallion 50kg", quantity=55),
                        ],
                        confidence=54,
                    )
                )
        if "yellow one" in text:
            matches = [p for a, p in aliases if "yellow" in a]
            if len(matches) >= 2:
                lines.append(
                    DecodedLine(
                        sku=matches[0]["sku"], quantity=15, confidence=71, reasoning="'15 kegs of the yellow one'"
                    )
                )
                flags.append(
                    DecodedFlag(
                        kind="slang",
                        line_index=len(lines) - 1,
                        issue="Two products share this slang",
                        quote="Add 15 kegs of the yellow one.",
                        why=(
                            f"'Yellow one' could be {matches[0]['name']} or {matches[1]['name']}. "
                            "Both are in your catalog."
                        ),
                        options=[
                            DecodedOption(label=f"{m['name']} {m.get('unit') or ''}".strip(), sku=m["sku"])
                            for m in matches[:2]
                        ],
                        confidence=71,
                    )
                )
            elif matches:
                lines.append(DecodedLine(sku=matches[0]["sku"], quantity=15, confidence=92, reasoning="alias match"))
        if data.image and not lines and "MGR-50" in skus:
            lines.append(DecodedLine(sku="MGR-50", quantity=20, confidence=62, reasoning="stacked 50kg bags in photo"))
            flags.append(
                DecodedFlag(
                    kind="photo",
                    line_index=0,
                    issue="Product match 62%",
                    quote="[Blurry photo of stacked bags]",
                    why="The stitching pattern matches Royal Stallion, but the label looks closer to Mama Gold.",
                    options=[
                        DecodedOption(label="Royal Stallion Parboiled 50kg", sku="RSR-50"),
                        DecodedOption(label="Mama Gold Premium 50kg", sku="MGR-50"),
                    ],
                    confidence=62,
                )
            )
        if not lines:
            # Plain text like "20 bags MGR-50": pick any SKU literally mentioned.
            for sku in skus:
                if re.search(rf"\b{re.escape(sku.lower())}\b", text):
                    lines.append(DecodedLine(sku=sku, quantity=20, confidence=96, reasoning="SKU named in message"))
        inquiries: list[DecodedInquiry] = []
        unmatched: list[str] = []
        if "do you have" in text or "how much" in text:
            # "do you have tomato? how much is rice?" -> one inquiry per catalog name/alias found, else unmatched.
            asked = re.split(r"do you have|how much is|how much for|[?,.]", text)
            for phrase in (a.strip() for a in asked if a.strip()):
                hit = next((p for p in data.catalog if phrase in p["name"].lower()), None) or next(
                    (p for a, p in aliases if phrase == a), None
                )
                if hit:
                    inquiries.append(DecodedInquiry(query=phrase, sku=hit["sku"]))
                elif phrase not in {"the", "this", "it", "and", "please", "abeg"}:
                    unmatched.append(phrase)
                    inquiries.append(DecodedInquiry(query=phrase, sku=None))
        intent = "mixed" if lines and inquiries else "order" if lines else "inquiry" if inquiries else "other"
        return DecodedOrder(
            intent=intent,
            retailer_guess=None,
            lines=lines,
            inquiries=inquiries,
            unmatched=unmatched,
            flags=flags,
            summary="fake decode",
        )

    async def extract_catalog(self, data: CatalogInput) -> DecodedCatalog:
        """Parses lines like 'Royal Stallion Rice 50kg - 78,500' or 'Kings Oil 25L: 96.5k'."""
        text = "\n".join(filter(None, [data.text, data.transcript]))
        if data.image and not text:
            text = (
                "Royal Stallion Parboiled Rice 50kg - 78,500\nMama Gold Premium Rice 50kg - 77,200\n"
                "Kings Vegetable Oil 25L - 96,500"
            )
        items: list[DecodedCatalogItem] = []
        for raw in text.splitlines():
            line = raw.strip(" •-*\t")
            if not line:
                continue
            m = re.match(
                r"^(?P<name>.+?)\s*[-–:=]\s*(?:₦|ngn)?\s*(?P<price>[\d.,]+)\s*(?P<k>k)?\s*(?:naira)?\s*$", line, re.I
            )
            if not m:
                items.append(
                    DecodedCatalogItem(name=line[:120], unit=None, price=None, confidence=40, note="no price found")
                )
                continue
            price = float(m.group("price").replace(",", "")) * (1000 if m.group("k") else 1)
            name = m.group("name").strip()
            unit_m = re.search(r"(\d+\s?(?:kg|l|ltr|litre|pcs|ctn|carton))\b", name, re.I)
            unit = unit_m.group(1) if unit_m else None
            items.append(DecodedCatalogItem(name=name, unit=unit, price=price, confidence=95))
        priced = sum(1 for i in items if i.price is not None)
        return DecodedCatalog(items=items, summary=f"{len(items)} products, {priced} with prices")


_default: Decoder | None = None


def get_decoder() -> Decoder:
    global _default
    if _default is None:
        _default = (
            ClaudeDecoder(settings.anthropic_api_key, settings.claude_model)
            if settings.anthropic_api_key
            else FakeDecoder()
        )
    return _default


def set_decoder(d: Decoder | None) -> None:
    global _default
    _default = d
