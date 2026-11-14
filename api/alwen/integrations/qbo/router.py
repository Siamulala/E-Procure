import base64
import csv
import hashlib
import io
import json
import os
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from alwen.auth import require_roles
from alwen.database import get_db
from alwen.models import (
    BillPayment,
    Item,
    Project,
    PurchaseOrder,
    PurchaseOrderLine,
    QboAccountMapping,
    QboConnection,
    QboOAuthState,
    QboSyncLog,
    StockBalance,
    Supplier,
    SupplierInvoice,
    SupplierInvoiceLine,
    User,
    utc_now,
)


router = APIRouter(prefix="/integrations/qbo", tags=["QuickBooks Online"])
ADMIN = ("Admin",)
OAUTH_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"


def _environment() -> str:
    environment = os.getenv("ALWEN_QBO_ENV", "sandbox").lower()
    if environment not in {"sandbox", "production"}:
        raise HTTPException(status_code=503, detail="ALWEN_QBO_ENV must be 'sandbox' or 'production'.")
    return environment


def _fernet() -> Fernet:
    key = os.getenv("ALWEN_QBO_ENCRYPTION_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="QBO token encryption is not configured.")
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as error:
        raise HTTPException(status_code=503, detail="ALWEN_QBO_ENCRYPTION_KEY must be a Fernet key.") from error


def _encrypt(token: str) -> str:
    return _fernet().encrypt(token.encode()).decode("ascii")


def _decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeEncodeError) as error:
        raise HTTPException(status_code=503, detail="Stored QBO credentials cannot be decrypted.") from error


def _qbo_api_base(environment: str) -> str:
    host = (
        "https://quickbooks.api.intuit.com"
        if environment == "production"
        else "https://sandbox-quickbooks.api.intuit.com"
    )
    return f"{host}/v3/company"


def _token_exchange(form: dict[str, str]) -> dict:
    client_id = os.getenv("ALWEN_QBO_CLIENT_ID", "")
    client_secret = os.getenv("ALWEN_QBO_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        raise HTTPException(status_code=503, detail="QBO OAuth client credentials are not configured.")
    authorization = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode("ascii")
    request = urllib.request.Request(
        OAUTH_TOKEN_URL,
        data=urllib.parse.urlencode(form).encode(),
        headers={
            "Authorization": f"Basic {authorization}",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise HTTPException(status_code=502, detail=f"QBO OAuth request failed with HTTP {error.code}.") from error
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=502, detail="QBO OAuth service is unavailable.") from error


def _api_request(
    environment: str,
    realm_id: str,
    access_token: str,
    method: str,
    path: str,
    payload: dict | None = None,
) -> dict:
    url = f"{_qbo_api_base(environment)}/{urllib.parse.quote(realm_id, safe='')}/{path.lstrip('/')}"
    data = json.dumps(payload).encode() if payload is not None else None
    for attempt in range(4):
        request = urllib.request.Request(
            url,
            data=data,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                body = response.read()
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as error:
            if error.code == 429 or 500 <= error.code < 600:
                if attempt < 3:
                    retry_after = error.headers.get("Retry-After")
                    delay = min(30, int(retry_after)) if retry_after and retry_after.isdigit() else 2 ** attempt
                    time.sleep(delay)
                    continue
            response_body = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"QBO API returned HTTP {error.code}: {response_body[:1000]}") from error
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt < 3:
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError("QBO API request failed after retries.") from error
        except json.JSONDecodeError as error:
            raise RuntimeError("QBO API returned invalid JSON.") from error
    raise RuntimeError("QBO API request exhausted its retries.")


def _connection(db: Session, realm_id: str | None = None) -> QboConnection:
    statement = select(QboConnection).where(QboConnection.is_enabled.is_(True))
    if realm_id is not None:
        statement = statement.where(QboConnection.realm_id == realm_id)
    connection = db.scalar(statement.order_by(QboConnection.id.desc()))
    if connection is None:
        raise HTTPException(status_code=503, detail="No enabled QuickBooks Online connection is configured.")
    return connection


def _api(
    db: Session,
    connection: QboConnection,
    method: str,
    path: str,
    payload: dict | None = None,
) -> dict:
    access_token = _decrypt(connection.access_token_encrypted)
    expires_at = connection.access_token_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= utc_now() + timedelta(minutes=5):
        refresh_token = _decrypt(connection.refresh_token_encrypted)
        tokens = _token_exchange({
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        })
        if not tokens.get("access_token") or not tokens.get("refresh_token"):
            raise RuntimeError("QBO refresh response did not contain both tokens.")
        connection.access_token_encrypted = _encrypt(tokens["access_token"])
        connection.refresh_token_encrypted = _encrypt(tokens["refresh_token"])
        connection.access_token_expires_at = utc_now() + timedelta(seconds=int(tokens.get("expires_in", 3600)))
        db.commit()
        access_token = tokens["access_token"]
    return _api_request(connection.environment, connection.realm_id, access_token, method, path, payload)


@router.get("/authorize")
def authorize(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*ADMIN)),
) -> dict:
    client_id = os.getenv("ALWEN_QBO_CLIENT_ID", "")
    redirect_uri = os.getenv("ALWEN_QBO_REDIRECT_URI", "")
    if not client_id or not redirect_uri:
        raise HTTPException(status_code=503, detail="QBO OAuth client ID and redirect URI must be configured.")
    _fernet()
    state = secrets.token_urlsafe(32)
    db.add(QboOAuthState(
        state_hash=hashlib.sha256(state.encode("ascii")).hexdigest(),
        user_id=user.id,
        expires_at=utc_now() + timedelta(minutes=10),
    ))
    db.commit()
    params = urllib.parse.urlencode({
        "client_id": client_id,
        "response_type": "code",
        "scope": "com.intuit.quickbooks.accounting",
        "redirect_uri": redirect_uri,
        "state": state,
    })
    return {"authorization_url": f"https://appcenter.intuit.com/connect/oauth2?{params}"}


