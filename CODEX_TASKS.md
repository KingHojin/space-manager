# CODEX_TASKS.md

Codex 실행용 작업 명세서입니다. **한 번에 Task 하나만** 수행하세요.
각 Task는 명시된 "수정 대상 파일"만 건드리고, "수정 금지 파일"은 절대 변경하지 마세요.
Task는 번호 순서대로 의존성이 있을 수 있습니다 (명시된 "선행 조건" 참고). 먼저 선행 Task가 완료되어 있는지 확인 후 시작하세요.

---

# Phase 1 — 탐험 메뉴 3D 행성 (✅ 완료)

> Task 001~005는 모두 구현 완료되어 브랜치에 커밋되어 있습니다. **다시 수행하지 마세요.**
> 산출물: `three`/`@react-three/fiber@8`/`@react-three/drei@9` 의존성, `src/data/planets.js`,
> `src/components/three/PlanetCanvas.jsx`, Exploration 패널·MapModal 3D 통합, 모바일 가로 오버플로 수정.

## 목표 (Phase 1)

탐험 메뉴(메인 "탐험" 패널 및 "성계 지도" 모달)에서 각 구역(zone)을 2D 카드가 아닌 **3D 행성**으로 시각화한다.

## 결정 필요 (Codex가 임의 판단하지 말고 아래 기본값을 그대로 따르거나, 모호하면 작업을 멈추고 보고할 것)

1. **텍스처 방식**: 레포에 행성 이미지/텍스처 에셋이 전혀 없고 외부 이미지 다운로드는 금지. 따라서 모든 행성은 **절차적(procedural) 머티리얼/색상**으로만 표현한다 (외부 이미지 파일, CDN 텍스처 로드 금지). 이 결정은 확정 사항이며 재질문 불필요.
2. **3D 라이브러리**: `three` + `@react-three/fiber` + `@react-three/drei` 조합을 사용한다 (React 18 호환 버전: `@react-three/fiber` ^8.x, `@react-three/drei` ^9.x). 확정 사항.
3. **모바일/성능 목표 FPS, 저사양 기기 대응 수준**: 명시되지 않음. 각 Task의 요구사항에 있는 기본 성능 가드(DPR 캡, 세그먼트 수 등) 이상으로 별도 성능 최적화 작업(LOD, 인스턴싱 등)은 하지 말 것. 추가 최적화가 필요하다고 판단되면 구현하지 말고 Task 완료 보고에 "추가 결정 필요" 항목으로 남길 것.
4. **기존 2D `zone-node` UI 완전 대체 여부**: 완전 대체하지 않는다. 기존 2D 그리드/버튼 상호작용(이동, 스캔, 강조 표시)은 그대로 유지하고, 3D 행성 뷰는 **추가 요소**로 삽입한다 (Task 004, 005 참고). 확정 사항.

---

## Task 001 — 3D 렌더링 라이브러리 의존성 추가

### 목표
프로젝트에 3D 행성 렌더링에 필요한 라이브러리(`three`, `@react-three/fiber`, `@react-three/drei`)를 추가하고 빌드가 정상 동작함을 확인한다. 이 Task는 순수 의존성 설치 작업이며 애플리케이션 코드는 변경하지 않는다.

### 수정 대상 파일
- `package.json`
- `package-lock.json` (npm install로 자동 갱신)

### 수정 금지 파일
- `src/` 이하 전체
- `vite.config.js` (설치만으로 설정 변경이 필요 없어야 함. 만약 정말 필요하다면 변경 사유를 완료 보고에 명시)

### 구현 요구사항
- `npm install three @react-three/fiber @react-three/drei` 실행 (React 18과 호환되는 버전 선택: `@react-three/fiber` v8.x, `@react-three/drei` v9.x, `three` 최신 안정판).
- 기존 `dependencies` 항목(react, zustand, tailwindcss 등) 버전은 변경하지 않는다.
- `package.json`의 `dependencies`에 알파벳 순서를 유지하며 3개 패키지를 추가한다 (기존 파일이 알파벳순 정렬되어 있음).

### 완료 조건
- `package.json`에 `three`, `@react-three/fiber`, `@react-three/drei`가 포함됨.
- `npm install` 후 `node_modules`에 세 패키지가 정상 설치됨.
- `npm run build`가 에러 없이 성공함.
- `src/` 이하 파일은 diff에 전혀 포함되지 않음.

### 테스트 방법
```
npm install
npm run build
```
빌드가 exit code 0으로 끝나는지 확인한다. (아직 3D 코드가 없으므로 기존 빌드 결과와 동일해야 함)

### 예상 충돌 지점
- 이후 모든 Task(002~005)는 이 Task가 만든 `package-lock.json`을 전제로 하므로, 반드시 이 Task를 가장 먼저 완료해야 한다.
- 다른 Task는 `package.json`을 건드리지 않으므로 파일 충돌은 없음.

---

## Task 002 — 행성 비주얼 데이터 정의 (신규 데이터 파일)

### 선행 조건
없음 (독립 실행 가능, Task 001과 병렬 가능하지만 순서상 001 다음 권장)

### 목표
구역(zone) 정보를 입력받아 3D 행성의 시각적 속성(색상, 크기, 고리 유무 등)을 결정론적으로 계산하는 순수 데이터/함수 모듈을 만든다. React나 three.js에 의존하지 않는 순수 JS여야 하며, Exploration 패널과 지도 모달이 공통으로 재사용한다.

### 수정 대상 파일
- `src/data/planets.js` (신규 생성)

### 수정 금지 파일
- `src/data/sectors.js` (읽기만 하고 구조 변경 금지 — import해서 zone 필드만 참조)
- 그 외 모든 기존 파일

### 구현 요구사항
- `sectors.js`의 zone 객체는 `{ id, name, type, danger, richness, distance, discovered }` 형태 (필요 시 `getZoneById`/`getAllZones`를 참고만 하고 수정하지 않음).
- zone의 `type` 값은 `station | nebula | ruin | anomaly | creature | mining | gate | wreck` 중 하나이다. 각 타입별 기본 색상 팔레트(baseColor, emissiveColor)를 매핑한 객체를 정의한다 (예: nebula → 보라/청록 계열, mining → 갈색/금속 계열, creature → 녹색/유기체 느낌 등 프로젝트의 slate/cyan 다크 테마와 어울리는 색).
- `zone.id` 문자열을 시드로 사용하는 간단한 결정론적 해시 함수(예: 문자 코드 합산 기반)를 구현하여, 같은 타입이라도 zone마다 색상 미세 변화(hue/lightness offset)와 `size`(0.8~1.4 범위 배율), `hasRing`(boolean, 확률적이지만 zone.id 기준 결정론적) 등을 다양화한다. `Math.random()`은 사용하지 않는다 (재렌더링 시 값이 바뀌면 안 됨).
- `danger`(1~5)가 높을수록 emissive 강도(밝기)를 높이고, `richness`(1~5)가 높을수록 표면 색이 더 선명하도록 반영한다.
- 다음 함수를 export한다:
  - `getPlanetVisual(zone)` → `{ baseColor: string(hex), emissiveColor: string(hex), size: number, hasRing: boolean, roughness: number(0~1), metalness: number(0~1), seed: number }`
  - `zone`이 `null`/`undefined`인 경우 안전한 기본값 객체를 반환한다 (throw 금지).
