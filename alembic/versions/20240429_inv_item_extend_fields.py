"""Add extended inventory item fields.

Revision ID: 20240429_inv_ext
Revises: 20240429_add_last_login_to_users
Create Date: 2024-04-29
"""

from alembic import op
import sqlalchemy as sa


revision = "20240429_inv_ext"
down_revision = "20240429_add_last_login_to_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {column["name"] for column in inspector.get_columns("inventory_items")}

    def add_column_if_missing(column: sa.Column) -> None:
        if column.name not in existing_columns:
            op.add_column("inventory_items", column)

    add_column_if_missing(sa.Column("subcategory", sa.String(length=120), nullable=True))
    add_column_if_missing(sa.Column("brand", sa.String(length=120), nullable=True))
    add_column_if_missing(sa.Column("reorder_quantity", sa.Integer(), nullable=False, server_default="50"))
    add_column_if_missing(sa.Column("cost_price", sa.Numeric(12, 2), nullable=False, server_default="0"))
    add_column_if_missing(sa.Column("sale_price", sa.Numeric(12, 2), nullable=True))
    add_column_if_missing(sa.Column("tax_rate", sa.Numeric(5, 2), nullable=False, server_default="0"))
    add_column_if_missing(sa.Column("weight_kg", sa.Float(), nullable=True))
    add_column_if_missing(sa.Column("dimensions", sa.String(length=100), nullable=True))
    add_column_if_missing(sa.Column("expiry_date", sa.DateTime(), nullable=True))
    add_column_if_missing(sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")))
    add_column_if_missing(sa.Column("featured", sa.Boolean(), nullable=False, server_default=sa.text("0")))
    add_column_if_missing(sa.Column("supplier_id", sa.Integer(), nullable=True))

    existing_fks = {fk["name"] for fk in inspector.get_foreign_keys("inventory_items")}
    if "fk_inventory_items_supplier_id_suppliers" not in existing_fks:
        op.create_foreign_key(
            "fk_inventory_items_supplier_id_suppliers",
            "inventory_items",
            "suppliers",
            ["supplier_id"],
            ["id"],
        )


def downgrade() -> None:
    op.drop_constraint("fk_inventory_items_supplier_id_suppliers", "inventory_items", type_="foreignkey")
    op.drop_column("inventory_items", "supplier_id")
    op.drop_column("inventory_items", "featured")
    op.drop_column("inventory_items", "is_active")
    op.drop_column("inventory_items", "expiry_date")
    op.drop_column("inventory_items", "dimensions")
    op.drop_column("inventory_items", "weight_kg")
    op.drop_column("inventory_items", "tax_rate")
    op.drop_column("inventory_items", "sale_price")
    op.drop_column("inventory_items", "cost_price")
    op.drop_column("inventory_items", "reorder_quantity")
    op.drop_column("inventory_items", "brand")
    op.drop_column("inventory_items", "subcategory")
