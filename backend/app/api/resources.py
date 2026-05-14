from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.core.auth import verify_token
from app.services.resource_service import ResourceService
from app.schemas.resource import ResourceOut

router = APIRouter()


@router.get("/resources", response_model=list[ResourceOut])
def list_resources(
    resource_type: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return ResourceService(db).get_all(resource_type, location, search)


@router.get("/resources/{resource_id}", response_model=ResourceOut)
def get_resource(resource_id: str, db: Session = Depends(get_db)):
    resource = ResourceService(db).get_by_id(resource_id)
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    return resource


@router.post("/resources/sync")
def sync_resources(db: Session = Depends(get_db), _=Depends(verify_token)):
    return ResourceService(db).sync()