- three.js import 금지 (색상은 hex 문자열로만 반환, Color 객체 변환은 Task 003의 컴포넌트에서 수행).

### 완료 조건
- `src/data/planets.js`가 존재하고 `getPlanetVisual`을 default 또는 named export로 제공.
- 동일한 zone 객체를 여러 번 넣었을 때 항상 동일한 값을 반환 (결정론적).
- 서로 다른 zone.id에 대해 최소 `baseColor`, `size` 값이 달라짐을 확인.

### 테스트 방법
임시 스크립트(예: `node --experimental-vm-modules` 불필요, ESM이므로 아래처럼 확인):
```
node -e "
import('./src/data/planets.js').then(async (m) => {
  const { getAllZones } = await import('./src/data/sectors.js');
  const zones = getAllZones();
  for (const z of zones) console.log(z.id, m.getPlanetVisual(z));
});
"
```
동일 명령을 두 번 실행해 같은 zone.id에 대해 값이 동일한지(결정론적) 확인한다. 이 임시 확인용 명령은 파일로 남기지 말 것 (커밋 대상 아님).

### 예상 충돌 지점
- 신규 파일이므로 다른 Task와 직접 충돌 없음.
- Task 003, 004, 005가 이 모듈의 `getPlanetVisual` 함수 시그니처에 의존하므로, 함수명/반환 필드명을 임의로 바꾸지 말 것.

---

## Task 003 — 재사용 가능한 3D 행성 컴포넌트 (PlanetCanvas)

### 선행 조건
Task 001(라이브러리 설치), Task 002(`src/data/planets.js`) 완료 필수.

### 목표
zone 하나를 입력받아 회전하는 3D 행성을 렌더링하는 독립적인 React 컴포넌트를 만든다. 이 컴포넌트는 Exploration 패널과 지도 모달 양쪽에서 재사용된다.

### 수정 대상 파일
- `src/components/three/PlanetCanvas.jsx` (신규 생성, 디렉터리도 신규)

### 수정 금지 파일
- `src/components/panels/Exploration.jsx`
- `src/components/modals/MapModal.jsx`
- `src/data/planets.js`, `src/data/sectors.js` (import만 할 것)
- `src/main.jsx`, `src/App.jsx` (테스트 목적이라도 최종 커밋에는 변경 없어야 함 — 아래 테스트 방법 참고)

### 구현 요구사항
- `@react-three/fiber`의 `Canvas`, `@react-three/drei`의 `Stars`, `OrbitControls`를 사용한다.
- Props: `PlanetCanvas({ zone, size = 240, interactive = true, className })`
  - `zone`이 `null`/`undefined`이면 3D 캔버스 대신 플레이스홀더(예: "행성 데이터 없음" 텍스트, 어두운 배경의 div)를 렌더링하고 크래시하지 않는다.
  - `size`는 컨테이너의 픽셀 높이/너비 기준(정사각형)으로 사용하되, 실제로는 Tailwind 클래스(`w-full h-full`)로 부모 크기를 채우도록 하고 `size`는 내부 지오메트리 스케일 정도로만 참고 (부모 컨테이너 크기 제어는 이 컴포넌트를 사용하는 쪽 책임).
  - `interactive=true`일 때만 `OrbitControls`를 활성화(자동 회전 없이 사용자 드래그만 허용, zoom 비활성화 권장: `enableZoom={false}`). `interactive=false`면 `OrbitControls` 자체를 렌더링하지 않는다.
- `Task 002`의 `getPlanetVisual(zone)`을 사용해 구체(SphereGeometry, 세그먼트 32x32 고정)의 `color`(baseColor), `emissive`(emissiveColor), `roughness`, `metalness`를 `meshStandardMaterial`에 매핑한다.
- `hasRing`이 true면 `TorusGeometry` 또는 납작한 `RingGeometry`로 간단한 고리를 추가한다 (텍스처 없이 `meshBasicMaterial` + 반투명 색상).
- `useFrame`으로 매 프레임 행성 mesh의 `rotation.y`를 서서히 증가시켜 자동 회전시킨다 (회전 속도는 고정 상수, 예: `0.15 * delta`).
- 조명: `ambientLight` + `pointLight` 최소 1개씩.
- 배경: `<Stars radius={80} depth={40} count={1000} factor={2} fade />` 등으로 은은한 별 배경 추가.
- 성능 가드: `<Canvas dpr={[1, 2]} gl={{ antialias: true }}>` 로 픽셀비 캡.
- three.js 관련 리소스는 r3f가 언마운트 시 자동 정리하므로 별도 dispose 코드는 작성하지 않는다 (불필요한 방어 코드 금지).

### 완료 조건
- `src/components/three/PlanetCanvas.jsx`가 default export로 `PlanetCanvas` 컴포넌트를 제공한다.
- 유효한 zone으로 렌더링 시 콘솔 에러 없이 회전하는 구체 + 별 배경이 보인다.
- `zone`이 없을 때 크래시 없이 플레이스홀더가 보인다.

### 테스트 방법
아래 방식으로 **임시로만** 확인하고, 확인 후 반드시 원상 복구한다:
1. `src/main.jsx`를 임시로 열어 `PlanetCanvas`를 테스트용으로 렌더링해보거나, 별도로 `src/components/three/__manual_test.jsx` 같은 임시 파일을 만들어 `npm run dev`로 브라우저에서 확인한다.
2. 확인이 끝나면 임시로 만든 테스트용 코드/파일을 전부 삭제하고, `git status`/`git diff`로 `src/main.jsx`, `src/App.jsx`에 변경 사항이 남아있지 않은지 반드시 확인한 뒤 커밋한다.
3. `npm run build`로 최종 빌드가 성공하는지 확인한다 (사용하는 곳이 아직 없어도 빌드는 통과해야 함 — dead code라도 문법/타입 문제 없어야 함).

### 예상 충돌 지점
- 신규 디렉터리/파일이므로 직접적인 파일 충돌은 없음.
- Task 004, 005가 이 컴포넌트의 props 시그니처(`zone`, `size`, `interactive`, `className`)에 의존하므로 임의 변경 금지.

---

## Task 004 — 탐험 패널에 3D 행성 뷰 통합

### 선행 조건
Task 003(`PlanetCanvas` 컴포넌트) 완료 필수.

### 목표
메인 "탐험" 패널(`Exploration.jsx`)에서 현재 위치한(또는 선택된) 구역을 3D 행성으로 보여준다. 기존 2D 구역 그리드/이동/스캔 기능은 그대로 유지한다.

### 수정 대상 파일
- `src/components/panels/Exploration.jsx`

