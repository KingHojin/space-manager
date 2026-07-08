# Space Manager — Codex 인수인계 지시서

이 문서를 새 Codex(또는 다른 AI) 세션에 붙여넣으면 이어서 작업할 수 있습니다.
(2026-07-08 기준. 이전 버전의 이 문서는 Phase 4 시절 내용이라 전면 교체됨.)

## 저장소

- GitHub: `KingHojin/space-manager` / 기본 브랜치: `master`
- 스택: Vite 6 + React 18 + Zustand(persist) + Tailwind v4(`@import "tailwindcss"`, 설정 파일 없음) + React Three Fiber(3D는 lazy 청크)
- 명령어: `npm install` / `npm run dev` / `npm run build` / **`npm test`(vitest, 현재 403개 전부 통과 — 반드시 유지)**
- 배포: master 푸시 시 Netlify 자동 배포(space-manager.netlify.app). PR마다 deploy-preview CI.

## 제품 방향

모바일 우선 우주 탐사/함선 운영 게임:
- Football Manager식 상황센터·결재·보고서
- RimWorld식 살아있는 승무원과 함선 내부
- FTL식 함내 위기 관리, XCOM식 부상/역할 긴장

플레이어는 버튼을 반복해서 누르는 게 아니라 "살아있는 함선을 지휘하는 함장"이어야 한다.

## 절대 아키텍처 규칙 (위반 금지)

1. `src/systems/*.js` = **순수 함수만**. 스토어 import 금지. 유닛 테스트 가능해야 함.
2. `src/stores/*.js` = zustand persist 스토어. **스토어 간 import 금지**
   (기존 위반 2건 — jobStore→inventoryStore, gameStore→inventoryStore — 은 알려진 예외, 건드리지 말 것).
3. `src/systems/gameClock.js`만 여러 스토어를 오케스트레이션. 크로스 스토어 부수효과는
   스토어 액션의 **반환값**으로 넘기고 gameClock(또는 UI 호출부)에서 적용.
4. `src/data/*.js` = 의존성 없는 순수 데이터 카탈로그.
5. 새 persist 스토어는 `src/stores/persistVersion.js`의 `PERSIST_VERSION`/`passthroughMigrate` 패턴 필수 +
   방어적 merge. 저장 키는 `SaveLoadModal.jsx`와 `Menu.jsx`의 known-keys 목록에 추가.
6. **보고서는 로그 문자열을 파싱해서 만들지 않는다** — 구조화된 이벤트 데이터에서만
   (`src/systems/reportSystem.js` 헤더 참조).
7. zustand 셀렉터가 매 렌더 새 배열/객체를 반환하면 무한 렌더 루프 발생 이력 있음 —
   배열 파생은 `useMemo`, 원시값 셀렉터만 인라인 허용.

## 우선순위/어휘 경계 (혼동 금지 — 4종이 의도적으로 분리됨)

- activity 어휘: `systems/priorities.js` — emergency/high/normal/low (승무원 활동/큐)
- 카드 어휘: `systems/commandCenter.js` — critical/high/medium/low/info (상황카드·보고서, PRIORITY_LABEL/TONE export됨)
- job 숫자: `data/constants.js` JOB_PRIORITY(1/3/5/7) ↔ 문자열 변환은 `systems/jobMigration.js`에서만
- 방 상태: `systems/roomJobs.js` deriveRoomStatus — 안정/점검 필요/위험/위기/작업 중
각 파일 상단에 경계 주석 있음. 어휘 간 즉석 변환/새 어휘 창조 금지.

## 완료된 것 (최신순)

