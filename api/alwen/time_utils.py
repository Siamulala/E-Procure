from datetime import date, datetime
from zoneinfo import ZoneInfo


BUSINESS_TIMEZONE = ZoneInfo("Africa/Nairobi")


def business_today() -> date:
    return datetime.now(BUSINESS_TIMEZONE).date()