@router.get("/callback")
def callback(
    code: str,
    realmId: str,
    state: str,
    db: Session = Depends(get_db),
) -> dict:
    state_hash = hashlib.sha256(state.encode("ascii")).hexdigest()
    oauth_state = db.scalar(select(QboOAuthState).where(QboOAuthState.state_hash == state_hash))
    if oauth_state is None:
        raise HTTPException(status_code=400, detail="Invalid or already-used QBO OAuth state.")
    expires_at = oauth_state.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= utc_now():
        db.delete(oauth_state)
        db.commit()
        raise HTTPException(status_code=400, detail="QBO OAuth state has expired.")
    redirect_uri = os.getenv("ALWEN_QBO_REDIRECT_URI", "")
    if not redirect_uri:
        raise HTTPException(status_code=503, detail="QBO OAuth redirect URI is not configured.")
    tokens = _token_exchange({
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
    })
    if not tokens.get("access_token") or not tokens.get("refresh_token"):
        raise HTTPException(status_code=502, detail="QBO OAuth response did not include both tokens.")
    connection = db.scalar(select(QboConnection).where(QboConnection.realm_id == realmId))
    if connection is None:
        connection = QboConnection(
            realm_id=realmId,
            environment=_environment(),
            access_token_encrypted="",
            refresh_token_encrypted="",
            access_token_expires_at=utc_now(),
            connected_by_id=oauth_state.user_id,
            is_enabled=True,
        )
        db.add(connection)
    connection.environment = _environment()
    connection.access_token_encrypted = _encrypt(tokens["access_token"])
    connection.refresh_token_encrypted = _encrypt(tokens["refresh_token"])
    connection.access_token_expires_at = utc_now() + timedelta(seconds=int(tokens.get("expires_in", 3600)))
    connection.connected_by_id = oauth_state.user_id
    connection.is_enabled = True
    db.delete(oauth_state)
    db.commit()
    return {"connected": True, "realm_id": realmId, "environment": connection.environment}


@router.get("/status")
def connection_status(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*ADMIN)),
) -> dict:
    connection = db.scalar(select(QboConnection).order_by(QboConnection.id.desc()))
    return {
        "configured": bool(connection and connection.is_enabled),
        "realm_id": connection.realm_id if connection else None,
        "environment": connection.environment if connection else _environment(),
        "access_token_expires_at": connection.access_token_expires_at.isoformat() if connection else None,
    }


def _query_all(db: Session, connection: QboConnection, entity: str) -> list[dict]:
    records = []
    start = 1
    while True:
        query = urllib.parse.quote(f"SELECT * FROM {entity} STARTPOSITION {start} MAXRESULTS 1000", safe="")
        response = _api(db, connection, "GET", f"query?query={query}")
        values = response.get("QueryResponse", {}).get(entity, [])
        records.extend(values)
        if len(values) < 1000:
            return records
        start += len(values)


