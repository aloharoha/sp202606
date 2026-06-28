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

## 2026-6-19 초기 버전 (Baseline)

프로젝트의 **출발점** 폴더. 이후 모든 날짜 폴더는 이 버전을 기반으로 변경 사항을 누적합니다.

- **C++ 물리 코드(`physics.h`, `physics.cpp`, `binding.cpp`)와 빌드 설정(`binding.gyp`) 이 루트에 위치** — 다음 버전(`2026-6-20`)에서 `physics/` 서브폴더로 이동.
- **공식 베이스**: 종단속도 / 자유낙하 수치 적분 / 충격량·충격력·충격 압력 / 로지스틱 파괴율.
- **UI 베이스**: 기본 입력 컨트롤 + Three.js 씬 + 결과 표시.
- **빌드 도구**: node-gyp + Python — 다음 버전들에서 cmake-js 로 단순화됨(`2026-6-22`).

> 이 폴더에는 직전 폴더가 없으므로 별도 "변경 사항" 절은 없습니다. 다음 버전(`2026-6-20`) 의 README 에서 이 폴더 대비 변경점이 정리되어 있습니다.
