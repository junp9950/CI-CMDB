"""
기존 change_events DB 레코드의 diff 필드에 한글 description 추가 마이그레이션.
backend/ 디렉토리에서 실행: python migrate_diff_description.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.core.database import SessionLocal
from app.models.change_event import ChangeEvent
from app.collectors.activity_log import _describe_operation


def migrate():
    db = SessionLocal()
    try:
        events = db.query(ChangeEvent).all()
        updated = 0
        for event in events:
            diff = event.diff
            if not isinstance(diff, dict):
                continue
            op_detail = diff.get("operation_detail")
            if not op_detail:
                continue
            if "description" in diff:
                continue  # 이미 있음
            diff["description"] = _describe_operation(op_detail)
            event.diff = dict(diff)  # SQLAlchemy JSON mutation 감지용
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(event, "diff")
            updated += 1

        db.commit()
        print(f"완료: {updated}건 업데이트, {len(events) - updated}건 스킵")
    finally:
        db.close()


if __name__ == "__main__":
    migrate()
