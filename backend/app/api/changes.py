from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timezone, timedelta
from app.core.database import get_db
from app.core.auth import verify_token
from app.services.change_service import ChangeService
from app.services.activity_log_service import ActivityLogService
from app.schemas.change_event import ChangeEventOut

router = APIRouter()


@router.get("/changes", response_model=list[ChangeEventOut])
def list_changes(
    resource_id: Optional[str] = Query(None),
    operation: Optional[str] = Query(None),
    risk_level: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),  # YYYY-MM-DD
    date_to: Optional[str] = Query(None),    # YYYY-MM-DD
    db: Session = Depends(get_db),
):
    dt_from = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc) if date_from else None
    dt_to = (datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)).replace(tzinfo=timezone.utc) if date_to else None
    return ChangeService(db).get_all(resource_id, operation, risk_level, dt_from, dt_to)


@router.get("/changes/{event_id}", response_model=ChangeEventOut)
def get_change(event_id: str, db: Session = Depends(get_db)):
    event = ChangeService(db).get_by_id(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Change event not found")
    return event


@router.post("/events/activity-log")
def ingest_activity_log(payload: dict, db: Session = Depends(get_db)):
    event = ChangeService(db).ingest_activity_log(payload)
    return {"id": event.id, "risk_level": event.risk_level}


@router.post("/activity-log/sync")
def sync_activity_log(hours: int = Query(720), db: Session = Depends(get_db), _=Depends(verify_token)):
    return ActivityLogService(db).sync(hours=hours)
