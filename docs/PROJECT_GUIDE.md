# Space Manager — 프로젝트 마스터 안내서

> 이 문서는 프로젝트의 **단일 진실 원천(single source of truth)** 입니다.
> 새 코딩 에이전트(Codex/Claude/기타)나 개발자가 이 문서 하나로 프로젝트의
> 최종 목표 · 현재 상태 · 앞으로 할 일 · 개선할 점을 전부 이해할 수 있도록 작성되었습니다.
> 작업 세부 규칙은 `docs/NEXT_CHAT_HANDOFF.md`(인수인계용 축약본)를, 각 기능 상세는
> `docs/PHASE_*.md`를 참조하세요. **문서와 코드가 어긋나면 코드가 정답이며, 발견 즉시 이 문서를 고치세요.**
>
> 최종 갱신: 2026-07-09 (Phase 21-A 진행: Inner Life 성격 특성 표시 기반, 테스트 429개 통과)

---

## 0. 한 문장 요약

> **모바일 우선 우주 탐사·함선 운영 시뮬레이션 게임.** 플레이어는 버튼을 반복해 누르는 것이 아니라,
> **살아있는 함선을 지휘하는 함장**이 되어 승무원·자원·항해·전투·위기를 정책과 결재로 관리한다.

---

## 1. 최종 목표 (Vision)

이 게임이 목표로 하는 "느낌"은 네 가지 명작의 조합이다:

| 참조작 | 가져오는 것 |
|---|---|
| **Football Manager** | 상황센터(홈 대시보드) · 우선순위 결재 큐 · 캡틴 보고서 수신함 |
| **RimWorld** | 살아있는 승무원 · 함선 내부 2D 뷰 · 방 작업 · 성격/무드(예정) |
| **FTL** | 함내 위기(화재/정전/선체파손/침입) 실시간 대응 · 전투 |
| **XCOM** | 부상/사망의 무게 · 역할(role) 긴장 · 영구적 손실 |

**핵심 설계 철학 (모든 판단의 기준):**
1. 플레이어는 "관리자/함장"이지 "일꾼"이 아니다. 반복 클릭이 아니라 **정책 설정 + 결재 + 판단**으로 플레이한다.
2. 함선은 살아 움직인다 — 승무원은 플레이어가 없어도 자율적으로 일하고(crewAI), 방은 마모되고, 위기는 스스로 발생한다.
3. 부재 중에 일어난 일은 **로그(흘러가는 피드)** 가 아니라 **보고서(결재 가능한 항목)** 로 전달된다.
4. **모바일 우선** — 좁은 화면, 큰 터치 타깃, 하단 탭 최소화, 보조 기능은 오버레이 모달.
5. 손실은 진짜여야 한다 — 죽은 승무원은 돌아오지 않고, 세이브는 자동 저장된다.

**장기 최종 상태 (아직 미도달):** 여러 함선으로 구성된 함대를 운영하며, 각 함선이 성격 있는 승무원으로
살아 돌아가고, 플레이어는 정책과 계약 선택으로 프론티어를 개척하는 캠페인 루프. 명확한 승리/패배 조건 포함.

---

## 2. 기술 스택 · 실행

- **빌드**: Vite 6 · **UI**: React 18 · **상태**: Zustand(+persist 미들웨어, localStorage 자동 저장)
- **스타일**: Tailwind v4 (`@import "tailwindcss"`, 설정 파일 없음) + `src/styles.css`의 HUD 커스텀 클래스
- **3D**: React Three Fiber / drei / three (행성·성계 지도, **lazy 청크로 분리**)
- **아이콘**: lucide-react
- **테스트**: vitest (node 환경, `tests/setup.js`가 localStorage/window 스텁 제공) — **현재 429개 전부 통과**

```bash
npm install        # 의존성 설치
npm run dev        # 개발 서버 (vite --host 127.0.0.1)
npm run build      # 프로덕션 빌드
npm test           # vitest 전체 (반드시 통과 유지)
```

- **배포**: `master` 푸시 시 Netlify 자동 배포 (space-manager.netlify.app). PR마다 `deploy-preview` CI.
- **저장소**: `KingHojin/space-manager`, 기본 브랜치 `master`.

---

## 3. 아키텍처 — 절대 규칙 (위반 금지)

이 프로젝트는 20+ 페이즈를 지나면서도 계층 규율을 유지한 것이 최대 자산이다. **아래 7항은 타협 불가:**

1. **`src/systems/*.js` = 순수 함수만.** 스토어 import 금지. 플레인 데이터로 유닛 테스트 가능해야 함.
   (유일한 예외: `gameClock.js` — 아래 3번)