### 수정 금지 파일
- `src/components/three/PlanetCanvas.jsx`
- `src/data/planets.js`, `src/data/sectors.js`
- `src/stores/explorationStore.js`
- `src/components/modals/MapModal.jsx`
- `src/App.jsx`

### 구현 요구사항
- `import PlanetCanvas from "../three/PlanetCanvas";` 를 추가한다.
- `aside` 영역의 "구역 정보"(`section`) 바로 위(또는 해당 section 내부 최상단, `Info` 목록 위)에 새 블록을 삽입:
  ```jsx
  <div className="h-56 w-full overflow-hidden rounded border border-slate-700/70 bg-slate-950/60 sm:h-64">
    <PlanetCanvas zone={current} interactive />
  </div>
  ```
  (정확한 높이 클래스는 레이아웃이 깨지지 않는 선에서 조정 가능하나, 기존 `section` 구조와 간격(`space-y-4`, `mt-4` 등 기존 컨벤션)을 그대로 따를 것.)
- `current`가 존재하지 않는 극단적 상황(초기 상태 버그 등)에도 `PlanetCanvas`가 자체적으로 플레이스홀더를 처리하므로 이 파일에서 별도 null 체크 분기를 추가하지 않는다 (불필요한 방어 코드 금지, Task 003에서 이미 처리됨).
- 기존 `handleMove`, `handleScan`, `zone-node` 그리드, `route` 표시 로직은 손대지 않는다. import 순서나 불필요한 리팩터링도 하지 않는다.

### 완료 조건
- 탐험 탭 진입 시 우측(또는 배치된 위치)에 현재 구역을 나타내는 회전하는 3D 행성이 보인다.
- 발견된 다른 구역으로 이동(`handleMove`) 시 3D 행성이 새 구역에 맞게 즉시 갱신된다 (색상/형태가 zone에 따라 달라짐, `current`가 `currentZoneId` 기반으로 자동 갱신되므로 별도 상태 관리 불필요).
- 기존 2D 그리드 클릭 이동/스캔 기능이 정상 동작한다 (회귀 없음).

### 테스트 방법
```
npm run dev
```
브라우저에서 좌측 사이드바 "탐험" 탭 진입 → 3D 행성이 렌더링되는지 확인 → 발견된 구역(예: 청색 표류대) 카드를 클릭해 이동 → 3D 행성 색상/모양이 바뀌는지 확인 → "현재 구역 스캔" 버튼이 여전히 정상 동작하는지 확인.
마지막으로 `npm run build`로 빌드 성공 확인.

### 예상 충돌 지점
- Task 005는 `MapModal.jsx`만 건드리므로 이 Task와 파일 충돌 없음.
- 삽입 위치를 "구역 정보 section 최상단"으로 명확히 지정했으므로, 다른 위치에 임의로 넣지 말 것 (레이아웃 리뷰 시 위치가 다르면 재작업 요청될 수 있음).

---

## Task 005 — 성계 지도 모달에 3D 행성 그리드 적용

### 선행 조건
Task 002(`src/data/planets.js`), Task 003(`PlanetCanvas`) 완료 필수.

### 목표
"성계 지도" 모달(`MapModal.jsx`, BottomDock에서 여는 지도 모달)에서 **발견된** 구역들을 작은 3D 행성 썸네일로 표시한다. 미발견 구역은 기존과 동일하게 안개(fog) 처리된 placeholder를 유지한다 (스포일러 방지 및 성능 보호).

### 수정 대상 파일
- `src/components/modals/MapModal.jsx`

### 수정 금지 파일
- `src/components/three/PlanetCanvas.jsx`
- `src/data/planets.js`, `src/data/sectors.js`
- `src/components/panels/Exploration.jsx`
- `src/stores/explorationStore.js`

### 구현 요구사항
- `import PlanetCanvas from "../three/PlanetCanvas";` 추가.
- 기존 `map-grid` 레이아웃과 `zone-node`/`zone-node-active`/`zone-node-hidden` 클래스, 활성 구역 강조 로직은 그대로 유지한다.
- `visible`(발견됨)인 zone에 한해, 기존 텍스트(`zone.name`, `거리 ${zone.distance}`) 위쪽에 작은 3D 캔버스 영역을 추가한다:
  ```jsx
  <div className="mb-2 h-20 w-full overflow-hidden rounded">
    <PlanetCanvas zone={zone} interactive={false} />
  </div>
  ```
- `visible`이 false(미발견)인 zone에는 `PlanetCanvas`를 렌더링하지 않는다 (기존 안개 placeholder 그대로 유지) — 동시에 여러 개의 3D 캔버스가 떠서 발생하는 성능 문제를 피하기 위함.
- `PlanetCanvas.jsx` 자체는 수정하지 않는다. 이 Task에서 세그먼트 수/디테일을 낮추고 싶어도 컴포넌트 내부를 고치지 말고, 이미 제공되는 props(`interactive={false}`)만 사용한다. (만약 발견된 구역 수가 많아 렌더링 성능이 실제로 문제된다면 코드를 수정하지 말고 완료 보고서에 "추가 결정 필요"로 기록만 할 것.)

### 완료 조건
- 지도 모달을 열면 발견된 구역은 각기 다른 색/형태의 작은 3D 행성 썸네일 + 기존 텍스트가 함께 보인다.
- 미발견 구역은 기존과 동일한 안개 스타일 placeholder로 표시된다 (회귀 없음).
- 여러 구역이 동시에 렌더링되어도 브라우저 콘솔에 에러가 없다.

### 테스트 방법
```
npm run dev
```
브라우저에서 하단 독(BottomDock)의 "지도" 버튼을 눌러 모달을 연다. 발견된 구역(앵커 정거장, 청색 표류대)에 3D 행성 썸네일이 보이는지, 미발견 구역은 기존 안개 스타일 그대로인지 확인. 개발자 콘솔에 에러/경고가 없는지 확인. `npm run build`로 빌드 성공 확인.

### 예상 충돌 지점
- Task 004와 파일이 겹치지 않으므로 직접 충돌 없음.
- 단, 같은 `PlanetCanvas` 컴포넌트를 동시에 여러 인스턴스로 마운트하므로, Task 003의 컴포넌트가 개별 인스턴스 단위로 상태를 격리하는지(전역 상태 공유 없음) 확인 필요 — 문제가 발견되면 `PlanetCanvas.jsx` 자체 수정은 이 Task 범위가 아니므로 별도 Task로 보고할 것.

---
---

# Phase 2 — 전면 UI 리디자인 ("Starfinder" HUD 스타일) (✅ 완료)

