from tests.conftest import auth, register


async def test_bridge_update(client, owner_token):
    resp = await client.patch(
        "/api/v1/business/bridge", json={"method": "current", "phone": "08052016042"}, headers=auth(owner_token)
    )
    assert resp.status_code == 200
    assert resp.json()["whatsapp_number"] == "+2348052016042"
    resp = await client.patch("/api/v1/business/bridge", json={"method": "virtual"}, headers=auth(owner_token))
    assert resp.json()["whatsapp_number"] is None


async def test_invite_accept_and_role_gate(client, owner_token, mailer):
    resp = await client.post(
        "/api/v1/team/invites",
        json={"email": "musa@okafor.ng", "phone": "0706 549 0211", "role": "Sales representative"},
        headers=auth(owner_token),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["role"] == "sales"
    assert len(mailer.sent) == 1 and mailer.sent[0].to == "musa@okafor.ng"
    token = mailer.sent[0].text.rsplit("/", 1)[-1]

    # the invitee sets their own password; nothing about it was ever in the invite
    accept = await client.post(
        f"/api/v1/team/invites/{token}/accept", json={"full_name": "Musa Bello", "password": "Musa pass 9"}
    )
    assert accept.status_code == 201, accept.text
    staff_token = accept.json()["access_token"]

    me = await client.get("/api/v1/auth/me", headers=auth(staff_token))
    assert me.json()["role"] == "sales"
    assert me.json()["business"]["name"] == "Okafor Provisions"

    # a sales rep cannot manage the team or the business profile
    denied = await client.post(
        "/api/v1/team/invites", json={"email": "x@y.ng", "role": "viewer"}, headers=auth(staff_token)
    )
    assert denied.status_code == 403
    denied = await client.patch("/api/v1/business", json={"name": "Hijack"}, headers=auth(staff_token))
    assert denied.status_code == 403

    # replaying the invite link fails
    again = await client.post(
        f"/api/v1/team/invites/{token}/accept", json={"full_name": "Someone", "password": "Other pass 1"}
    )
    assert again.status_code == 400

    # owner sees both members, no pending invites, and can change the role
    team = await client.get("/api/v1/team", headers=auth(owner_token))
    body = team.json()
    assert [m["role"] for m in body["members"]] == ["owner", "sales"]
    assert body["invites"] == []
    membership_id = body["members"][1]["membership_id"]
    changed = await client.patch(
        f"/api/v1/team/{membership_id}", json={"role": "Operations manager"}, headers=auth(owner_token)
    )
    assert changed.status_code == 200 and changed.json()["role"] == "ops"

    removed = await client.delete(f"/api/v1/team/{membership_id}", headers=auth(owner_token))
    assert removed.status_code == 200
    assert (await client.get("/api/v1/auth/me", headers=auth(staff_token))).status_code == 403


async def test_cannot_invite_owner_role_or_existing_member(client, owner_token):
    resp = await client.post(
        "/api/v1/team/invites", json={"email": "z@z.ng", "role": "owner"}, headers=auth(owner_token)
    )
    assert resp.status_code == 422
    resp = await client.post(
        "/api/v1/team/invites", json={"email": "ada@okaforprovisions.ng", "role": "viewer"}, headers=auth(owner_token)
    )
    assert resp.status_code == 409


async def test_tenant_isolation(client):
    a = await register(client)
    client.cookies.clear()
    b = await register(client, email="b@other.ng", business_name="Other Ltd")
    team_a = (await client.get("/api/v1/team", headers=auth(a))).json()
    team_b = (await client.get("/api/v1/team", headers=auth(b))).json()
    assert team_a["members"][0]["email"] != team_b["members"][0]["email"]
