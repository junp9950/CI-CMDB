import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.repositories.notification_config_repo import NotificationConfigRepository
from app.schemas.notification_config import NotificationConfigCreate, NotificationConfigOut

router = APIRouter()


@router.get("/notifications", response_model=list[NotificationConfigOut])
def list_configs(db: Session = Depends(get_db)):
    return NotificationConfigRepository(db).get_all()


@router.post("/notifications", response_model=NotificationConfigOut)
def create_config(body: NotificationConfigCreate, db: Session = Depends(get_db)):
    repo = NotificationConfigRepository(db)
    return repo.create({"id": str(uuid.uuid4()), **body.model_dump()})


@router.put("/notifications/{config_id}", response_model=NotificationConfigOut)
def update_config(config_id: str, body: NotificationConfigCreate, db: Session = Depends(get_db)):
    repo = NotificationConfigRepository(db)
    config = repo.update(config_id, body.model_dump())
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    return config


@router.delete("/notifications/{config_id}")
def delete_config(config_id: str, db: Session = Depends(get_db)):
    NotificationConfigRepository(db).delete(config_id)
    return {"ok": True}


@router.post("/notifications/test")
async def test_notification(body: dict, db: Session = Depends(get_db)):
    config_id = body.get("config_id")
    repo = NotificationConfigRepository(db)

    if config_id:
        config = repo.get_by_id(config_id)
        if not config:
            raise HTTPException(status_code=404, detail="Config not found")
        configs = [config]
    else:
        configs = repo.get_enabled()

    results = []
    async with httpx.AsyncClient(timeout=10) as client:
        for cfg in configs:
            message = {"text": f"[CIDB/CMDB] 알림 테스트 - {cfg.name}"}
            try:
                r = await client.post(cfg.webhook_url, json=message)
                results.append({"name": cfg.name, "status": r.status_code})
            except Exception as e:
                results.append({"name": cfg.name, "error": str(e)})

    return {"results": results}
