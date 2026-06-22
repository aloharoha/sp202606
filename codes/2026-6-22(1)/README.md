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

## 2026-6-22(1) 변경 사항 (버그 수정 + FPS 최적화)

`2026-6-22` 버전을 기반으로 발견된 문제를 고치고 렌더링 성능을 개선한 버전.
**C++ 애드온을 수정했으므로 `npm run build-addon`을 다시 실행해야 한다.**

### 버그 수정
1. **그래프가 재생 중 멈춤** — 매 프레임 `clearTimeout`으로 디바운스 타이머를
   리셋해 재생 중에는 그래프가 한 번도 다시 그려지지 않던 문제. 시간 누적
   기반 스로틀(약 8fps)로 교체.
2. **공기밀도/대기층 데이터 깨짐** — C++ 궤적은 ~120개로 다운샘플되는데,
   이를 인덱스 그대로 JS 프레임(0.05초 간격)에 덮어써서 시간이 어긋난 채
   표/그래프에 들어가던 문제. localSimulate가 이미 프레임별로 정확히
   계산하므로 덮어쓰기를 제거.
3. **초기 속도(v0)가 충돌 결과에 미반영** — C++ `simulate()`가 v0를 무시하고
   항상 0에서 시작. `SimInput`에 `v0`를 추가하고 `v = -v0`로 초기화하여
   JS 시뮬레이션과 일치시킴.
4. **GPU 메모리 누수** — 낙하체/타깃/파편 메시 교체 시 이전 geometry·material을
   해제하지 않아 Run을 반복할수록 메모리가 누적되며 FPS가 점점 떨어지던 문제.
   교체·정리 시 `dispose()` 호출 추가.
5. **그래프 maxY 스택오버플로 위험** — `Math.max(...allY)`가 프레임 수천 개일 때
   인수 전개로 터질 수 있어 루프 계산으로 변경.

### FPS 최적화
- **온디맨드 렌더링** — 변화(재생/파편/먼지/카메라 이동/리사이즈)가 있을 때만
  `render()` 호출. 유휴 상태에서 GPU 사용 거의 0%.
- **파편 물리 JS 이관** — 기존엔 매 프레임 IPC로 메인 프로세스의 C++
  `stepFragments`를 호출(직렬화/왕복 비용). 동일 로직을 렌더러 JS에서 직접
  적분하도록 옮겨 파편 재생 중 프레임 드랍 제거.
- **표 하이라이트 비용 제거** — 매 프레임 `querySelectorAll` + smooth
  `scrollIntoView`(강제 reflow)를 제거. 시간키→행 `Map`으로 O(1) 조회 +
  10fps 스로틀 + 즉시 스크롤.
- **표 생성 일괄 주입** — 행마다 `appendChild`하던 것을 문자열로 모아
  한 번에 `innerHTML` 주입.
- **그래프 캔버스 재할당 최소화** — 크기가 바뀔 때만 비트맵 재할당.
- **픽셀 비율 상한** — `devicePixelRatio`를 2 → 1.75로 낮춰 고해상도에서
  픽셀 처리량 감소.
- **그림자 갱신 최소화** — `shadowMap.autoUpdate=false`로 두고 실제 렌더
  프레임에서만 갱신.
- **구름 애니메이션** — 재생 중에만 이동(유휴 시 렌더 트리거 안 함).

### 추가로 더 올릴 수 있는 여지 (제안)
- **InstancedMesh로 파편 묶기** — 파편 수십~수백 개를 개별 Mesh 대신 인스턴싱
  1회 draw call로. draw call이 가장 큰 병목이 되면 효과 큼.
- **파편/먼지 그림자 끄기** — `castShadow=false`로 그림자 패스 부담 감소.
- **표를 가상 스크롤로** — 수천 행일 때 DOM 노드 수를 화면에 보이는 만큼만 유지.
- **그래프 정적/동적 레이어 분리** — 곡선은 한 번만 그려 캐시하고 재생
  헤드(세로선)만 매번 덧그리기.
- **하늘 구체 세그먼트 축소** — `SphereGeometry(80000,32,16)` → 더 낮은 분할.
- **frustum culling / LOD** — 카메라가 멀 때 낙하체·파편 디테일을 낮추기.
