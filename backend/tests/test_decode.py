import json
import os
from pathlib import Path

import pytest

from app.integrations.claude import FakeDecoder, set_decoder
from app.integrations.storage import DiskStorage, set_storage
from app.integrations.whatsapp import FakeWhatsApp, set_whatsapp
from app.integrations.whisper import FakeTranscriber, set_transcriber
from tests.conftest import auth, register

SLIP = Path(__file__).resolve().parents[2] / "frontend" / "public" / "images" / "warroom-order-slip.jpg"


@pytest.fixture
def sabi(tmp_path):
    """Wire every provider to a fake and hand them back for assertions."""
    storage, transcriber, decoder, wa = DiskStorage(tmp_path), FakeTranscriber(), FakeDecoder(), FakeWhatsApp()
    set_storage(storage)
    set_transcriber(transcriber)
    set_decoder(decoder)
    set_whatsapp(wa)
    yield storage, transcriber, decoder, wa
    set_storage(None)
    set_transcriber(None)
    set_decoder(None)
    set_whatsapp(None)


async def seed(client, token):
    h = auth(token)
    for sku, name, unit, price, aliases in [
        ("RSR-50", "Royal Stallion Parboiled Rice", "Bag 50kg", "78500", ["royal", "stallion"]),
        ("MGR-50", "Mama Gold Premium Rice", "Bag 50kg", "77200", ["mama gold"]),
        ("KVO-25R", "Kings Vegetable Oil", "Keg 25L", "96500", ["the yellow one", "kings"]),
        ("FSL-25", "Fortune Soya Oil", "Keg 25L", "91000", ["the yellow one", "fortune"]),
    ]:
        await client.post(
            "/api/v1/products",
            json={"sku": sku, "name": name, "unit": unit, "price": price, "stock": 100, "aliases": aliases},
            headers=h,
        )
    r = await client.post(
        "/api/v1/retailers",
        json={"name": "Okafor Provisions", "phone": "08052016042", "market": "Onitsha Main Market"},
        headers=h,
    )
    return r.json()


async def test_voice_note_end_to_end(client, owner_token, sabi):
    storage, transcriber, decoder, wa = sabi
    h = auth(owner_token)
    retailer = await seed(client, owner_token)

    r = await client.post(
        "/api/v1/dev/simulate/whatsapp",
        data={"from_number": "+2348052016042"},
        files={"file": ("note.ogg", b"OggS fake audio bytes", "audio/ogg")},
        headers=h,
    )
    assert r.status_code == 202, r.text

    # transcriber saw the audio and the catalog names; decoder saw the transcript + retailer context
    assert transcriber.calls == [(len(b"OggS fake audio bytes"), "audio/ogg")]
    assert decoder.calls[0].retailer_name == "Okafor Provisions"
    assert decoder.calls[0].transcript.startswith("Send me like fifty")
    assert {p["sku"] for p in decoder.calls[0].catalog} == {"RSR-50", "MGR-50", "KVO-25R", "FSL-25"}

    orders = (await client.get("/api/v1/orders", headers=h)).json()
    assert orders["total"] == 1
    order = (await client.get(f"/api/v1/orders/{orders['items'][0]['id']}", headers=h)).json()
    assert order["number"] == "LE-1001" and order["channel"] == "voice"
    assert order["status"] == "needs_review" and order["open_flags"] == 2
    assert order["retailer"]["id"] == retailer["id"]

    # Sabi replied straight away: what it understood, its two questions, and no amount to pay yet
    reply = wa.sent[-1]
    assert reply[0] == "+2348052016042"
    assert "Order LE-1001" in reply[1] and "50 × Royal Stallion" in reply[1] and "Quick check" in reply[1]
    assert "1) 50 bags" in reply[1] and "2) 55 bags" in reply[1]
    assert "Pay by transfer" not in reply[1]
    assert order["reply_text"] == reply[1]

    kinds = [e["kind"] for e in order["evidence"]]
    assert kinds == ["voice", "transcript"]
    voice = order["evidence"][0]
    assert voice["url"].startswith("/api/v1/media/") and voice["mime"] == "audio/ogg"
    assert order["evidence"][1]["text"] == transcriber.transcript

    rice, oil = order["lines"]
    assert (rice["sku"], rice["quantity"], rice["confidence_score"], rice["review_state"]) == (
        "RSR-50",
        50,
        54,
        "check",
    )
    assert oil["sku"] == "KVO-25R" and oil["review_state"] == "check"
    assert order["subtotal"] == "5372500.00"

    flags = (await client.get("/api/v1/flags", headers=h)).json()
    assert {f["kind"] for f in flags} == {"voice", "slang"}
    assert {f["status"] for f in flags} == {"asked_retailer"}
    slang = next(f for f in flags if f["kind"] == "slang")
    assert [o["sku"] for o in slang["options"]] == ["KVO-25R", "FSL-25"]

    # the stored voice note is served to the owner but not to another business
    media = await client.get(voice["url"], headers=h)
    assert media.status_code == 200 and media.content == b"OggS fake audio bytes"
    client.cookies.clear()
    other = await register(client, email="other@x.ng", business_name="Other")
    assert (await client.get(voice["url"], headers=auth(other))).status_code == 404

    # notifications and dashboard reflect the new flags
    notes = (await client.get("/api/v1/notifications", headers=h)).json()
    assert notes[0]["title"] == "LE-1001 needs your eye" and notes[0]["order_id"] == order["id"]
    assert (await client.get("/api/v1/dashboard/summary", headers=h)).json()["pending_verifications"] == 2

    # resolve both flags, then confirm and send the WhatsApp confirmation
    voice_flag = next(f for f in flags if f["kind"] == "voice")
    await client.post(f"/api/v1/flags/{voice_flag['id']}/resolve", json={"option_index": 1}, headers=h)
    await client.post(f"/api/v1/flags/{slang['id']}/resolve", json={"option_index": 1}, headers=h)
    order = (await client.get(f"/api/v1/orders/{order['id']}", headers=h)).json()
    assert order["status"] == "processing"
    assert order["lines"][0]["quantity"] == 55 and order["lines"][1]["sku"] == "FSL-25"
    r = await client.post(f"/api/v1/orders/{order['id']}/confirm", json={}, headers=h)
    assert r.json()["status"] == "pending"
    assert wa.sent[-1][0] == "+2348052016042" and "55 × Royal Stallion" in wa.sent[-1][1]