2. **`src/stores/*.js` = 스토어 간 import 금지.** 크로스 스토어 부수효과는 스토어 액션의 **반환값**으로
   넘기고 호출부(gameClock/UI)에서 적용한다.
   - *알려진 기존 위반(건드리지 말 것):* `jobStore→inventoryStore`, `gameStore→inventoryStore`.
   - *문서화 안 됐지만 존재하는 위반(리팩터 후보, 지금은 방치):* `shipInteriorStore→inventoryStore`,
     `recruitStore→crewStore/gameStore`, `navStore→crewStore/jobStore`.
3. **`src/systems/gameClock.js`만** 여러 스토어를 오케스트레이션한다. 게임의 심장(틱 루프)이자 유일한 조율자.
4. **`src/data/*.js` = 의존성 없는 순수 데이터 카탈로그.** (단 값 파생을 위해 다른 data 파일 import는 허용 —
   예: `constants.js`가 `shipRooms.js`에서 방 라벨을 가져옴)
5. **새 persist 스토어는 `src/stores/persistVersion.js`의 `PERSIST_VERSION`/`passthroughMigrate` 패턴 필수** +
   방어적 `merge`(구세이브 형태 검증·정규화). 저장 키는 `SaveLoadModal.jsx`와 `Menu.jsx`의 known-keys 목록에
   **반드시 추가**(누락 방지 구조 테스트 `persistKnownKeys.test.js`가 감시 중).
6. **보고서는 로그 문자열을 파싱해서 만들지 않는다.** 반드시 구조화된 이벤트 데이터에서 생성.
   (`src/systems/reportSystem.js` 헤더 참조 — 로그는 사람이 한 번 읽는 자유 텍스트, 데이터 계약이 아님)
7. **zustand 셀렉터 렌더 안정성**: 셀렉터가 매 렌더 새 배열/객체를 반환하면 "Maximum update depth" 무한 루프
   발생 이력 있음. 배열 파생은 `useMemo`, 원시값(count 등) 셀렉터만 인라인 허용.

### 데이터 흐름 (틱 1회)
```
useGameClock (setInterval) → advanceMinutes → processTimedJobs(deltaMinutes):
  ├ migrateLegacyJobsOnce (세이브 마이그레이션, 1회성)
  ├ processJobScheduler   (jobStore.runScheduler: backlog→assign→start)
  ├ completeReadyJobs → applyUnifiedJob (완료된 잡 효과 적용 + work 보고서)
  ├ processTravel / processNavigation (navStore 항해·표류 틱, applyNavEffect)
  ├ processCrises          (shipInteriorStore.tickCrises: 위기 발생/진행/해결 + crisis 보고서)
  ├ processCrewAI          (crewStore.runCrewAI → systems/crewAI.generateCrewActivities)
  ├ processCrewMeals / processCrewNeeds / processCrewHealth
  ├ processRoomJobs        (shipInteriorStore.tickRooms: 방 마모/작업 진행)
  └ processPolicies        (policyStore + policyEngine → applyPolicyActions + policy 보고서)
  + dust 수집, 랜덤 이벤트
```
**틱 순서는 의미가 있다.** 새 process* 추가 시 순서 의존성을 고려할 것.

---

## 4. 우선순위·상태 어휘 4종 (절대 혼동 금지)

의도적으로 분리된 4개 어휘가 공존한다. 각 파일 상단에 경계 주석이 있다. **어휘 간 즉석 변환·새 어휘 창조 금지.**

| 어휘 | 위치 | 값 | 용도 |
|---|---|---|---|
| **activity** | `systems/priorities.js` | emergency / high / normal / low | 승무원 활동·작업 큐 |
| **card** | `systems/commandCenter.js` | critical / high / medium / low / info | 상황카드·**보고서** (`PRIORITY_LABEL`/`PRIORITY_TONE` export됨) |
| **job(숫자)** | `data/constants.js` `JOB_PRIORITY` | 1 / 3 / 5 / 7 | jobStore 내부 정렬. 문자열 변환은 `systems/jobMigration.js`에서만 |
| **room status** | `systems/roomJobs.js` `deriveRoomStatus` | 안정 / 점검 필요 / 위험 / 위기 / 작업 중 | 방 물리 상태 |

---

## 5. 스토어 지도 (18개)