@router.post("/sync/import")
def import_reference_data(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*ADMIN)),
) -> dict:
    connection = _connection(db)
    response: dict[str, dict] = {}
    for entity in ("Item", "Vendor", "Class", "Account"):
        records = _query_all(db, connection, entity)
        matched = 0
        unmatched = []
        for record in records:
            remote_id = str(record.get("Id", ""))
            display_name = str(record.get("Name", "")).strip()
            if entity == "Item":
                local = db.scalar(select(Item).where(
                    (Item.sku == record.get("Sku")) if record.get("Sku") else (Item.name == display_name),
                    Item.deleted_at.is_(None),
                ))
                if local is None:
                    unmatched.append(display_name)
                    continue
                local.qbo_item_id = remote_id
                local.qbo_sync_token = str(record.get("SyncToken", ""))
            elif entity == "Vendor":
                local = db.scalar(select(Supplier).where(
                    Supplier.normalized_name == " ".join(display_name.casefold().split()),
                    Supplier.deleted_at.is_(None),
                ))
                if local is None:
                    unmatched.append(display_name)
                    continue
                local.qbo_vendor_id = remote_id
                local.qbo_sync_token = str(record.get("SyncToken", ""))
            elif entity == "Class":
                local = db.scalar(select(Project).where(
                    (Project.code == display_name) | (Project.name == display_name),
                    Project.deleted_at.is_(None),
                ))
                if local is None:
                    unmatched.append(display_name)
                    continue
                local.qbo_class_id = remote_id
                local.qbo_sync_token = str(record.get("SyncToken", ""))
            else:
                account_type = str(record.get("AccountType", "other")).lower().replace(" ", "_")
                account = db.scalar(select(QboAccountMapping).where(
                    QboAccountMapping.account_type == account_type,
                    QboAccountMapping.qbo_account_id == remote_id,
                ))
                if account is None:
                    db.add(QboAccountMapping(
                        account_type=account_type,
                        qbo_account_id=remote_id,
                        name=display_name,
                        account_number=record.get("AcctNum"),
                        is_active=bool(record.get("Active", True)),
                    ))
                else:
                    account.name = display_name
                    account.account_number = record.get("AcctNum")
                    account.is_active = bool(record.get("Active", True))
            matched += 1
        response[entity] = {"received": len(records), "mapped": matched, "unmatched": unmatched}
    db.commit()
    return response


def _sync_log(db: Session, entity_type: str, entity_id: int) -> QboSyncLog:
    key = f"push:{entity_type}:{entity_id}"
    row = db.scalar(select(QboSyncLog).where(QboSyncLog.idempotency_key == key))
    if row is None:
        row = QboSyncLog(
            entity_type=entity_type,
            entity_id=str(entity_id),
            direction="push",
            status="Pending",
            idempotency_key=key,
        )
        db.add(row)
        db.flush()
    return row


def _send_entity(db: Session, entity_type: str, entity_id: int, payload: dict) -> dict:
    connection = _connection(db)
    log = _sync_log(db, entity_type, entity_id)
    if log.status == "Synced":
        return {"status": "Synced", "qbo_id": log.qbo_id, "idempotent": True}
    log.attempts += 1
    try:
        response = _api(db, connection, "POST", entity_type, payload)
        entity = response.get(entity_type.removesuffix("s"), response)
        remote_id = str(entity.get("Id", ""))
        if not remote_id:
            raise RuntimeError("QBO response did not include an entity ID.")
        sync_token = str(entity.get("SyncToken", ""))
        if entity_type == "PurchaseOrder":
            local = db.get(PurchaseOrder, entity_id)
            local.qbo_purchase_order_id = remote_id
            local.qbo_sync_token = sync_token
        elif entity_type == "Bill":
            local = db.get(SupplierInvoice, entity_id)
            local.qbo_bill_id = remote_id
            local.qbo_sync_token = sync_token
        else:
            local = db.get(BillPayment, entity_id)
            local.qbo_bill_payment_id = remote_id
            local.qbo_sync_token = sync_token
        log.status = "Synced"
        log.qbo_id = remote_id
        log.error_message = None
        log.synced_at = utc_now()
        db.commit()
        return {"status": log.status, "qbo_id": remote_id, "idempotent": False}
    except (RuntimeError, HTTPException) as error:
        log.status = "Failed"
        log.error_message = str(error)[:4000]
        db.commit()
        raise HTTPException(status_code=502, detail=f"QuickBooks sync failed: {error}") from error