async def test_photo_and_text_paths(client, owner_token, sabi):
    _, _, decoder, _ = sabi
    h = auth(owner_token)
    await seed(client, owner_token)

    r = await client.post(
        "/api/v1/dev/simulate/whatsapp",
        data={"from_number": "+2348052016042"},
        files={"file": ("slip.jpg", SLIP.read_bytes(), "image/jpeg")},
        headers=h,
    )
    assert r.status_code == 202
    assert decoder.calls[-1].image is not None and decoder.calls[-1].transcript is None
    order = (await client.get("/api/v1/orders/LE-1001", headers=h)).json()
    assert order["channel"] == "photo" and [e["kind"] for e in order["evidence"]] == ["photo"]
    assert order["flags"][0]["kind"] == "photo" and order["status"] == "needs_review"

    r = await client.post(
        "/api/v1/dev/simulate/whatsapp", data={"from_number": "+2348052016042", "text": "20 bags MGR-50"}, headers=h
    )
    order = (await client.get("/api/v1/orders/LE-1002", headers=h)).json()
    assert order["channel"] == "text" and order["evidence"][0]["text"] == "20 bags MGR-50"
    # nothing to check -> invoiced immediately so the transfer can match
    assert order["status"] == "pending" and order["lines"][0]["review_state"] == "sure"
    assert "Pay by transfer" in order["reply_text"] and "Reference: LE-1002" in order["reply_text"]
    assert (await client.get("/api/v1/dashboard/summary", headers=h)).json()["invoiced"] == "1544000.00"


async def test_unknown_sender_becomes_a_retailer_with_an_account(client, owner_token, sabi):
    from app.integrations.paystack import FakePaystack, set_paystack

    set_paystack(FakePaystack())
    h = auth(owner_token)
    await seed(client, owner_token)
    r = await client.post(
        "/api/v1/dev/simulate/whatsapp",
        data={"from_number": "+2347000000000", "text": "20 bags MGR-50", "sender_name": "Mama Nkechi"},
        headers=h,
    )
    assert r.status_code == 202
    order = (await client.get("/api/v1/orders/LE-1001", headers=h)).json()
    assert order["retailer"]["name"] == "Mama Nkechi" and order["retailer"]["phone"] == "+2347000000000"
    retailers = (await client.get("/api/v1/retailers?q=nkechi", headers=h)).json()["items"]
    assert retailers[0]["dva_account_number"] == "9900000001"  # provisioned on the spot
    assert "9900000001" in order["reply_text"]
    set_paystack(None)


