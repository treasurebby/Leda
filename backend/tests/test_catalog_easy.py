"""The two easy roads into the catalog: 'forward your price list' and 'learn from what retailers ask for'."""

from app.integrations.claude import FakeDecoder, set_decoder
from app.integrations.storage import DiskStorage, set_storage
from app.integrations.whatsapp import FakeWhatsApp, set_whatsapp
from app.integrations.whisper import FakeTranscriber, set_transcriber
from tests.conftest import OWNER, auth

PRICE_LIST = (
    "Royal Stallion Parboiled Rice 50kg - 78,500\nMama Gold Premium Rice 50kg: ₦77,200\n"
    "Kings Vegetable Oil 25L - 96.5k\nPalm oil"
)


async def simulate(client, h, from_number, text=None, file=None):
    kwargs = {"data": {"from_number": from_number, **({"text": text} if text else {})}}
    if file:
        kwargs["files"] = {"file": file}
    return await client.post("/api/v1/dev/simulate/whatsapp", headers=h, **kwargs)


async def test_owner_forwards_price_list_on_whatsapp(client, owner_token, tmp_path):
    wa = FakeWhatsApp()
    set_whatsapp(wa)
    set_decoder(FakeDecoder())
    set_transcriber(FakeTranscriber())
    set_storage(DiskStorage(tmp_path))
    h = auth(owner_token)
    owner_phone = "+2348034051198"  # OWNER["phone"] normalised; registered in step 1, so Leda knows it's the owner

    # 1. price list in -> draft + question, no order created
    r = await simulate(client, h, owner_phone, text=PRICE_LIST)
    assert r.status_code == 202
    assert (await client.get("/api/v1/orders", headers=h)).json()["total"] == 0
    ask = wa.sent[-1]
    assert ask[0] == owner_phone
    assert "I found 3 products" in ask[1]
    assert "• Royal Stallion Parboiled Rice 50kg (50kg) — ₦78,500" in ask[1]
    assert "• Kings Vegetable Oil 25L (25L) — ₦96,500" in ask[1]
    assert "No price found for: Palm oil" in ask[1]
    assert "Reply YES" in ask[1]
    assert (await client.get("/api/v1/products", headers=h)).json()["total"] == 0  # nothing until YES

    # 2. YES -> products exist with generated SKUs; unpriced row left out
    await simulate(client, h, owner_phone, text="yes")
    assert "Done — 3 added, 0 updated" in wa.sent[-1][1]
    items = (await client.get("/api/v1/products", headers=h)).json()["items"]
    assert {p["name"] for p in items} == {
        "Royal Stallion Parboiled Rice 50kg",
        "Mama Gold Premium Rice 50kg",
        "Kings Vegetable Oil 25L",
    }
    assert next(p for p in items if p["name"].startswith("Royal"))["sku"] == "RSPR-50"
    assert next(p for p in items if p["name"].startswith("Kings"))["sku"] == "KVO-25"
    assert next(p for p in items if p["name"].startswith("Kings"))["price"] == "96500.00"

    # 3. a second list with a changed price updates rather than duplicates
    await simulate(client, h, owner_phone, text="Royal Stallion Parboiled Rice 50kg - 80,000")
    await simulate(client, h, owner_phone, text="YES")
    assert "0 added, 1 updated" in wa.sent[-1][1]
    items = (await client.get("/api/v1/products", headers=h)).json()["items"]
    assert len(items) == 3 and next(p for p in items if p["sku"] == "RSPR-50")["price"] == "80000.00"

    # 4. NO discards; a plain greeting gets instructions
    await simulate(client, h, owner_phone, text="Garri 1 bag - 30,000")
    await simulate(client, h, owner_phone, text="no")
    assert "Discarded" in wa.sent[-1][1]
    assert len((await client.get("/api/v1/products", headers=h)).json()["items"]) == 3
    await simulate(client, h, owner_phone, text="hello")
    assert "Send it as lines like" in wa.sent[-1][1]

    # 5. a photo of the price board works the same way
    await simulate(client, h, owner_phone, file=("board.jpg", b"\xff\xd8fake", "image/jpeg"))
    assert "I found 3 products" in wa.sent[-1][1]
    set_whatsapp(None)
    set_decoder(None)
    set_transcriber(None)
    set_storage(None)