> Task 006~013은 모두 구현 완료되어 브랜치에 커밋되어 있습니다 (커밋 `cf567dd`). **다시 수행하지 마세요.**
> 산출물: HUD 디자인 토큰/공통 클래스, 헤더·사이드바·모바일 탭바 리디자인, 개요 대시보드 재구성,
> 탐험 패널 선택→항로설정 UX, 잔여 패널 6종 및 모달 6종 스타일 통일.
> 부수적으로 발견해 수정한 버그: `getInstalledModules`/카드 필터 셀렉터의 무한 리렌더 크래시,
> 루트 wrapper `min-h-dvh`→`h-dvh`(모바일 탭바가 페이지 스크롤에 밀려 화면 밖으로 나가던 문제).

## 목표 (Phase 2)

제공된 시안(데스크톱: 멀티패널 HUD 대시보드 / 모바일: 하단 탭바 + 카드 스택) 스타일로 전체 UI를 리디자인한다.
핵심 인상: 짙은 네이비-블랙 우주 배경, 시안(cyan) 네온 액센트, 얇은 발광 보더의 HUD 패널, 대문자·자간 넓은 마이크로 라벨, 그라데이션 게이지 바, 데스크톱은 정보 밀도 높은 3열 대시보드, 모바일은 하단 고정 탭바와 세로 카드 스택.

**이것은 리스킨 + 레이아웃 개편이며, 게임 시스템 추가가 아니다.** 시안에 보이는 요소 중 게임에 데이터가 없는 것(아래 "결정 필요/매핑 규칙" 참고)은 임의로 새 시스템을 만들지 말고 규칙대로 매핑하거나 생략한다.

## 전역 제약 (Phase 2 모든 Task 공통)

1. **외부 리소스 절대 금지**: 웹폰트 로드, CDN 이미지, 행성/함선 사진·렌더 이미지 파일 추가 금지. 비주얼은 전부 CSS(그라데이션/보더/그림자), lucide-react 아이콘, 기존 `PlanetCanvas`(three.js)로만 구현한다. 시안의 사진급 아트는 재현 대상이 아니라 "톤 참고"다.
2. **신규 npm 의존성 금지**: 현재 `package.json`에 있는 것만 사용.
3. **게임 로직/스토어 데이터 불변**: 명시적으로 허용된 Task(011의 `selectedZoneId` 추가) 외에는 `src/stores/*`, `src/systems/*`, `src/data/*`(constants.js의 MENU_ITEMS sublabel 추가 제외) 수정 금지. 하드코딩 가짜 수치(시안의 "2,845,730" 같은 목업 값) 삽입 금지 — 반드시 스토어의 실제 값 바인딩.
4. **텍스트는 한국어 유지**: 시안의 영문 라벨(SET COURSE 등)을 그대로 옮기지 않는다. 기존 한국어 라벨을 유지하고, 장식용 마이크로 라벨(예: 패널 상단 소제목)에 한해 영문 대문자 표기를 허용한다.
5. **가로 오버플로 회귀 주의**: 이 프로젝트는 grid 트랙에 `minmax(0, ...)`/`grid-cols-1`을 명시하지 않으면 3D Canvas가 레이아웃을 밀어내는 "그리드 블로우아웃" 버그를 이미 겪었다 (커밋 `4357c9a` 참고). 새로 만드는 모든 grid/flex 컨테이너에 `min-w-0` 또는 `minmax(0, …)`을 습관적으로 적용하고, 각 Task의 테스트에서 `document.body.scrollWidth === clientWidth`(390px 뷰포트)를 반드시 확인한다.
6. **완료 조건 공통**: `npm run build` 성공 + 390px/1440px 두 뷰포트에서 시각 확인 + 가로 오버플로 없음.
7. 반응형 브레이크포인트는 기존 컨벤션 유지: 모바일 기본 → `sm:`(640) → `lg:`(1024, 사이드바 등장) → `xl:`(1280, 다열 레이아웃).

## 결정 필요 / 매핑 규칙 (Codex는 아래 확정 규칙을 따르고, 목록에 없는 모호함은 멈추고 보고)

| 시안 요소 | 게임 실제 데이터 | 확정 매핑 |
|---|---|---|
| COMMANDER Alex Morgan, Level/XP 바 | 커맨더/레벨 시스템 없음 | 함선 등급(`shipGrade`, SHIP_GRADES)+함선명으로 대체. XP바 만들지 않음 |
| ENERGY 게이지 | 에너지 없음 | 산소(oxygen)로 대체 |
| RESEARCH RP, SKILL TREE | 연구/스킬 시스템 없음 | **생략** (신규 시스템 구현 금지) |
| FACTION/평판, 인구 | 없음 | **생략** |
| ALERTS 카운트 | 전용 알림 시스템 없음 | 자원 경고(연료/산소/선체 중 `LOW_RESOURCE_WARNING`(25) 미만 개수)로 계산해 표시. 0이면 배지 숨김 |
| SET COURSE | `moveToZone` | "항로 설정" 버튼 = 선택 구역으로 이동 (Task 011) |
| CREW STATUS 28/32, Ready/Injured | `crew[]`: name, role, morale, injury | 인원수 `crew.length`, 목록에 이름/역할/사기/부상 표시 |
| INVENTORY 아이콘 그리드 | inventoryStore items/dust | 실제 보유 아이템/우주 먼지 수량만 표시 |
| 미니맵/성계 배경 아트 | 이미지 없음 | CSS radial-gradient 성운 + 점 패턴(별)으로 분위기만 재현 |
| 시안의 콘덴스드 SF 폰트 | 웹폰트 금지 | 현 폰트 스택 유지, 자간(letter-spacing)·대문자로 SF 느낌만 |

**진짜 결정 필요 (기본값으로 진행하되 사용자 확인 후 변경 가능):**
- (A) 탐험 지도를 시안처럼 자유 좌표 성계 맵(SVG, 노드 좌표+연결선)으로 만들지 여부. **기본값: 아니오** — Task 011은 기존 그리드 구조를 유지하고 노드 스타일만 시안 톤으로 개선한다. 자유 좌표 맵을 원하면 별도 Task로 지시할 것 (zone 데이터에 x,y 좌표 추가 필요).
- (B) 뉴스티커 유지 여부. **기본값: 유지** (모바일에서는 탭바 위에 표시).

## Task 순서와 파일 소유권

실행 순서: **006 → 007 → 008 → 009 → 010 → 011 → 012 → 013** (건너뛰기 금지).
`src/styles.css`는 여러 Task가 만진다 — 규칙: **006만 기존 클래스를 수정할 수 있고, 007 이후는 파일 끝에 새 클래스 추가만 허용** (기존 클래스 값 변경 금지). `App.jsx`는 009와 010이 순서대로 만진다.

---

## Task 006 — 디자인 토큰 & 공통 HUD 스타일 시스템

### 선행 조건
없음 (Phase 2의 기반 Task).

### 목표
`src/styles.css`를 개편해 시안의 시각 언어(색 토큰, HUD 패널, 게이지, 버튼, 마이크로 라벨)를 **기존 클래스 이름을 유지한 채** 입힌다. 이 Task 하나로 모든 패널의 1차 리스킨이 자동 적용되게 하는 것이 핵심 전략이다 (컴포넌트 파일은 건드리지 않음).

