# Build Harness

## 목적

Build Harness는 Academy Ops Hub의 제품 개발용 하네스다.

- 기능 설계
- 코드 구현
- 코드 리뷰
- 테스트
- 문서화
- PR 준비

## 역할

### Router

요청을 `frontend`, `backend`, `api`, `sql`, `infra`, `refactor`로 분류한다.

### Builder

분류된 작업을 실제 코드 변경으로 옮긴다.

### Reviewer

버그, 성능, 보안, 유지보수성, 회귀 위험을 점검한다.

### Doc Writer

README, API 문서, 변경 이력, 운영 메모를 정리한다.

## 실행 플로우

요구사항 분석 → 설계 → 구현 → 리뷰 → 테스트 → 문서화 → PR

## 체크리스트

- 기존 API 계약 유지
- 마이그레이션 분리
- 테스트 추가
- 감사 영향 검토
- 권한 영향 검토

## 주요 적용 지점

- `Academy_ops_hub_master_prompt.md`
- `components/*`
- `app/api/*`
- `lib/services/*`

## 종료 조건

- 코드가 동작한다.
- 테스트가 통과한다.
- 문서가 갱신된다.
- PR 가능 상태가 된다.
