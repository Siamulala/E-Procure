"""Add workflow sessions and stock balances.

Revision ID: fa459fb720d4
Revises: c2585998b9df
Create Date: 2026-11-12 15:12:33.472912
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "fa459fb720d4"
down_revision: Union[str, None] = "c2585998b9df"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _inspector():
    return sa.inspect(op.get_bind())


def _columns(table_name: str) -> set[str]:
    return {column["name"] for column in _inspector().get_columns(table_name)}


def _indexes(table_name: str) -> set[str]:
    return {index["name"] for index in _inspector().get_indexes(table_name)}


def _foreign_keys(table_name: str) -> set[str]:
    return {foreign_key["name"] for foreign_key in _inspector().get_foreign_keys(table_name)}


def upgrade() -> None:
    inspector = _inspector()
    if "api_sessions" not in inspector.get_table_names():
        op.create_table(
            "api_sessions",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("token_hash", sa.String(length=64), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(
                ["user_id"], ["users.id"],
                name=op.f("fk_api_sessions_user_id_users"),
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id", name=op.f("pk_api_sessions")),
            sa.UniqueConstraint("token_hash", name=op.f("uq_api_sessions_token_hash")),
        )
    for index_name, column_name in (
        (op.f("ix_api_sessions_expires_at"), "expires_at"),
        (op.f("ix_api_sessions_user_id"), "user_id"),
    ):
        if index_name not in _indexes("api_sessions"):
            op.create_index(index_name, "api_sessions", [column_name], unique=False)

    if "stock_balances" not in _inspector().get_table_names():
        op.create_table(
            "stock_balances",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("item_id", sa.Integer(), nullable=False),
            sa.Column("store_id", sa.Integer(), nullable=False),
            sa.Column("quantity", sa.Numeric(precision=14, scale=3), nullable=False),
            sa.Column("average_unit_cost", sa.Numeric(precision=14, scale=2), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(
                ["item_id"], ["items.id"],
                name=op.f("fk_stock_balances_item_id_items"),
            ),
            sa.ForeignKeyConstraint(
                ["store_id"], ["stores.id"],
                name=op.f("fk_stock_balances_store_id_stores"),
            ),
            sa.PrimaryKeyConstraint("id", name=op.f("pk_stock_balances")),
            sa.UniqueConstraint("item_id", "store_id", name=op.f("uq_stock_balances_item_id")),
        )
    for index_name, column_name in (
        (op.f("ix_stock_balances_item_id"), "item_id"),
        (op.f("ix_stock_balances_store_id"), "store_id"),
    ):
        if index_name not in _indexes("stock_balances"):
            op.create_index(index_name, "stock_balances", [column_name], unique=False)

    receipt_columns = _columns("goods_receipt_lines")
    receipt_indexes = _indexes("goods_receipt_lines")
    receipt_fks = _foreign_keys("goods_receipt_lines")
    receipt_fk_name = op.f("fk_goods_receipt_lines_purchase_order_line_id_purchase_order_lines")
    with op.batch_alter_table("goods_receipt_lines") as batch:
        if "purchase_order_line_id" not in receipt_columns:
            batch.add_column(sa.Column("purchase_order_line_id", sa.Integer(), nullable=True))
        if op.f("ix_goods_receipt_lines_purchase_order_line_id") not in receipt_indexes:
            batch.create_index(op.f("ix_goods_receipt_lines_purchase_order_line_id"), ["purchase_order_line_id"])
        if receipt_fk_name not in receipt_fks:
            batch.create_foreign_key(
                receipt_fk_name,
                "purchase_order_lines",
                ["purchase_order_line_id"],
                ["id"],
            )

    po_columns = _columns("purchase_order_lines")
    po_indexes = _indexes("purchase_order_lines")
    po_fks = _foreign_keys("purchase_order_lines")
    po_fk_name = op.f("fk_purchase_order_lines_request_line_id_purchase_request_lines")
    po_unique_name = op.f("uq_purchase_order_lines_request_line_id")
    with op.batch_alter_table("purchase_order_lines") as batch:
        if "request_line_id" not in po_columns:
            batch.add_column(sa.Column("request_line_id", sa.Integer(), nullable=True))
        if op.f("ix_purchase_order_lines_request_line_id") not in po_indexes:
            batch.create_index(op.f("ix_purchase_order_lines_request_line_id"), ["request_line_id"])
        if po_unique_name not in {constraint.get("name") for constraint in _inspector().get_unique_constraints("purchase_order_lines")}:
            batch.create_unique_constraint(po_unique_name, ["request_line_id"])
        if po_fk_name not in po_fks:
            batch.create_foreign_key(
                po_fk_name,
                "purchase_request_lines",
                ["request_line_id"],
                ["id"],
            )

    request_columns = _columns("purchase_requests")
    request_fks = _foreign_keys("purchase_requests")
    request_fk_name = op.f("fk_purchase_requests_created_by_id_users")
    with op.batch_alter_table("purchase_requests") as batch:
        if "created_by_id" not in request_columns:
            batch.add_column(sa.Column("created_by_id", sa.Integer(), nullable=True))
        if request_fk_name not in request_fks:
            batch.create_foreign_key(request_fk_name, "users", ["created_by_id"], ["id"])


def downgrade() -> None:
    request_columns = _columns("purchase_requests")
    request_fks = _foreign_keys("purchase_requests")
    request_fk_name = op.f("fk_purchase_requests_created_by_id_users")
    with op.batch_alter_table("purchase_requests") as batch:
        if request_fk_name in request_fks:
            batch.drop_constraint(request_fk_name, type_="foreignkey")
        if "created_by_id" in request_columns:
            batch.drop_column("created_by_id")

    po_columns = _columns("purchase_order_lines")
    po_fks = _foreign_keys("purchase_order_lines")
    po_fk_name = op.f("fk_purchase_order_lines_request_line_id_purchase_request_lines")
    po_unique_name = op.f("uq_purchase_order_lines_request_line_id")
    po_indexes = _indexes("purchase_order_lines")
    with op.batch_alter_table("purchase_order_lines") as batch:
        if po_fk_name in po_fks:
            batch.drop_constraint(po_fk_name, type_="foreignkey")
        if po_unique_name in {constraint.get("name") for constraint in _inspector().get_unique_constraints("purchase_order_lines")}:
            batch.drop_constraint(po_unique_name, type_="unique")
        if op.f("ix_purchase_order_lines_request_line_id") in po_indexes:
            batch.drop_index(op.f("ix_purchase_order_lines_request_line_id"))
        if "request_line_id" in po_columns:
            batch.drop_column("request_line_id")

    receipt_columns = _columns("goods_receipt_lines")
    receipt_fks = _foreign_keys("goods_receipt_lines")
    receipt_fk_name = op.f("fk_goods_receipt_lines_purchase_order_line_id_purchase_order_lines")
    receipt_indexes = _indexes("goods_receipt_lines")
    with op.batch_alter_table("goods_receipt_lines") as batch:
        if receipt_fk_name in receipt_fks:
            batch.drop_constraint(receipt_fk_name, type_="foreignkey")
        if op.f("ix_goods_receipt_lines_purchase_order_line_id") in receipt_indexes:
            batch.drop_index(op.f("ix_goods_receipt_lines_purchase_order_line_id"))
        if "purchase_order_line_id" in receipt_columns:
            batch.drop_column("purchase_order_line_id")

    if "stock_balances" in _inspector().get_table_names():
        op.drop_table("stock_balances")
    if "api_sessions" in _inspector().get_table_names():
        op.drop_table("api_sessions")