### 수정 대상 파일
- `src/styles.css`

### 수정 금지 파일
- `src/` 이하 모든 `.jsx` 파일, `index.html`, `package.json`

### 구현 요구사항
1. `:root`에 CSS 변수 정의:
   - `--hud-bg: #030712` 계열(페이지 배경), `--hud-panel: rgb(10 16 32 / 0.85)`, `--hud-border: rgb(56 189 248 / 0.16)`, `--hud-border-strong: rgb(56 189 248 / 0.45)`, `--hud-accent: #38bdf8`(cyan), `--hud-accent-dim: rgb(56 189 248 / 0.12)`, `--hud-text: #e2e8f0`, `--hud-text-dim: #64748b`, `--hud-success: #34d399`, `--hud-warn: #fbbf24`, `--hud-danger: #f87171`.
2. `body` 배경을 단색에서 우주 분위기로: 짙은 베이스 + 2~3개의 은은한 `radial-gradient` 성운(시안/보라, 투명도 0.05~0.1) + 아주 미세한 별 패턴(작은 점 `radial-gradient` 반복). 애니메이션 금지(성능).
3. 기존 `section` 클래스 재정의 → HUD 패널: `--hud-panel` 배경(살짝 블러 `backdrop-filter: blur(6px)` 허용), 1px `--hud-border` 보더, 6px 라운드, 상단에 1px 액센트 하이라이트(`::before`로 상단 보더라인에 subtle glow). 과도한 glow 금지 — 시안은 절제된 발광.
4. `.section-title` 재정의: 크기 0.8rem, `text-transform: uppercase` 느낌의 자간(`letter-spacing: 0.14em`), 색 `--hud-text`, 아이콘 색 `--hud-accent`. (한국어에도 자간은 적용됨)
5. `.primary-button`: 투명 배경 + `--hud-border-strong` 보더 + 시안 텍스트, hover 시 `--hud-accent-dim` 배경 (시안의 SET COURSE 버튼 스타일). `.secondary-button`, `.icon-button`, `.dock-button`, `.nav-button`도 같은 계열로 통일.
6. 신규 공통 클래스 추가:
   - `.hud-gauge` / `.hud-gauge-fill`: 높이 6px 게이지 트랙+채움. 채움은 `linear-gradient(90deg, ...)` 사용, 수치별 색상은 modifier 클래스 `.hud-gauge-success`(emerald), `.hud-gauge-warn`(amber), `.hud-gauge-danger`(red), 기본은 cyan.
   - `.hud-label`: 마이크로 라벨(0.65rem, 자간 0.16em, `--hud-text-dim`).
   - `.hud-value`: 수치 표기(font-mono 계열, `tabular-nums`, `--hud-text`).
   - `.hud-chip`: 작은 필/칩 (1px 보더, 라운드 4px, 0.7rem).
   - `.hud-corner`: 패널 네 모서리에 짧은 'ㄱ'자 라인 장식(`::before`/`::after` 또는 conic/linear gradient 기법, 8px 길이, `--hud-border-strong`). 모든 패널 기본 적용이 아니라 **opt-in 클래스**로만.
7. `.zone-node` 계열 재정의: 어두운 유리 패널 + 발견 노드는 좌상단에 작은 시안 점, `.zone-node-active`는 시안 보더 + 외곽 glow(box-shadow 8px 이내), `.zone-node-hidden`은 현행 사선 패턴 유지하되 새 팔레트로.
8. `.data-table`, `.modal-panel`, `.card-flip` 등 나머지 기존 클래스도 새 팔레트로 색만 교체 (구조 변경 금지).
9. 스크롤바 스타일(webkit + `scrollbar-width: thin`): 트랙 투명, 썸 `--hud-border-strong`.

### 완료 조건
- 컴포넌트 파일 수정 없이 8개 패널 전부에서 새 톤(어두운 패널, 시안 보더, 새 버튼 스타일)이 보인다.
- 시각 대비: 본문 텍스트 대비율 유지(회색 텍스트가 배경에 묻히지 않게, 최소 slate-400 수준 밝기).
- 390px에서 가로 오버플로 없음.

### 테스트 방법
`npm run dev` → 1440px에서 8개 패널 전부 순회 스크린샷, 390px에서 개요/탐험/전투 스크린샷. `npm run build` 성공 확인.

### 예상 충돌 지점
- 이후 모든 Task가 이 파일에 클래스를 **추가**한다. 이 Task 이후 기존 클래스 정의 블록을 다시 수정하는 Task는 없어야 하며, 필요 시 보고할 것.

---

## Task 007 — 헤더(상단 HUD 바) 리디자인

### 선행 조건
Task 006.

### 목표
시안의 상단 스트립처럼: 좌측 함선 아이덴티티, 중앙 우주력+시간 컨트롤, 우측 자원 게이지 그룹 + 경고 배지. 모바일은 시안 모바일 헤더처럼 컴팩트 2단.

### 수정 대상 파일
- `src/components/layout/Header.jsx`
- `src/styles.css` (**파일 끝에 새 클래스 추가만**)

### 수정 금지 파일
- `src/stores/*`, `src/App.jsx`, 그 외 컴포넌트 전부

### 구현 요구사항
1. 데스크톱(lg+) 구성, 수직 구분선(1px `--hud-border`)으로 그룹 분리:
   - [함선] 등급 아이콘 뱃지(기존 grade.icon) + "{등급}급 탐사선" 마이크로 라벨 + 함선명.
   - [시간] `.hud-label` "STARDATE" + 우주력(`formatGameDate`) + 일시정지/배속 버튼(기존 `togglePause`/`cycleSpeed` 그대로).
   - [자원] 크레딧(₢ 수치), 연료·산소·선체: 각각 `.hud-label` + `.hud-value` + 폭 ~72px `.hud-gauge`(25 미만이면 danger, 50 미만 warn, 이상 기본/success).
   - [경고] 연료/산소/선체 중 25 미만 개수를 계산해 0보다 크면 빨간 `.hud-chip` 배지(개수 표시), 0이면 렌더링 안 함.
2. 모바일(<lg): 1행 = 등급뱃지+함선명(좌) / 경고배지+일시정지+배속(우), 2행 = 크레딧·연료·산소·선체 4칸 게이지 그리드. 우주력은 모바일에서 `.hud-label` 크기로 1행 아래 или 2행에 축약 표기(공간 판단은 구현 시 결정하되 잘림 금지).
3. 모든 수치는 `useGameStore` 실데이터 바인딩 (기존 코드와 동일한 selector 사용).
4. 새 CSS는 `hud-header-*` 접두사로만 추가.

### 완료 조건
- 데스크톱에서 4그룹+구분선 레이아웃, 게이지가 자원 수치에 따라 색 변화.
- 모바일 390px에서 두 줄 헤더가 잘림/오버플로 없이 표시.
- 일시정지/배속 버튼 동작 회귀 없음.

