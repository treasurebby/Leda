import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select

from app.api.v1.auth import _set_refresh_cookie, _token_response
from app.core.deps import DB, CurrentTenant, Tenant, require
from app.integrations.email import EmailSender, get_email_sender
from app.models import Invite
from app.schemas.auth import TokenResponse
from app.schemas.common import Message
from app.schemas.team import InviteAccept, InviteCreate, InviteOut, MemberOut, RoleUpdate, TeamResponse
from app.services import auth as auth_service
from app.services import team as team_service

router = APIRouter(prefix="/team", tags=["team"])
Mailer = Annotated[EmailSender, Depends(get_email_sender)]


@router.get("", response_model=TeamResponse)
async def get_team(db: DB, tenant: CurrentTenant) -> TeamResponse:
    members = await team_service.list_members(db, tenant.business_id)
    invites = (
        (
            await db.execute(
                select(Invite)
                .where(Invite.business_id == tenant.business_id, Invite.accepted_at.is_(None))
                .order_by(Invite.created_at)
            )
        )
        .scalars()
        .all()
    )
    return TeamResponse(members=members, invites=[InviteOut.model_validate(i) for i in invites])


@router.post("/invites", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
async def create_invite(
    data: InviteCreate, db: DB, mailer: Mailer, tenant: Annotated[Tenant, Depends(require("team:write"))]
) -> InviteOut:
    try:
        invite = await team_service.create_invite(db, tenant.business, tenant.user, data, mailer)
    except team_service.TeamError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    return InviteOut.model_validate(invite)


@router.delete("/invites/{invite_id}", response_model=Message)
async def cancel_invite(
    invite_id: uuid.UUID, db: DB, tenant: Annotated[Tenant, Depends(require("team:write"))]
) -> Message:
    invite = await db.get(Invite, invite_id)
    if invite is None or invite.business_id != tenant.business_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invite not found")
    await db.delete(invite)
    await db.commit()
    return Message(detail="Invite cancelled")


@router.post("/invites/{token}/accept", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def accept_invite(token: str, data: InviteAccept, db: DB, response: Response) -> TokenResponse:
    """Public: the invitee sets their own name and password. No password ever travels in an invite."""
    try:
        user, business = await team_service.accept_invite(db, token, data)
    except team_service.TeamError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    _set_refresh_cookie(response, await auth_service.issue_refresh_token(db, user))
    return _token_response(user, business.id)


@router.patch("/{membership_id}", response_model=MemberOut)
async def update_role(
    membership_id: uuid.UUID, data: RoleUpdate, db: DB, tenant: Annotated[Tenant, Depends(require("team:write"))]
) -> MemberOut:
    try:
        await team_service.change_role(db, tenant.business_id, membership_id, data.role)
    except team_service.TeamError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    members = await team_service.list_members(db, tenant.business_id)
    return next(m for m in members if m.membership_id == membership_id)


@router.delete("/{membership_id}", response_model=Message)
async def remove_member(
    membership_id: uuid.UUID, db: DB, tenant: Annotated[Tenant, Depends(require("team:write"))]
) -> Message:
    try:
        await team_service.remove_member(db, tenant.business_id, membership_id)
    except team_service.TeamError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return Message(detail="Member removed")