| 스토어 | 책임 | 핵심 필드/액션 |
|---|---|---|
| `gameStore` | 자원·시간·로그·속도·일시정지 | resources(credits/fuel/oxygen/hull), currentMinute, logs(80캡), addLog, spendCredits, addResources, advanceMinutes |
| `navStore` | **항해(현행)** — 절차 생성 섹터/노드 | sector, currentNodeId, discovered, visited, travel, fuel, pendingEncounter, driftState, planRoute, tickTravel, resolveEncounter |
| `explorationStore` | ⚠️ **대부분 죽은 필드**(세이브 호환용). `pendingCombatEncounter`만 현행 | pendingCombatEncounter(긴급 전투 플래그, 라이브), 나머지 activeTravel/currentZoneId/discoveredZoneIds/scannedZoneIds는 **읽지 말 것** |
| `crewStore` | 승무원·활동·건강·부상 | crew, crewActivities, runCrewAI, applyCombatCasualty, tickCrewHealth, tickMemberInjury(배경 치료 `treatedBy` 포함) |
| `crewMotionStore` | 승무원 시각 이동(rAF, 비영속) | 함선 내부 마커 부드러운 이동, 게임플레이 무관 |
| `jobStore` | **통합 작업 시스템** | jobs, rooms(파생 잡-슬롯 인덱스), enqueueTraining/Treatment/Recovery/ShipWork/ModuleWork, runScheduler, completeReadyJobs, cancelJobsForCrew |
| `shipInteriorStore` | **방 물리 상태 + 위기** | rooms(condition/load/tier/modules/activeCrisisId), activeCrises, tickRooms, tickCrises, spawnCrisis |
| `shipStore` | 함선·모듈·다중 함선 스캐폴딩 | modules, installed, vesselsById, activeVesselId, applyModuleJob, getInstalledModules |
| `inventoryStore` | 아이템·먼지·카드 | items, dust, cards, activeCardIds, addItem, removeItem, getActiveCards |
| `missionStore` | 계약 임무(vesselId 스코프) | activeByVesselId, boardsByScopeId, acceptMission, completeMission, 임무 조우 |
| `contractStore` | 시장 계약 수락/완료 상태 | acceptedIds, completedIds |
| `combatStore` | 전투 상태(vesselId 스코프) | combatByVesselId, feedByVesselId, startCombat, updateCombat, resetCombat |
| `factionStore` | 팩션 평판 | reputation, addReputation |
| `skillStore` | 스킬트리 | availablePoints, unlocked |
| `recruitStore` | 가챠 영입 | pity, candidatePool(**영입 후보 실 소스**), pull, recruitFromCandidate |
| `policyStore` | **정책 시스템** | policies{enabled,params}, setPolicyEnabled, setPolicyParam, resetPolicy |
| `reportStore` | **보고서 수신함** | reports(120캡+미확인 critical 보존 140하드캡), addReport, markRead, markAllRead, acknowledge, clearAcknowledged |
| `persistVersion` | (스토어 아님) 공용 persist version/migrate 유틸 | PERSIST_VERSION=1, passthroughMigrate |

---

## 6. 지금까지 만든 것 (Phase 1–20, 최신순)

각 항목 상세는 `docs/PHASE_*.md` 참조. 테스트는 매 PR 통과 상태로만 머지됨.

### Phase 20 — 보고서 시스템 ✅ (`PHASE_20_REPORT_SYSTEM.md`)
부재 중 일어난 일을 결재 가능한 캡틴 보고서로. 카테고리 6종(정책/전투/항해/위기/작업/경제),
순수 빌더 5종, 생성 지점(정책 실행·전투 종료·위기 발생/해결·작업 완료·임무 완료·이벤트 유발 위기),
`ReportsModal` 수신함(필터/읽음/확인/critical 강조) + 미읽음 뱃지 3곳 + 홈 다이제스트.
볼륨 선별 원칙: **"부재 중 의사결정 또는 완결된 결과만"** 보고서화(로그 복사본 금지).

### 버그 수정 라운드 (2회, PR #89·#90·#96)
- 시장 정박 판정(어디서든 상시 개방 → 정거장 정박 시에만)
- 전사 승무원 잡 누수(방 슬롯 점유 → 강제 취소 일원화)
- survey 계약 영구 완료 불가(노드 타입 기반 재배선)
- MapModal·Menu·BottomDock·Combat의 죽은 `discoveredZoneIds` 재배선(탐사율·적 위험도가 실제 진행 반영)
- 시장 연료 보급 미작동, 홈 긴급전투 미표시, 스탯 NaN, 영입 후보 카운트 오류
- lazy 3D 청크 로드 실패 에러 경계

