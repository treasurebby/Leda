"""Two easy roads into the catalog.

1. Price list -> draft -> apply. The owner forwards their price list (text, photo, voice) on WhatsApp or pastes /
   snaps it in onboarding; Sabi extracts products; the owner says YES (or edits) and they're upserted.
2. Demand -> product requests. Anything a retailer asked for that isn't stocked is recorded once, counted, and
   can be turned into a product with one call.
"""

import re
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import utcnow
from app.integrations.claude import CatalogInput, DecodedCatalog, Decoder
from app.integrations.whisper import Transcriber
from app.models import (
    Business,
    CatalogDraft,
    CatalogDraftStatus,
    Membership,
    Product,
    ProductRequest,
    ProductRequestStatus,
    User,
)

STOPWORDS = {"the", "this", "it", "and", "please", "abeg", "some", "any", "a", "an", "of"}


class CatalogError(Exception):
    pass


# ---------------------------------------------------------------- owner detection
async def is_owner_number(db: AsyncSession, business: Business, phone: str) -> bool:
    """A message from the business's own number, or any team member's phone, is the owner talking to Leda."""
    if business.whatsapp_number and business.whatsapp_number == phone:
        return True
    member = await db.scalar(
        select(User.id)
        .join(Membership, Membership.user_id == User.id)
        .where(Membership.business_id == business.id, User.phone == phone)
    )
    return member is not None


# ---------------------------------------------------------------- extraction
async def extract(
    decoder: Decoder,
    transcriber: Transcriber,
    *,
    text: str | None = None,
    audio: tuple[bytes, str] | None = None,
    image: tuple[bytes, str] | None = None,
) -> DecodedCatalog:
    transcript = None
    if audio:
        transcript = await transcriber.transcribe(audio[0], audio[1], [])
    if not (text or transcript or image):
        raise CatalogError("Send the price list as text, a photo, or a voice note.")
    return await decoder.extract_catalog(CatalogInput(text=text, transcript=transcript, image=image))


def sku_for(name: str, existing: set[str]) -> str:
    """Deterministic, readable SKU from the name: 'Royal Stallion Parboiled Rice 50kg' -> 'RSPR-50'."""
    words = [w for w in re.split(r"[^A-Za-z0-9]+", name) if w]
    alpha = [w for w in words if w[0].isalpha()]
    # Initials for multi-word names (RSPR), the first three letters for single words (CUC).
    letters = ("".join(w[0] for w in alpha)[:5] if len(alpha) > 1 else (alpha[0][:3] if alpha else "PRD")).upper()
    digits = next((re.sub(r"\D", "", w) for w in words if any(c.isdigit() for c in w)), "")
    base = f"{letters}-{digits}" if digits else letters
    sku, n = base, 2
    while sku in existing:
        sku, n = f"{base}-{n}", n + 1
    return sku


async def create_draft(db: AsyncSession, business_id: uuid.UUID, source: str, decoded: DecodedCatalog) -> CatalogDraft:
    draft = CatalogDraft(
        business_id=business_id,
        source=source,
        items=[item.model_dump() for item in decoded.items],
    )
    db.add(draft)
    await db.flush()
    return draft


async def pending_draft(db: AsyncSession, business_id: uuid.UUID) -> CatalogDraft | None:
    return await db.scalar(
        select(CatalogDraft)
        .where(CatalogDraft.business_id == business_id, CatalogDraft.status == CatalogDraftStatus.pending)
        .order_by(CatalogDraft.created_at.desc())
    )