async def test_inquiry_gets_prices_without_creating_an_order(client, owner_token, sabi):
    _, _, _, wa = sabi
    h = auth(owner_token)
    await seed(client, owner_token)
    r = await client.post(
        "/api/v1/dev/simulate/whatsapp",
        data={
            "from_number": "+2348052016042",
            "text": "Do you have kings vegetable oil? How much is mama gold? Do you have cucumber?",
        },
        headers=h,
    )
    assert r.status_code == 202
    assert (await client.get("/api/v1/orders", headers=h)).json()["total"] == 0
    reply = wa.sent[-1][1]
    assert "✓ Kings Vegetable Oil (Keg 25L): ₦96,500" in reply
    assert "✓ Mama Gold Premium Rice (Bag 50kg): ₦77,200" in reply
    assert "✗ Cucumber: not currently stocked." in reply
    assert "quantities" in reply


async def test_retailer_answers_questions_by_number(client, owner_token, sabi):
    _, _, _, wa = sabi
    h = auth(owner_token)
    await seed(client, owner_token)
    await client.post(
        "/api/v1/dev/simulate/whatsapp",
        data={"from_number": "+2348052016042"},
        files={"file": ("note.ogg", b"OggS", "audio/ogg")},
        headers=h,
    )
    assert "Quick check" in wa.sent[-1][1]

    # out-of-range answer is bounced
    await client.post("/api/v1/dev/simulate/whatsapp", data={"from_number": "+2348052016042", "text": "7"}, headers=h)
    assert "between 1 and 2" in wa.sent[-1][1]

    # first answer resolves the first question and re-asks the remaining one
    await client.post("/api/v1/dev/simulate/whatsapp", data={"from_number": "+2348052016042", "text": "2"}, headers=h)
    assert "Quick check" in wa.sent[-1][1]
    # second answer -> invoice with payment details, order confirmed and invoiced
    await client.post("/api/v1/dev/simulate/whatsapp", data={"from_number": "+2348052016042", "text": "2"}, headers=h)
    final = wa.sent[-1][1]
    assert "Total:" in final and "Reference: LE-1001" in final
    order = (await client.get("/api/v1/orders/LE-1001", headers=h)).json()
    assert order["status"] == "pending" and order["open_flags"] == 0
    assert (order["lines"][0]["quantity"], order["lines"][1]["sku"]) == (55, "FSL-25")
    assert (await client.get("/api/v1/orders", headers=h)).json()["total"] == 1  # the digits never became orders


async def test_auto_reply_can_be_switched_off(client, owner_token, sabi):
    _, _, _, wa = sabi
    h = auth(owner_token)
    await seed(client, owner_token)
    r = await client.patch("/api/v1/business", json={"auto_reply": False}, headers=h)
    assert r.status_code == 200 and r.json()["auto_reply"] is False
    await client.post(
        "/api/v1/dev/simulate/whatsapp", data={"from_number": "+2348052016042", "text": "20 bags MGR-50"}, headers=h
    )
    assert wa.sent == []
    order = (await client.get("/api/v1/orders/LE-1001", headers=h)).json()
    assert order["status"] == "processing" and order["reply_text"] is None


async def test_whatsapp_webhook_verify_dedupe_and_routing(client, owner_token, sabi, monkeypatch):
    from app.core import config

    monkeypatch.setattr(config.settings, "whatsapp_verify_token", "tok")
    h = auth(owner_token)
    await seed(client, owner_token)

    r = await client.get("/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=12345")
    assert r.status_code == 200 and r.text == "12345"
    assert (
        await client.get("/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=1")
    ).status_code == 403

    payload = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "id": "wamid.1",
                                    "from": "2348052016042",
                                    "type": "text",
                                    "text": {"body": "20 bags MGR-50"},
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }
    r = await client.post(
        "/api/v1/webhooks/whatsapp", content=json.dumps(payload).encode(), headers={"content-type": "application/json"}
    )
    assert r.status_code == 200
    assert (await client.get("/api/v1/orders", headers=h)).json()["total"] == 1

    # redelivery of the same wamid creates nothing
    await client.post(
        "/api/v1/webhooks/whatsapp", content=json.dumps(payload).encode(), headers={"content-type": "application/json"}
    )
    assert (await client.get("/api/v1/orders", headers=h)).json()["total"] == 1


