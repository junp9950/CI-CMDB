from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core.config import settings
from app.core.auth import create_token

router = APIRouter()


class LoginRequest(BaseModel):
    password: str


@router.post("/auth/login")
def login(body: LoginRequest):
    if body.password != settings.admin_password:
        raise HTTPException(status_code=401, detail="비밀번호가 틀렸습니다")
    return {"token": create_token()}
