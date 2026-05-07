# Academy Ops Hub - AI Harness Architecture

## 개요

Academy Ops Hub의 AI Harness는 단일 하네스가 아니라 아래 3가지 운영 구성으로 나뉜다.

1. Build Harness
2. Ops Harness
3. Governance Harness

이 문서는 세 하네스의 상위 인덱스이자 역할 분리 기준이다.

---

## 왜 3개로 나누는가

Academy Ops Hub는 단순한 코드 생성 프로젝트가 아니다.

- 제품 개발 흐름이 있다.
- 현장 운영 자동화 흐름이 있다.
- 승인, 감사, 보안, 추적 흐름이 있다.

이 세 흐름은 입력, 책임자, 산출물, 승인 기준이 다르므로 같은 하네스로 묶으면 운영 경계가 흐려진다.

---

## Harness 1. Build Harness

목적:
- 기능 구현 자동화
- 설계 검토 자동화
- 코드 리뷰 자동화
- 테스트/문서/PR 준비 자동화

주요 역할:
- Router
- Builder
- Reviewer
- Doc Writer

대표 입력:
- 신규 기능 요청
- 버그 수정 요청
- UI/UX 개선 요청
- API/DB 변경 요청

대표 산출물:
- 구현 코드
- 마이그레이션
- 테스트
- 변경 문서
- PR 초안

상세 문서:
- [docs/harness/build-harness.md](/Users/sonssoftbs/Desktop/academy_ops/docs/harness/build-harness.md:1)

---

## Harness 2. Ops Harness

목적:
- 현장 문의 자동 분류
- A/S 진단 자동화
- FAQ 응답 자동화
- 티켓 생성/라우팅 자동화

주요 역할:
- Router
- Support Diagnostician
- Ticket Builder
- Knowledge Writer

대표 입력:
- 장비 장애 문의
- 소모품/렌탈 운영 문의
- NAS 접속 문의
- 반복 FAQ

대표 산출물:
- 해결 가이드
- 자가 진단 결과
- 업체 전달용 티켓
- 운영 로그
- FAQ 문서 초안

상세 문서:
- [docs/harness/ops-harness.md](/Users/sonssoftbs/Desktop/academy_ops/docs/harness/ops-harness.md:1)

---

## Harness 3. Governance Harness

목적:
- 승인 흐름 검증
- 권한 검증
- 감사 로그 강제
- 정책 위반 탐지
- 보안 및 데이터 정합성 검토

주요 역할:
- Policy Checker
- Permission Guard
- Auditor
- Compliance Reviewer

대표 입력:
- 승인 요청
- 상태 변경
- 고액 결제
- 권한 민감 작업
- 데이터 변경 이벤트

대표 산출물:
- 승인 가능 여부
- 정책 위반 결과
- 감사 로그
- 보안 리스크 리포트
- 차단 또는 보류 판단

상세 문서:
- [docs/harness/governance-harness.md](/Users/sonssoftbs/Desktop/academy_ops/docs/harness/governance-harness.md:1)

---

## 공통 오케스트레이션 원칙

세 하네스 모두 아래 원칙을 공유한다.

- 사람은 최종 승인자다.
- AI는 실행 보조 및 검토 보조다.
- 모든 mutation은 추적 가능해야 한다.
- 승인 우회는 금지한다.
- 권한 검증 없이 상태 변경은 허용하지 않는다.
- 감사 로그 없는 변경은 완료로 간주하지 않는다.

---

## 시스템 매핑

현재 코드베이스에서 각 하네스는 다음과 같이 대응된다.

### Build Harness

- 제품/설계 문서: `Academy_Ops_Hub_PRD.md`, `Academy_ops_hub_master_prompt.md`
- UI: `components/ops-console.tsx`

### Ops Harness

- 요청 처리 서비스: `lib/services/request-hub-service.ts`
- 사용자/운영 API: `app/api/requests/*`, `app/api/portal/requests/*`

### Governance Harness

- 정책: `lib/harness/policy/*`
- 권한: `lib/harness/permission/*`
- 워크플로: `lib/harness/workflow/*`
- 보안: `lib/harness/security/*`
- 감사: `lib/harness/audit/*`
- SLA: `lib/harness/sla/*`

---

## 기본 실행 순서

### Build Harness

기획 → 설계 → 구현 → 리뷰 → 문서화 → PR

### Ops Harness

문의 접수 → 분류 → 자가 진단 → 해결 안내 또는 티켓 생성 → 이력 저장

### Governance Harness

행동 요청 → 정책 검증 → 권한 검증 → 상태 전이 검증 → 감사 기록 → 승인 또는 차단

---

## 결론

Academy Ops Hub의 AI Harness는 하나가 아니라 3개다.

- Build Harness는 개발을 담당한다.
- Ops Harness는 현장 운영 자동화를 담당한다.
- Governance Harness는 승인, 감사, 보안, 정책 강제를 담당한다.

향후 문서와 UI도 이 3분할 기준에 맞춰 유지한다.
