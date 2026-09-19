import hashlib
import hmac
import json

from app.integrations.paystack import FakePaystack, set_paystack
from app.integrations.whatsapp import FakeWhatsApp, set_whatsapp
from tests.conftest import auth
from tests.test_orders import seed_catalog


async def confirmed_order(client, token, products, retailer, qty=10, sku="RSR-50"):
    h = auth(token)
    r = await client.post(
        "/api/v1/orders",
        json={
            "retailer_id": retailer["id"],
            "lines": [{"product_id": products[sku]["id"], "quantity": qty, "unit_price": products[sku]["price"]}],
        },
        headers=h,
    )
    order = r.json()
    r = await client.post(f"/api/v1/orders/{order['id']}/confirm", json={}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


async def test_virtual_account_and_auto_match_by_account(client, owner_token):
    h = auth(owner_token)
    set_paystack(FakePaystack())
    set_whatsapp(FakeWhatsApp())
    products, retailer = await seed_catalog(client, owner_token)

    r = await client.post(f"/api/v1/retailers/{retailer['id']}/virtual-account", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["dva_account_number"] == "9900000001" and r.json()["account_reference"] == "9900000001"
    # idempotent
    assert (await client.post(f"/api/v1/retailers/{retailer['id']}/virtual-account", headers=h)).json()[
        "dva_account_number"
    ] == "9900000001"

    order = await confirmed_order(client, owner_token, products, retailer, qty=10)  # 785,000
    assert order["status"] == "pending"

    # credit arrives on the retailer's DVA for exactly the pending amount -> matched, order paid
    r = await client.post(
        "/api/v1/dev/simulate/paystack-credit",
        json={"amount": "785000", "reference": "T1", "retailer_id": retailer["id"]},
        headers=h,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "matched" and r.json()["order_number"] == "LE-1001"
    assert (await client.get(f"/api/v1/orders/{order['id']}", headers=h)).json()["status"] == "paid"

    # replay -> no-op
    r = await client.post(
        "/api/v1/dev/simulate/paystack-credit",
        json={"amount": "785000", "reference": "T1", "retailer_id": retailer["id"]},
        headers=h,
    )
    assert "already processed" in r.json()["detail"]
    assert (await client.get("/api/v1/payments", headers=h)).json()["total"] == 1

    summary = (await client.get("/api/v1/dashboard/summary", headers=h)).json()
    assert (
        summary["invoiced"] == "785000.00" and summary["collected"] == "785000.00" and summary["receivables"] == "0.00"
    )
    bal = (await client.get(f"/api/v1/retailers/{retailer['id']}/balance", headers=h)).json()
    assert bal["balance"] == "0.00"


async def test_ambiguous_credit_goes_to_review_then_manual_match_and_unmatch(client, owner_token):
    h = auth(owner_token)
    set_paystack(FakePaystack())
    set_whatsapp(FakeWhatsApp())
    products, retailer = await seed_catalog(client, owner_token)
    await client.post(f"/api/v1/retailers/{retailer['id']}/virtual-account", headers=h)
    o1 = await confirmed_order(client, owner_token, products, retailer, qty=10)
    o2 = await confirmed_order(client, owner_token, products, retailer, qty=10)  # same amount -> ambiguous

    r = await client.post(
        "/api/v1/dev/simulate/paystack-credit",
        json={"amount": "785000", "reference": "T2", "retailer_id": retailer["id"]},
        headers=h,
    )
    assert r.json()["status"] == "review"
    payment_id = r.json()["id"]
    assert (await client.get("/api/v1/dashboard/summary", headers=h)).json()["verification_breakdown"]["transfer"] == 1

    # narration naming the order disambiguates
    r = await client.post(
        "/api/v1/dev/simulate/paystack-credit",
        json={"amount": "785000", "reference": "T3", "retailer_id": retailer["id"], "narration": "LE-1002 rice"},
        headers=h,
    )
    assert r.json()["status"] == "matched" and r.json()["order_number"] == "LE-1002"

    # manual match of the review item to LE-1001
    r = await client.post(f"/api/v1/payments/{payment_id}/match", json={"order_id": o1["id"]}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "matched"
    assert (await client.get(f"/api/v1/orders/{o1['id']}", headers=h)).json()["status"] == "paid"
    # matching to an already-paid order is refused
    r = await client.post(f"/api/v1/payments/{payment_id}/match", json={"order_id": o2["id"]}, headers=h)
    assert r.status_code == 400

    # unmatch reverses via an adjustment entry; the order goes back to pending
    r = await client.post(f"/api/v1/payments/{payment_id}/unmatch", headers=h)
    assert r.json()["status"] == "review" and r.json()["order_id"] is None
    assert (await client.get(f"/api/v1/orders/{o1['id']}", headers=h)).json()["status"] == "pending"

    ledger = (await client.get("/api/v1/ledger", headers=h)).json()
    kinds = [e["kind"] for e in ledger["items"]]
    assert kinds == ["invoice", "invoice", "payment", "payment", "adjustment"]
    assert ledger["items"][-1]["balance"] == "785000.00"  # 2 invoices - 2 payments + 1 reversal
    assert ledger["closing_balance"] == "785000.00"

    csv_resp = await client.get("/api/v1/ledger/export.csv", headers=h)
    assert csv_resp.status_code == 200 and csv_resp.headers["content-type"].startswith("text/csv")
    lines = csv_resp.text.strip().splitlines()
    assert lines[0] == "Date,Entry,Counterparty,Reference,Debit,Credit,Balance" and len(lines) == 6

    # per-retailer filter and window
    filtered = (await client.get(f"/api/v1/ledger?retailer_id={retailer['id']}", headers=h)).json()
    assert len(filtered["items"]) == 5


async def test_paystack_webhook_signature_and_routing(client, owner_token, monkeypatch):
    from app.core import config

    monkeypatch.setattr(config.settings, "paystack_secret_key", "sk_test_secret")
    h = auth(owner_token)
    set_paystack(FakePaystack())
    set_whatsapp(FakeWhatsApp())
    products, retailer = await seed_catalog(client, owner_token)
    va = (await client.post(f"/api/v1/retailers/{retailer['id']}/virtual-account", headers=h)).json()
    await confirmed_order(client, owner_token, products, retailer, qty=10)

    event = {
        "event": "charge.success",
        "data": {
            "reference": "PSK_1",
            "amount": 78500000,
            "narration": "",
            "authorization": {"receiver_bank_account_number": va["dva_account_number"]},
        },
    }
    body = json.dumps(event).encode()

    bad = await client.post(
        "/api/v1/webhooks/paystack",
        content=body,
        headers={"x-paystack-signature": "nope", "content-type": "application/json"},
    )
    assert bad.status_code == 401

    sig = hmac.new(b"sk_test_secret", body, hashlib.sha512).hexdigest()
    ok = await client.post(
        "/api/v1/webhooks/paystack",
        content=body,
        headers={"x-paystack-signature": sig, "content-type": "application/json"},
    )
    assert ok.status_code == 200 and ok.json() == {"ok": True}
    payments = (await client.get("/api/v1/payments", headers=h)).json()
    assert payments["total"] == 1 and payments["items"][0]["status"] == "matched"
    assert payments["items"][0]["amount"] == "785000.00"  # kobo converted

    # duplicate delivery is acknowledged and ignored
    again = await client.post(
        "/api/v1/webhooks/paystack",
        content=body,
        headers={"x-paystack-signature": sig, "content-type": "application/json"},
    )
    assert again.status_code == 200
    assert (await client.get("/api/v1/payments", headers=h)).json()["total"] == 1

    other = {"event": "transfer.success", "data": {}}
    r = await client.post(
        "/api/v1/webhooks/paystack",
        content=json.dumps(other).encode(),
        headers={
            "x-paystack-signature": hmac.new(b"sk_test_secret", json.dumps(other).encode(), hashlib.sha512).hexdigest(),
            "content-type": "application/json",
        },
    )
    assert r.json()["ignored"] == "transfer.success"


async def test_accountant_can_match_but_not_edit_orders(client, owner_token, mailer):
    h = auth(owner_token)
    await client.post("/api/v1/team/invites", json={"email": "acc@x.ng", "role": "Accountant"}, headers=h)
    token = mailer.sent[-1].text.rsplit("/", 1)[-1]
    r = await client.post(f"/api/v1/team/invites/{token}/accept", json={"full_name": "Acc", "password": "Account 12"})
    ah = auth(r.json()["access_token"])
    assert (await client.get("/api/v1/ledger", headers=ah)).status_code == 200
    assert (await client.get("/api/v1/payments", headers=ah)).status_code == 200
    assert (
        await client.post("/api/v1/products", json={"sku": "X", "name": "x", "price": "1"}, headers=ah)
    ).status_code == 403
