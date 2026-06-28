# 낙하 물리 시뮬레이터

하늘에서 무언가 떨어진다면? 종단속도 · 충격량 · 파괴율을 계산하는 시뮬레이터.

---

## 필요한 도구 설치 (처음 한 번만)

1. **Node.js** 설치 → https://nodejs.org (LTS 버전)
2. **Visual Studio Build Tools** 설치 (C++ 컴파일러)
   - https://visualstudio.microsoft.com/visual-cpp-build-tools/
   - 설치 시 "C++를 사용한 데스크톱 개발" 선택
3. **Python** 설치 → https://python.org (node-gyp에 필요)

---

## 빌드 & 실행 순서

```bash
# 1. 프로젝트 폴더에서 의존성 설치
npm install

# 2. C++ 물리 엔진 컴파일
npm run build-addon

# 3. 앱 실행
npm start
```

---

## exe 파일로 배포

```bash
npm run dist
```

`dist/` 폴더에 설치 파일(`.exe`)이 생성됩니다.

---

## 파일 구조 설명

```
physics/
  physics.h      ← 물리 구조체 및 클래스 선언
  physics.cpp    ← 핵심 물리 계산
                   - 종단속도: v_t = sqrt(2mg / ρCdA)
                   - 수치 적분으로 낙하 궤적 (Euler method)
                   - 충격량, 충격력, 충격 압력
                   - 파괴율 (로지스틱 함수)
  binding.cpp    ← N-API: C++ ↔ JavaScript 연결

main.js          ← Electron 메인 프로세스
preload.js       ← IPC 브릿지 (보안 경계)
index.html       ← UI 레이아웃
renderer.js      ← UI 로직 + Three.js 애니메이션
```

---

## 물리 공식 요약

| 항목 | 공식 |
|------|------|
| 종단속도 | `v_t = √(2mg / ρCdA)` |
| 운동방정식 | `ma = mg - ½ρCdAv²` |
| 충격량 | `J = mv` |
| 평균 충격력 | `F = J / Δt` |
| 충격 압력 | `P = F / (πr²)` |
| 파괴율 | 로지스틱: `1 / (1 + e^(-2.5(P/σ_y - 1)))` |

---

## 나중에 GLB 파일 추가하는 법

`renderer.js` 상단에 GLTFLoader를 추가하면 돼:

```js
const { GLTFLoader } = await import('./node_modules/three/examples/jsm/loaders/GLTFLoader.js');
const loader = new GLTFLoader();
loader.load('./models/your-model.glb', (gltf) => {
  scene.add(gltf.scene);
});
```

---

## 2026-6-22 변경 사항 (빌드 시스템 전환 · ISA 대기 · 실시간 오버레이/표)

`2026-6-21` 기반. 빌드 체계를 단순화하고 대기 모델·실시간 정보를 도입.

### 빌드 시스템: node-gyp → cmake-js
- **`binding.gyp` 삭제, `CMakeLists.txt` 추가** — CMake 기반 `cmake-js` 로 네이티브 빌드 전환. Python / node-gyp 의존성을 제거.
- `package.json` 의 `scripts.build-addon` 을 `node-gyp rebuild` → `cmake-js compile` 로 교체, `cmake-js` 런타임/Electron 버전 설정 추가.
- 빌드 산출물 경로가 `build/Release/physics.node` 외에 `build/Debug/`, `build/` 등 여러 후보를 두는 형태로 변경 → `main.js` 가 후보를 차례로 시도하도록 함.

### ISA 표준 대기 모델 (C++)
- **`calcAirDensity(alt)`** — 고도별 공기 밀도 (대류권 ~ 중간권).
- **`calcTerminalVelocityAtAlt`** — 고도별 종단속도 계산.
- **`getAtmosphereName`** — 현재 고도가 속한 대기층 이름.

### UI / 시각화 (renderer.js 536 → 645 줄)
- **실시간 오버레이** (`#live-overlay`) — 진행 중 속도·고도·공기밀도·대기온도·대기층 표시 (`ov-v`, `ov-h`, `ov-rho`, `ov-t`, `ov-atm`).
- **대기층 뱃지** (`#atm-badge`) — 현재 대기층을 색상 뱃지로 강조.
- **자료 표** (`#data-table`) — 프레임별 물리량을 표 형태로 표시(이후 버전에서 CSV 내보내기와 연동).

> **빌드 시스템 자체가 바뀌었습니다.** 처음 빌드 시 `npm install` 로 `cmake-js` 가 설치된 뒤
> **`npm run build-addon` 재실행** 필요. (Python · node-gyp 는 더 이상 불필요.)