### Phase 19 — 정책 시스템 ✅ (`PHASE_19_POLICY_SYSTEM.md`)
"if X, do Y without asking" 자동화 규칙. 4종: 자동 선체 수리(hullThreshold:40) / 부상자 자동 치료
(minSeverity:"minor") / 연료 예비율 경고(reserveThreshold:30) / 조우 기본 대응(stance:balanced).
전부 기본 OFF, `PolicyModal`에서 토글·조정. **전투로 이어지는 조우 선택지는 어떤 정책도 자동 선택 안 함.**

### Phase 18 — 안정화 Track A ✅
vitest 인프라 도입(0→테스트 있음), 레거시 이중화 3쌍 청산(작업 큐/항해/방 모델), 우선순위 어휘 경계
명문화, persist 스키마 버전 도입(전 스토어 version:1), three.js lazy 분리(초기 gzip 423→185KB).

### Phase 1–17 (기반 게임플레이)
1 커맨드센터(홈) · 2 우선순위 · 3 크루AI · 4 함선내부 · 5 방작업 슬롯 · 6 위기대응 · 7 부상/역할 ·
8 항해(절차 생성 섹터) · 9 함선 커스터마이징 · 10 가챠 영입 · 11 함대전투(부분) · 13 리빙크루(Layer A만) ·
14 계약임무 · 15 임무조우 · 16 보상경제 · 17 전투결정(서브시스템 타겟팅).

**현재 플레이 루프:** 임무 게시판 → 계약 수주 → 노드 항해 → 조우/위기/전투 → 보상 → 수리·업그레이드 →
승무원 관리(영입·훈련·치료·방작업) → 정책 자동화 → 보고서 결재 → 반복.

---

## 7. 앞으로 만들 것 (우선순위순 로드맵)

### 🥇 Phase 21 — Inner Life (진행 중)
`PHASE_21_INNER_LIFE.md` 기준으로 `PHASE_13_LIVING_CREW.md`의 Layer B 실행. 승무원을 "방 사이를 오가는 마커"에서 "성격 있는 존재"로.
- **21-A 완료**: 성격 특성(traits) 카탈로그(data) + crew 필드 확장(세이브 호환 merge) + 크루 카드 칩 표시 — 표시만, 효과 없음
- **21-B 완료**: 기존 needs/fatigue 기반 무드 모델 + 작업 `effectiveDuration`/방작업 점수·진행에 **소폭(0.88~1.12x)** 곱연산 적용
- **21-C 다음**: 관계(친밀/불화) — 같은 방 근무·식사로 변화, 불화 시 효율 페널티
- **21-D**: UI(크루 카드에 특성/무드 칩) + 보고서 연동(무드 급락·불화 발생 → crisis/work 보고서) + 안정화·문서
- ⚠️ 주의: crewAI 우선순위 체계(치료>위기>강제휴식>큐>방작업)를 깨지 말 것. 효과는 소폭.

### 🥈 Phase 22 — 전투↔함내 연결 (소형, 1~2 PR)
`PHASE_11_FLEET_COMBAT.md` 미완 항목. 전투 피해가 함내 위기를 실제 스폰.
- `resolveCombatRound`의 hull 피해가 클 때 확률적으로 `hull_breach`/`intruder` 위기 스폰 효과를 **반환값**으로
  넘기고 Combat.jsx(또는 gameClock)에서 `shipInteriorStore.spawnCrisis` 적용
- → 20-D가 연결한 위기 보고서가 자동 발동. combatEngine 순수성 유지(스토어 import 금지).

### 🥉 소형 백로그 (짬날 때 1 PR씩)
- **economy 보고서 생성기**: 계약 완료·큰 거래 → economy 카테고리(`buildWorkReport` 패턴 재사용, 카탈로그/UI 이미 준비됨)
- **위기 escalation 보고**: `crisisEvents`에 구조화 데이터 이미 있음, 쓰로틀 필수(스팸 방지)
- **fuel-reserve 자동 구매**: 시장 재고/가격 모델부터 설계 필요
- **신규 플레이어 온보딩**(첫 10분 가이드) + **게임오버/승리 조건 명시** — 배포 중인 게임이라 실은 중요
- **전역 `:focus-visible` 스타일 정리**

### 🏆 그 이후 (대형) — 함대(Fleet) 활성화
`shipStore.vesselsById` 스캐폴딩 실전화 — 2번함 획득/전환, 함선별 크루·방 스코프.
전투/임무는 이미 vesselId 스코프로 저장됨(`combatStore`/`missionStore`). **가장 큰 확장이므로 마지막 권장.**

---

## 8. 개선할 것 / 알려진 지뢰 (기술 부채)

