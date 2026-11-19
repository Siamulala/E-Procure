from collections.abc import Iterator
from datetime import datetime, timedelta, timezone

from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from cryptography.fernet import Fernet
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from alwen.auth import hash_password
from alwen.database import get_db
from alwen.main import app
from alwen.models import Base, Category, Item, Project, Staff, Store, Supplier, Unit, User, UserRole


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr("alwen.auth.PASSWORD_ITERATIONS", 10_000)
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    test_sessions = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        with test_sessions() as session:
            yield session

    with test_sessions() as session:
        category = Category(name="Accessories")
        unit = Unit(code="pcs", display_name="Pieces")
        supplier = Supplier(name="Nile Computers", normalized_name="nile computers")
        project = Project(code="KER", name="Kericho")
        store = Store(name="Main Store")
        second_store = Store(name="Site Store")
        staff = Staff(name="Store Receiver")
        session.add_all([category, unit, supplier, project, store, second_store, staff])
        session.flush()
        item = Item(name="Drop Cable", category_id=category.id, unit_id=unit.id, reorder_level="2")
        users = [
            User(
                email="admin@example.com",
                full_name="Admin",
                password_hash=hash_password("Admin-password-123"),
                role=UserRole.ADMIN.value,
            ),
            User(
                email="buyer@example.com",
                full_name="Buyer",
                password_hash=hash_password("Buyer-password-123"),
                role=UserRole.PROCUREMENT_OFFICER.value,
            ),
            User(
                email="approver@example.com",
                full_name="Approver",
                password_hash=hash_password("Approver-password-123"),
                role=UserRole.APPROVER.value,
            ),
            User(
                email="director@example.com",
                full_name="Director",
                password_hash=hash_password("Director-password-123"),
                role=UserRole.DIRECTOR.value,
            ),
            User(
                email="store@example.com",
                full_name="Store Keeper",
                password_hash=hash_password("Store-password-123"),
                role=UserRole.STORE_KEEPER.value,
            ),
            User(
                email="project@example.com",
                full_name="Project Manager",
                password_hash=hash_password("Project-password-123"),
                role=UserRole.PROJECT_MANAGER.value,
                project_id=project.id,
            ),
        ]
        session.add(item)
        session.add_all(users)
        session.commit()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    engine.dispose()


