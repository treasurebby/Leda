from datetime import timedelta

from sqlalchemy import select

from app.core.db import utcnow
from app.core.security import hash_token
from app.models import PasswordResetToken
from tests.conftest import OWNER, auth, register


async def test_remember_choice_survives_refresh(client):
    await register(client)
    for remember in (False, True):
        response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": OWNER["email"],
                "password": OWNER["password"],
                "remember": remember,
            },
        )
        assert response.status_code == 200
        cookie = response.headers["set-cookie"].lower()
        assert "httponly" in cookie
        assert ("max-age=" in cookie) is remember
        refreshed = await client.post("/api/v1/auth/refresh")
        assert refreshed.status_code == 200
        assert ("max-age=" in refreshed.headers["set-cookie"].lower()) is remember


async def test_password_recovery_end_to_end(client, mailer, db):
    old_access = await register(client)
    old_refresh = client.cookies.get("leda_refresh")
    known = await client.post("/api/v1/auth/forgot-password", json={"email": OWNER["email"]})
    unknown = await client.post("/api/v1/auth/forgot-password", json={"email": "unknown@leda.example"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert len(mailer.sent) == 1
    raw = mailer.sent[0].text.split("/#/reset-password/")[1].split()[0]
    row = await db.scalar(select(PasswordResetToken))
    assert row.token_hash == hash_token(raw)
    assert raw not in known.text
    # A repeated request neither floods the inbox nor reveals the account.
    assert (await client.post("/api/v1/auth/forgot-password", json={"email": OWNER["email"]})).json() == known.json()
    assert len(mailer.sent) == 1
    payload = {"token": raw, "password": "New strong pass 2"}
    response = await client.post("/api/v1/auth/reset-password", json=payload)
    assert response.status_code == 200
    assert (await client.get("/api/v1/auth/me", headers=auth(old_access))).status_code == 401
    client.cookies.set("leda_refresh", old_refresh, path="/api/v1/auth")
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401
    assert (await client.post("/api/v1/auth/reset-password", json=payload)).status_code == 400
    assert (
        await client.post(
            "/api/v1/auth/login",
            json={
                "email": OWNER["email"],
                "password": OWNER["password"],
            },
        )
    ).status_code == 401
    login = await client.post("/api/v1/auth/login", json={"email": OWNER["email"], "password": payload["password"]})
    assert login.status_code == 200
    assert (await client.get("/api/v1/auth/me", headers=auth(login.json()["access_token"]))).status_code == 200


async def test_reset_rejects_expiry_and_weak_password(client, mailer, db):
    await register(client)
    await client.post("/api/v1/auth/forgot-password", json={"email": OWNER["email"]})
    raw = mailer.sent[0].text.split("/#/reset-password/")[1].split()[0]
    assert (
        await client.post("/api/v1/auth/reset-password", json={"token": raw, "password": "short"})
    ).status_code == 422
    row = await db.scalar(select(PasswordResetToken))
    row.expires_at = utcnow() - timedelta(seconds=1)
    await db.commit()
    assert (
        await client.post(
            "/api/v1/auth/reset-password",
            json={
                "token": raw,
                "password": "Another pass 1",
            },
        )
    ).status_code == 400


async def test_setup_completion_persists(client):
    token = await register(client)
    assert (await client.get("/api/v1/auth/me", headers=auth(token))).json()["business"][
        "onboarding_completed"
    ] is False
    assert (await client.post("/api/v1/business/complete-setup", headers=auth(token))).status_code == 400
    await client.patch("/api/v1/business/bridge", json={"method": "virtual"}, headers=auth(token))
    assert (await client.post("/api/v1/business/complete-setup", headers=auth(token))).json()[
        "onboarding_completed"
    ] is True
    assert (await client.get("/api/v1/auth/me", headers=auth(token))).json()["business"]["onboarding_completed"] is True


async def test_existing_invitee_authenticates_and_keeps_selected_workspace(client, mailer):
    await register(client)
    other = await register(client, email="owner@second.ng", business_name="Second workspace")
    await client.post("/api/v1/team/invites", headers=auth(other), json={"email": OWNER["email"], "role": "viewer"})
    token = mailer.sent[0].text.rsplit("/", 1)[-1]
    endpoint = f"/api/v1/team/invites/{token}/accept"
    bad = await client.post(endpoint, json={"full_name": OWNER["full_name"], "password": "Wrong pass 1"})
    assert bad.status_code == 400
    accepted = await client.post(endpoint, json={"full_name": OWNER["full_name"], "password": OWNER["password"]})
    assert accepted.status_code == 201
    refreshed = await client.post("/api/v1/auth/refresh")
    session = await client.get("/api/v1/auth/me", headers=auth(refreshed.json()["access_token"]))
    assert session.json()["business"]["name"] == "Second workspace"
    assert session.json()["role"] == "viewer"
