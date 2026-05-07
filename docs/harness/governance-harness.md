# Governance Harness

## 목적

Governance Harness는 승인, 정책, 보안, 감사 강제를 담당하는 하네스다.

- 권한 검증
- 정책 위반 차단
- 상태 전이 검증
- 감사 로그 기록
- SLA 추적

## 역할

### Policy Checker

카테고리별 필수 입력값과 승인 필요 여부를 판단한다.

### Permission Guard

행위 주체가 해당 액션을 수행할 권한이 있는지 검사한다.

### Workflow Guard

허용되지 않은 상태 변경을 차단한다.

### Auditor

모든 중요 행동의 before/after와 actor를 기록한다.

## 실행 플로우

행동 요청 → 정책 검증 → 권한 검증 → 워크플로 검증 → 감사 기록 → 승인 또는 차단

## 체크리스트

- 인증된 사용자 여부
- 역할 매핑 정확성
- 승인 단계 우회 여부
- 파일 업로드 정책 위반 여부
- 감사 로그 누락 여부

## 주요 적용 지점

- `lib/harness/policy/*`
- `lib/harness/permission/*`
- `lib/harness/workflow/*`
- `lib/harness/security/*`
- `lib/harness/audit/*`
- `lib/harness/sla/*`

## 종료 조건

- 허용 가능한 요청만 통과한다.
- 거부 사유는 사용자 메시지와 시스템 로그에 남는다.
- 이력 없는 변경은 발생하지 않는다.