### 테스트 방법
`npm run dev` → 1440/390 스크린샷. 배속 버튼 클릭해 1x→2x→4x 순환 확인. 콘솔에서 `useGameStore.setState({resources:{credits:100, fuel:10, oxygen:20, hull:88}})` 실행해 경고 배지 2개·게이지 danger 색 확인 후 새로고침으로 원복(persist 주의: localStorage `space-manager-game` 삭제로 원복). `npm run build`.

### 예상 충돌 지점
- 없음 (Header.jsx는 이 Task만 소유). styles.css는 추가만.

---

## Task 008 — 데스크톱 사이드바 리디자인 + 퀵액션 통합

### 선행 조건
Task 007.

### 목표
시안 좌측 내비게이션처럼: 아이콘 + 메인 라벨 + 서브 라벨 2줄 항목, 활성 항목은 좌측 액센트 바 + 배경 하이라이트. 하단에 "퀵 액션" 섹션으로 모달 6종(스탯/아이템/지도/카드/로그/저장) 버튼을 데스크톱 사이드바로 흡수한다.

### 수정 대상 파일
- `src/components/layout/Sidebar.jsx`
- `src/data/constants.js` (**MENU_ITEMS 각 항목에 `sub` 필드 추가만** — 예: 개요→"작전 현황판", 탐험→"성계 탐사", 전투→"전술 상황", 사냥→"생물 사냥", 함선→"모듈 & 업그레이드", 승무원→"대원 관리", 우주 집진기→"자원 수집", 시장→"거래 & 환전". id/label 변경 금지)
- `src/App.jsx` (Sidebar에 `onOpenModal` prop 전달 배선만)
- `src/styles.css` (파일 끝 추가만)

### 수정 금지 파일
- `src/components/layout/BottomDock.jsx` (Task 009에서 처리), 스토어/시스템 전부

### 구현 요구사항
1. 데스크톱(lg+) 사이드바: 각 항목 = 아이콘(18px) + 오른쪽 2줄(메인 라벨 0.875rem bold / `sub` 0.68rem `--hud-text-dim`). 활성 항목: 좌측 2px 시안 액센트 바(`::before`), 배경 `--hud-accent-dim`, 아이콘·라벨 시안 톤.
2. 사이드바 하단(flex column + `mt-auto`)에 `.hud-label` "퀵 액션" 구분 후 6개 모달 버튼을 2열 그리드 아이콘+짧은 라벨로 배치. 클릭 시 `onOpenModal(id)` 호출 (id: stats/inventory/map/cards/log/save — BottomDock의 dockItems와 동일).
3. `App.jsx`: `<Sidebar activePanel={...} onChange={...} onOpenModal={setActiveModal} />`로 prop 하나만 추가. 다른 구조 변경 금지.
4. 모바일(<lg)에서 사이드바는 **현행 그대로**(가로 스크롤 칩) 유지 — Task 009가 모바일 내비를 교체할 때까지 임시 공존.
5. 사이드바 폭: App.jsx의 `lg:grid-cols-[14rem_...]` 트랙을 유지할 것 (14rem 안에서 소화; 늘리려면 보고).

### 완료 조건
- 데스크톱: 2줄 내비 + 활성 액센트 바 + 하단 퀵 액션 6버튼이 표시되고, 퀵 액션 클릭 시 해당 모달이 열린다.
- 모바일: 기존과 동일하게 동작(회귀 없음).
- 8개 패널 전환 정상.

### 테스트 방법
`npm run dev` → 1440px에서 패널 전환 + 퀵 액션 6종 모두 클릭해 모달 오픈 확인, 390px 회귀 확인. `npm run build`.

### 예상 충돌 지점
- `App.jsx`를 Task 009·010도 수정한다 — 반드시 006→…→순서대로 진행하고, 이 Task에서는 prop 배선 한 줄만 추가할 것.

---

## Task 009 — 모바일 하단 탭바 + "더보기" 시트

### 선행 조건
Task 008.

### 목표
시안 모바일의 하단 고정 탭바(HOME/MAP/COMBAT/INVENTORY/SHIP)를 구현한다. 이 게임 기준 5탭: **개요(홈)·탐험·전투·함선·더보기**. "더보기"는 나머지 패널 4종(사냥/승무원/우주 집진기/시장)과 모달 6종을 담는 하단 시트. 데스크톱에서는 BottomDock을 제거한다(Task 008에서 사이드바로 흡수됨).

### 수정 대상 파일
- `src/components/layout/BottomDock.jsx` (전면 개편 — 탭바+시트로)
- `src/App.jsx`
- `src/styles.css` (파일 끝 추가만)

### 수정 금지 파일
- `Sidebar.jsx`, 각 패널/모달 컴포넌트, 스토어 전부

### 구현 요구사항
1. `BottomDock`을 모바일 전용 탭바로 개편 (`lg:hidden`): 고정 높이 ~3.75rem + `env(safe-area-inset-bottom)` 패딩, 5탭 균등 그리드. 탭 = 아이콘(Sidebar와 동일 아이콘 재사용) + 0.65rem 라벨. 활성 탭: 시안 색 + 상단 2px 액센트 라인.
2. Props 변경: `BottomDock({ activePanel, onChangePanel, onOpenModal })`. "더보기" 탭 클릭 시 내부 state로 하단 시트 토글:
   - 시트: 탭바 위로 슬라이드-업(간단한 CSS transition, 200ms 이내), 배경 딤 클릭 시 닫힘.
   - 시트 내용: `.hud-label` "메뉴" + 패널 4종(사냥/승무원/우주 집진기/시장) 2열 버튼 → `onChangePanel(id)` 후 시트 닫기, 구분선, `.hud-label` "도구" + 모달 6종 3열 버튼 → `onOpenModal(id)` 후 시트 닫기.
   - 더보기 내 패널이 활성 상태면 "더보기" 탭을 활성 표시.
3. `App.jsx` 개편:
   - `<Sidebar>`를 `hidden lg:block` 래핑(또는 Sidebar 루트에 클래스)으로 **모바일에서 숨김** (기존 모바일 칩 내비는 탭바로 대체됨).
   - `<BottomDock activePanel={activePanel} onChangePanel={setActivePanel} onOpenModal={setActiveModal} />`.
   - 메인 스크롤 영역 하단에 탭바 높이만큼 패딩(`pb-16 lg:pb-0` 계열)을 줘 콘텐츠 가림 방지. NewsTicker는 탭바 바로 위 유지.
   - 데스크톱에서 BottomDock 미렌더(`lg:hidden`).
4. 최상위 그리드/main 그리드의 `grid-cols-1`/`minmax(0,…)` 명시를 유지·준수할 것 (전역 제약 5).

### 완료 조건
- 390px: 하단 5탭 표시, 개요/탐험/전투/함선 직접 전환, 더보기 시트로 나머지 패널·모달 전부 접근 가능. 시트 열림/닫힘 부드럽고 딤 클릭 닫기 동작.
- 1440px: 탭바 없음, 사이드바만. 회귀 없음.
- 콘텐츠 최하단이 탭바에 가려지지 않음.