@pytest.mark.live
@pytest.mark.skipif(not os.environ.get("ANTHROPIC_API_KEY"), reason="needs ANTHROPIC_API_KEY")
async def test_live_claude_reads_the_order_slip():
    from app.integrations.claude import ClaudeDecoder, DecodeInput

    decoder = ClaudeDecoder(os.environ["ANTHROPIC_API_KEY"], "claude-opus-5")
    catalog = [
        {"sku": "RSR-50", "name": "Royal Stallion Parboiled Rice", "unit": "Bag 50kg", "price": "78500", "aliases": []},
        {"sku": "MGR-50", "name": "Mama Gold Premium Rice", "unit": "Bag 50kg", "price": "77200", "aliases": []},
        {
            "sku": "KVO-25R",
            "name": "Kings Vegetable Oil",
            "unit": "Keg 25L",
            "price": "96500",
            "aliases": ["the yellow one"],
        },
        {
            "sku": "FSL-25",
            "name": "Fortune Soya Oil",
            "unit": "Keg 25L",
            "price": "91000",
            "aliases": ["the yellow one"],
        },
    ]
    result = await decoder.decode(
        DecodeInput(
            catalog=catalog,
            retailer_name="Okafor Provisions",
            recent_skus=["RSR-50"],
            transcript=(
                "Send me like fifty bags of Royal Stallion, make e remain small. Add fifteen kegs of the yellow one."
            ),
            image=(SLIP.read_bytes(), "image/jpeg"),
        )
    )
    assert result.lines and all(ln.sku in {c["sku"] for c in catalog} for ln in result.lines)
    assert any(f.kind == "slang" for f in result.flags), result


@pytest.mark.live
@pytest.mark.skipif(not os.environ.get("OPENAI_API_KEY"), reason="needs OPENAI_API_KEY")
async def test_live_openai_decoder_flags_the_slang():
    from app.integrations.claude import DecodeInput, OpenAIDecoder

    decoder = OpenAIDecoder(os.environ["OPENAI_API_KEY"], os.environ.get("OPENAI_DECODER_MODEL", "gpt-5.5"))
    catalog = [
        {"sku": "RSR-50", "name": "Royal Stallion Parboiled Rice", "unit": "Bag 50kg", "price": "78500", "aliases": []},
        {
            "sku": "KVO-25R",
            "name": "Kings Vegetable Oil",
            "unit": "Keg 25L",
            "price": "96500",
            "aliases": ["the yellow one"],
        },
        {
            "sku": "FSL-25",
            "name": "Fortune Soya Oil",
            "unit": "Keg 25L",
            "price": "91000",
            "aliases": ["the yellow one"],
        },
    ]
    result = await decoder.decode(
        DecodeInput(
            catalog=catalog,
            retailer_name="Okafor Provisions",
            recent_skus=["RSR-50"],
            transcript=(
                "Send me like fifty bags of Royal Stallion, make e remain small. Add fifteen kegs of the yellow one."
            ),
        )
    )
    assert result.lines and all(ln.sku in {c["sku"] for c in catalog} for ln in result.lines)
    assert any(f.kind == "slang" for f in result.flags), result


async def test_routing_by_receiving_number_and_messages_view(client, owner_token, sabi, monkeypatch):
    """Two businesses share the database; an unknown sender is routed by the number that received the message."""
    from app.core import config

    monkeypatch.setattr(config.settings, "whatsapp_verify_token", "tok")
    h = auth(owner_token)
    await seed(client, owner_token)
    # claim the Meta test number for this business
    r = await client.patch("/api/v1/business", json={"whatsapp_number": "+15551787628"}, headers=h)
    assert r.status_code == 200 and r.json()["whatsapp_number"] == "+15551787628"
    client.cookies.clear()
    await register(client, email="other@x.ng", business_name="Other Ltd")  # now there are two businesses

    payload = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "metadata": {
                                "display_phone_number": "1 (555) 178-7628",
                                "phone_number_id": "1344895592037333",
                            },
                            "contacts": [{"wa_id": "2347010000000", "profile": {"name": "Mama Nkechi"}}],
                            "messages": [
                                {
                                    "id": "wamid.route1",
                                    "from": "2347010000000",
                                    "type": "text",
                                    "text": {"body": "20 bags MGR-50"},
                                }
                            ],
                        }
                    }
                ]
            }
        ]
    }
    r = await client.post(
        "/api/v1/webhooks/whatsapp", content=json.dumps(payload).encode(), headers={"content-type": "application/json"}
    )
    assert r.status_code == 200
    orders = (await client.get("/api/v1/orders", headers=h)).json()
    assert orders["total"] == 1 and orders["items"][0]["retailer"]["name"] == "Mama Nkechi"

    msgs = (await client.get("/api/v1/whatsapp/messages", headers=h)).json()
    assert len(msgs) == 1
    m = msgs[0]
    assert (m["from_number"], m["sender_name"], m["kind"], m["text"]) == (
        "+2347010000000",
        "Mama Nkechi",
        "text",
        "20 bags MGR-50",
    )
    assert m["outcome"] == "order" and m["order_number"] == "LE-1001" and "Pay by transfer" in m["reply_text"]