### 🕳️ 죽은 필드 (읽지 말 것 — 새 코드에서 참조 금지)
- `explorationStore.currentZoneId` / `discoveredZoneIds` / `scannedZoneIds` / `activeTravel` / `pendingTravelEvent`
  — 쓰기 경로 없음, 세이브 호환용으로만 state에 존재. **항해 상태는 전부 `navStore`.**
  - 단 `explorationStore.pendingCombatEncounter`는 **현행 기능**(긴급 전투 플래그).
- 남은 죽은 액션: `explorationStore.moveToZone/scanZone/revealRandomZone`, `jobStore.advanceJobs/migrateProgressJobs`
  — 호출자 0(세이브 호환 원칙에 따라 유지).

### ⚠️ 관찰됐으나 미수정 (수정 시 판단 필요)
- **문서 미기재 스토어 간 import 3건**(§3 2번 참조) — 리팩터 후보, 동작 버그 아님.
- **crewAI 위기 중 전원 crisis-standby** — 위기 활성 시 대응 미배정 승무원이 식사/휴식보다 standby 우선.
  장기 위기 시 배고픔 누적 가능하나 문서화된 우선순위와 부합(디자인 판단 필요).
- **Combat `startEncounter`가 `pendingCombatEncounter.enemyId` 무시** — danger 기반 랜덤 재추첨(`fallback:true`로 의도된 폴백일 수 있음).
- **gameClock 틱 순서**: `processCrises`가 `processCrewAI`보다 먼저 → 위기 대응자 신규 배정 첫 틱 진압 기여 1틱 누락(파이프라인 스냅샷 의도일 수 있음).
- **크루AI 배경 치료**(`crewStore.tickMemberInjury`의 `treatedBy`) — 정책/잡 시스템과 무관하게 유휴 메딕이 부상 호전. Phase 19 이전부터 존재, 버그 아님(정책 시스템의 보장 범위는 "잡 예약+비용 지출"까지).
- `inventoryStore`/`recruitStore`의 무방비 `crypto.randomUUID()`(jobStore는 가드) — HTTPS 배포 환경에선 무해.

### 세이브 호환 원칙
- persist state 필드를 **제거하지 말 것**(구세이브가 읽을 수 있음). 새 필드는 방어적 merge로.
- 레거시 큐 마이그레이션(`migrateLegacyJobsOnce`) 유지.
- persist version 불일치는 `passthroughMigrate`로 처리(구세이브=version 0 → 1 통과).

---

## 9. 작업 프로세스 (반드시 준수)

1. `origin/master`에서 새 브랜치 → **작은 단위** 구현 → `npm test` 전부 통과 + **신규 테스트 추가** →
   `npm run build` 통과 → PR 생성 → Netlify `deploy-preview` CI 확인 → **squash 머지**.
2. PR은 작게 쪼갤 것(기능당 A/B/C… 서브 PR). 각 PR은 독립적으로 머지 가능해야 함.
3. **게임플레이 수치를 바꾸지 말 것**(기존 값 재사용). 새 수치가 필요하면 `data/` 카탈로그에.
4. 기능 문서(`docs/PHASE_*.md`)는 코드와 **같은 PR에서** 갱신. 코드가 문서를 참조하면 문서도 그 PR에서 채운다.
5. **PR 설명에 실제로 하지 않은 검증(가짜 "npm test 통과" 등)을 쓰지 말 것.**
6. Playwright 검증 시(해당 환경): `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`,
   스토어 조작은 dev 서버의 ES 모듈을 `page.evaluate` 안에서 `import()`(실제 앱과 동일 싱글턴).
7. 버그를 "발견"하면 반드시 **재현 테스트 또는 grep 근거**로 증명 후 수정. 애매하면 수정 말고 문서에 기록.

---

## 10. 빠른 오리엔테이션 (새 에이전트용 첫 30분)

1. 이 문서(`PROJECT_GUIDE.md`) 전체를 읽는다.
2. `src/systems/gameClock.js`를 읽어 틱 루프 전체 흐름을 파악한다(모든 시스템이 여기서 만난다).
3. 최근 완성 기능의 3분할 패턴을 본다: `data/policies.js` + `stores/policyStore.js` + `systems/policyEngine.js`
   (또는 reports 3종). **새 기능은 이 패턴을 그대로 복제한다.**
4. `npm test`를 돌려 429개 통과를 확인한다. 테스트 파일들(`src/**/__tests__/`)이 각 시스템의 계약을 보여준다.
5. 작업할 기능의 `docs/PHASE_*.md`를 읽는다.
6. §9 프로세스대로 작은 PR로 시작한다.

---

*이 문서는 코드가 바뀔 때마다 갱신되어야 하는 살아있는 문서입니다. 오래된 서술을 발견하면 그 자리에서 고치세요.*