def _token(client: TestClient, email: str, password: str) -> str:
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def test_purchase_to_receipt_to_stock_issue(client: TestClient):
    buyer = _token(client, "buyer@example.com", "Buyer-password-123")
    approver = _token(client, "approver@example.com", "Approver-password-123")
    storekeeper = _token(client, "store@example.com", "Store-password-123")
    buyer_headers = {"Authorization": f"Bearer {buyer}"}
    approver_headers = {"Authorization": f"Bearer {approver}"}
    store_headers = {"Authorization": f"Bearer {storekeeper}"}

    created = client.post(
        "/purchase-requests",
        headers=buyer_headers,
        json={
            "project_id": 1,
            "lines": [{
                "item_id": 1,
                "description": "Drop cable",
                "quantity": "4",
                "unit_id": 1,
                "proposed_supplier_id": 1,
            }],
            "quotes": [{
                "supplier_id": 1,
                "reference": "Q-1",
                "lines": [{"line_index": 0, "rate": "25.00"}],
            }],
        },
    )
    assert created.status_code == 201, created.text
    request_id = created.json()["id"]
    assert created.json()["request_number"].startswith("PR-")
    assert created.json()["lines"][0]["quotes"][0]["amount"] == "100.00"

    submitted = client.post(f"/purchase-requests/{request_id}/submit", headers=buyer_headers)
    assert submitted.status_code == 200
    approved = client.post(
        f"/purchase-requests/{request_id}/decision",
        headers=approver_headers,
        json={"decision": "Approved", "comments": "Approved"},
    )
    assert approved.status_code == 200
    converted = client.post(f"/purchase-requests/{request_id}/convert-to-orders", headers=buyer_headers)
    assert converted.status_code == 201, converted.text
    order = converted.json()["purchase_orders"][0]
    assert order["order_number"] == "PO:001"
    assert order["lines"][0]["subtotal"] == "100.00"

    first_receipt = client.post(
        "/goods-receipts",
        headers=store_headers,
        json={
            "purchase_order_id": order["id"],
            "store_id": 1,
            "receiver_id": 1,
            "received_date": "2026-11-12",
            "lines": [{
                "purchase_order_line_id": order["lines"][0]["id"],
                "quantity": "2",
                "unit_cost": "20.00",
            }],
        },
    )
    assert first_receipt.status_code == 201, first_receipt.text
    assert first_receipt.json()["delivery_status"] == "Partially received"

    second_receipt = client.post(
        "/goods-receipts",
        headers=store_headers,
        json={
            "purchase_order_id": order["id"],
            "store_id": 1,
            "receiver_id": 1,
            "received_date": "2026-11-12",
            "lines": [{
                "purchase_order_line_id": order["lines"][0]["id"],
                "quantity": "2",
                "unit_cost": "30.00",
            }],
        },
    )
    assert second_receipt.status_code == 201
    assert second_receipt.json()["delivery_status"] == "Received"

    balances = client.get("/stock/balances", headers=store_headers).json()["items"]
    assert balances[0]["quantity"] == "4.000"
    assert balances[0]["average_unit_cost"] == "25.00"
    assert balances[0]["stock_value"] == "100.00"

    issued = client.post(
        "/stock/issues",
        headers=store_headers,
        json={
            "item_id": 1,
            "store_id": 1,
            "quantity": "3",
            "movement_date": "2026-11-12",
            "project_id": 1,
            "staff_id": 1,
            "purpose": "Site installation",
        },
    )
    assert issued.status_code == 201
    assert issued.json()["movement_type"] == "Issue"
    blocked = client.post(
        "/stock/issues",
        headers=store_headers,
        json={"item_id": 1, "store_id": 1, "quantity": "2", "staff_id": 1, "purpose": "Over-issue"},
    )
    assert blocked.status_code == 409
    assert client.get("/stock/balances", headers=store_headers).json()["items"][0]["quantity"] == "1.000"
    movements = client.get(
        "/stock/movements?item_id=1&store_id=1",
        headers=store_headers,
    )
    assert movements.status_code == 200
    latest_movement = movements.json()["items"][0]
    assert latest_movement["movement_type"] == "Issue"
    assert latest_movement["running_balance"] == "1.000"

    analytics = client.get("/analytics/dashboard", headers=buyer_headers)
    assert analytics.status_code == 200, analytics.text
    report = analytics.json()
    assert report["summary"]["period_po_commitments"] == "100.00"
    assert report["summary"]["open_po_value"] == "0.00"
    assert report["supplier_spend"][0]["supplier"] == "Nile Computers"
    assert report["supplier_scorecard"][0]["win_rate"] == "100.00"
    assert report["price_history"][0]["average_rate"] == "25.00"
    assert report["stock"]["low_stock_items"][0]["quantity"] == "1.000"
    assert report["stock"]["stock_value"] == "25.00"
    assert report["stock"]["by_store"][0]["stock_value"] == "25.00"
    assert report["usage_by_project"][0]["quantity"] == "3.000"
    filtered_report = client.get(
        "/analytics/dashboard?supplier_id=1&category_id=1",
        headers=buyer_headers,
    )
    assert filtered_report.status_code == 200
    assert filtered_report.json()["purchase_request_funnel"][4]["count"] == 1
    invalid_range = client.get(
        "/analytics/dashboard?start_date=2026-12-01&end_date=2026-01-01",
        headers=buyer_headers,
    )
    assert invalid_range.status_code == 422
    movement_window = client.get(
        "/analytics/dashboard?start_date=2026-11-12&end_date=2026-11-12",
        headers=buyer_headers,
    )
    assert movement_window.status_code == 200
    assert movement_window.json()["stock_movements_by_month"] == [{
        "month": "2026-11",
        "received": "4.000",
        "issued": "3.000",
    }]

    out_of_range = client.get(
        "/analytics/dashboard?start_date=2000-01-01&end_date=2000-12-31",
        headers=buyer_headers,
    )
    assert out_of_range.status_code == 200
    assert out_of_range.json()["summary"]["period_po_commitments"] == "0.00"

    export = client.get("/analytics/exports/spend.csv?group_by=supplier", headers=buyer_headers)
    assert export.status_code == 200
    assert "Nile Computers" in export.text
    assert "100.00" in export.text

    project_token = _token(client, "project@example.com", "Project-password-123")
    project_headers = {"Authorization": f"Bearer {project_token}"}
    project_report = client.get("/analytics/dashboard", headers=project_headers)
    assert project_report.status_code == 200
    assert project_report.json()["stock"] is None
    assert project_report.json()["project_spend"][0]["project"] == "Kericho"
    forbidden_project = client.get("/analytics/dashboard?project_id=99", headers=project_headers)
    assert forbidden_project.status_code == 403