async def apply_draft(db: AsyncSession, draft: CatalogDraft, items: list[dict] | None = None) -> CatalogDraft:
    """Upsert the draft items (or an edited list) into products, matching existing ones by name (case-insensitive)."""
    if draft.status != CatalogDraftStatus.pending:
        raise CatalogError("This draft has already been handled")
    rows = items if items is not None else draft.items
    existing = (await db.execute(select(Product).where(Product.business_id == draft.business_id))).scalars().all()
    by_name = {p.name.strip().lower(): p for p in existing}
    skus = {p.sku for p in existing}
    inserted = updated = 0
    for item in rows:
        name = (item.get("name") or "").strip()
        price = item.get("price")
        if not name or price is None:
            continue  # unpriced or unnamed rows stay out until the owner fills them in
        price = Decimal(str(price))
        aliases = [a for a in (item.get("aliases") or []) if a]
        match = by_name.get(name.lower())
        if match:
            match.price = price
            if item.get("unit"):
                match.unit = item["unit"]
            if aliases:
                match.aliases = sorted(set(match.aliases or []) | set(aliases))
            updated += 1
        else:
            sku = (item.get("sku") or sku_for(name, skus)).upper()
            skus.add(sku)
            product = Product(
                business_id=draft.business_id,
                sku=sku,
                name=name,
                unit=item.get("unit"),
                price=price,
                stock=int(item.get("stock") or 0),
                aliases=aliases,
            )
            db.add(product)
            by_name[name.lower()] = product
            inserted += 1
    draft.items = rows
    draft.inserted, draft.updated = inserted, updated
    draft.status = CatalogDraftStatus.applied
    draft.applied_at = utcnow()
    await db.flush()
    return draft


async def discard_draft(db: AsyncSession, draft: CatalogDraft) -> None:
    draft.status = CatalogDraftStatus.discarded
    await db.flush()


def draft_reply(draft: CatalogDraft) -> str:
    """The WhatsApp message asking the owner to confirm what Sabi read."""
    priced = [i for i in draft.items if i.get("price") is not None]
    unpriced = [i for i in draft.items if i.get("price") is None]
    lines = [f"I found {len(priced)} product{'s' if len(priced) != 1 else ''} in your price list:"]
    for i in priced[:25]:
        unit = f" ({i['unit']})" if i.get("unit") else ""
        flag = " ⚠" if (i.get("confidence") or 0) < 70 else ""
        lines.append(f"• {i['name']}{unit} — ₦{Decimal(str(i['price'])):,.0f}{flag}")
    if len(priced) > 25:
        lines.append(f"…and {len(priced) - 25} more.")
    if unpriced:
        lines.append(f"No price found for: {', '.join(i['name'] for i in unpriced[:6])}. Send those prices later.")
    lines.append("Reply YES to add them to your catalog, or NO to discard. ⚠ marks ones worth double-checking.")
    return "\n".join(lines)


def applied_reply(draft: CatalogDraft) -> str:
    return (
        f"Done — {draft.inserted} added, {draft.updated} updated. Your retailers can order these on WhatsApp now. "
        "Send a new price list any time to update prices."
    )


# ---------------------------------------------------------------- demand-side requests
def _key(query: str) -> str:
    return re.sub(r"\s+", " ", query.strip().lower())


async def record_requests(db: AsyncSession, business_id: uuid.UUID, queries: list[str], retailer_id: uuid.UUID | None):
    for query in queries:
        key = _key(query)
        if not key or key in STOPWORDS or len(key) > 160:
            continue
        row = await db.scalar(
            select(ProductRequest).where(ProductRequest.business_id == business_id, ProductRequest.query_key == key)
        )
        if row is None:
            db.add(
                ProductRequest(
                    business_id=business_id, query=query.strip()[:160], query_key=key, last_retailer_id=retailer_id
                )
            )
        else:
            row.times_asked += 1
            row.last_asked_at = utcnow()
            row.last_retailer_id = retailer_id
            if row.status == ProductRequestStatus.dismissed:
                row.status = ProductRequestStatus.open  # asked again after being dismissed: worth another look
    await db.flush()


async def add_request_as_product(
    db: AsyncSession,
    request: ProductRequest,
    *,
    name: str | None,
    unit: str | None,
    price: Decimal,
    sku: str | None,
    stock: int,
) -> Product:
    if request.status == ProductRequestStatus.added:
        raise CatalogError("Already added to the catalog")
    existing = {
        p.sku for p in (await db.execute(select(Product).where(Product.business_id == request.business_id))).scalars()
    }
    product_name = (name or request.query).strip().title() if not name else name.strip()
    product = Product(
        business_id=request.business_id,
        sku=(sku or sku_for(product_name, existing)).upper(),
        name=product_name,
        unit=unit,
        price=price,
        stock=stock,
        aliases=[request.query.strip().lower()],
    )
    db.add(product)
    await db.flush()
    request.status = ProductRequestStatus.added
    request.product_id = product.id
    await db.flush()
    return product