- **Phase 20 — 보고서 시스템** (PR #91~94): 카테고리 6종 카탈로그, reportStore(120캡+미확인 critical 보존 140 하드캡),
  순수 빌더 5종, 생성 지점(정책 실행/전투 종료/위기 발생·해결/작업 완료/임무 완료/이벤트 유발 위기),
  ReportsModal 수신함 + 미읽음 뱃지 3곳 + 홈 다이제스트. 볼륨 선별 원칙: "부재 중 의사결정/완결 결과만".
  상세: `docs/PHASE_20_REPORT_SYSTEM.md`
- **버그 수정 라운드 2회** (PR #89, #90): 시장 정박 판정(어디서든 상시 개방이던 버그 → 정거장 정박 시에만),
  전사 승무원 잡 누수(`gameClock.applyCombatCasualtyWithJobs`로 일원화), survey 계약 영구 완료 불가
  (노드 타입 기반 재배선, `hasVisitedNodeType`), MapModal 죽은 필드, lazy 3D 청크 에러 경계.
- **Phase 19 — 정책 시스템** (PR #83~88): 자동 선체 수리(hullThreshold:40)/부상자 자동 치료(minSeverity:"minor")/
  연료 예비율 경고(reserveThreshold:30)/조우 기본 대응(stance:balanced — **전투로 이어지는 선택지는 절대 자동 선택 안 함**).
  전부 기본 OFF, PolicyModal에서 토글. 상세: `docs/PHASE_19_POLICY_SYSTEM.md`
- **Phase 18 — 안정화 Track A** (PR #77~82): vitest 인프라 도입, 작업 큐/항해/방 모델의 레거시 이중화 3쌍 청산,
  우선순위 어휘 경계 명문화, persist 스키마 버전(전 스토어 version:1), three.js lazy 분리(초기 gzip 423→185KB).
- Phase 1~17: 커맨드센터/우선순위/크루AI/함선내부/방작업/위기/부상/항해/커스터마이징/가챠영입/
  리빙크루/계약임무/임무조우/보상경제/전투결정 — 각 `docs/PHASE_*.md` 참조.

## 알려진 지뢰 (수정 시 주의)

- `explorationStore`의 `currentZoneId`/`discoveredZoneIds`/`scannedZoneIds`/`activeTravel`/`pendingTravelEvent`는
  **죽은 필드**(세이브 호환용으로만 state에 존재, 쓰기 경로 없음). 새 코드에서 절대 읽지 말 것 —
  항해 상태는 전부 `navStore`(sector/currentNodeId/discovered/visited/travel).
  단 `pendingCombatEncounter`는 **현행 기능**(긴급 전투 플래그).
- `Menu.jsx`/`BottomDock.jsx`/`Combat.jsx`에 죽은 `discoveredZoneIds`를 읽는 잔여 소비처가 남아 있음(아래 백로그).
- 크루AI의 배경 치료(`crewStore.tickMemberInjury`의 `treatedBy`)는 정책/잡 시스템과 무관하게 부상을 호전시킬 수 있음 — 버그 아님.
- 세이브 호환: persist state 필드 제거 금지. 레거시 큐 마이그레이션(`migrateLegacyJobsOnce`) 유지.
- Playwright 검증 시: `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })` (해당 환경 한정).

## 작업 프로세스 (반드시 준수)

1. `origin/master`에서 새 브랜치 → 작은 단위 구현 → **`npm test` 전부 통과 + 신규 테스트 추가** →
   `npm run build` 통과 → PR 생성 → Netlify deploy-preview CI 확인 → squash 머지.
2. PR은 작게 쪼갤 것(기능당 A/B/C… 서브 PR). 각 PR은 독립적으로 머지 가능해야 함.
3. 게임플레이 수치를 바꾸지 말 것(기존 값 재사용). 새 수치가 필요하면 data 카탈로그에.
4. 기능 문서(`docs/PHASE_*.md`)는 코드와 **같은 PR에서** 갱신.
5. PR 설명에 실제로 하지 않은 검증(가짜 "npm test 통과" 등)을 쓰지 말 것.

## 다음 작업 (우선순위순)

### 1. Phase 21 — Inner Life (Phase 13 Layer B, 권장 다음 작업)
`docs/PHASE_13_LIVING_CREW.md`의 Layer B 계획 실행: 성격(traits)/무드/관계가 게임플레이에 연결.
- A: 성격 특성 카탈로그(data) + crew 필드 확장(세이브 호환 merge) — 표시만, 효과 없음
- B: 무드 모델(needs/사건이 무드에 반영) + 무드가 작업 속도/방작업 점수에 소폭 영향(순수 함수, 기존 공식에 곱연산)
- C: 관계(친밀/불화) — 같은 방 근무·식사 이벤트로 변화, 불화 시 효율 페널티
- D: UI(크루 카드에 특성/무드 칩, 보고서 연동 — 무드 급락·불화 발생을 crisis/work 보고서로) + 안정화·문서
- 주의: crewAI 우선순위 체계(치료>위기>강제휴식>큐>방작업)를 깨지 말 것. 효과는 소폭(±10~15%)으로.

### 2. Phase 22 — 전투↔함내 연결 (소형, 1~2 PR)
`docs/PHASE_11_FLEET_COMBAT.md`의 미완 항목: 전투 피해가 함내 위기를 실제 스폰.
- resolveCombatRound의 hull 피해가 클 때 확률적으로 `hull_breach`/`intruder` 위기 스폰 효과를 **반환값**으로 넘기고
  Combat.jsx(또는 gameClock)에서 `shipInteriorStore.spawnCrisis` 적용 → 20-D가 연결한 위기 보고서가 자동 발동.
- 순수 함수 원칙 유지(combatEngine은 스토어 import 금지).

### 3. 소형 백로그 (짬날 때 1 PR씩)
- economy 보고서 생성기(계약 완료/큰 거래 → economy 카테고리, `buildWorkReport` 패턴 재사용)
- Menu/BottomDock/Combat의 죽은 `discoveredZoneIds` 소비처를 navStore 기반으로 재배선
- 위기 escalation 보고(쓰로틀 필수 — `crisisEvents`에 구조화 데이터 이미 있음)
- fuel-reserve 자동 구매(시장 가격 모델 필요 — 설계부터)
- 신규 플레이어 온보딩(첫 10분 가이드) + 게임오버/승리 조건 명시
- 전역 `:focus-visible` 스타일 정리

### 그 이후 (대형)
- 함대(Fleet) 활성화: `shipStore.vesselsById` 스캐폴딩 실전화 — 2번함 획득/전환, 함선별 크루/방 스코프.
  전투/임무는 이미 vesselId 스코프로 저장됨(`combatStore`/`missionStore`). 가장 큰 확장이므로 마지막 권장.
