import uuid

from app.integrations.whatsapp import FakeWhatsApp, set_whatsapp
from app.models import Flag, FlagKind, OrderLine, ReviewState
from tests.conftest import auth


async def seed_catalog(client, token):
    h = auth(token)
    products = {}
    for sku, name, unit, price in [
        ("RSR-50", "Royal Stallion Parboiled Rice", "Bag 50kg", "78500"),
        ("MGR-50", "Mama Gold Premium Rice", "Bag 50kg", "77200"),
        ("KVO-25R", "Kings Vegetable Oil", "Keg 25L", "96500"),
        ("FSL-25", "Fortune Soya Oil", "Keg 25L", "91000"),
    ]:
        r = await client.post(
            "/api/v1/products", json={"sku": sku, "name": name, "unit": unit, "price": price, "stock": 100}, headers=h
        )
        products[sku] = r.json()
    r = await client.post(
        "/api/v1/retailers",
        json={"name": "Okafor Provisions", "phone": "08052016042", "market": "Onitsha Main Market"},
        headers=h,
    )
    return products, r.json()


async def test_manual_order_numbering_totals_and_confirm(client, owner_token):
    h = auth(owner_token)
    products, retailer = await seed_catalog(client, owner_token)
    fake_wa = FakeWhatsApp()
    set_whatsapp(fake_wa)

    body = {
        "retailer_id": retailer["id"],
        "lines": [
            {"product_id": products["RSR-50"]["id"], "quantity": 40, "unit_price": "78500"},
            {"product_id": products["MGR-50"]["id"], "quantity": 25, "unit_price": "77200"},
        ],
    }
    r = await client.post("/api/v1/orders", json=body, headers=h)
    assert r.status_code == 201, r.text
    order = r.json()
    assert order["number"] == "LE-1001"
    assert order["subtotal"] == "5070000.00"
    assert order["status"] == "processing"
    assert order["item_count"] == 65
    assert order["lines"][0]["product_name"] == "Royal Stallion Parboiled Rice"
    assert order["lines"][0]["total"] == "3140000.00"

    r2 = await client.post("/api/v1/orders", json=body, headers=h)
    assert r2.json()["number"] == "LE-1002"

    # lookup by human number, with or without '#'
    assert (await client.get("/api/v1/orders/LE-1001", headers=h)).json()["id"] == order["id"]
    assert (await client.get("/api/v1/orders/%23LE-1001", headers=h)).json()["id"] == order["id"]

    # edit lines from the War Room: change a quantity, drop a line, add one
    lines = order["lines"]
    new_lines = [
        {"id": lines[0]["id"], "quantity": 50, "unit_price": "78500"},
        {"product_id": products["KVO-25R"]["id"], "quantity": 15, "unit_price": "96500"},
    ]
    r = await client.patch(f"/api/v1/orders/{order['id']}/lines", json={"lines": new_lines}, headers=h)
    assert r.status_code == 200, r.text
    edited = r.json()
    assert [ln["quantity"] for ln in edited["lines"]] == [50, 15]
    assert edited["subtotal"] == "5372500.00"
    assert edited["lines"][0]["id"] == lines[0]["id"]  # kept its identity

    # confirm -> pending, invoice posted, WhatsApp confirmation sent, stock reserved
    r = await client.post(f"/api/v1/orders/{order['id']}/confirm", json={}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pending" and r.json()["confirmed_at"]
    assert fake_wa.sent and fake_wa.sent[0][0] == "+2348052016042" and "LE-1001" in fake_wa.sent[0][1]
    prod = (await client.get(f"/api/v1/products/{products['RSR-50']['id']}", headers=h)).json()
    assert prod["reserved"] == 50 and prod["available"] == 50

    again = await client.post(f"/api/v1/orders/{order['id']}/confirm", json={}, headers=h)
    assert again.status_code == 400

    summary = (await client.get("/api/v1/dashboard/summary", headers=h)).json()
    assert summary["orders_today"] == 2
    assert summary["invoiced"] == "5372500.00" and summary["receivables"] == "5372500.00"

    listing = (await client.get("/api/v1/orders?status=pending", headers=h)).json()
    assert listing["total"] == 1 and listing["items"][0]["retailer"]["name"] == "Okafor Provisions"
    assert (await client.get("/api/v1/orders?q=onitsha", headers=h)).json()["total"] == 2


async def test_review_toggle_and_flags(client, owner_token, db):
    h = auth(owner_token)
    products, retailer = await seed_catalog(client, owner_token)
    set_whatsapp(FakeWhatsApp())
    r = await client.post(
        "/api/v1/orders",
        json={
            "retailer_id": retailer["id"],
            "lines": [
                {"product_id": products["RSR-50"]["id"], "quantity": 50, "unit_price": "78500"},
                {"product_id": products["KVO-25R"]["id"], "quantity": 15, "unit_price": "96500"},
            ],
        },
        headers=h,
    )
    order = r.json()
    rice_line, oil_line = order["lines"]

    # Simulate what the decoder produces: a low-confidence line plus two flags pointing at lines.
    from sqlalchemy import select

    from app.models import Order as OrderModel

    db_order = (await db.execute(select(OrderModel).where(OrderModel.id == uuid.UUID(order["id"])))).scalar_one()
    db_rice = await db.get(OrderLine, uuid.UUID(rice_line["id"]))
    db_oil = await db.get(OrderLine, uuid.UUID(oil_line["id"]))
    db_oil.review_state, db_oil.confidence_score = ReviewState.check, 71
    db.add(
        Flag(
            order_id=db_order.id,
            line_id=db_rice.id,
            kind=FlagKind.voice,
            issue="Quantity unclear (54% confidence)",
            quote="Send me like fifty, make e remain small.",
            why="Could be 50 or 55 bags.",
            confidence=54,
            options=[
                {"label": "50 bags of Royal Stallion 50kg", "quantity": 50},
                {"label": "55 bags of Royal Stallion 50kg", "quantity": 55},
            ],
        )
    )
    db.add(
        Flag(
            order_id=db_order.id,
            line_id=db_oil.id,
            kind=FlagKind.slang,
            issue="Two products share this slang",
            quote="Add 15 kegs of the yellow one.",
            why="Kings or Fortune?",
            confidence=71,
            options=[
                {"label": "Kings Vegetable Oil 25L", "sku": "KVO-25R"},
                {"label": "Fortune Soya Oil 25L", "sku": "FSL-25"},
            ],
        )
    )
    await db.commit()

    # Recompute happens on the next write; the review toggle triggers it
    r = await client.post(f"/api/v1/orders/{order['id']}/lines/{oil_line['id']}/review", headers=h)
    assert r.json()["review_state"] == "verified"
    detail = (await client.get(f"/api/v1/orders/{order['id']}", headers=h)).json()
    assert detail["status"] == "needs_review" and detail["open_flags"] == 2

    flags = (await client.get("/api/v1/flags", headers=h)).json()
    assert (
        len(flags) == 2 and flags[0]["order_number"] == "LE-1001" and flags[0]["retailer_name"] == "Okafor Provisions"
    )
    qty_flag = next(f for f in flags if f["kind"] == "voice")
    slang_flag = next(f for f in flags if f["kind"] == "slang")

    # cannot confirm while flags are open
    assert (await client.post(f"/api/v1/orders/{order['id']}/confirm", json={}, headers=h)).status_code == 400

    # resolve quantity -> 55 bags
    r = await client.post(f"/api/v1/flags/{qty_flag['id']}/resolve", json={"option_index": 1}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "resolved"
    detail = (await client.get(f"/api/v1/orders/{order['id']}", headers=h)).json()
    assert detail["lines"][0]["quantity"] == 55 and detail["lines"][0]["review_state"] == "verified"
    assert detail["open_flags"] == 1

    # bad option index
    assert (
        await client.post(f"/api/v1/flags/{slang_flag['id']}/resolve", json={"option_index": 5}, headers=h)
    ).status_code == 400

    # resolve slang -> swap product to Fortune Soya Oil
    r = await client.post(f"/api/v1/flags/{slang_flag['id']}/resolve", json={"option_index": 1}, headers=h)
    detail = (await client.get(f"/api/v1/orders/{order['id']}", headers=h)).json()
    assert detail["lines"][1]["sku"] == "FSL-25" and detail["lines"][1]["unit_price"] == "91000.00"
    assert detail["status"] == "processing" and detail["open_flags"] == 0
    assert (await client.get("/api/v1/dashboard/summary", headers=h)).json()["pending_verifications"] == 0

    # reopen puts it back in the queue; ask-retailer sends a WhatsApp question
    r = await client.post(f"/api/v1/flags/{slang_flag['id']}/reopen", headers=h)
    assert r.json()["status"] == "open"
    r = await client.post(f"/api/v1/flags/{slang_flag['id']}/ask-retailer", headers=h)
    assert r.json()["status"] == "asked_retailer"
    assert len((await client.get("/api/v1/flags?status=asked_retailer", headers=h)).json()) == 1


async def test_viewer_cannot_write_orders(client, owner_token, mailer):
    h = auth(owner_token)
    await client.post("/api/v1/team/invites", json={"email": "v@x.ng", "role": "viewer"}, headers=h)
    token = mailer.sent[-1].text.rsplit("/", 1)[-1]
    r = await client.post(
        f"/api/v1/team/invites/{token}/accept", json={"full_name": "View Only", "password": "Viewer pass 1"}
    )
    vh = auth(r.json()["access_token"])
    assert (await client.get("/api/v1/orders", headers=vh)).status_code == 200
    assert (
        await client.post("/api/v1/orders", json={"lines": [{"quantity": 1, "unit_price": "1"}]}, headers=vh)
    ).status_code == 403
