"""Password recovery, remembered sessions, and onboarding completion.

Revision ID: 8c291a4e5b20
Revises: 602f6d27a691
"""
from alembic import op
import sqlalchemy as sa

revision = "8c291a4e5b20"
down_revision = "602f6d27a691"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("auth_version", sa.Integer(), nullable=False, server_default="0"))
    # Existing workspaces stay accessible; newly registered workspaces start incomplete.
    op.add_column("businesses", sa.Column("onboarding_completed", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.alter_column("businesses", "onboarding_completed", server_default=sa.false())
    op.add_column("refresh_tokens", sa.Column("remember", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("refresh_tokens", sa.Column("business_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_refresh_tokens_business_id_businesses", "refresh_tokens", "businesses", ["business_id"], ["id"], ondelete="CASCADE")
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_password_reset_tokens_user_id", "password_reset_tokens", ["user_id"])
    op.create_index("ix_password_reset_tokens_token_hash", "password_reset_tokens", ["token_hash"], unique=True)


def downgrade():
    op.drop_table("password_reset_tokens")
    op.drop_constraint("fk_refresh_tokens_business_id_businesses", "refresh_tokens", type_="foreignkey")
    op.drop_column("refresh_tokens", "business_id")
    op.drop_column("refresh_tokens", "remember")
    op.drop_column("businesses", "onboarding_completed")
    op.drop_column("users", "auth_version")
