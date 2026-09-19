import io

from openpyxl import Workbook

from tests.conftest import auth

PRODUCTS_CSV = (
    b"\xef\xbb\xbfProduct name,SKU,Price,Stock\n"
    b"Royal Stallion Rice 50kg,RSR50,78500,120\n"
    b"Mama Gold Rice 50kg,MGR50,\xe2\x82\xa677200,80\n"
    b"Kings Vegetable Oil 25L,KVO25,96500,65\n"
)
RETAILERS_CSV = (
    b"Retailer name,Email,Phone\n"
    b"Kike Stores,kike@example.com,08031234567\n"
    b"Okafor Provisions,okafor@example.com,08052345678\n"
    b"Amina Food Mart,amina@example.com,07063456789\n"
)


async def upload(client, url, name, content, token):
    return await client.post(url, files={"file": (name, content, "application/octet-stream")}, headers=auth(token))


async def test_product_import_csv_then_reimport_updates(client, owner_token):
    job = await upload(client, "/api/v1/products/import", "products.csv", PRODUCTS_CSV, owner_token)
    assert job.status_code == 202, job.text
    job_id = job.json()["id"]

    status = (await client.get(f"/api/v1/import-jobs/{job_id}", headers=auth(owner_token))).json()
    assert status["status"] == "done", status
    assert (status["total"], status["inserted"], status["updated"]) == (3, 3, 0)

    page = (await client.get("/api/v1/products", headers=auth(owner_token))).json()
    assert page["total"] == 3
    by_sku = {p["sku"]: p for p in page["items"]}
    assert by_sku["MGR50"]["price"] == "77200.00"  # ₦ prefix stripped, money is a string
    assert by_sku["RSR50"]["stock"] == 120

    # Same SKUs again with a changed price -> updates, not duplicates
    again = PRODUCTS_CSV.replace(b"78500", b"80000")
    job2 = await upload(client, "/api/v1/products/import", "products.csv", again, owner_token)
    status2 = (await client.get(f"/api/v1/import-jobs/{job2.json()['id']}", headers=auth(owner_token))).json()
    assert (status2["inserted"], status2["updated"]) == (0, 3)
    page = (await client.get("/api/v1/products", headers=auth(owner_token))).json()
    assert page["total"] == 3
    assert next(p for p in page["items"] if p["sku"] == "RSR50")["price"] == "80000.00"


async def test_product_import_xlsx(client, owner_token):
    wb = Workbook()
    ws = wb.active
    ws.append(["Item name", "Unit price", "Qty", "Pack"])
    ws.append(["Dangote Sugar", 43000, 31, "Bag 50kg"])
    ws.append(["Golden Penny Noodles", "30,000", 205, "Carton 70"])
    buf = io.BytesIO()
    wb.save(buf)
    job = await upload(client, "/api/v1/products/import", "catalog.xlsx", buf.getvalue(), owner_token)
    status = (await client.get(f"/api/v1/import-jobs/{job.json()['id']}", headers=auth(owner_token))).json()
    assert status["status"] == "done", status
    items = (await client.get("/api/v1/products", headers=auth(owner_token))).json()["items"]
    assert {p["sku"] for p in items} == {"LEDA0001", "LEDA0002"}  # generated SKUs
    assert next(p for p in items if p["name"] == "Golden Penny Noodles")["unit"] == "Carton 70"


async def test_product_import_errors(client, owner_token):
    async def fail_with(name, content):
        job = await upload(client, "/api/v1/products/import", name, content, owner_token)
        return (await client.get(f"/api/v1/import-jobs/{job.json()['id']}", headers=auth(owner_token))).json()

    s = await fail_with("p.csv", b"Name,Colour\nThing,red\n")
    assert s["status"] == "failed" and "Product name" in s["errors"][0]

    s = await fail_with("p.csv", b"Product name,Price,Stock\nA,abc,1\nB,10,-2\nA2,10,1.5\n")
    assert s["status"] == "failed"
    assert "Row 2: enter a valid, nonnegative price." in s["errors"][0]
    assert "Row 3: stock must be a nonnegative whole number." in s["errors"][0]
    assert "Row 4: stock must be a nonnegative whole number." in s["errors"][0]

    s = await fail_with("p.csv", b"Product name,SKU,Price\nA,X1,10\nB,x1,20\n")
    assert "SKU X1 is repeated" in s["errors"][0]

    s = await fail_with("p.txt", b"whatever")
    assert "CSV or Excel" in s["errors"][0]

    s = await fail_with("p.csv", b"Product name,Price\n")
    assert "at least one record" in s["errors"][0]

    # a failed import leaves nothing behind
    assert (await client.get("/api/v1/products", headers=auth(owner_token))).json()["total"] == 0