def test_role_guard_rejects_non_procurement_user(client: TestClient):
    storekeeper = _token(client, "store@example.com", "Store-password-123")
    response = client.post(
        "/purchase-requests",
        headers={"Authorization": f"Bearer {storekeeper}"},
        json={"lines": [{"description": "Cable", "quantity": "1"}]},
    )
    assert response.status_code == 403


def test_approval_and_session_validation(client: TestClient):
    response = client.post("/auth/login", json={"email": "buyer@example.com", "password": "wrong"})
    assert response.status_code == 401
    assert client.get("/purchase-requests").status_code == 401

    token = _token(client, "buyer@example.com", "Buyer-password-123")
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/auth/me", headers=headers).json()["role"] == "Procurement Officer"
    assert client.post("/auth/logout", headers=headers).status_code == 204
    assert client.get("/auth/me", headers=headers).status_code == 401


def test_verified_password_reset_revokes_existing_sessions(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ALWEN_PASSWORD_RESET_KEY", "local-test-reset-key")
    old_token = _token(client, "buyer@example.com", "Buyer-password-123")
    reset = client.post(
        "/auth/password-reset/complete",
        headers={"X-Alwen-Password-Reset-Key": "local-test-reset-key"},
        json={"email": "buyer@example.com", "new_password": "New-password-456"},
    )
    assert reset.status_code == 204
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {old_token}"}).status_code == 401
    assert client.post(
        "/auth/login",
        json={"email": "buyer@example.com", "password": "New-password-456"},
    ).status_code == 200
    assert client.post(
        "/auth/password-reset/complete",
        headers={"X-Alwen-Password-Reset-Key": "incorrect"},
        json={"email": "buyer@example.com", "new_password": "Unsafe-password-456"},
    ).status_code == 403


def test_monthly_budget_override_requires_director_approval(client: TestClient):
    admin = _token(client, "admin@example.com", "Admin-password-123")
    buyer = _token(client, "buyer@example.com", "Buyer-password-123")
    approver = _token(client, "approver@example.com", "Approver-password-123")
    director = _token(client, "director@example.com", "Director-password-123")
    admin_headers = {"Authorization": f"Bearer {admin}"}
    buyer_headers = {"Authorization": f"Bearer {buyer}"}

    budget = client.put(
        "/projects/1/monthly-budgets/2026/12",
        headers=admin_headers,
        json={"amount": "50.00"},
    )
    assert budget.status_code == 200, budget.text
    request_data = {
        "required_by": "2026-12-10",
        "project_id": 1,
        "lines": [{
            "description": "Site cable",
            "quantity": "2",
            "proposed_supplier_id": 1,
        }],
        "quotes": [{
            "supplier_id": 1,
            "lines": [{"line_index": 0, "rate": "30.00"}],
        }],
    }
    created = client.post("/purchase-requests", headers=buyer_headers, json=request_data)
    assert created.status_code == 201, created.text
    request_id = created.json()["id"]
    blocked = client.post(f"/purchase-requests/{request_id}/submit", headers=buyer_headers)
    assert blocked.status_code == 409

    request_data["budget_override_reason"] = "Emergency site restoration."
    updated = client.put(
        f"/purchase-requests/{request_id}",
        headers=buyer_headers,
        json=request_data,
    )
    assert updated.status_code == 200, updated.text
    submitted = client.post(f"/purchase-requests/{request_id}/submit", headers=buyer_headers)
    assert submitted.status_code == 200, submitted.text

    wrong_approver = client.post(
        f"/purchase-requests/{request_id}/decision",
        headers={"Authorization": f"Bearer {approver}"},
        json={"decision": "Approved"},
    )
    assert wrong_approver.status_code == 403
    approved = client.post(
        f"/purchase-requests/{request_id}/decision",
        headers={"Authorization": f"Bearer {director}"},
        json={"decision": "Approved"},
    )
    assert approved.status_code == 200, approved.text
    assert "Budget override: Emergency site restoration." in approved.json()["approvals"][0]["comments"]


def test_approval_delegation_allows_delegate_to_decide(client: TestClient):
    buyer = _token(client, "buyer@example.com", "Buyer-password-123")
    approver = _token(client, "approver@example.com", "Approver-password-123")
    buyer_headers = {"Authorization": f"Bearer {buyer}"}
    approver_headers = {"Authorization": f"Bearer {approver}"}
    now = datetime.now(timezone.utc)
    delegation = client.post(
        "/approval-delegations",
        headers=approver_headers,
        json={
            "delegate_user_id": 2,
            "starts_at": (now - timedelta(days=1)).isoformat(),
            "ends_at": (now + timedelta(days=1)).isoformat(),
        },
    )
    assert delegation.status_code == 201, delegation.text

    request = client.post(
        "/purchase-requests",
        headers=buyer_headers,
        json={
            "project_id": 1,
            "lines": [{"description": "Routine supply", "quantity": "1"}],
        },
    )
    assert request.status_code == 201
    request_id = request.json()["id"]
    assert client.post(f"/purchase-requests/{request_id}/submit", headers=buyer_headers).status_code == 200
    decision = client.post(
        f"/purchase-requests/{request_id}/decision",
        headers=buyer_headers,
        json={"decision": "Approved"},
    )
    assert decision.status_code == 200, decision.text


def test_supplier_onboarding_suspends_until_all_documents_are_reapproved(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    monkeypatch.setattr("alwen.suppliers.UPLOAD_ROOT", tmp_path)
    buyer = _token(client, "buyer@example.com", "Buyer-password-123")
    headers = {"Authorization": f"Bearer {buyer}"}
    supplier = client.post("/suppliers", headers=headers, json={"name": "Compliance Supplier"})
    assert supplier.status_code == 201
    supplier_id = supplier.json()["id"]

    onboarding = client.get(f"/suppliers/{supplier_id}/onboarding", headers=headers)
    assert onboarding.status_code == 200
    assert onboarding.json()["supplier_status"] == "Suspended"
    assert len([item for item in onboarding.json()["items"] if not item["present"]]) == 4

    document_types = [
        "KRA PIN certificate",
        "Certificate of incorporation",
        "Tax compliance certificate",
        "Bank confirmation",
    ]
    for document_type in document_types:
        uploaded = client.post(
            f"/suppliers/{supplier_id}/documents",
            headers=headers,
            params={"document_type": document_type, "expires_on": "2027-12-31"},
            files={"file": ("certificate.pdf", b"%PDF-1.4 sample", "application/pdf")},
        )
        assert uploaded.status_code == 201, uploaded.text

    assert client.post(f"/suppliers/{supplier_id}/reapprove", headers=headers).status_code == 403
    director = _token(client, "director@example.com", "Director-password-123")
    reapproved = client.post(
        f"/suppliers/{supplier_id}/reapprove",
        headers={"Authorization": f"Bearer {director}"},
    )
    assert reapproved.status_code == 200, reapproved.text
    assert reapproved.json()["status"] == "Active"


def test_contract_prices_and_quantity_limits_apply_to_purchase_requests(client: TestClient):
    buyer = _token(client, "buyer@example.com", "Buyer-password-123")
    approver = _token(client, "approver@example.com", "Approver-password-123")
    buyer_headers = {"Authorization": f"Bearer {buyer}"}
    contract = client.post(
        "/contracts",
        headers=buyer_headers,
        json={
            "contract_number": "ALW-2026-001",
            "supplier_id": 1,
            "start_date": "2026-01-01",
            "end_date": "2027-12-31",
            "payment_terms": "30 days",
            "lines": [{
                "item_id": 1,
                "description": "Drop cable",
                "agreed_price": "10.00",
                "max_quantity": "5",
            }],
        },
    )
    assert contract.status_code == 201, contract.text
    contract_id = contract.json()["id"]
    contract_line_id = contract.json()["lines"][0]["id"]
    activated = client.post(f"/contracts/{contract_id}/activate", headers=buyer_headers)
    assert activated.status_code == 200, activated.text

    def create_request(quantity):
        created = client.post(
            "/purchase-requests",
            headers=buyer_headers,
            json={
                "project_id": 1,
                "lines": [{
                    "item_id": 1,
                    "description": "Drop cable",
                    "quantity": str(quantity),
                    "proposed_supplier_id": 1,
                    "contract_line_id": contract_line_id,
                }],
            },
        )
        assert created.status_code == 201, created.text
        request_id = created.json()["id"]
        assert client.post(f"/purchase-requests/{request_id}/submit", headers=buyer_headers).status_code == 200
        assert client.post(
            f"/purchase-requests/{request_id}/decision",
            headers={"Authorization": f"Bearer {approver}"},
            json={"decision": "Approved"},
        ).status_code == 200
        return request_id

    request_id = create_request(4)
    converted = client.post(f"/purchase-requests/{request_id}/convert-to-orders", headers=buyer_headers)
    assert converted.status_code == 201, converted.text
    order_line = converted.json()["purchase_orders"][0]["lines"][0]
    assert order_line["unit_price"] == "10.00"

    second_request = create_request(2)
    blocked = client.post(
        f"/purchase-requests/{second_request}/convert-to-orders",
        headers=buyer_headers,
    )
    assert blocked.status_code == 409


def test_supplier_vat_is_calculated_and_etims_is_required_before_payment(client: TestClient):
    admin = _token(client, "admin@example.com", "Admin-password-123")
    admin_headers = {"Authorization": f"Bearer {admin}"}
    tax = client.put(
        "/tax/settings",
        headers=admin_headers,
        json={"vat_rate": "0.1600", "wht_rates": {"services": "0.05"}},
    )
    assert tax.status_code == 200, tax.text
    supplier = client.post(
        "/suppliers",
        headers=admin_headers,
        json={"name": "VAT Supplier", "vat_registered": True},
    )
    assert supplier.status_code == 201, supplier.text
    invoice = client.post(
        "/invoices",
        headers=admin_headers,
        json={
            "supplier_id": supplier.json()["id"],
            "invoice_number": "VAT-INV-001",
            "invoice_date": "2026-11-14",
            "lines": [{
                "item_id": 1,
                "description": "Drop cable",
                "quantity": "2",
                "unit_price": "50.00",
            }],
        },
    )
    assert invoice.status_code == 201, invoice.text
    assert invoice.json()["net_amount"] == "100.00"
    assert invoice.json()["vat_amount"] == "16.00"
    assert invoice.json()["total_amount"] == "116.00"
    payment = client.post(
        f"/invoices/{invoice.json()['id']}/payments",
        headers=admin_headers,
        json={"amount": "10.00", "payment_date": "2026-11-14"},
    )
    assert payment.status_code == 409
    assert "eTIMS" in payment.json()["detail"]


def test_notifications_can_be_filtered_and_marked_read(client: TestClient):
    buyer = _token(client, "buyer@example.com", "Buyer-password-123")
    approver = _token(client, "approver@example.com", "Approver-password-123")
    buyer_headers = {"Authorization": f"Bearer {buyer}"}
    approver_headers = {"Authorization": f"Bearer {approver}"}
    preferences = client.put(
        "/notifications/preferences/me",
        headers=approver_headers,
        json={"email_enabled": False, "sms_enabled": False, "alert_kinds": ["approval_required"]},
    )
    assert preferences.status_code == 200
    request = client.post(
        "/purchase-requests",
        headers=buyer_headers,
        json={"lines": [{"description": "Routine order", "quantity": "1"}]},
    )
    assert request.status_code == 201
    submitted = client.post(
        f"/purchase-requests/{request.json()['id']}/submit",
        headers=buyer_headers,
    )
    assert submitted.status_code == 200
    inbox = client.get("/notifications/me?unread_only=true", headers=approver_headers)
    assert inbox.status_code == 200
    notification = inbox.json()["items"][0]
    assert notification["kind"] == "approval_required"
    marked = client.patch(f"/notifications/{notification['id']}/read", headers=approver_headers)
    assert marked.status_code == 200
    assert client.get("/notifications/me?unread_only=true", headers=approver_headers).json()["items"] == []


def test_qbo_oauth_and_reference_sync_use_mocked_intuit_api(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    admin = _token(client, "admin@example.com", "Admin-password-123")
    headers = {"Authorization": f"Bearer {admin}"}
    monkeypatch.setenv("ALWEN_QBO_CLIENT_ID", "test-client")
    monkeypatch.setenv("ALWEN_QBO_CLIENT_SECRET", "test-secret")
    monkeypatch.setenv("ALWEN_QBO_REDIRECT_URI", "http://localhost:8000/integrations/qbo/callback")
    monkeypatch.setenv("ALWEN_QBO_ENCRYPTION_KEY", Fernet.generate_key().decode("ascii"))
    monkeypatch.setattr(
        "alwen.integrations.qbo.router._token_exchange",
        lambda form: {
            "access_token": "mock-access-token",
            "refresh_token": "mock-refresh-token",
            "expires_in": 3600,
        },
    )
    authorize = client.get("/integrations/qbo/authorize", headers=headers)
    assert authorize.status_code == 200, authorize.text
    state = parse_qs(urlparse(authorize.json()["authorization_url"]).query)["state"][0]
    callback = client.get(
        "/integrations/qbo/callback",
        params={"code": "mock-code", "realmId": "realm-1", "state": state},
    )
    assert callback.status_code == 200, callback.text
    assert callback.json()["connected"] is True

    def mocked_api(db, connection, method, path, payload=None):
        decoded = path.replace("%20", " ")
        entity = decoded.split("FROM ", 1)[1].split()[0]
        records = {
            "Item": [{"Id": "item-1", "Name": "Drop Cable", "SyncToken": "0"}],
            "Vendor": [{"Id": "vendor-1", "Name": "Nile Computers", "SyncToken": "0"}],
            "Class": [{"Id": "class-1", "Name": "Kericho", "SyncToken": "0"}],
            "Account": [{"Id": "account-1", "Name": "Operating bank", "AccountType": "Bank", "Active": True}],
        }[entity]
        return {"QueryResponse": {entity: records}}

    monkeypatch.setattr("alwen.integrations.qbo.router._api", mocked_api)
    imported = client.post("/integrations/qbo/sync/import", headers=headers)
    assert imported.status_code == 200, imported.text
    assert {name: data["mapped"] for name, data in imported.json().items()} == {
        "Item": 1,
        "Vendor": 1,
        "Class": 1,
        "Account": 1,
    }


def test_qbo_export_only_csv_is_available_without_oauth(client: TestClient):
    admin = _token(client, "admin@example.com", "Admin-password-123")
    exported = client.get(
        "/integrations/qbo/export/purchase-orders.csv",
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert exported.status_code == 200
    assert "DocNumber,Vendor,Project,Description,Quantity,UnitPrice,Amount" in exported.text


def test_stock_returns_transfers_and_approved_adjustments(client: TestClient):
    storekeeper = _token(client, "store@example.com", "Store-password-123")
    approver = _token(client, "approver@example.com", "Approver-password-123")
    store_headers = {"Authorization": f"Bearer {storekeeper}"}
    approver_headers = {"Authorization": f"Bearer {approver}"}

    receipt = client.post(
        "/goods-receipts",
        headers=store_headers,
        json={
            "store_id": 1,
            "receiver_id": 1,
            "received_date": "2026-11-12",
            "lines": [{"item_id": 1, "quantity": "5", "unit_cost": "8.00"}],
        },
    )
    assert receipt.status_code == 201
    issue = client.post(
        "/stock/issues",
        headers=store_headers,
        json={"item_id": 1, "store_id": 1, "quantity": "3", "staff_id": 1, "purpose": "Project issue"},
    )
    assert issue.status_code == 201

    returned = client.post(
        "/stock/returns",
        headers=store_headers,
        json={
            "original_issue_id": issue.json()["id"],
            "quantity": "1",
            "reason": "Unused material",
        },
    )
    assert returned.status_code == 201
    too_much_returned = client.post(
        "/stock/returns",
        headers=store_headers,
        json={
            "original_issue_id": issue.json()["id"],
            "quantity": "3",
            "reason": "Duplicate return",
        },
    )
    assert too_much_returned.status_code == 409

    transfer = client.post(
        "/stock/transfers",
        headers=store_headers,
        json={
            "item_id": 1,
            "from_store_id": 1,
            "to_store_id": 2,
            "quantity": "2",
            "reason": "Move to site store",
        },
    )
    assert transfer.status_code == 201
    assert transfer.json()["out"]["quantity"] == transfer.json()["in"]["quantity"] == "2.000"

    unauthorized_adjustment = client.post(
        "/stock/adjustments",
        headers=store_headers,
        json={
            "item_id": 1,
            "store_id": 2,
            "quantity_delta": "-1",
            "reason": "Stocktake",
        },
    )
    assert unauthorized_adjustment.status_code == 403
    adjustment = client.post(
        "/stock/adjustments",
        headers=approver_headers,
        json={
            "item_id": 1,
            "store_id": 2,
            "quantity_delta": "-1",
            "reason": "Approved stocktake variance",
        },
    )
    assert adjustment.status_code == 201
    assert adjustment.json()["quantity"] == "-1.000"

    balances = client.get("/stock/balances", headers=approver_headers).json()["items"]
    assert {row["store_id"]: row["quantity"] for row in balances} == {1: "1.000", 2: "1.000"}


def test_login_rate_limit_blocks_after_ten_failed_attempts(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr("alwen.auth._failed_login_attempts", {})
    payload = {"email": "unknown@example.com", "password": "wrong"}

    for _ in range(10):
        response = client.post("/auth/login", json=payload)
        assert response.status_code == 401

    limited = client.post("/auth/login", json=payload)
    assert limited.status_code == 429
    assert int(limited.headers["Retry-After"]) > 0


def test_budget_report_includes_configured_project_month(
    client: TestClient,
):
    admin_headers = {"Authorization": f"Bearer {_token(client, 'admin@example.com', 'Admin-password-123')}"}
    configured = client.put(
        "/projects/1/monthly-budgets/2026/11",
        headers=admin_headers,
        json={"amount": "12500.00"},
    )
    assert configured.status_code == 200, configured.text

    report = client.get("/reports/budget-vs-actual?year=2026", headers=admin_headers)
    assert report.status_code == 200, report.text
    row = next(item for item in report.json()["items"] if item["project_id"] == 1 and item["month"] == 11)
    assert row["budget"] == "12500.00"