async def test_pasted_price_list_in_onboarding(client, owner_token):
    set_decoder(FakeDecoder())
    set_transcriber(FakeTranscriber())
    h = auth(owner_token)
    r = await client.post("/api/v1/catalog/extract", json={"text": PRICE_LIST}, headers=h)
    assert r.status_code == 201, r.text
    draft = r.json()
    assert draft["status"] == "pending" and len(draft["items"]) == 4
    assert draft["items"][3]["price"] is None and draft["items"][3]["note"] == "no price found"

    # the owner edits before applying: fills in the palm oil price, fixes a unit
    items = draft["items"]
    items[3].update({"price": "45000", "unit": "Keg 25L"})
    items[0]["unit"] = "Bag 50kg"
    r = await client.post(f"/api/v1/catalog/drafts/{draft['id']}/apply", json={"items": items}, headers=h)
    assert r.status_code == 200, r.text
    assert (r.json()["inserted"], r.json()["updated"], r.json()["status"]) == (4, 0, "applied")
    products = (await client.get("/api/v1/products", headers=h)).json()["items"]
    assert next(p for p in products if p["name"] == "Palm oil")["price"] == "45000.00"
    assert next(p for p in products if p["name"].startswith("Royal"))["unit"] == "Bag 50kg"

    # applying twice is refused
    assert (await client.post(f"/api/v1/catalog/drafts/{draft['id']}/apply", json={}, headers=h)).status_code == 400
    set_decoder(None)
    set_transcriber(None)


async def test_demand_becomes_catalog(client, owner_token, tmp_path):
    wa = FakeWhatsApp()
    set_whatsapp(wa)
    set_decoder(FakeDecoder())
    set_transcriber(FakeTranscriber())
    set_storage(DiskStorage(tmp_path))
    h = auth(owner_token)
    await client.post(
        "/api/v1/products",
        json={"sku": "MGR-50", "name": "Mama Gold Premium Rice", "unit": "Bag 50kg", "price": "77200", "stock": 40},
        headers=h,
    )

    # two retailers ask for cucumber; one also asks for garri
    await simulate(client, h, "+2348011111111", text="Do you have cucumber? Do you have garri?")
    await simulate(client, h, "+2348022222222", text="do you have cucumber")
    reqs = (await client.get("/api/v1/product-requests", headers=h)).json()
    assert [(r["query"], r["times_asked"]) for r in reqs] == [("cucumber", 2), ("garri", 1)]
    assert "✗ Cucumber: not currently stocked." in wa.sent[-1][1]

    # one tap: it's a product now, and the next retailer who asks gets a price
    cucumber = reqs[0]
    r = await client.post(
        f"/api/v1/product-requests/{cucumber['id']}/add",
        json={"price": "12000", "unit": "Crate", "stock": 10},
        headers=h,
    )
    assert r.status_code == 201, r.text
    assert r.json()["name"] == "Cucumber" and r.json()["aliases"] == ["cucumber"]
    assert (await client.get("/api/v1/product-requests", headers=h)).json()[0]["query"] == "garri"
    await simulate(client, h, "+2348033333333", text="do you have cucumber")
    assert "✓ Cucumber (Crate): ₦12,000 — 10 available" in wa.sent[-1][1]

    # dismissed requests come back if asked again
    garri = (await client.get("/api/v1/product-requests", headers=h)).json()[0]
    await client.post(f"/api/v1/product-requests/{garri['id']}/dismiss", headers=h)
    assert (await client.get("/api/v1/product-requests", headers=h)).json() == []
    await simulate(client, h, "+2348011111111", text="do you have garri")
    assert (await client.get("/api/v1/product-requests", headers=h)).json()[0]["times_asked"] == 2
    set_whatsapp(None)
    set_decoder(None)
    set_transcriber(None)
    set_storage(None)


async def test_owner_phone_is_recognised_from_registration():
    from app.core.security import normalise_phone

    assert normalise_phone(OWNER["phone"]) == "+2348034051198"