@router.post("/sync/purchase-orders/{order_id}")
def push_purchase_order(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*ADMIN)),
) -> dict:
    order = db.get(PurchaseOrder, order_id)
    supplier = db.get(Supplier, order.supplier_id) if order and order.supplier_id else None
    if order is None or order.deleted_at is not None or supplier is None:
        raise HTTPException(status_code=404, detail="Purchase order or supplier not found.")
    if not supplier.qbo_vendor_id:
        raise HTTPException(status_code=409, detail="Map the supplier to a QBO vendor before syncing.")
    project = db.get(Project, order.project_id) if order.project_id else None
    lines = db.scalars(select(PurchaseOrderLine).where(PurchaseOrderLine.purchase_order_id == order.id)).all()
    qbo_lines = []
    for line in lines:
        item = db.get(Item, line.item_id) if line.item_id else None
        if item is None or not item.qbo_item_id:
            raise HTTPException(status_code=409, detail=f"Map item on PO line {line.id} to QBO before syncing.")
        qbo_line = {
            "Amount": float(line.subtotal),
            "DetailType": "ItemBasedExpenseLineDetail",
            "Description": line.description,
            "ItemBasedExpenseLineDetail": {
                "ItemRef": {"value": item.qbo_item_id},
                "Qty": float(line.quantity),
                "UnitPrice": float(line.unit_price),
            },
        }
        if project and project.qbo_class_id:
            qbo_line["ItemBasedExpenseLineDetail"]["ClassRef"] = {"value": project.qbo_class_id}
        qbo_lines.append(qbo_line)
    payload = {
        "VendorRef": {"value": supplier.qbo_vendor_id},
        "TxnDate": order.order_date.isoformat() if order.order_date else utc_now().date().isoformat(),
        "DocNumber": order.order_number,
        "Line": qbo_lines,
    }
    return _send_entity(db, "PurchaseOrder", order.id, payload)


@router.post("/sync/invoices/{invoice_id}")
def push_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*ADMIN)),
) -> dict:
    invoice = db.get(SupplierInvoice, invoice_id)
    supplier = db.get(Supplier, invoice.supplier_id) if invoice else None
    if invoice is None or invoice.deleted_at is not None or supplier is None:
        raise HTTPException(status_code=404, detail="Invoice or supplier not found.")
    if invoice.matching_status != "Matched":
        raise HTTPException(status_code=409, detail="Only matched invoices can be synced as QBO bills.")
    if not supplier.qbo_vendor_id:
        raise HTTPException(status_code=409, detail="Map the supplier to a QBO vendor before syncing.")
    invoice_lines = db.scalars(
        select(SupplierInvoiceLine).where(SupplierInvoiceLine.invoice_id == invoice.id)
    ).all()
    lines = [{
        "Amount": float(line.amount),
        "DetailType": "AccountBasedExpenseLineDetail",
        "Description": line.description,
        "AccountBasedExpenseLineDetail": {
            "AccountRef": {"value": os.getenv("ALWEN_QBO_DEFAULT_EXPENSE_ACCOUNT_ID", "")},
        },
    } for line in invoice_lines]
    if not all(line["AccountBasedExpenseLineDetail"]["AccountRef"]["value"] for line in lines):
        raise HTTPException(status_code=409, detail="Configure ALWEN_QBO_DEFAULT_EXPENSE_ACCOUNT_ID before syncing bills.")
    payload = {
        "VendorRef": {"value": supplier.qbo_vendor_id},
        "TxnDate": invoice.invoice_date.isoformat() if invoice.invoice_date else utc_now().date().isoformat(),
        "DocNumber": invoice.invoice_number,
        "Line": lines,
    }
    return _send_entity(db, "Bill", invoice.id, payload)


