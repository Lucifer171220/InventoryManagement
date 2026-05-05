"""add product image fields

Revision ID: 20260501_add_product_image_fields
Revises: 20240429_inv_ext
Create Date: 2026-05-01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260501_add_product_image_fields"
down_revision = "20240429_inv_ext"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {column["name"] for column in inspector.get_columns("inventory_items")}
    if "image_url" not in existing_columns:
        op.add_column("inventory_items", sa.Column("image_url", sa.String(length=500), nullable=True))
    if "image_prompt" not in existing_columns:
        op.add_column("inventory_items", sa.Column("image_prompt", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("inventory_items", "image_prompt")
    op.drop_column("inventory_items", "image_url")
