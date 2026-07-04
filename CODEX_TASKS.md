# CODEX_TASKS.md

Codex 실행용 작업 명세서입니다. **한 번에 Task 하나만** 수행하세요.
각 Task는 명시된 "수정 대상 파일"만 건드리고, "수정 금지 파일"은 절대 변경하지 마세요.
Task는 번호 순서대로 의존성이 있을 수 있습니다 (명시된 "선행 조건" 참고). 먼저 선행 Task가 완료되어 있는지 확인 후 시작하세요.

---

## 목표 (전체)

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