@router.post("/sync/payments/{payment_id}")
def push_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*ADMIN)),
) -> dict:
    payment = db.get(BillPayment, payment_id)
    invoice = db.get(SupplierInvoice, payment.invoice_id) if payment else None
    supplier = db.get(Supplier, invoice.supplier_id) if invoice else None
    if payment is None or invoice is None or supplier is None:
        raise HTTPException(status_code=404, detail="Payment or its invoice was not found.")
    if not invoice.qbo_bill_id:
        raise HTTPException(status_code=409, detail="Sync the invoice as a QBO bill before syncing its payment.")
    bank_account = db.scalar(select(QboAccountMapping).where(
        QboAccountMapping.account_type == "bank",
        QboAccountMapping.is_active.is_(True),
    ))
    if bank_account is None:
        raise HTTPException(status_code=409, detail="Map an active QBO bank account before syncing payments.")
    payload = {
        "VendorRef": {"value": supplier.qbo_vendor_id},
        "TotalAmt": float(payment.amount),
        "PayType": "Check",
        "CheckPayment": {"BankAccountRef": {"value": bank_account.qbo_account_id}},
        "TxnDate": payment.payment_date.isoformat(),
        "Line": [{
            "Amount": float(payment.amount),
            "LinkedTxn": [{"TxnId": invoice.qbo_bill_id, "TxnType": "Bill"}],
        }],
    }
    return _send_entity(db, "BillPayment", payment.id, payload)


@router.get("/export/{entity_type}.csv")
def export_csv(
    entity_type: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*ADMIN)),
) -> StreamingResponse:
    if entity_type not in {"purchase-orders", "invoices", "payments"}:
        raise HTTPException(status_code=404, detail="Unsupported QBO export type.")
    output = io.StringIO()
    writer = csv.writer(output)
    if entity_type == "purchase-orders":
        writer.writerow(["DocNumber", "Vendor", "Project", "Description", "Quantity", "UnitPrice", "Amount"])
        rows = db.execute(select(
            PurchaseOrder.order_number,
            Supplier.name,
            Project.name,
            PurchaseOrderLine.description,
            PurchaseOrderLine.quantity,
            PurchaseOrderLine.unit_price,
            PurchaseOrderLine.subtotal,
        ).join(Supplier, Supplier.id == PurchaseOrder.supplier_id)
            .join(PurchaseOrderLine, PurchaseOrderLine.purchase_order_id == PurchaseOrder.id)
            .outerjoin(Project, Project.id == PurchaseOrder.project_id))
        writer.writerows(rows)
    elif entity_type == "invoices":
        writer.writerow(["DocNumber", "Vendor", "TxnDate", "NetAmount", "VAT", "Total"])
        rows = db.execute(select(
            SupplierInvoice.invoice_number,
            Supplier.name,
            SupplierInvoice.invoice_date,
            SupplierInvoice.net_amount,
            SupplierInvoice.vat_amount,
            SupplierInvoice.total_amount,
        ).join(Supplier, Supplier.id == SupplierInvoice.supplier_id)
            .where(SupplierInvoice.deleted_at.is_(None)))
        writer.writerows(rows)
    else:
        writer.writerow(["BillId", "TxnDate", "Amount", "PaymentMethodId"])
        rows = db.execute(select(
            SupplierInvoice.qbo_bill_id,
            BillPayment.payment_date,
            BillPayment.amount,
            BillPayment.payment_method_id,
        ).join(SupplierInvoice, SupplierInvoice.id == BillPayment.invoice_id))
        writer.writerows(rows)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="qbo-{entity_type}.csv"'},
    )


@router.get("/reconciliation")
def reconcile_inventory(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*ADMIN)),
) -> dict:
    connection = _connection(db)
    result = _api(db, connection, "GET", f"query?query={urllib.parse.quote('SELECT * FROM Account', safe='')}")
    accounts = result.get("QueryResponse", {}).get("Account", [])
    qbo_inventory_value = sum(
        (Decimal(str(account.get("CurrentBalance", 0))) for account in accounts
         if account.get("AccountSubType") == "Inventory"),
        Decimal("0"),
    )
    local_value = db.scalar(select(func.coalesce(
        func.sum(StockBalance.quantity * StockBalance.average_unit_cost), 0
    ))) or Decimal("0")
    return {
        "local_stock_value": str(local_value.quantize(Decimal("0.01"))),
        "qbo_inventory_asset_balance": str(qbo_inventory_value.quantize(Decimal("0.01"))),
        "variance": str((local_value - qbo_inventory_value).quantize(Decimal("0.01"))),
    }


@router.get("/sync-logs")
def sync_logs(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*ADMIN)),
) -> dict:
    rows = db.scalars(select(QboSyncLog).order_by(QboSyncLog.id.desc()).limit(limit)).all()
    return {"items": [{
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "direction": row.direction,
        "status": row.status,
        "attempts": row.attempts,
        "qbo_id": row.qbo_id,
        "error_message": row.error_message,
        "synced_at": row.synced_at.isoformat() if row.synced_at else None,
    } for row in rows]}
