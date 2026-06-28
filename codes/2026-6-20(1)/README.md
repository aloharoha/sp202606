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

## 2026-6-20(1) 변경 사항 (UI 전면 개편 · STL 업로드 · Shape 선택)

`2026-6-20` 기반. UI 디자인을 다듬고 모델/형상 선택 기능을 추가.

- **UI 전면 개편** — `index.html` 의 CSS 디자인 토큰과 레이아웃을 새로 구성(헤더 52px, 좌측 패널, 캔버스 그리드). 색상·테두리·라운드·폰트 등을 디자인 토큰으로 통일.
- **STL 파일 업로드 버튼** — `⬆ STL 파일 불러오기` 버튼(`btn-stl`) + 숨김 input(`file-stl`) 추가. (구체 렌더링 자리에 사용자가 직접 STL 모델을 올려볼 수 있는 기초 단계.)
- **Shape 선택 드롭다운** — `sel-shape` 추가. 기본 형상(구·원기둥·박스·원뿔)을 골라 낙하 시뮬레이션에 적용.
- **차트 자리표시자** — 결과 표시 영역에 `#chart-placeholder` 영역을 두어 그래프 영역 확보.
- **높이 진행 바** — 화면 우측에 `#h-bar` 추가로 현재 고도를 시각화.
- **앱 타이틀 영문화** — 패키지 빌드 등 환경 호환성을 위해 `<title>` 을 `Physics Simulator` 로 변경.

> C++ 코드 변경은 없음. `renderer.js` 가 신규 UI 요소를 다루도록 함께 갱신됨.
