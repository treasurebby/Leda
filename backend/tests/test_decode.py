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
    assert order["status"] == "processing" and order["lines"][0]["review_state"] == "sure"


async def test_unknown_sender_gets_unlinked_order(client, owner_token, sabi):
    h = auth(owner_token)
    await seed(client, owner_token)
    r = await client.post(
        "/api/v1/dev/simulate/whatsapp", data={"from_number": "+2347000000000", "text": "20 bags MGR-50"}, headers=h
    )
    assert r.status_code == 202
    order = (await client.get("/api/v1/orders/LE-1001", headers=h)).json()
    assert order["retailer"] is None
    # confirming needs a retailer attached
    assert (await client.post(f"/api/v1/orders/{order['id']}/confirm", json={}, headers=h)).status_code == 400


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
            transcript="Send me like fifty bags of Royal Stallion, make e remain small. Add fifteen kegs of the yellow one.",
            image=(SLIP.read_bytes(), "image/jpeg"),
        )
    )
    assert result.lines and all(ln.sku in {c["sku"] for c in catalog} for ln in result.lines)
    assert any(f.kind == "slang" for f in result.flags), result
