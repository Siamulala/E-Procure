import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from alwen.controls import run_alerts
from alwen.database import SessionLocal
from alwen.suppliers import recompute_all_supplier_scores, suspend_noncompliant_suppliers
from alwen.time_utils import BUSINESS_TIMEZONE


logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler(timezone=BUSINESS_TIMEZONE)


def run_daily_maintenance() -> dict[str, int]:
    with SessionLocal() as db:
        alerts_created = run_alerts(db)
        suppliers_suspended = suspend_noncompliant_suppliers(db)
        suppliers_recomputed = recompute_all_supplier_scores(db)
    logger.info(
        "Daily maintenance finished: %d alerts, %d suppliers suspended, %d supplier scores updated.",
        alerts_created,
        suppliers_suspended,
        suppliers_recomputed,
    )
    return {
        "alerts_created": alerts_created,
        "suppliers_suspended": suppliers_suspended,
        "suppliers_recomputed": suppliers_recomputed,
    }


def start_scheduler() -> None:
    if not scheduler.running:
        scheduler.add_job(
            run_daily_maintenance,
            CronTrigger(hour=7, minute=0, timezone=BUSINESS_TIMEZONE),
            id="alwen_daily_maintenance",
            replace_existing=True,
        )
        scheduler.start()


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
