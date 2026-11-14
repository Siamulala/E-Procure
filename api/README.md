# Alwen Procurement & Inventory API

FastAPI service for the Alwen Networks Ltd procurement and inventory system. It runs alongside the legacy React/Express application; set `REACT_APP_ALWEN_API_URL` to use the API-backed procurement workflows.

## Requirements

- Python 3.11
- SQLite for local development; PostgreSQL for shared/deployed environments

## Local setup

From the repository root in PowerShell:

```powershell
cd api
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
alembic upgrade head
python -m alwen.seed
python -m alwen.create_user --email admin@example.com --name "System Admin" --role Admin
uvicorn alwen.main:app --reload
```

The API health check is at `http://127.0.0.1:8000/health`; interactive OpenAPI docs are at `/docs`. The default SQLite database is `api/alwen.db`. Set `DATABASE_URL` in `api/.env` to a PostgreSQL DSN to use PostgreSQL.

The user command prompts for a password and requires at least 12 characters. Create additional accounts using one of `Admin`, `Procurement Officer`, `Approver`, `Store Keeper`, `Project Manager`, or `Finance`; Project Managers should be assigned their project with `--project-id`.

## Authentication and procurement workflows

- Sign in with `POST /auth/login` to obtain an eight-hour opaque bearer token. Tokens are random, stored only as hashes, and can be revoked with `POST /auth/logout`. Passwords are stored as PBKDF2 hashes; reset credentials must be configured outside the application.
- Failed sign-ins are throttled after 10 attempts per client address in 15 minutes. This limiter and its counters are process-local; use a shared gateway limiter if deploying multiple API workers. HTTP request logs are structured JSON and omit query strings and request bodies.
- Create and edit draft PRs with `POST`/`PUT /purchase-requests`; submit with `/purchase-requests/{id}/submit`, approve or reject with `/decision`, and convert approved requests with `/convert-to-orders`. Conversion creates one PO per proposed supplier.
- Project monthly budgets are enforced during approval. An over-budget request needs a documented reason and additional Director approval. Approval delegations are date-bounded.
- Receive full or partial PO lines using `POST /goods-receipts`. The service prevents over-receipt and updates the PO delivery status.
- Direct receipts are also supported through `/goods-receipts` without a PO, provided each line includes an item and unit cost.
- `/stock/issues`, `/stock/returns`, `/stock/transfers`, and `/stock/adjustments` append immutable ledger rows. Stock balances are maintained per item/store using weighted-average cost, and issues cannot exceed available stock. Adjustments require an Admin or Approver and a reason.
- Supplier onboarding tracks required documents and expiry, supports bounded PDF/JPG/PNG uploads, reapproval, scorecards, and rejected-goods records.
- Contracts support draft/activation/termination, signed PDF upload, contract-priced call-offs, quantity limits, and price variance reports.
- Invoice entry supports three-way matching, configurable VAT/WHT calculations, eTIMS checks before payment, payment recording, and VAT/WHT exports. Tax rates are configurable; have a Kenyan tax professional verify the rates and classifications before production use.
- Notifications provide an inbox, read receipts, email preferences, optional SMS, and scheduled approval/contract/compliance alerts.
- QuickBooks Online integration supports OAuth, encrypted credential storage, mapping, sync logs, reconciliation, and CSV exports. Configure the QBO settings in `api/.env` before enabling it.
- Read-only reference endpoints include `/items`, `/suppliers`, `/projects`, `/stores`, `/units`, `/categories`, and `/staff`. Admin/Procurement users can create items and suppliers in the API or UI.

The React app uses these workflows when `REACT_APP_ALWEN_API_URL=http://localhost:8000` is set before starting the frontend. API-mode accounts are created in the API database, not in browser local storage. The existing legacy login remains available when this variable is unset.

## Analytics and budgets

- `GET /analytics/dashboard` returns filtered PO commitments by month, supplier, project, category, and item; the PR status funnel; quote win rates and price comparisons; stock value/reorder alerts; monthly stock-in vs net issue; and net usage by project.
- Filters are optional `start_date`, `end_date`, `project_id`, `supplier_id`, and `category_id`. The date range is inclusive. Project Managers are always restricted to their assigned project and do not receive a company-wide stock snapshot.
- `GET /analytics/exports/spend.csv?group_by=month|supplier|project|category|item` exports filtered purchase-order commitments as CSV.
- PO commitments are not paid expenditure. Current stock value is a live snapshot and is independent of the date, project, and supplier filters (but respects category). Supplier win rate means proposed-supplier lines selected at the lowest quoted rate divided by submitted, approved, or converted proposals.

For API accounts to use the emailed self-service password reset, configure the same random `ALWEN_PASSWORD_RESET_KEY` in `api/.env` and `backend/.env`, set `ALWEN_API_URL=http://127.0.0.1:8000` in `backend/.env`, and configure `GMAIL_USER` plus a Google App Password there. Restart both services after changing the settings. Resetting an API password revokes that user’s active API sessions.

## Docker Compose

From the repository root, copy `.env.example` to `.env`, change `POSTGRES_PASSWORD`, then run:

```powershell
docker compose up --build
```

Compose starts PostgreSQL, applies migrations, seeds reference data, and serves the API on port 8000. Uploaded supplier and contract documents persist in the `alwen_uploads` volume. The API container runs as a non-root user and has a health check. Set production secrets through a secret manager rather than committing `.env` files.

## Database backups

Run the backup command from `api/`. SQLite uses the online backup API; PostgreSQL uses `pg_dump` and requires its client tools to be installed. The database URL is read from `DATABASE_URL` (defaults to the local SQLite database), and output files are written to `backups/` unless `--output-dir` is supplied:

```powershell
python ..\scripts\backup_alwen_db.py --output-dir ..\backups
```

PostgreSQL backup credentials are passed through `PGPASSWORD` to `pg_dump`; protect the backup directory and periodically test a restore.

## Workbook dry run

The importer reads the documented workbook families and stages normalized rows with their source sheet and Excel row number:

```powershell
python -m alwen.importer C:\path\to\Alwen_Procurement_prompt.xlsx --report .\import-report.json
```

Dry run does not write to the database. `--apply` stores parsed rows in the import staging tables. `--commit` creates historical PR/PO/receipt/stock records from valid rows and marks them as imports; review the summary/pivot reconciliation and resolve errors before committing.

The importer flags malformed or out-of-range dates, quantity/rate amount differences, non-lowest proposed suppliers without a qualifying reason, and fuzzy supplier-name matches for manual confirmation. `Summary for 2026` and `Pivot Table` are retained as reference sheets and excluded from imported transaction rows.

Validate the recognized sheet layouts and summary/pivot reconciliation against the source workbook before committing its data.

## Schema / ERD overview

- **Reference data:** categories, units, suppliers, items, projects, stores, staff, payment methods, and users.
- **Requests and ordering:** purchase requests → request lines → supplier quotes → quotation lines → approvals → purchase orders → purchase-order lines.
- **Receiving and stock:** goods receipts → receipt lines; append-only stock movements track item, store, movement date, quantity, project, and source row.
- **Payables:** supplier invoices → bill payments.
- **PPE:** PPE issues → PPE issue lines.
- **Controls and integrations:** import batches → source-row staging records; audit logs; QBO connection, account mappings, and sync logs.

Money uses fixed-scale `Numeric` columns, quantities use `Numeric(14,3)`, phone numbers are text, and imported source sheet/row coordinates are kept for traceability. Database timestamps are timezone-aware UTC; Nairobi presentation formatting belongs in the API/frontend layer.

## Tests

```powershell
python -m pytest
```