async def test_retailer_import_and_errors(client, owner_token):
    job = await upload(client, "/api/v1/retailers/import", "retailers.csv", RETAILERS_CSV, owner_token)
    status = (await client.get(f"/api/v1/import-jobs/{job.json()['id']}", headers=auth(owner_token))).json()
    assert status["status"] == "done", status
    items = (await client.get("/api/v1/retailers", headers=auth(owner_token))).json()["items"]
    assert len(items) == 3
    assert next(r for r in items if r["name"] == "Kike Stores")["phone"] == "+2348031234567"
    assert all(r["account_reference"] is None for r in items)  # provisioned later by Paystack, never a preview number

    bad = b"Retailer name,Email,Phone\nA,,\nB,not-an-email,\nC,,12345\nD,dup@x.com,\nE,dup@x.com,\n"
    job = await upload(client, "/api/v1/retailers/import", "r.csv", bad, owner_token)
    status = (await client.get(f"/api/v1/import-jobs/{job.json()['id']}", headers=auth(owner_token))).json()
    assert status["status"] == "failed"
    msg = status["errors"][0]
    assert "Row 2: add an email or phone number." in msg
    assert "Row 3: the email is not valid." in msg
    assert "Row 4: use a valid Nigerian phone number." in msg
    assert "Plus 1 more issues." in msg


async def test_product_crud_low_stock_and_restock(client, owner_token):
    h = auth(owner_token)
    created = await client.post(
        "/api/v1/products",
        json={
            "sku": "kvo-25r",
            "name": "Kings Vegetable Oil",
            "unit": "Keg 25L",
            "price": "96500",
            "stock": 18,
            "reserved": 15,
            "reorder_level": 35,
            "aliases": ["the yellow one"],
        },
        headers=h,
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["sku"] == "KVO-25R" and body["available"] == 3 and body["low_stock"] is True

    dup = await client.post("/api/v1/products", json={"sku": "KVO-25R", "name": "x", "price": "1"}, headers=h)
    assert dup.status_code == 409

    ok = await client.post(
        "/api/v1/products",
        json={"sku": "FSL-25", "name": "Fortune Soya Oil", "price": "91000", "stock": 67, "reorder_level": 30},
        headers=h,
    )
    assert ok.status_code == 201
    low = (await client.get("/api/v1/products?low_stock=true", headers=h)).json()
    assert [p["sku"] for p in low["items"]] == ["KVO-25R"]

    restocked = await client.post(f"/api/v1/products/{body['id']}/restock", json={"quantity": 40}, headers=h)
    assert restocked.json()["stock"] == 58 and restocked.json()["low_stock"] is False

    search = (await client.get("/api/v1/products?q=soya", headers=h)).json()
    assert search["total"] == 1

    gone = await client.delete(f"/api/v1/products/{body['id']}", headers=h)
    assert gone.status_code == 200
    assert (await client.get(f"/api/v1/products/{body['id']}", headers=h)).status_code == 404


async def test_retailer_crud_requires_contact(client, owner_token):
    h = auth(owner_token)
    resp = await client.post("/api/v1/retailers", json={"name": "No Contact"}, headers=h)
    assert resp.status_code == 422
    resp = await client.post(
        "/api/v1/retailers",
        json={"name": "Madam Kike", "phone": "0803 405 1198", "market": "Trade Fair", "tier": "Gold"},
        headers=h,
    )
    assert resp.status_code == 201 and resp.json()["phone"] == "+2348034051198"
    upd = await client.patch(f"/api/v1/retailers/{resp.json()['id']}", json={"terms": "7 day credit"}, headers=h)
    assert upd.json()["terms"] == "7 day credit"