### 테스트 방법
`npm run dev` → 390px에서 5탭 전환 + 더보기에서 사냥·시장·아이템 모달 등 열기, 최하단 스크롤로 가림 확인. 1440px 회귀 확인. `npm run build`.

### 예상 충돌 지점
- `App.jsx`를 Task 010도 수정 — 이 Task 완료 후에만 010 착수.
- Sidebar를 모바일에서 숨기면 모바일에서 패널 4종은 더보기로만 접근 — 의도된 동작.

---

## Task 010 — 개요(홈) 대시보드 리디자인

### 선행 조건
Task 009.

### 목표
개요 패널을 시안 모바일 홈처럼 재구성: 현재 구역 히어로 카드(3D 행성 + 항해 정보), 함선 상태, 승무원 상태, 진행 임무, 퀵 이동 타일, 자원 스트립. 데스크톱(xl)에서는 시안 데스크톱처럼 2~3열 밀도 배치.

### 수정 대상 파일
- `src/components/panels/Overview.jsx`
- `src/App.jsx` (`<Panel />` → `<Panel onNavigate={setActivePanel} />` 한 줄만)
- `src/styles.css` (파일 끝 추가만)

### 수정 금지 파일
- `PlanetCanvas.jsx`, 스토어/시스템/데이터 전부, 다른 패널

### 구현 요구사항
1. **히어로 카드**(전폭): 좌측 `PlanetCanvas zone={현재구역} interactive={false}` (h-40~48, `overflow-hidden rounded`), 우측에 구역명(큰 타이포)+타입/위험/풍부도 `.hud-chip`들, "탐험 열기" `.primary-button` → `onNavigate("exploration")`. 모바일은 상하 스택.
2. **함선 상태 카드**: 등급뱃지+함선명, 선체/연료/산소 3줄 `.hud-gauge`(값·색 규칙은 Task 007과 동일), "함선 관리" 버튼 → `onNavigate("ship")`.
3. **승무원 카드**: `crew[]` 매핑 — 이름/역할/사기(`morale`)/부상(`injury`) 행, 부상≠"정상"이면 danger 색. 헤더에 `{crew.length}명`. "승무원 관리" 버튼 → `onNavigate("crew")`.
4. **진행 중 임무 카드**: 기존 하드코딩 3줄 임무 리스트 유지(신규 시스템 금지), 스타일만 카드화.
5. **퀵 타일 4개**(시안의 COMBAT/UPGRADES/COLLECTION/SKILL TREE 위치): 전투→`combat`, 사냥→`hunting`, 우주 집진기→`collector`, 시장→`market`. 아이콘+라벨+한 줄 설명, 2열(모바일)/4열(xl).
6. **자원 스트립**: 우주 먼지(`dust`), 크레딧, 보유 아이템 종수(inventoryStore), 보유 카드 수(cards 스토어가 있으면 — 없으면 생략하고 보고) 를 가로 스크롤 칩 행으로.
7. **최근 이벤트**: 기존 `logs.slice(0,5)` 유지, 스타일만 통일.
8. 데스크톱 xl 배치 예: 1행 [히어로(2fr) | 함선 상태(1fr)], 2행 [승무원 | 임무 | 퀵타일], 3행 [자원 스트립+최근 이벤트]. 모든 트랙 `minmax(0,…)`.
9. `onNavigate` prop이 없는 다른 패널 호환: App.jsx에서 모든 Panel에 일괄 전달해도 무해(미사용 prop) — 일괄 전달 방식으로 구현.

### 완료 조건
- 개요 탭이 위 카드 구성으로 표시되고 모든 수치가 스토어 실데이터.
- 각 버튼/타일 클릭 시 해당 패널로 전환.
- 390px 세로 스택 자연스럽고 오버플로 없음, 1440px 다열 배치.

### 테스트 방법
`npm run dev` → 390/1440 스크린샷, 타일 4종+버튼 3종 내비게이션 확인, `npm run build`.

### 예상 충돌 지점
- `App.jsx` 최종 수정 Task. 이후 Task는 App.jsx 수정 금지.
- 히어로의 PlanetCanvas는 탐험 패널과 별개 인스턴스 — 개요/탐험 왕복 시 콘솔 에러 없어야 함.

---

## Task 011 — 탐험 패널 리디자인 (선택 → 항로 설정 UX)

### 선행 조건
Task 010.

### 목표
시안의 갤럭시 맵 화면 구조로 개편: 상단 섹터 정보 칩(성계명·탐사율·스캔 완료 수), 중앙 구역 노드 그리드(성계 지도 분위기 배경), 하단/우측 "선택 구역" 상세 카드(3D 행성 + 정보 + **항로 설정** 버튼). UX를 "클릭 즉시 이동"에서 "**클릭=선택, 항로 설정 버튼=이동 확정**"으로 변경한다.

### 수정 대상 파일
- `src/components/panels/Exploration.jsx`
- `src/stores/explorationStore.js` (**`selectedZoneId` 상태와 `selectZone(zoneId)` 액션 추가만** — 기존 상태/액션 변경 금지, persist 이름 유지)
- `src/styles.css` (파일 끝 추가만)

### 수정 금지 파일
- `PlanetCanvas.jsx`, `planets.js`, `sectors.js`, `MapModal.jsx`, `gameStore.js`

### 구현 요구사항
1. `explorationStore`: `selectedZoneId: null` 추가, `selectZone(zoneId)` 액션 추가. `moveToZone`은 변경 금지.
2. 레이아웃: xl에서 [지도(1.25fr) | 상세(0.75fr)] 유지하되 모두 `minmax(0,…)`. 모바일: 섹터 칩 → 지도 그리드 → 상세 카드 순 세로 스택.
3. **섹터 정보 바**: `sectors[0].name`("헬리오스 외연") + `.hud-chip`들: "탐사율 {발견수}/{전체}", "스캔 {scannedZoneIds.length}", "현재: {현재구역명}".
4. **지도 영역**: 그리드 유지(결정 A 기본값). 컨테이너에 성계 배경(CSS 성운+별 점 패턴, Task 006 body와 같은 기법의 로컬 버전). 노드 개선:
   - 발견 노드: 구역 타입별 lucide 아이콘(예: station=Anchor, nebula=Cloud, ruin=Landmark, anomaly=Zap, creature=Bug, mining=Pickaxe, gate=DoorOpen, wreck=Skull — 임포트 가능한 것으로 대체 허용) + 이름 + "위험 N" 칩(위험 1~2 기본, 3~4 warn, 5 danger 색).
   - 현재 위치 노드: "현재 위치" 칩 + 액센트 보더(기존 `.zone-node-active` 활용).
   - **선택된 노드**: 점선 보더 또는 이중 보더로 현재 위치와 구분되는 하이라이트(새 클래스 `.zone-node-selected`).
   - 미발견: 현행 fog 유지, 클릭 시 아무 동작 없음.
