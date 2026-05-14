from abc import ABC, abstractmethod


class BaseCollector(ABC):
    @abstractmethod
    def collect(self) -> list[dict]:
        """Azure 리소스 목록을 수집하여 반환"""
        ...
