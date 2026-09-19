from tests.conftest import OWNER, auth, register


async def test_register_login_me(client):
    token = await register(client)
    me = await client.get("/api/v1/auth/me", headers=auth(token))
    assert me.status_code == 200
    body = me.json()
    assert body["user"]["email"] == OWNER["email"]
    assert body["user"]["phone"] == "+2348034051198"
    assert body["business"]["name"] == "Okafor Provisions"
    assert body["role"] == "owner"

    login = await client.post("/api/v1/auth/login", json={"email": OWNER["email"], "password": OWNER["password"]})
    assert login.status_code == 200
    assert "leda_refresh" in login.cookies


async def test_register_duplicate_email(client):
    await register(client)
    resp = await client.post("/api/v1/auth/register", json=OWNER)
    assert resp.status_code == 409


async def test_register_validation(client):
    resp = await client.post("/api/v1/auth/register", json={**OWNER, "phone": "12345", "password": "short"})
    assert resp.status_code == 422
    fields = {e["loc"][-1] for e in resp.json()["detail"]}
    assert fields == {"phone", "password"}


async def test_wrong_password(client):
    await register(client)
    resp = await client.post("/api/v1/auth/login", json={"email": OWNER["email"], "password": "nope1234"})
    assert resp.status_code == 401


async def test_refresh_rotates_and_old_token_dies(client):
    await register(client)
    first = client.cookies.get("leda_refresh")
    resp = await client.post("/api/v1/auth/refresh")
    assert resp.status_code == 200
    second = client.cookies.get("leda_refresh")
    assert second and second != first

    # replaying the first token must fail
    client.cookies.set("leda_refresh", first, path="/api/v1/auth")
    replay = await client.post("/api/v1/auth/refresh")
    assert replay.status_code == 401


async def test_logout_revokes(client):
    await register(client)
    resp = await client.post("/api/v1/auth/logout")
    assert resp.status_code == 200
    # cookie cleared -> refresh has nothing to use
    assert await (await client.post("/api/v1/auth/refresh")).aread() and True
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401


async def test_me_requires_token(client):
    assert (await client.get("/api/v1/auth/me")).status_code == 401
    assert (await client.get("/api/v1/auth/me", headers=auth("garbage"))).status_code == 401
