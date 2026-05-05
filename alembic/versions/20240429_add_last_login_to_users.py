"""Add last_login column to users table.

Revision ID: 20240429_add_last_login_to_users
Revises: None
Create Date: 2024-04-29
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20240429_add_last_login_to_users"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add last_login column (nullable DateTime)."""
    op.add_column(
        "users",
        sa.Column("last_login", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    """Remove the column if rolling back."""
    op.drop_column("users", "last_login")