5. **상세 카드**(선택 구역 없으면 현재 구역 표시):
   - `PlanetCanvas zone={선택||현재} interactive` (h-52~64).
   - 정보 행: 이름/타입/위험도/풍부도/거리 + **예상 연료 소모 `Math.round(distance * 1.4)`** (기존 이동 공식과 동일 계수).
   - 버튼: 선택 구역이 현재 위치와 다르고 발견 상태면 "항로 설정 (연료 -N)" `.primary-button` → 기존 `handleMove` 로직(spendFuel+moveToZone+addLog) 실행 후 선택 해제. 현재 위치면 "현재 구역 스캔" 버튼(기존 `handleScan`) 표시.
   - 연료가 예상 소모보다 부족하면 버튼 disabled + "연료 부족" 표기 (스토어에 검증 로직 추가 금지, UI 단 disabled만).
6. 최근 이동 경로 리스트는 유지(카드 하나로 축소 배치 가능).
7. 기존 기능 회귀 금지: 이동 시 연료 차감·로그 추가·발견 처리 동일하게 동작.

### 완료 조건
- 발견 구역 클릭=선택(하이라이트+상세 갱신), "항로 설정" 클릭 시에만 이동·연료 차감.
- 현재 구역 표시 상태에서 스캔 버튼 동작.
- 연료 부족 시 버튼 비활성.
- 390/1440 레이아웃 정상, 오버플로 없음.

### 테스트 방법
`npm run dev` → 청색 표류대 클릭(선택만 되는지, 연료 불변 확인) → 항로 설정 클릭(이동+연료 차감+로그) → 현재 구역 스캔 동작 확인. localStorage `space-manager-game`에서 fuel을 1로 바꿔 새로고침 후 버튼 disabled 확인, 원복. `npm run build`.

### 예상 충돌 지점
- `explorationStore` persist에 새 키 추가 — 기존 저장 데이터와 병합 시 `selectedZoneId` undefined 허용되도록 기본값 null 처리.
- MapModal은 이 Task에서 변경하지 않음(선택 UX는 탐험 패널 한정).

---

## Task 012 — 잔여 패널 6종 스타일 통일 (전투/사냥/함선/승무원/집진기/시장)

### 선행 조건
Task 011.

### 목표
나머지 패널의 마크업 클래스를 새 HUD 시스템(`.hud-label`, `.hud-value`, `.hud-gauge`, `.hud-chip` 등)으로 치환해 시각 통일. **로직·상태·이벤트 핸들러 변경 절대 금지, 클래스/마크업 구조 정리만.**

### 수정 대상 파일
- `src/components/panels/Combat.jsx`, `Hunting.jsx`, `Ship.jsx`, `Crew.jsx`, `Collector.jsx`, `Market.jsx`
- `src/components/common/Badge.jsx` (팔레트만)
- `src/styles.css` (파일 끝 추가만)

### 수정 금지 파일
- 스토어/시스템/데이터 전부, Overview/Exploration(완료됨), 레이아웃 컴포넌트

### 구현 요구사항
1. 각 패널의 인라인 수치·라벨을 `.hud-label`/`.hud-value` 페어로, 진행 바류는 `.hud-gauge`로, 상태 표기는 `.hud-chip`으로 치환.
2. `data-table` 사용처는 그대로 두되(006에서 이미 리스킨됨) 헤더 행에 `.hud-label` 톤 적용.
3. 함선 패널의 blueprint 영역: 기존 구조 유지, 색만 새 토큰과 조화되는지 확인(필요시 styles.css의 `.ship-blueprint*` 값을 006 팔레트로 보정 — 이 클래스군에 한해 수정 허용).
4. 각 패널에서 버튼은 이미 006으로 리스킨됨 — 클래스 추가 변경 불필요하면 건드리지 않는다. 파일당 diff를 최소화할 것.
5. 한 패널씩 순서대로 작업하고 패널마다 동작 확인(전투 시작, 사냥, 뽑기, 구매/판매, 모듈 장착, 승무원 목록 등 기존 버튼이 전부 동작해야 함).

### 완료 조건
- 6개 패널이 개요/탐험과 동일한 시각 언어. 기존 인터랙션 전부 회귀 없음.
- 390/1440 오버플로 없음.

### 테스트 방법
`npm run dev` → 패널별 핵심 인터랙션 1회씩 실행(전투 개시/사냥/뽑기/거래/장착). 390px 순회. `npm run build`.

### 예상 충돌 지점
- 게임 로직 파일을 건드리지 않고 UI 클래스만 바꾸는 것이 원칙 — 로직 수정이 필요해 보이면 중단하고 보고.

---

## Task 013 — 모달 & 오버레이 리디자인

### 선행 조건
Task 012.

### 목표
`OverlayModal`을 시안 톤으로: 데스크톱 중앙 다이얼로그(코너 장식 + 헤더 라인), 모바일 하단 시트 스타일(하단에서 슬라이드 업, 상단 라운드). 6개 모달 내부는 새 HUD 클래스로 정리.

### 수정 대상 파일
- `src/components/modals/OverlayModal.jsx`
- `src/components/modals/StatsModal.jsx`, `InventoryModal.jsx`, `MapModal.jsx`, `CardsModal.jsx`, `LogModal.jsx`, `SaveLoadModal.jsx`
- `src/styles.css` (파일 끝 추가만; `.modal-panel` 계열은 수정 허용)

### 수정 금지 파일
- 스토어/시스템/데이터, 패널/레이아웃 컴포넌트, `PlanetCanvas.jsx`

### 구현 요구사항
1. `OverlayModal`: 배경 딤 강화(`bg-black/60` + 미세 블러), 패널에 `.hud-corner` 장식, 헤더 하단 1px 액센트 라인, 닫기 버튼 `.icon-button`. 모바일(<sm)에서는 `items-end` 정렬로 하단 시트화(상단만 라운드, `max-height 85dvh`, 슬라이드 업 transition 200ms 이내). ESC/딤 클릭 닫기 등 기존 동작 유지.
2. 각 모달 내부: Task 012와 같은 원칙(클래스 치환만, 로직 불변). MapModal은 Phase 1의 3D 썸네일 구조 유지, 카드 스타일만 통일.
3. SaveLoadModal의 위험 동작(삭제/초기화)이 있으면 해당 버튼만 danger 톤.

### 완료 조건
- 6개 모달이 데스크톱 다이얼로그/모바일 시트로 표시, 열기·닫기·내부 기능 회귀 없음.
- MapModal 3D 썸네일 정상.

### 테스트 방법
`npm run dev` → 데스크톱: 사이드바 퀵 액션으로 6종 오픈. 모바일 390px: 더보기 시트 → 6종 오픈, 하단 시트 애니메이션 확인. `npm run build` + 390px 오버플로 체크.

### 예상 충돌 지점
- 없음 (Phase 2 마지막 Task). 완료 후 전체 회귀 순회 1회 권장: 8패널 + 6모달 + 모바일 탭바.
