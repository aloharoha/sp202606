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

## 2026-6-21 변경 사항 (타깃 오브젝트 · 파괴 시각화 · 파편)

`2026-6-20(2)` 기반. 충돌 대상과 파괴 결과를 실제 형상으로 보여주는 큰 변화.

### C++ 물리 엔진 확장 (134 → 307 줄)
- **`computeFracture`** — 충격 결과로부터 파편 분포·파괴 정도를 계산하는 메인 진입점.
- **`computeFractureMode`** — 충격 압력·재질 항복강도 비교로 파괴 모드를 분기.
- **`computeShatter`** — 깨짐(shatter) 형상 산출. `buildConvexFragment` / `buildFragmentIndices` 로 컨벡스 파편 메시 데이터 생성.
- **`computeDeform`** — 휘어짐(deform) 처리.
- **`stepFragments`** — 파편들의 시간 진행(중력·지면 충돌)을 한 스텝씩 진행하는 헬퍼.
- **`FractureResult`** 자료형으로 결과를 일관되게 반환.

### UI / 렌더 (renderer.js 371 → 536 줄)
- **타깃 재질 선택** — `sel-target` 드롭다운 추가. 재질별 항복강도·밀도 차이가 충돌 결과에 반영.
- **파괴율 시각화** — `#destr-level` / `#destr-fill` 진행 바로 파괴 진행도를 표시.
- **시간 표시 ID 정리** — `t-display` → `t-disp` 로 변경.
- **앱 타이틀 한글 복귀** — 이번 버전에서는 `<title>낙하 물리 시뮬레이터</title>` 로 표기. (다음 버전 6-22 에서 다시 영문 통일.)

> C++ 코드 대규모 변경 — 빌드 시 반드시 **`npm run build-addon` 재실행**.
