from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from app.core.database import engine, SessionLocal, Base
from app.models import resource, change_event, notification_config
from app.api import dashboard, resources, changes, notifications, auth
from app.services.resource_service import ResourceService
from app.services.activity_log_service import ActivityLogService
from app.core.config import settings
import logging

logger = logging.getLogger("scheduler")

Base.metadata.create_all(bind=engine)


def _sync_resources():
    db = SessionLocal()
    try:
        result = ResourceService(db).sync()
        logger.info(f"[auto] resource sync: {result}")
    except Exception as e:
        logger.error(f"[auto] resource sync error: {e}")
    finally:
        db.close()


def _sync_activity_log():
    db = SessionLocal()
    try:
        result = ActivityLogService(db).sync(hours=settings.activity_log_sync_interval_minutes * 2)
        logger.info(f"[auto] activity log sync: {result}")
    except Exception as e:
        logger.error(f"[auto] activity log sync error: {e}")
    finally:
        db.close()


scheduler = BackgroundScheduler(timezone="Asia/Seoul")


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.add_job(
        _sync_resources,
        "interval",
        minutes=settings.resource_sync_interval_minutes,
        id="resource_sync",
    )
    scheduler.add_job(
        _sync_activity_log,
        "interval",
        minutes=settings.activity_log_sync_interval_minutes,
        id="activity_log_sync",
    )
    scheduler.start()
    logger.info(
        f"스케줄러 시작: 리소스 {settings.resource_sync_interval_minutes}분, "
        f"변경이력 {settings.activity_log_sync_interval_minutes}분 간격"
    )
    yield
    scheduler.shutdown()


app = FastAPI(title="Azure CIDB/CMDB", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(resources.router, prefix="/api")
app.include_router(changes.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")


@app.get("/")
def root():
    return {"status": "ok", "docs": "/docs"}
