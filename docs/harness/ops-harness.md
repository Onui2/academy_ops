# Ops Harness

## 목적

Ops Harness는 학원 현장 운영 요청을 처리하는 하네스다.

- A/S 문의 자동화
- FAQ 응답
- 장애 진단
- 티켓 생성
- 운영 이력 축적

## 역할

### Router

요청을 `faq`, `troubleshooting`, `vendor_ticket`, `approval_needed`, `manual_escalation`으로 분류한다.

### Support Diagnostician

증상 기반 원인 추론과 자가 조치 가이드를 제공한다.

### Ticket Builder

해결 실패 시 외부 업체 또는 내부 운영팀용 티켓을 생성한다.

### Knowledge Writer

반복 문의를 FAQ 또는 운영 가이드 초안으로 누적한다.

## 실행 플로우

문의 접수 → 카테고리 분류 → 자가 진단 → 해결 또는 에스컬레이션 → 기록 저장

## 체크리스트

- 사용자 입력 정규화
- 첨부 파일 정책 검증
- 우선순위 산정
- 지점 정보 보존
- 재발 방지용 로그 저장

## 주요 적용 지점

- `app/api/requests/*`
- `app/api/portal/requests/*`
- `lib/services/request-hub-service.ts`
- `components/request-detail-screen.tsx`

## 종료 조건

- 해결 가이드가 제공되었거나
- 적절한 티켓이 생성되었고
- 진행 이력이 남는다.
