# Azure CIDB / CMDB

Azure 구독의 인프라 리소스를 수집·관리하고, 변경 이력을 추적하는 웹 애플리케이션.

- **CIDB** (Configuration Item DB): Azure Resource Graph로 리소스 현황 수집 및 조회
- **CMDB** (Change Management DB): Activity Log 기반 변경 이력 추적 및 위험도 분류
- **네트워크 분석**: NSG · UDR · Azure Firewall 레이어 기반 트래픽 경로 분석

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React 18 + TypeScript |
| Backend | FastAPI (Python 3.11+) |
| Database | SQLite |
| Azure 수집 | Azure Resource Graph, Activity Log API |
| Azure 인증 | App Registration (Entra ID, Client Credentials) |

---

## 주요 기능

### 대시보드
- 리소스 수 / 변경 이벤트 수 / 위험도별 통계 카드
- 마지막 동기화 시각, Admin 로그인 상태 표시
- 리소스 동기화 / 변경 이력 동기화 버튼

### CIDB — 리소스 목록
- 이름·유형·위치·Public IP 유무 필터링
- 클릭 시 우측 상세 패널 (드래그 리사이즈)
- VM: NIC / NSG / Public IP / 디스크 연결 리소스 표시
- 비-VM: properties JSON 표시

### CMDB — 변경 이력
- Azure Activity Log 기반 변경 이벤트 수집
- `correlation_id` 기반 그룹핑 (대규모 배포 묶음 표시)
- 위험도 3단계 자동 분류 (High / Medium / Low)
- 변경 사항 before/after diff 표시
- 이름 · 유형 · 변경자 · 작업 · 위험도 · 날짜 필터
- CSV 내보내기 (BOM UTF-8)

### 네트워크 경로 분석
- 소스/목적지 VM 선택 또는 IP 직접 입력
- 분석 레이어 (Azure 평가 순서 준수):
  1. 송신측 NIC NSG → 서브넷 NSG
  2. UDR (Route Table) — 최장 prefix 매칭
  3. Azure Firewall (Classic 인라인 / Policy 방식 모두 지원)
  4. 수신측 서브넷 NSG → NIC NSG
- 분석 실행 시 최신 리소스 자동 fetch
- 차단 원인 및 수정 가이드 표시

### 알림 설정
- Teams / Slack Webhook 설정
- 위험도 임계값 기반 알림 발송

---

## 프로젝트 구조

```
azure-cidb-cmdb/
├── backend/
│   ├── app/
│   │   ├── api/              # FastAPI 라우터
│   │   ├── core/             # 설정, DB 연결
│   │   ├── models/           # SQLAlchemy 모델
│   │   ├── schemas/          # Pydantic 스키마
│   │   ├── repositories/     # DB 접근 레이어
│   │   ├── services/         # 비즈니스 로직
│   │   ├── collectors/
│   │   │   ├── azure_rg.py   # Resource Graph 수집 (+ FW Policy RCG REST API)
│   │   │   ├── activity_log.py  # Activity Log 수집 및 노이즈 필터
│   │   │   └── mock.py       # 개발용 Mock
│   │   └── engines/
│   │       └── risk_engine.py
│   ├── data/                 # SQLite DB (cidb.db), last_sync.txt
│   └── main.py
│
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Dashboard/
│       │   ├── Resources/
│       │   ├── Changes/
│       │   ├── NetworkAnalysis/
│       │   └── Settings/
│       ├── components/
│       ├── hooks/            # useAdmin (JWT 인증)
│       └── api/              # Axios 클라이언트
│
└── start.ps1                 # 백엔드 + 프론트엔드 동시 실행
```

---

## 시작하기

### 사전 조건
- Python 3.11+
- Node.js 18+
- Azure App Registration (Entra ID) — Reader 권한 부여

### 1. 환경변수 설정

`backend/.env` 파일 생성:

```env
AZURE_TENANT_ID=<테넌트 ID>
AZURE_CLIENT_ID=<앱 등록 클라이언트 ID>
AZURE_CLIENT_SECRET=<클라이언트 시크릿>
AZURE_SUBSCRIPTION_ID=<구독 ID>

COLLECTOR_MODE=azure        # mock | azure
ADMIN_PASSWORD=admin1234
DATABASE_URL=sqlite:///./data/cidb.db
```

### 2. 백엔드 실행

```bash
cd backend
python -m venv venv
venv\Scripts\activate       # Windows
pip install -r requirements.txt
uvicorn main:app --port 8000
```

### 3. 프론트엔드 실행

```bash
cd frontend
npm install
npm start
```

또는 `start.ps1` 한 번에 실행:

```powershell
.\start.ps1
```

### 접속

| URL | 설명 |
|-----|------|
| http://localhost:3000 | 웹 앱 |
| http://localhost:8000/docs | Swagger API 문서 |

---

## Azure 권한 설정

App Registration에 아래 권한 부여 필요:

| 권한 | 용도 |
|------|------|
| 구독 Reader | Resource Graph 리소스 조회 |
| Microsoft.Insights/eventtypes/values/read | Activity Log 조회 |

---

## 주요 설계 결정

| 항목 | 결정 |
|------|------|
| PK | Azure `event_data_id` (중복 방지) |
| 그룹핑 | `correlation_id` 기반 (대규모 배포 묶음) |
| 동기화 | APScheduler 5분 간격 자동 동기화 |
| 마지막 동기화 시각 | 파일 기반 (`backend/data/last_sync.txt`) |
| FW Policy RCG | Resource Graph 미인덱싱 → REST API 직접 수집 |
| 노이즈 필터 | `updateReferences/action` 등 Azure 내부 이벤트 제외 |

---

## 한계 및 향후 과제

- Hub-Spoke / VNet Peering 경유 경로 분석 미지원
- Azure Firewall Policy 상속(Parent Policy) 미지원
- NVA(서드파티 방화벽) 규칙 미지원
- ASG(Application Security Group) 미지원
- SQLite → Azure SQL 마이그레이션 미완
