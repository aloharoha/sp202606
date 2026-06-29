(async () => {
  // 핵심 렌더링(three)은 동적 import로 로드한다. 이 방식은 dev/패키지 모두에서 검증됨.
  const THREE = await import('three');
  // GLB/STL 로더는 별도로 로드하되 실패해도 렌더링은 살아남도록 try/catch.
  let GLTFLoader = null;
  let STLLoader = null;
  let glbLoaderError = null;
  try {
    ({ GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'));
  } catch (e) {
    glbLoaderError = e;
    console.warn('GLTFLoader 로드 실패 — GLB 모델 기능 비활성화', e);
  }
  try {
    ({ STLLoader } = await import('three/addons/loaders/STLLoader.js'));
  } catch (e) {
    console.warn('STLLoader 로드 실패 — STL 업로드 기능 비활성화', e);
  }

  // ── 화면 토스트 (GLB 로드 성공/실패를 사용자에게 보이게) ──
  function toast(msg, type = 'info', ms = 4200) {
    let host = document.getElementById('toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toast-host';
      host.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    const bg = type === 'error' ? '#7f1d1d' : (type === 'ok' ? '#14532d' : '#1e293b');
    const bd = type === 'error' ? '#f87171' : (type === 'ok' ? '#4ade80' : '#64748b');
    el.style.cssText = `pointer-events:auto;max-width:520px;padding:10px 14px;border-radius:8px;font-size:13px;color:#fff;background:${bg};border:1px solid ${bd};box-shadow:0 4px 18px rgba(0,0,0,.45);white-space:pre-wrap`;
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, ms);
  }


  // ── DOM refs ──
  // [null-safe] 주변 툴(메뉴바/툴바/패널)을 제거하거나 숨겨도 초기화가 끊기지 않도록,
  // 존재하지 않는 요소는 "관대한 스텁"을 돌려준다. 스텁은 addEventListener·style·value·
  // classList 등 어떤 접근도 무해하게 흡수한다. 정상 UI(요소 존재)에서는 실제 요소를
  // 그대로 돌려주므로 동작에 변화가 없다. 스트립 모드(요소 없음)에서만 작동한다.
  function makeStubEl() {
    const noop = () => {};
    const styleStub    = new Proxy({}, { get: () => '', set: () => true });
    const classListStub = { add: noop, remove: noop, toggle: () => false, contains: () => false, replace: noop };
    const rect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 });
    const base = {
      nodeType: 1, tagName: 'DIV', value: '', checked: false, disabled: false,
      textContent: '', innerHTML: '', innerText: '', className: '', id: '',
      offsetWidth: 0, offsetHeight: 0, clientWidth: 0, clientHeight: 0,
      scrollTop: 0, scrollHeight: 0, selectedIndex: -1,
      options: [], files: [], children: [], dataset: {},
      style: styleStub, classList: classListStub, parentNode: null,
      addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true,
      appendChild: x => x, removeChild: x => x, insertBefore: x => x, replaceChild: x => x, remove: noop,
      setAttribute: noop, getAttribute: () => null, removeAttribute: noop, hasAttribute: () => false,
      click: noop, focus: noop, blur: noop, scrollIntoView: noop, select: noop,
      querySelector: () => null, querySelectorAll: () => [], closest: () => null,
      getBoundingClientRect: rect, getContext: () => null, toDataURL: () => '',
    };
    return new Proxy(base, {
      get(t, k) { return k in t ? t[k] : undefined; },
      set(t, k, v) { t[k] = v; return true; },
    });
  }
  const _stubCache = new Map();
  const $ = id => {
    const el = document.getElementById(id);
    if (el) return el;
    let s = _stubCache.get(id);
    if (!s) { s = makeStubEl(); _stubCache.set(id, s); }
    return s;
  };
  const selPreset        = $('sel-preset');
  const selShape         = $('sel-shape');
  const selTarget        = $('sel-target');
  const inpThickness     = $('inp-thickness');
  const inpYield         = $('inp-yield');
  const inpMass          = $('inp-mass');
  const inpArea          = $('inp-area');
  const inpCd            = $('inp-cd');
  const inpHeight        = $('inp-height');
  const inpV0            = $('inp-v0');
  const inpG             = $('inp-g');
  const inpWindX         = $('inp-wind-x');
  const inpWindZ         = $('inp-wind-z');
  const windHint         = $('wind-hint');
  const windArrowCvs     = $('wind-arrow-canvas');
  const inpTemp          = $('inp-temp');
  const inpHumidity      = $('inp-humidity');
  const atmRhoHint       = $('atm-rho-hint');
  const tvLive           = $('tv-live');
  const inpLaunchAngle   = $('inp-launch-angle');
  const inpLaunchAzimuth = $('inp-launch-azimuth');
  const inpSpinRpm       = $('inp-spin-rpm');
  const selSpinAxis      = $('sel-spin-axis');
  const magnusHint       = $('magnus-hint');
  const selTerrain       = $('sel-terrain');
  const fieldSlope       = $('field-slope');
  const inpSlope         = $('inp-slope');
  const moList           = $('mo-list');
  const btnAddObj        = $('btn-add-obj');
  const btnRun           = $('btn-run');
  const btnPlay          = $('btn-play');
  const btnStop          = $('btn-stop');
  const btnReset         = $('btn-reset');
  const btnTraj          = $('btn-traj');
  const btnCompare       = $('btn-compare');
  const btnRecord        = $('btn-record');
  const cmpBadge         = $('cmp-badge');
  const btnExportPng     = $('btn-export-png');
  const btnExportCsv     = $('btn-export-csv');
  const btnSaveJson      = $('btn-save-json');
  const btnLoadJson      = $('btn-load-json');
  const fileJson         = $('file-json');
  const tDisp            = $('t-disp');
  const hBar             = $('h-bar');
  const btnStl           = $('btn-stl');
  const fileStl              = $('file-stl');
  const selGlbPreset         = $('sel-glb-preset');
  const customGlbRow         = $('custom-glb-row');
  const selShapeGlbPreset    = $('sel-shape-glb-preset');
  const btnShapeGlbFile      = $('btn-shape-glb-file');
  const fileShapeGlb         = $('file-shape-glb');
  const inpGlbScale          = $('inp-glb-scale');
  const glbScaleVal          = $('glb-scale-val');
  const inpGlbScaleMin       = $('inp-glb-scale-min');
  const inpGlbScaleMax       = $('inp-glb-scale-max');
  const inpGlbScaleNum       = $('inp-glb-scale-num');
  const ovHeatRow        = $('ov-heat-row');
  const ovFluxRow        = $('ov-flux-row');
  const ovTemp           = $('ov-temp');
  const ovFlux           = $('ov-flux');
  const mVt              = $('m-vt');
  const mVi              = $('m-vi');
  const mFt              = $('m-ft');
  const mTt              = $('m-tt');
  const destrFill        = $('destr-fill');
  const destrLevel       = $('destr-level');
  const energyBox        = $('energy-box');
  const eKe              = $('e-ke');
  const eMom             = $('e-mom');
  const eForce           = $('e-force');
  const chartPh          = $('chart-ph');
  const graphCanvas      = $('graph-canvas');
  const graphLegend      = $('graph-legend');
  const canvasWrap       = $('canvas-wrap');
  const panelResizer     = $('panel-resizer');
  const workspaceEl      = document.querySelector('.workspace');
  const liveOverlay      = $('live-overlay');
  const atmBadge         = $('atm-badge');
  const ovT              = $('ov-t');
  const ovH              = $('ov-h');
  const ovV              = $('ov-v');
  const ovRho            = $('ov-rho');
  const ovAtm            = $('ov-atm');
  const ovDriftRow       = $('ov-drift-row');
  const ovPx             = $('ov-px');
  const ovPz             = $('ov-pz');
  const ovSpinRow        = $('ov-spin-row');
  const ovMf             = $('ov-mf');
  const matTooltip       = $('mat-tooltip');
  const ttName           = $('tt-name');
  const ttYs             = $('tt-ys');
  const ttTh             = $('tt-th');
  const ttFm             = $('tt-fm');
  const tblPlaceholder   = $('tbl-placeholder');
  const dataTable        = $('data-table');
  const tblBody          = $('tbl-body');
  const tblInfo          = $('tbl-info');
  const chartArea        = $('chart-area');
  const historyArea      = $('history-area');
  const histList         = $('hist-list');
  const histEmpty        = $('hist-empty');
  const btnSaveHist      = $('btn-save-hist');
  const btnUnit          = $('btn-unit');
  const btnRealtime      = $('btn-realtime');
  const btnLsSave        = $('btn-ls-save');
  const btnLsLoad        = $('btn-ls-load');
  const btnLsDel         = $('btn-ls-del');
  const inpLsName        = $('inp-ls-name');
  const selLs            = $('sel-ls');
  const uVt              = $('u-vt');
  const uVi              = $('u-vi');
  const uOvH             = $('u-ov-h');
  const uOvV             = $('u-ov-v');

  const ATM_COLOR = {
    'Troposphere':        '#58a6ff',
    'Lower Stratosphere': '#a371f7',
    'Upper Stratosphere': '#c084fc',
    'Stratopause':        '#f0a500',
    'Mesosphere':         '#f85149',
    'Near Vacuum':        '#6e7681',
  };
  const LEVEL_CLASS = {
    'Withstood':'lv0','No Damage':'lv0','Minor Damage':'lv1','Moderate Damage':'lv2',
    'Severe Damage':'lv3','Total Destruction':'lv4',
  };
  const MO_COLORS = [0xf85149, 0x3fb950, 0xa371f7];

  // ── Feature toggles ──
  const features = {
    projectile: false,
    wind:       true,
    atmosphere: true,
    magnus:     false,
    terrain:    false,
    multiobj:   false,
    energy:     true,
    record:     false,
    crater:     true,
    traj:       false,
    tooltip:    true,
    instfrag:   true,
    resize:     true,
    heat:       true,
    fragcol:    true,
    elevate:    false,
    bend:       true,
  };
  const FEAT_BODY = {
    projectile: 'body-projectile', wind: 'body-wind', atmosphere: 'body-atmosphere',
    magnus: 'body-magnus', terrain: 'body-terrain', multiobj: 'body-multiobj', record: 'body-record',
  };
  function applyFeature(key) {
    switch(key) {
      case 'energy':
        energyBox.style.display = (features.energy && simResult && simResult.impactData) ? 'flex' : 'none';
        break;
      case 'traj':
        showTraj = features.traj;
        btnTraj.classList.toggle('active', showTraj);
        if (trajLine) { showTraj ? scene.add(trajLine) : scene.remove(trajLine); requestRender(); }
        break;
      case 'terrain':
        rebuildTerrain();
        break;
      case 'multiobj':
        if (!features.multiobj) clearMultiObjects();
        renderMoList();
        break;
      case 'record':
        if (!features.record) { recording = false; btnRecord.classList.remove('rec-on'); }
        break;
      case 'magnus':
        updateMagnusHint();
        ovSpinRow.style.display = features.magnus ? 'flex' : 'none';
        break;
      case 'resize':
        if (panelResizer) panelResizer.classList.toggle('disabled', !features.resize);
        break;
      case 'heat':
        if (ovHeatRow) ovHeatRow.style.display = features.heat ? 'flex' : 'none';
        if (ovFluxRow) ovFluxRow.style.display = features.heat ? 'flex' : 'none';
        const thHeat = document.getElementById('th-heat');
        const thFlux = document.getElementById('th-flux');
        if (thHeat) thHeat.style.display = features.heat ? '' : 'none';
        if (thFlux) thFlux.style.display = features.heat ? '' : 'none';
        break;
      case 'bend': {
        const row = document.getElementById('bend-row');
        if (row) row.style.display = features.bend ? '' : 'none';
        // 토글 OFF 로 바뀌면 휨을 즉시 원복
        if (!features.bend) resetPlateBend();
        break;
      }
      case 'elevate': {
        const row = document.getElementById('elevate-row');
        if (row) row.style.display = features.elevate ? '' : 'none';
        rebuildTargetMesh();
        // 정지 상태(낙하 전)면 물체도 새 기준 높이로 재배치
        if (!playing && fallingMesh) {
          const by = getTargetBaseY();
          fallingMesh.position.y = by;
          if (glbMesh) glbMesh.position.y = by + glbGroundOffset();
        }
        requestRender();
        break;
      }
    }
  }
  // 타겟을 바닥에서 띄운 높이(시각 단위). 토글 OFF면 0.
  function getTargetBaseY() {
    if (!features.elevate) return 0;
    const el = document.getElementById('inp-elevate');
    return el ? (+el.value || 0) : 6;
  }
  Object.keys(features).forEach(key => {
    const cb = $('feat-' + key); if (!cb) return;
    cb.checked = features[key];
    cb.addEventListener('change', () => {
      features[key] = cb.checked;
      const bodyId = FEAT_BODY[key];
      if (bodyId) $(bodyId).classList.toggle('collapsed', !cb.checked);
      applyFeature(key);
    });
  });

  // ── 추가 앱 설정 (메뉴/팝업 창에서 제어) + View 상태 ──
  // view: 패널 상시 표시 등 (메인 창에 DOM 없이 JS 상태로 둠)
  const view = {
    alwaysSettings: true,   // 좌측 설정창 상시 표시
    alwaysGraph: true,      // 우측 그래프 상시 표시 (ON이면 실시간 자동)
    alwaysTraj: true,       // 하단 궤적 데이터 표 상시 표시
    autoResults: true,      // 시뮬 종료 후 결과창 자동 표시
    realtime: false,        // 실시간 그래프
    graphTab: 'velocity',
    simOnly: false,         // 시뮬레이터 전용 모드(주변 툴 숨김) — 토글
  };
  // 값 설정용 새 컨트롤을 좌측 패널 끝에 동적으로 추가(상시 표시 모드/팝업 공용 단일 출처).
  (function addAppControls(){
    const lp = document.querySelector('.left-panel'); if(!lp) return;
    const sec = document.createElement('div'); sec.className='sec-body';
    sec.innerHTML =
      '<div class="sec-hdr" style="margin:0 -12px 8px"><span class="sec-title">App / Thermal</span></div>'+
      '<div class="field"><label>표면온도 한계 시 동작</label>'+
        '<select id="sel-heat-fail"><option value="off">없음</option>'+
        '<option value="burnup">타서 소멸 (Burn up)</option>'+
        '<option value="disintegrate">공중 분해 (Disintegrate)</option></select></div>'+
      '<div class="field"><label>표면온도 한계 <span>°C</span></label>'+
        '<input type="number" id="inp-heat-threshold" value="1500" min="100" step="50"></div>'+
      '<div class="field"><label>프레임레이트 상한</label>'+
        '<select id="sel-fps-cap"><option value="0">무제한</option><option value="30">30</option>'+
        '<option value="60">60</option><option value="120">120</option></select></div>';
    lp.appendChild(sec);
  })();
  const selHeatFail   = $('sel-heat-fail');
  const inpHeatThresh = $('inp-heat-threshold');
  const selFpsCap     = $('sel-fps-cap');
  // 파생 헬퍼
  const heatFailMode  = () => (selHeatFail ? selHeatFail.value : 'off');
  const heatThreshold = () => (inpHeatThresh ? (+inpHeatThresh.value || 1500) : 1500);
  const fpsCap        = () => (selFpsCap ? (+selFpsCap.value || 0) : 0);

  // ── State ──
  let activeTab      = 'velocity';
  let simResult      = null;
  let compareResult  = null;
  let showTraj       = false;
  let trajLine       = null;
  let craterGroup    = null;
  let playing        = false;
  let playHead       = 0;
  let impacted       = false;
  // 표면온도 한계 초과로 인한 열 파괴 상태
  let thermalFailed  = false;
  let maxSurfaceTemp = 0;
  // 버팀(withstood) 시 공 바운스 상태
  let bouncing       = false;
  let bounceVel      = 0;
  let bounceY        = 0;
  let targetObjects  = [];
  let fallingPresets = [];
  let jsFragments    = [];
  let dustParticles  = null;
  let fracturing     = false;
  let lastFrameTime  = 0;
  let graphAccum     = 0;
  let highlightAccum = 0;
  let needsRender    = true;
  let currentH0      = 500;
  let currentG       = 9.81;
  // 재생 보간 커서 (단조 증가하는 playHead용 — O(1) 프레임 조회 + 부드러운 보간)
  const playState    = { c:0 };
  let   shadowTick   = 0;
  // [F14] fragment rendering
  let fragInstanced  = null;
  let fragMeshes     = [];
  let useInstanced   = true;
  const _m4 = new THREE.Matrix4();
  const _q  = new THREE.Quaternion();
  const _p  = new THREE.Vector3();
  const _s  = new THREE.Vector3(1,1,1);
  // [F11] multi-object
  let moObjects  = [];
  // [F15] recording
  let recording  = false;
  let recordings = [];
  // Unit system
  let unitIdx = 0;
  const UNIT_SYSTEMS = [
    { key:'SI',   speedF:1,     speedL:'m/s',  distF:1,     distL:'m' },
    { key:'km/h', speedF:3.6,   speedL:'km/h', distF:1,     distL:'m' },
    { key:'IMP',  speedF:3.281, speedL:'ft/s', distF:3.281, distL:'ft'},
  ];
  function us() { return UNIT_SYSTEMS[unitIdx]; }
  function dispSpeed(v) { return (v * us().speedF).toFixed(2); }
  function dispDist(d)  { return (d * us().distF ).toFixed(1); }
  // Camera follow
  let camFollowMode = false;
  // Real-time graph
  let realtimeGraph = false;

  function requestRender() { needsRender = true; }

  // 프레임레이트 독립 감쇠 계수 (lambda 클수록 빠르게 수렴)
  function dampK(lambda, dt) { return 1 - Math.exp(-lambda * dt); }
  // 시뮬레이션 프레임 배열에서 시각 t의 상태를 선형 보간으로 구한다.
  // state.c 는 단조 증가 커서라 매 프레임 O(1)로 동작하고, 프레임 사이를
  // 부드럽게 이어줘서 낙하가 계단식으로 끊기지 않고 쭉 내려가게 한다.
  function lerpFrame(frames, t, state) {
    const n = frames.length;
    if (n === 0) return null;
    if (n === 1) return frames[0];
    let c = state.c | 0;
    if (c >= n - 1 || t < frames[c].t) c = 0;      // 되감기/리셋 시 커서 복구
    while (c < n - 2 && frames[c + 1].t <= t) c++; // 단조 전진
    state.c = c;
    const f0 = frames[c], f1 = frames[c + 1] || f0;
    const span = f1.t - f0.t;
    const u = span > 1e-9 ? Math.max(0, Math.min(1, (t - f0.t) / span)) : 0;
    const lf = (a, b) => a + (b - a) * u;
    return {
      t,
      h:        lf(f0.h, f1.h),
      v:        lf(f0.v, f1.v),
      a:        lf(f0.a, f1.a),
      rho:      lf(f0.rho ?? 1.225, f1.rho ?? 1.225),
      px:       lf(f0.px || 0, f1.px || 0),
      pz:       lf(f0.pz || 0, f1.pz || 0),
      heatFlux: lf(f0.heatFlux || 0, f1.heatFlux || 0),
      T_surface:lf(f0.T_surface || 0, f1.T_surface || 0),
      atm: f0.atm,
    };
  }

  const SHAPE_CD = { sphere:0.47, cylinder:0.82, box:1.05, cone:0.50 };

  // ── Presets ──
  if (window.physics) {
    fallingPresets = await window.physics.getFallingObjects();
    fallingPresets.forEach((p,i) => {
      const o = document.createElement('option');
      o.value = i; o.textContent = `${p.name}  (${p.mass} kg)`;
      selPreset.appendChild(o);
    });
    targetObjects = await window.physics.getTargetObjects();
    targetObjects.forEach((t,i) => {
      const o = document.createElement('option');
      o.value = i; o.textContent = t.name;
      selTarget.appendChild(o);
    });
  }

  // 선택한 타깃 프리셋의 두께(mm)·항복강도(MPa)를 입력칸에 채운다
  function syncTargetFields() {
    const t = targetObjects[+selTarget.value]; if (!t) return;
    inpThickness.value = (t.thickness * 1000).toFixed(0); // m → mm
    inpYield.value     = t.yieldStrength.toFixed(1);
  }
  // 현재 입력값을 반영한 타깃 객체(두께·항복강도 오버라이드)
  function currentTarget() {
    const base = targetObjects[+selTarget.value];
    if (!base) return base;
    return {
      ...base,
      thickness:     (+inpThickness.value || 1) / 1000,  // mm → m
      yieldStrength: (+inpYield.value || base.yieldStrength),
    };
  }
  if (targetObjects.length) syncTargetFields();

  const PRESET_SHAPES = ['sphere','sphere','box','sphere','box','box','sphere'];
  function lockInputs(locked) {
    [inpMass,inpArea,inpCd].forEach(el => locked ? el.setAttribute('readonly',true) : el.removeAttribute('readonly'));
  }
  selPreset.addEventListener('change', () => {
    const idx = parseInt(selPreset.value);
    if (idx < 0) { lockInputs(false); return; }
    const p = fallingPresets[idx];
    inpMass.value = p.mass; inpArea.value = p.area; inpCd.value = p.cd;
    selShape.value = PRESET_SHAPES[idx] || 'sphere';
    lockInputs(true); updateTV(); rebuildFallingMesh();
  });
  selShape.addEventListener('change', () => {
    const isCustom = selShape.value === 'custom';
    customGlbRow.style.display = isCustom ? 'flex' : 'none';
    if (!isCustom) {
      // custom 에서 다른 형상으로 바꾸면 GLB 제거 + 기본 형상 복원
      clearGlbMesh();
      if (selShapeGlbPreset) selShapeGlbPreset.value = '';
      if (parseInt(selPreset.value) < 0) { inpCd.value = SHAPE_CD[selShape.value]; updateTV(); }
      rebuildFallingMesh();
    } else {
      // custom 진입: fallingMesh는 숨기기만(GLB 선택 전까지 아무것도 안 보임)
      rebuildFallingMesh();
      if (fallingMesh) fallingMesh.visible = false;
    }
  });

  // [F8] ISA + Magnus humidity
  function airDensityJS(alt, tempOffset=0, humidity=50) {
    if (!features.atmosphere) return 1.225;
    if (alt < 0) alt = 0;
    const R=287.05, grav=9.80665, L0=0.0065;
    const T0=288.15+tempOffset, P0=101325;
    let T, P;
    if (alt <= 11000) {
      T = T0 - L0*alt; P = P0*Math.pow(T/T0, grav/(R*L0));
    } else {
      const T11=T0-L0*11000, P11=P0*Math.pow((T0-L0*11000)/T0, grav/(R*L0));
      if (alt <= 20000) {
        T = T11; P = P11*Math.exp(-grav*(alt-11000)/(R*T11));
      } else {
        const P20 = P11*Math.exp(-grav*9000/(R*T11));
        if (alt <= 32000) {
          const L2=0.001; T=T11+L2*(alt-20000); P=P20*Math.pow(T/T11,-grav/(R*L2));
        } else if (alt <= 80000) {
          return airDensityJS(32000,tempOffset,0)*Math.exp(-0.0001*(alt-32000));
        } else { return 1e-5; }
      }
    }
    let rho = P/(R*T);
    if (humidity > 0 && alt < 20000) {
      const Tc=T-273.15, es=611.2*Math.exp(17.67*Tc/(Tc+243.04)), e=(humidity/100)*es;
      rho *= (1 - 0.378*e/P);
    }
    return Math.max(rho, 1e-5);
  }

  function atmNameJS(alt) {
    if (!features.atmosphere) return 'Troposphere';
    if (alt < 11000) return 'Troposphere';
    if (alt < 20000) return 'Lower Stratosphere';
    if (alt < 32000) return 'Upper Stratosphere';
    if (alt < 50000) return 'Stratopause';
    if (alt < 80000) return 'Mesosphere';
    return 'Near Vacuum';
  }

  function updateAtmHint() {
    const rho = airDensityJS(0, +inpTemp.value||0, +inpHumidity.value||50);
    atmRhoHint.textContent = `Sea-level ρ = ${rho.toFixed(4)} kg/m³`;
    updateTV();
  }
  [inpTemp, inpHumidity].forEach(el => el.addEventListener('input', updateAtmHint));
  updateAtmHint();

  // [F1] Wind arrow
  function drawWindArrow() {
    const wx=+inpWindX.value||0, wz=+inpWindZ.value||0, speed=Math.hypot(wx,wz);
    const ctx=windArrowCvs.getContext('2d'), W=windArrowCvs.width, H=windArrowCvs.height;
    if(!ctx) return; // [null-safe] 풍향 캔버스가 없으면(스트립 모드) 건너뜀
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#161b22'; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='#21262d'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(W/2,H/2,W/2-2,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle='#6e7681'; ctx.font='8px Consolas'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('N',W/2,6); ctx.fillText('S',W/2,H-6);
    ctx.fillText('E',W-6,H/2); ctx.fillText('W',6,H/2);
    if (speed < 0.01) { ctx.fillText('—',W/2,H/2); return; }
    const angle=Math.atan2(wx,-wz), len=Math.min(speed*2,W/2-10);
    const cx=W/2, cy=H/2, ex=cx+Math.sin(angle)*len, ey=cy-Math.cos(angle)*len;
    ctx.strokeStyle='#58a6ff'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(ex,ey); ctx.stroke();
    const sa=Math.sin(angle),ca=Math.cos(angle),hw=3,hl=7;
    ctx.fillStyle='#58a6ff'; ctx.beginPath();
    ctx.moveTo(ex,ey);
    ctx.lineTo(ex-sa*hl-ca*hw, ey+ca*hl-sa*hw);
    ctx.lineTo(ex-sa*hl+ca*hw, ey+ca*hl+sa*hw);
    ctx.closePath(); ctx.fill();
  }
  function updateWindHint() {
    const wx=+inpWindX.value||0, wz=+inpWindZ.value||0, speed=Math.hypot(wx,wz);
    if (speed < 0.01) { windHint.textContent='No wind'; drawWindArrow(); return; }
    const deg=((Math.atan2(wx,-wz)*180/Math.PI)+360)%360;
    windHint.textContent=`${speed.toFixed(1)} m/s  ·  ${deg.toFixed(0)}° (from N)`;
    drawWindArrow();
  }
  [inpWindX, inpWindZ].forEach(el => el.addEventListener('input', updateWindHint));
  updateWindHint();

  function updateTV() {
    const m=+inpMass.value, A=+inpArea.value, Cd=+inpCd.value, g=+inpG.value;
    const rho=airDensityJS(0, +inpTemp.value||0, +inpHumidity.value||50);
    tvLive.textContent = (m&&A&&Cd&&g) ? Math.sqrt((2*m*g)/(rho*Cd*A)).toFixed(3) : '—';
  }
  [inpMass,inpArea,inpCd,inpG].forEach(el => el.addEventListener('input', updateTV));
  updateTV();

  // [F7] Magnus hint
  function spinAxisVec() {
    switch(selSpinAxis.value) { case 'x': return [1,0,0]; case 'y': return [0,1,0]; default: return [0,0,1]; }
  }
  function updateMagnusHint() {
    if (!features.magnus) { magnusHint.textContent='—'; return; }
    const omega=(+inpSpinRpm.value||0)*2*Math.PI/60;
    magnusHint.textContent=`ω = ${omega.toFixed(1)} rad/s  ·  CL ≈ 0.25`;
  }
  [inpSpinRpm, selSpinAxis].forEach(el => el.addEventListener('input', updateMagnusHint));
  updateMagnusHint();
  // 드롭 높이를 바꾸면(정지 상태) 구름도 그 높이에 맞춰 즉시 재배치
  if (inpHeight) inpHeight.addEventListener('input', () => { if(!playing) positionClouds(+inpHeight.value||500); });

  // STL/GLB 버튼 이벤트는 GLB 로더 섹션에서 처리

  // [F12] Terrain slope visibility
  selTerrain.addEventListener('change', () => {
    fieldSlope.style.display = selTerrain.value==='slope' ? 'block' : 'none';
    if (features.terrain) rebuildTerrain();
  });
  inpSlope.addEventListener('input', () => { if (features.terrain) rebuildTerrain(); });

  // ── [F1][F7][F8][F12][F13] Local physics ──
  function localSimulate(mass, area, cd) {
    const m=mass, A=area, Cd=cd;
    const h0=+inpHeight.value, v0=+inpV0.value, g=+inpG.value;
    const wx=features.wind?(+inpWindX.value||0):0;
    const wz=features.wind?(+inpWindZ.value||0):0;
    const tempOff=+inpTemp.value||0, hum=+inpHumidity.value||50;
    // [F13] projectile decomposition
    const launchRad=(features.projectile?(+inpLaunchAngle.value||45):90)*Math.PI/180;
    const azimRad  =(features.projectile?(+inpLaunchAzimuth.value||0):0)*Math.PI/180;
    let vy=-(v0*Math.sin(launchRad));
    let vx= v0*Math.cos(launchRad)*Math.sin(azimRad);
    let vz= v0*Math.cos(launchRad)*Math.cos(azimRad);
    // [F12] slope-adjusted gravity
    const slopeDeg=(features.terrain&&selTerrain.value==='slope')?(+inpSlope.value||0):0;
    const slopeRad=slopeDeg*Math.PI/180;
    const gVert=g*Math.cos(slopeRad), gSlope=g*Math.sin(slopeRad);
    // [F7] magnus params
    const omega=features.magnus?((+inpSpinRpm.value||0)*2*Math.PI/60):0;
    const CL=0.25, [sx,sy,sz]=spinAxisVec();
    let h=h0, posX=0, posZ=0, t=0;
    const frames=[]; let ttReached=null; let maxMagnusF=0;
    const rhoSea=airDensityJS(0,tempOff,hum);
    const vtSea=Math.sqrt((2*m*gVert)/(rhoSea*Cd*A));
    while (h>0 && t<7200) {
      const rho=airDensityJS(h,tempOff,hum);
      const drag_y=0.5*rho*Cd*A*vy*vy;
      const sign_vy=vy>=0?1:-1;
      let ay=(m*gVert - sign_vy*drag_y)/m;
      const vRelX=vx-wx, vRelZ=vz-wz;
      let ax=gSlope-(0.5*rho*Cd*A*vRelX*Math.abs(vRelX))/m;
      let az=       -(0.5*rho*Cd*A*vRelZ*Math.abs(vRelZ))/m;
      if (omega > 0.001) {
        const fs=0.5*CL*rho*A*omega/m;
        const mAx=fs*(sy*vz-sz*vy), mAy=fs*(sz*vx-sx*vz), mAz=fs*(sx*vy-sy*vx);
        ax+=mAx; ay+=mAy; az+=mAz;
        maxMagnusF=Math.max(maxMagnusF, m*Math.hypot(mAx,mAy,mAz));
      }
      const vtL=rho>1e-10?Math.sqrt((2*m*gVert)/(rho*Cd*A)):1e9;
      // [F16] 공력 가열 계산 (마하수 기반)
      const speed=Math.abs(vy);
      const T_atm=Math.max(180, 288.15+tempOff - 0.0065*Math.max(h,0)); // 대기 온도 (K)
      const c_sound=Math.sqrt(1.4*287*T_atm);           // 음속 (m/s)
      const Ma=speed/c_sound;                             // 마하수
      // 정체 온도: T_stag = T*(1 + 0.2*Ma²)  (이상기체 γ=1.4)
      const T_stag=T_atm*(1+0.2*Ma*Ma);
      // Sutton-Graves 간략화: q̇ = 1.83e-4 * v³ * √(ρ/R_nose)  [W/m²]
      const R_nose=Math.sqrt(A/Math.PI);
      const heatFlux=features.heat&&rho>1e-10
        ? 1.83e-4 * speed*speed*speed * Math.sqrt(rho/Math.max(R_nose,0.01)) : 0;
      // 표면 온도: 복사 평형(방사율 0.9) + 대기 온도 (둘 중 큰 값)
      const T_rad=heatFlux>0 ? Math.pow(heatFlux/(5.67e-8*0.9),0.25) : 0;
      const T_surface=Math.max(T_atm, T_rad, T_stag) - 273.15; // °C
      frames.push({t,v:vy,h,a:ay,rho,atm:atmNameJS(h),px:posX,pz:posZ,heatFlux,T_surface});
      if (!ttReached && Math.abs(vy)>=vtL*0.99) ttReached=t;
      vy+=ay*dt_sim; h-=vy*dt_sim;
      vx+=ax*dt_sim; posX+=vx*dt_sim;
      vz+=az*dt_sim; posZ+=vz*dt_sim;
      t=Math.round((t+dt_sim)*1000)/1000;
    }
    const last=frames[frames.length-1];
    // 고고도(긴 낙하)에선 dt_sim=0.05 고정이라 프레임이 수만~십수만 개로 폭증한다.
    // 그래프/표/궤적이 매 프레임 전체 프레임을 순회하면서 재생이 갈수록 끊긴다.
    // 요약값(impactVelocity·fallTime 등)은 전체 해상도로 계산한 뒤, 표시용 프레임만
    // 일정 개수 이하로 다운샘플한다(마지막 프레임은 정확도 위해 항상 보존).
    const dispFrames=downsampleFrames(frames,DISP_FRAME_CAP);
    return {frames:dispFrames,terminalVelocity:vtSea,impactVelocity:Math.abs(last.v),
            fallTime:last.t,timeToTerminal:ttReached??last.t,
            driftX:last.px,driftZ:last.pz,maxMagnusF};
  }
  const dt_sim=0.05;
  const DISP_FRAME_CAP=3000;   // 표시용 프레임 상한 (재생/그래프/표/궤적 비용 일정하게 유지)
  // 균등 stride 다운샘플. 첫·마지막 프레임은 항상 포함해 시작/충돌 시점을 보존한다.
  function downsampleFrames(frames,maxN){
    const n=frames.length;
    if(n<=maxN)return frames;
    const stride=Math.ceil(n/maxN);
    const out=[];
    for(let i=0;i<n;i+=stride)out.push(frames[i]);
    if(out[out.length-1]!==frames[n-1])out.push(frames[n-1]);
    return out;
  }

  // ── Three.js scene ──
  const scene     = new THREE.Scene();
  const camera    = new THREE.PerspectiveCamera(50,1,0.1,200000);
  const renderer3 = new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer3.setPixelRatio(Math.min(window.devicePixelRatio,1.75));
  renderer3.shadowMap.enabled=true;
  renderer3.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer3.shadowMap.autoUpdate=false;
  canvasWrap.appendChild(renderer3.domElement);

  // 대기: 층 경계 없이 부드럽게 이어지는 연속 그라데이션.
  // 높이(t)에 따라 지평선→하늘색→상층→우주로 smoothstep 으로 매끄럽게 섞고,
  // 낙하 물체의 현재 고도(altitudeFrac)에 따라 전체를 우주색으로 점진적으로 어둡게 한다.
  const skyMat=new THREE.ShaderMaterial({
    side:THREE.BackSide, uniforms:{altitudeFrac:{value:0.0}},
    vertexShader:`varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`
      varying vec3 vPos;
      uniform float altitudeFrac;
      void main(){
        float t = clamp(vPos.y/80000.0, 0.0, 1.0);
        // 색 스톱: 지평선(밝은 청록) → 하늘(파랑) → 상층(짙은 파랑) → 우주(검정)
        vec3 horizon = vec3(0.55, 0.74, 0.92);
        vec3 sky     = vec3(0.30, 0.55, 0.90);
        vec3 upper   = vec3(0.06, 0.12, 0.34);
        vec3 space   = vec3(0.01, 0.01, 0.04);
        // smoothstep 으로 인접 스톱을 겹쳐 섞어 경계(층)가 보이지 않게 한다
        vec3 c = mix(horizon, sky,   smoothstep(0.0,  0.30, t));
        c      = mix(c,       upper, smoothstep(0.22, 0.62, t));
        c      = mix(c,       space, smoothstep(0.55, 1.0,  t));
        // 관측 고도가 높아질수록 전체적으로 우주색 쪽으로 (연속적으로)
        c = mix(c, space, smoothstep(0.0, 1.0, altitudeFrac) * 0.9);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(80000,32,16),skyMat));

  const sunLight=new THREE.DirectionalLight(0xfff5e0,1.4);
  sunLight.position.set(200,500,100); sunLight.castShadow=true;
  sunLight.shadow.mapSize.set(1024,1024);
  sunLight.shadow.camera.near=0.5; sunLight.shadow.camera.far=2000;
  sunLight.shadow.camera.left=-200; sunLight.shadow.camera.right=200;
  sunLight.shadow.camera.top=200; sunLight.shadow.camera.bottom=-200;
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x9bbfff,0.5));
  const fill=new THREE.DirectionalLight(0x7eb3ff,0.3);
  fill.position.set(-100,50,-100); scene.add(fill);

  const cloudGroup=new THREE.Group();
  for(let i=0;i<14;i++){
    const geo=new THREE.SphereGeometry(50+Math.random()*70,7,4);
    const mat=new THREE.MeshStandardMaterial({color:0xffffff,transparent:true,opacity:0.5+Math.random()*0.2,roughness:1,metalness:0});
    const c=new THREE.Mesh(geo,mat);
    c.position.set((Math.random()-0.5)*3000,0,(Math.random()-0.5)*3000);
    c.scale.set(1+Math.random(),0.35+Math.random()*0.25,1+Math.random());
    // 낙하 시각 구간(0..visualH) 안에서의 높이 비율. 하단(troposphere)에도 구름이
    // 깔리도록 5%~85%에 고르게 분포시킨다. positionClouds()에서 실제 y로 환산.
    c._fracY=0.05+(i/13)*0.80+(Math.random()-0.5)*0.04;
    cloudGroup.add(c);
  }
  scene.add(cloudGroup);
  // 드롭 높이에 맞춰 구름 y를 재배치. 낙하 구간은 visualH(≤1500)로 압축되므로,
  // 구름을 그 구간 안에 두면 troposphere(하단) 구간을 지날 때도 구름이 보인다.
  function positionClouds(h0){
    const visualH=Math.min(Math.max(h0||+inpHeight.value||500,1),1500);
    const baseY=getTargetBaseY();
    cloudGroup.children.forEach(c=>{
      c.position.y=baseY+visualH*(c._fracY!=null?c._fracY:0.5);
    });
    requestRender();
  }
  positionClouds(+inpHeight.value||500);

  // [F12] Ground / terrain group
  let terrainGroup = new THREE.Group(); scene.add(terrainGroup);
  let terrainGrid  = new THREE.GridHelper(300,30,0x1a3a10,0x1a3a10);
  terrainGrid.position.y=0.01; scene.add(terrainGrid);

  function rebuildTerrain() {
    terrainGroup.children.slice().forEach(o => {
      terrainGroup.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    const type = features.terrain ? selTerrain.value : 'flat';
    if (type === 'water') {
      const m=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),
        new THREE.MeshStandardMaterial({color:0x1d4e6b,roughness:0.1,metalness:0.6,transparent:true,opacity:0.85}));
      m.rotation.x=-Math.PI/2; m.receiveShadow=true; terrainGroup.add(m);
    } else if (type === 'slope') {
      const base=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),
        new THREE.MeshStandardMaterial({color:0x3a5c2e,roughness:0.95}));
      base.rotation.x=-Math.PI/2; base.position.y=-0.01; base.receiveShadow=true; terrainGroup.add(base);
      const deg=+inpSlope.value||15;
      const ramp=new THREE.Mesh(new THREE.PlaneGeometry(300,400),
        new THREE.MeshStandardMaterial({color:0x4a6a34,roughness:0.9}));
      ramp.rotation.x=-Math.PI/2+deg*Math.PI/180; ramp.position.y=0.02; ramp.receiveShadow=true; terrainGroup.add(ramp);
    } else if (type === 'elevated') {
      const base=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),
        new THREE.MeshStandardMaterial({color:0x3a5c2e,roughness:0.95}));
      base.rotation.x=-Math.PI/2; base.position.y=-0.01; base.receiveShadow=true; terrainGroup.add(base);
      const plat=new THREE.Mesh(new THREE.BoxGeometry(60,20,60),
        new THREE.MeshStandardMaterial({color:0x57606a,roughness:0.9,metalness:0.1}));
      plat.position.y=10; plat.receiveShadow=true; plat.castShadow=true; terrainGroup.add(plat);
    } else {
      const m=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),
        new THREE.MeshStandardMaterial({color:0x3a5c2e,roughness:0.95}));
      m.rotation.x=-Math.PI/2; m.position.y=-0.01; m.receiveShadow=true; terrainGroup.add(m);
    }
    requestRender();
  }
  rebuildTerrain();

  // Camera orbit
  let orbitTarget=new THREE.Vector3(0,2,0), orbitRadius=40, orbitTheta=0.6, orbitPhi=1.1;
  let isDragging=false, isPanning=false, lastMouse={x:0,y:0};
  function updateCamera() {
    camera.position.set(
      orbitTarget.x+orbitRadius*Math.sin(orbitPhi)*Math.sin(orbitTheta),
      orbitTarget.y+orbitRadius*Math.cos(orbitPhi),
      orbitTarget.z+orbitRadius*Math.sin(orbitPhi)*Math.cos(orbitTheta)
    );
    camera.lookAt(orbitTarget);
  }
  updateCamera();
  renderer3.domElement.addEventListener('mousedown',e=>{
    if(e.button===0)isDragging=true; if(e.button===2)isPanning=true;
    lastMouse={x:e.clientX,y:e.clientY};
  });
  renderer3.domElement.addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('mouseup',()=>{isDragging=false;isPanning=false;});
  window.addEventListener('mousemove',e=>{
    if(!isDragging&&!isPanning)return;
    const dx=e.clientX-lastMouse.x, dy=e.clientY-lastMouse.y;
    lastMouse={x:e.clientX,y:e.clientY};
    if(isDragging){orbitTheta-=dx*0.008;orbitPhi=Math.max(0.05,Math.min(Math.PI*0.48,orbitPhi+dy*0.008));updateCamera();requestRender();}
    if(isPanning){
      const r=new THREE.Vector3();
      r.crossVectors(camera.getWorldDirection(new THREE.Vector3()),new THREE.Vector3(0,1,0)).normalize();
      orbitTarget.addScaledVector(r,-dx*0.08); orbitTarget.y+=dy*0.08; updateCamera(); requestRender();
    }
  });
  renderer3.domElement.addEventListener('wheel',e=>{
    orbitRadius=Math.max(5,Math.min(2000,orbitRadius+e.deltaY*0.1)); updateCamera(); requestRender();
  });
  function resize3() {
    const w=canvasWrap.clientWidth, h=canvasWrap.clientHeight;
    renderer3.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); requestRender();
  }
  resize3();
  new ResizeObserver(resize3).observe(canvasWrap);

  // ── Left panel (설정창) resizer — 드래그로 폭 자유 조절 (toggleable) ──
  const LEFT_W_KEY = 'sim_left_panel_w';
  const LEFT_W_MIN = 170, LEFT_W_DEFAULT = 230;
  function leftWMax() { return Math.max(LEFT_W_MIN, Math.round(window.innerWidth * 0.55)); }
  function setLeftWidth(px) {
    const w = Math.max(LEFT_W_MIN, Math.min(leftWMax(), Math.round(px)));
    workspaceEl.style.setProperty('--left-w', w + 'px');
    return w;
  }
  // 저장된 폭 복원 (재시작 후에도 유지)
  const savedLeftW = parseInt(localStorage.getItem(LEFT_W_KEY) || '', 10);
  if (Number.isFinite(savedLeftW)) setLeftWidth(savedLeftW);
  if (panelResizer) {
    panelResizer.classList.toggle('disabled', !features.resize);
    let resizing = false;
    panelResizer.addEventListener('mousedown', e => {
      if (!features.resize || e.button !== 0) return;
      resizing = true;
      panelResizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!resizing) return;
      // 워크스페이스 왼쪽 끝부터 마우스까지의 거리 = 설정창 폭
      const left = workspaceEl.getBoundingClientRect().left;
      setLeftWidth(e.clientX - left);
    });
    window.addEventListener('mouseup', () => {
      if (!resizing) return;
      resizing = false;
      panelResizer.classList.remove('dragging');
      document.body.style.cursor = '';
      const cur = workspaceEl.style.getPropertyValue('--left-w');
      if (cur) localStorage.setItem(LEFT_W_KEY, parseInt(cur, 10));
    });
    // 더블클릭 → 기본 폭으로 리셋
    panelResizer.addEventListener('dblclick', () => {
      if (!features.resize) return;
      setLeftWidth(LEFT_W_DEFAULT);
      localStorage.setItem(LEFT_W_KEY, LEFT_W_DEFAULT);
    });
  }

  // Camera presets
  document.querySelectorAll('.cam-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const p = btn.dataset.cam;
      camFollowMode = p === 'follow';
      if (p === 'front')  { orbitTheta = 0;         orbitPhi = 1.1; }
      else if (p === 'side')  { orbitTheta = Math.PI/2; orbitPhi = 1.1; }
      else if (p === 'top')   { orbitTheta = 0;         orbitPhi = 0.05; }
      else if (p === 'reset') { orbitTheta = 0.6;       orbitPhi = 1.1; orbitRadius = 40; }
      else if (p === 'follow') {
        // 추적 모드 진입 시 보기 좋은 각도/거리로 초기 정렬 — 이후 매 프레임 lerp 로 따라감
        orbitTheta = 0.6; orbitPhi = 1.15; orbitRadius = 28;
        if (fallingMesh) orbitTarget.copy(fallingMesh.position);
        updateCamera();
      }
      if (!camFollowMode) { updateCamera(); requestRender(); }
      else { requestRender(); }
    });
  });

  // Falling mesh
  let fallingMesh=null;
  const FALL_MATS={
    sphere:  new THREE.MeshStandardMaterial({color:0x3b82f6,roughness:0.3,metalness:0.4}),
    cylinder:new THREE.MeshStandardMaterial({color:0x22c55e,roughness:0.4,metalness:0.2}),
    box:     new THREE.MeshStandardMaterial({color:0xf59e0b,roughness:0.5,metalness:0.1}),
    cone:    new THREE.MeshStandardMaterial({color:0xef4444,roughness:0.4,metalness:0.2}),
  };
  function buildShapeGeo(shape) {
    switch(shape) {
      case 'sphere':   return new THREE.SphereGeometry(1,24,24);
      case 'cylinder': return new THREE.CylinderGeometry(0.7,0.7,1.8,24);
      case 'box':      return new THREE.BoxGeometry(1.4,1.4,1.4);
      case 'cone':     return new THREE.ConeGeometry(1,2,24);
      default:         return new THREE.SphereGeometry(1,24,24);
    }
  }
  // 빨간 테두리: 같은 형상을 약간 키우고 BackSide 빨간 재질로 실루엣 표시
  const OUTLINE_MAT = new THREE.MeshBasicMaterial({color:0xff2d2d,side:THREE.BackSide});
  function rebuildFallingMesh() {
    if(fallingMesh){scene.remove(fallingMesh);fallingMesh.geometry.dispose();fallingMesh=null;}
    const shape = selShape.value === 'custom' ? 'sphere' : selShape.value;
    const geo=buildShapeGeo(shape);
    fallingMesh=new THREE.Mesh(geo, FALL_MATS[shape] || FALL_MATS.sphere);
    fallingMesh.castShadow=true;
    // 빨간 테두리 아웃라인을 자식으로 부착 (공을 따라다님)
    const outline=new THREE.Mesh(geo,OUTLINE_MAT);
    outline.scale.setScalar(1.12);
    fallingMesh.add(outline);
    // Custom 모드에서 GLB가 이미 있으면 fallingMesh는 숨김
    fallingMesh.visible = !(selShape.value === 'custom' && glbMesh);
    scene.add(fallingMesh); requestRender();
  }
  rebuildFallingMesh();

  // ── [F17] GLB 모델 로더 ──
  // GLTFLoader 로드 실패 시 gltfLoader는 null — GLB 기능만 꺼지고 나머지는 정상.
  const gltfLoader = GLTFLoader ? new GLTFLoader() : null;
  let glbMesh = null;     // 현재 로드된 GLB 루트 오브젝트
  let glbLoading = false; // 비동기 로딩 진행 중 여부
  let glbLoadSeq = 0;     // 빠른 연속 선택 시 마지막 요청만 반영하기 위한 시퀀스

  const stlLoader = STLLoader ? new STLLoader() : null;
  // 비율을 유지한 채 크기를 조정하기 위해 정규화 스케일과 사용자 배율을 분리해 둔다.
  let glbBaseScale = 1;   // 모델 최대변을 2.5 유닛으로 맞추는 정규화 스케일
  let glbUserScale = 1;   // 사용자가 슬라이더로 조절하는 배율 (균등 → 비율 유지)
  let glbHalfHeight = 0;  // 모델 바운딩박스 높이의 절반(스케일 전). 바닥 잠김 방지용 오프셋 계산에 사용.

  // 모델 중심이 그룹 원점에 있으므로, 표면 위에 바닥이 닿게 하려면 이만큼 위로 올려야 한다.
  // 모델마다 높이가 다르므로 GLB에 따라 자동으로 달라진다(스케일 슬라이더에도 연동).
  function glbGroundOffset() {
    return glbMesh ? glbHalfHeight * glbBaseScale * glbUserScale : 0;
  }

  function clearGlbMesh() {
    if (!glbMesh) return;
    scene.remove(glbMesh);
    glbMesh.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
    glbMesh = null;
  }

  // 비율을 유지한 채 현재 모델 크기를 다시 적용. (슬라이더 입력 시에도 호출)
  function applyGlbScale() {
    if (!glbMesh) return;
    glbMesh.scale.setScalar(glbBaseScale * glbUserScale);
    requestRender();
  }

  // GLB scene 또는 STL Mesh(=Object3D)를 받아 원점 중심 정렬 후 fallingMesh를 대체.
  // 그룹으로 감싸 모델 중심을 그룹 원점에 두고, 그룹에 균등 스케일을 적용한다.
  // 이렇게 하면 슬라이더로 크기를 바꿔도 항상 비율이 유지되고 중심이 고정된다.
  function applyGlbToFalling(obj) {
    clearGlbMesh();
    if (fallingMesh) fallingMesh.visible = false;
    obj.traverse(c => {
      if (!c.isMesh) return;
      c.castShadow = true; c.receiveShadow = true;
      // 일부 모델은 노멀이 뒤집혀 한쪽 면만 보이므로 양면 렌더링으로 안전하게
      const mats = Array.isArray(c.material) ? c.material : (c.material ? [c.material] : []);
      mats.forEach(m => { if (m) m.side = THREE.DoubleSide; });
    });
    // 스케일 전 좌표 기준으로 모델 중심을 원점으로 옮긴다
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    obj.position.sub(center);
    const maxS = Math.max(size.x, size.y, size.z) || 1;
    glbBaseScale = 2.5 / maxS;
    glbHalfHeight = size.y / 2;   // 바닥 잠김 방지 오프셋용 (스케일 전 높이의 절반)
    const group = new THREE.Group();
    group.add(obj);
    glbMesh = group;
    applyGlbScale();            // glbBaseScale * glbUserScale 균등 적용 (비율 유지)
    scene.add(glbMesh);
    glbMesh.visible = true;     // 재생 중 늦게 로드돼도 즉시 표시
    requestRender();
  }

  // STL geometry → 표준 머티리얼을 입힌 Mesh 로 변환
  function makeStlMesh(geometry) {
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x9aa7b4, roughness: 0.55, metalness: 0.15 });
    return new THREE.Mesh(geometry, mat);
  }

  // 확장자(.stl/.glb)에 맞는 로더를 고른다
  function pickLoader(pathOrName) {
    return /\.stl$/i.test(pathOrName) ? { loader: stlLoader, kind: 'STL' }
                                      : { loader: gltfLoader, kind: 'GLB' };
  }

  // path가 비면 모델 제거(기본 형상 복원). 아니면 비동기 로드 + 결과/오류를 토스트로 표시.
  function loadModelFromPath(path, label) {
    const name = label || (path ? path.split('/').pop() : '');
    if (!path) {
      clearGlbMesh();
      glbLoading = false;
      if (fallingMesh) fallingMesh.visible = (selShape.value !== 'custom');
      requestRender(); return;
    }
    const { loader, kind } = pickLoader(path);
    if (!loader) {
      toast(`${kind} 로더를 불러오지 못해 모델 기능을 쓸 수 없습니다.\n` +
            (glbLoaderError ? String(glbLoaderError.message || glbLoaderError) : '') +
            '\n→ index.html의 import map / node_modules/three 설치를 확인하세요.', 'error', 9000);
      return;
    }
    const seq = ++glbLoadSeq;
    glbLoading = true;
    toast(`${kind} 로딩 중… (${name})`, 'info', 2000);
    loader.load(
      path,
      result => {
        if (seq !== glbLoadSeq) return; // 더 최신 요청이 들어왔으면 폐기
        glbLoading = false;
        applyGlbToFalling(kind === 'STL' ? makeStlMesh(result) : result.scene);
        toast(`${kind} 로드 완료: ${name}`, 'ok', 2500);
      },
      undefined,
      err => {
        if (seq !== glbLoadSeq) return;
        glbLoading = false;
        console.error(`[${kind}] load failed:`, path, err);
        toast(`${kind} 로드 실패: ${name}\n${err && (err.message || err.type) || err}\n경로: ${path}`, 'error', 9000);
      }
    );
  }
  // 드롭다운 선택 + 물리값 자동 설정
  const GLB_PHYS = {
    'assets/Classic_table.glb': {mass:15,    area:0.30, cd:1.2},
    'assets/screwdriver.glb':   {mass:0.15,  area:0.0005, cd:0.5},
    'assets/Hyperbolic.glb':    {mass:10,    area:0.20, cd:0.30},
  };
  if (selGlbPreset) {
    selGlbPreset.addEventListener('change', () => {
      loadModelFromPath(selGlbPreset.value);
      const p = GLB_PHYS[selGlbPreset.value];
      if (p) {
        inpMass.value = p.mass;
        inpArea.value = p.area;
        inpCd.value   = p.cd;
        updateTV();
      }
    });
  }

  // 로컬 파일(File 객체)을 업로드: assets 폴더로 복사한 뒤 그 경로에서 로드한다.
  // 복사하면 blob URL 대신 로컬 HTTP 서버가 바로 서빙해 로드 지연이 사라지고
  // STL/GLB 모두 동일 경로 로직으로 안정적으로 렌더된다. 복사 불가 시 blob 으로 폴백.
  async function loadLocalModelFile(f, btn) {
    if (!f) return;
    const { loader, kind } = pickLoader(f.name);
    if (!loader) {
      toast(`${kind} 로더를 불러오지 못해 ${kind} 파일을 쓸 수 없습니다.`, 'error', 9000);
      return;
    }
    if (btn) btn.textContent = f.name;

    // 1) assets 폴더로 복사 시도 → 성공하면 정적 경로에서 로드 (지연 없음)
    if (window.physics && window.physics.copyToAssets) {
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const res = await window.physics.copyToAssets(f.name, bytes);
        if (res && res.ok && res.path) {
          loadModelFromPath(res.path, f.name);
          return;
        }
        console.warn('[MODEL] copyToAssets 실패 — blob 폴백:', res && res.error);
      } catch (e) {
        console.warn('[MODEL] copyToAssets 예외 — blob 폴백:', e);
      }
    }

    // 2) 폴백: blob URL 로 직접 로드
    const seq = ++glbLoadSeq;
    glbLoading = true;
    const url = URL.createObjectURL(f);
    toast(`${kind} 로딩 중… (${f.name})`, 'info', 2000);
    loader.load(
      url,
      result => {
        URL.revokeObjectURL(url);
        if (seq !== glbLoadSeq) return;
        glbLoading = false;
        applyGlbToFalling(kind === 'STL' ? makeStlMesh(result) : result.scene);
        toast(`${kind} 로드 완료: ${f.name}`, 'ok', 2500);
      },
      undefined,
      err => {
        URL.revokeObjectURL(url);
        if (seq !== glbLoadSeq) return;
        glbLoading = false;
        console.error(`[${kind}] file load failed:`, f.name, err);
        toast(`${kind} 로드 실패: ${f.name}\n${err && (err.message || err.type) || err}`, 'error', 9000);
      }
    );
  }

  // 모델 크기 컨트롤 (비율 유지) — 1.0× 이면 정규화 기본 크기와 동일.
  // 슬라이더 + 범위(최소/최대) 직접 지정 + 수치 직접 입력을 모두 동기화한다.
  if (inpGlbScale) {
    const fmtScale = v => (Math.round(v * 100) / 100).toFixed(2) + '×';
    // 최소/최대 입력칸을 읽어 유효한 범위로 보정
    const readRange = () => {
      let mn = parseFloat(inpGlbScaleMin && inpGlbScaleMin.value);
      let mx = parseFloat(inpGlbScaleMax && inpGlbScaleMax.value);
      if (!(mn > 0)) mn = 0.01;
      if (!(mx > mn)) mx = mn + 0.01;
      return { mn, mx };
    };
    const applyRangeToSlider = () => {
      const { mn, mx } = readRange();
      inpGlbScale.min = mn; inpGlbScale.max = mx;
      return { mn, mx };
    };
    // 배율 v 적용. src 별로 입력칸 갱신 방식이 다름.
    //  - 'num'  : 수치 직접 입력 → 범위를 벗어나면 슬라이더 범위를 넓혀 따라가게 함
    //  - 그 외  : 슬라이더/범위 편집 → 현재 범위로 클램프
    const setGlbScale = (v, src) => {
      v = parseFloat(v); if (!(v > 0)) v = 1;
      let { mn, mx } = applyRangeToSlider();
      if (v < mn) { if (src === 'num' && inpGlbScaleMin) { inpGlbScaleMin.value = v; mn = v; } else v = mn; }
      if (v > mx) { if (src === 'num' && inpGlbScaleMax) { inpGlbScaleMax.value = v; mx = v; } else v = mx; }
      applyRangeToSlider();
      glbUserScale = v;
      if (src !== 'range' && inpGlbScale)    inpGlbScale.value = v;
      if (src !== 'num'   && inpGlbScaleNum) inpGlbScaleNum.value = v;
      if (glbScaleVal) glbScaleVal.textContent = fmtScale(v);
      applyGlbScale();
      // 정지 상태면 크기 변경에 맞춰 바닥 잠김 오프셋도 다시 적용
      if (!playing && glbMesh && src !== 'init') {
        glbMesh.position.y = getTargetBaseY() + glbGroundOffset();
        requestRender();
      }
    };
    applyRangeToSlider();
    setGlbScale(parseFloat(inpGlbScale.value) || 1, 'init');
    inpGlbScale.addEventListener('input', () => setGlbScale(inpGlbScale.value, 'range'));
    if (inpGlbScaleNum) inpGlbScaleNum.addEventListener('input', () => setGlbScale(inpGlbScaleNum.value, 'num'));
    if (inpGlbScaleMin) inpGlbScaleMin.addEventListener('input', () => setGlbScale(glbUserScale, 'minmax'));
    if (inpGlbScaleMax) inpGlbScaleMax.addEventListener('input', () => setGlbScale(glbUserScale, 'minmax'));
  }

  // Shape → Custom GLB 프리셋/파일 핸들러
  if (selShapeGlbPreset) {
    selShapeGlbPreset.addEventListener('change', () => {
      loadModelFromPath(selShapeGlbPreset.value);
      const p = GLB_PHYS[selShapeGlbPreset.value];
      if (p) { inpMass.value = p.mass; inpArea.value = p.area; inpCd.value = p.cd; updateTV(); }
    });
  }
  if (btnShapeGlbFile) {
    btnShapeGlbFile.addEventListener('click', () => fileShapeGlb && fileShapeGlb.click());
  }
  if (fileShapeGlb) {
    fileShapeGlb.addEventListener('change', () => {
      const f = fileShapeGlb.files[0]; if (!f) return;
      loadLocalModelFile(f, btnShapeGlbFile);
    });
  }

  // 기존 파일 선택 버튼 → GLB/STL 직접 업로드 (assets 복사 경유)
  btnStl.addEventListener('click', () => fileStl.click());
  fileStl.addEventListener('change', () => {
    const f = fileStl.files[0]; if (!f) return;
    loadLocalModelFile(f, btnStl);
  });

  // Target mesh
  let targetMesh=null;
  // 충돌 시 판 휨(아래로 처짐) 을 위해 윗면(width × depth)에 세그먼트를 추가한다.
  // 세그먼트가 많을수록 휨이 부드럽지만 vertex 수가 늘어나므로 24×24 정도가 균형점.
  const TARGET_CFG={
    wood:    {color:0x8b5e3c,roughness:0.9,metalness:0.0,geo:()=>new THREE.BoxGeometry(20,0.6,20,24,1,24)},
    concrete:{color:0x6b7280,roughness:1.0,metalness:0.0,geo:()=>new THREE.BoxGeometry(28,1.2,28,28,1,28)},
    steel:   {color:0xb0b8c4,roughness:0.15,metalness:0.95,geo:()=>new THREE.BoxGeometry(22,0.25,22,28,1,28)},
    glass:   {color:0x93c5fd,roughness:0.05,metalness:0.1,transparent:true,opacity:0.4,geo:()=>new THREE.BoxGeometry(20,0.18,20,24,1,24)},
    brick:   {color:0xa0522d,roughness:0.95,metalness:0.0,geo:()=>new THREE.BoxGeometry(18,4,8,18,2,8)},
  };
  let targetSupports=null; // 지지대 그룹 (띄우기 토글 시)
  function clearTargetSupports() {
    if(!targetSupports)return;
    scene.remove(targetSupports);
    targetSupports.traverse(c=>{if(c.geometry)c.geometry.dispose();if(c.material)c.material.dispose();});
    targetSupports=null;
  }
  // ── 판 휨(plate bend) 상태 ──
  // 충격 시 (cx,cz) 를 중심으로 가우시안 형태의 아래쪽 처짐을 점차 누적해 적용한다.
  // 누적 적용을 위해 원본 vertex 의 Y 값을 따로 보관해 두고, 매 프레임 원본 + 최신 휨으로 다시 계산.
  let plateBaseY = null;          // 빌드 시 원본 vertex Y (Float32Array)
  let bendActive = false;         // 휨 애니메이션 진행 중
  let bendTargetDepth = 0;        // 목표 최종 처짐량(시각 단위)
  let bendCurDepth   = 0;         // 현재 적용된 처짐량
  let bendCenter     = {x:0,z:0}; // 휨 중심 (XZ)
  let bendSigma      = 4;         // 가우시안 반치폭 (시각 단위)

  function resetPlateBend() {
    bendActive = false; bendCurDepth = 0; bendTargetDepth = 0;
    if (targetMesh && plateBaseY) {
      const pos = targetMesh.geometry.attributes.position;
      for (let i=0;i<pos.count;i++) pos.setY(i, plateBaseY[i]);
      pos.needsUpdate = true; targetMesh.geometry.computeVertexNormals();
      requestRender();
    }
  }

  // 현재 휨 깊이(0..bendTargetDepth)를 vertex Y 에 반영. 윗면 vertex 만 아래로 처짐.
  // (윗면 = 원본 Y 가 targetMesh 박스 절반에 가까운 vertex)
  function applyPlateBendToVertices() {
    if (!targetMesh || !plateBaseY) return;
    const geo = targetMesh.geometry;
    const pos = geo.attributes.position;
    const params = geo.parameters || {width:20,height:0.6,depth:20};
    const halfH = (params.height||0.6) * 0.5;
    // mesh 좌표계에서 휨 중심 (월드 → 로컬은 mesh.position 만 빼면 됨; 회전 없음)
    const cx = bendCenter.x - targetMesh.position.x;
    const cz = bendCenter.z - targetMesh.position.z;
    const twoSig2 = 2 * bendSigma * bendSigma;
    for (let i=0; i<pos.count; i++) {
      const baseY = plateBaseY[i];
      // 윗면 vertex (y ≈ +halfH) 만 변형. 아래쪽은 그대로 두어 두께 유지.
      const topness = (baseY + halfH) / Math.max(0.0001, params.height);  // 0..1
      if (topness < 0.5) { pos.setY(i, baseY); continue; }
      const x = pos.getX(i), z = pos.getZ(i);
      const r2 = (x-cx)*(x-cx) + (z-cz)*(z-cz);
      const w = Math.exp(-r2 / twoSig2);
      pos.setY(i, baseY - bendCurDepth * w * topness);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  function startPlateBend(impactX, impactZ, impactSpeed) {
    if (!features.bend || !targetMesh) return;
    const t = targetObjects[+selTarget.value]; if (!t) return;
    const ys = Math.max(1e6, t.yieldStrength || 1e7);          // Pa
    const thickness = Math.max(0.001, t.thickness || 0.05);    // m (실제 두께)
    const m = Math.max(0.01, +inpMass.value || 1);
    const ke = 0.5 * m * impactSpeed * impactSpeed;            // J
    // 휨 깊이 = 충격에너지를 항복강도×두께^2 로 나눈 비율 — 강하고 두꺼울수록 적게 휨
    // 0.5 는 시각화용 스케일, 슬라이더로 ±조정.
    const slider = document.getElementById('inp-bend-strength');
    const userK = slider ? Math.max(0.1, +slider.value || 1) : 1;
    const raw = (ke / (ys * thickness * thickness * 100)) * 0.5 * userK;
    // 시각 단위(유닛). 박스 두께 절반 이상으로는 안 처지게 클램프.
    const params = targetMesh.geometry.parameters || {height:0.6,width:20,depth:20};
    const maxDepth = (params.height || 0.6) * 0.45;
    bendTargetDepth = Math.min(maxDepth, Math.max(0.05, raw));
    bendCenter = { x: impactX, z: impactZ };
    bendSigma = Math.min(params.width, params.depth) * 0.18;
    bendActive = true;
  }

  function stepPlateBend(dt) {
    if (!bendActive) return;
    // 부드럽게 목표 처짐량으로 수렴 (~0.6s)
    bendCurDepth += (bendTargetDepth - bendCurDepth) * dampK(6, dt);
    applyPlateBendToVertices();
    if (Math.abs(bendTargetDepth - bendCurDepth) < bendTargetDepth * 0.01) {
      bendCurDepth = bendTargetDepth;
      applyPlateBendToVertices();
      bendActive = false;
    }
    requestRender();
  }

  function rebuildTargetMesh() {
    if(targetMesh){scene.remove(targetMesh);targetMesh.geometry.dispose();targetMesh.material.dispose();targetMesh=null;}
    plateBaseY = null; bendActive = false; bendCurDepth = 0;
    clearTargetSupports();
    const t=targetObjects[+selTarget.value]; if(!t)return;
    const cfg=TARGET_CFG[t.material]||TARGET_CFG.concrete;
    const geo=cfg.geo();
    targetMesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({
      color:cfg.color,roughness:cfg.roughness,metalness:cfg.metalness,
      transparent:cfg.transparent||false,opacity:cfg.opacity||1.0,
    }));
    const baseY=getTargetBaseY();
    targetMesh.position.y=baseY; targetMesh.receiveShadow=true; scene.add(targetMesh);
    // 원본 vertex Y 보관 — 휨 적용/원복 시 기준이 됨
    {
      const pos = targetMesh.geometry.attributes.position;
      plateBaseY = new Float32Array(pos.count);
      for (let i=0;i<pos.count;i++) plateBaseY[i] = pos.getY(i);
    }
    // 띄우기 ON이면 네 모서리에 지지대 기둥을 세워 바닥과 연결
    if(features.elevate && baseY>0.01){
      targetSupports=new THREE.Group();
      const gp=geo.parameters||{width:20,height:0.6,depth:20};
      const halfH=(gp.height||0.6)*0.5;
      const px=(gp.width||20)*0.42, pz=(gp.depth||20)*0.42;
      const postH=baseY-halfH>0?baseY-halfH:baseY*0.5;
      const postMat=new THREE.MeshStandardMaterial({color:0x4b5563,roughness:0.7,metalness:0.4});
      [[px,pz],[-px,pz],[px,-pz],[-px,-pz]].forEach(([x,z])=>{
        const post=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,postH,12),postMat);
        post.position.set(x,postH*0.5,z); post.castShadow=true; post.receiveShadow=true;
        targetSupports.add(post);
      });
      scene.add(targetSupports);
    }
    requestRender();
  }
  rebuildTargetMesh();
  selTarget.addEventListener('change',()=>{rebuildTargetMesh();syncTargetFields();});
  // 띄울 높이 슬라이더 → 타겟/지지대 재배치 (정지 상태면 물체 기준 높이도 갱신)
  {
    const inpElevate=document.getElementById('inp-elevate');
    if(inpElevate){
      inpElevate.addEventListener('input',()=>{
        if(!features.elevate)return;
        rebuildTargetMesh();
        if(!playing && fallingMesh){
          const by=getTargetBaseY();
          fallingMesh.position.y=by;
          if(glbMesh) glbMesh.position.y=by+glbGroundOffset();
        }
        requestRender();
      });
    }
  }

  // [F6] Material tooltip (toggleable)
  selTarget.addEventListener('mousemove',e=>{
    if(!features.tooltip){matTooltip.style.display='none';return;}
    const t=targetObjects[+selTarget.value]; if(!t)return;
    ttName.textContent=t.name;
    ttYs.textContent=`${t.yieldStrength.toFixed(0)} Pa`;
    ttTh.textContent=`${t.thickness.toFixed(3)} m`;
    ttFm.textContent=t.fractureMode||'—';
    matTooltip.style.display='block';
    const tw=matTooltip.offsetWidth, th=matTooltip.offsetHeight;
    matTooltip.style.left=(e.clientX+tw+12>window.innerWidth?e.clientX-tw-6:e.clientX+12)+'px';
    matTooltip.style.top =(e.clientY+th+6>window.innerHeight?e.clientY-th-6:e.clientY+6)+'px';
  });
  selTarget.addEventListener('mouseleave',()=>{matTooltip.style.display='none';});

  // [F2] Crater (toggleable)
  // 버팀 시 공 바운스 시작 (충돌 속도의 일부를 반발로)
  function startBounce() {
    const vi = simResult ? Math.abs(simResult.impactVelocity) : 5;
    bounceVel = Math.min(vi*0.45, 25);   // 반발 속도 (과하지 않게 제한)
    bounceY   = fallingMesh ? fallingMesh.position.y : 1;
    bouncing  = true;
    // 버틸 때 판이 아래로 부드럽게 휘어짐 (토글 ON 일 때만)
    if (features.bend && targetMesh && fallingMesh) {
      startPlateBend(fallingMesh.position.x, fallingMesh.position.z, vi);
    }
  }

  // 표면온도 한계 초과 시 열 파괴: 'burnup'(타서 소멸) 또는 'disintegrate'(공중 분해).
  // 낙하 도중 한 번만 발동 → 물체를 숨기고 그 자리에서 잔해/불티를 흩뿌리고 시뮬 종료.
  let thermalDebris = null;   // 공중 분해 잔해 그룹 (정리용)
  function clearThermalFailure(){
    thermalFailed=false; maxSurfaceTemp=0;
    if(thermalDebris){scene.remove(thermalDebris);thermalDebris.traverse(c=>{if(c.isMesh&&c.geometry!==FRAG_GEO_SHARED&&c.geometry)c.geometry.dispose();});thermalDebris=null;}
  }
  function triggerThermalFailure(frame, yVisual){
    thermalFailed = true;
    impacted = true;          // 낙하 동기화 중단
    const x = (frame.px||0)*0.05, z = (frame.pz||0)*0.05, y = yVisual;
    if(fallingMesh) fallingMesh.visible=false;
    if(glbMesh) glbMesh.visible=false;
    const mode = heatFailMode();
    // 불티/연기 파티클 (두 모드 공통, 분해 쪽이 더 많음)
    const n = mode==='disintegrate'?120:80;
    const pos=new Float32Array(n*3), vel=new Float32Array(n*3);
    for(let i=0;i<n;i++){
      pos[i*3]=x+(Math.random()-0.5)*2; pos[i*3+1]=y+(Math.random()-0.5)*2; pos[i*3+2]=z+(Math.random()-0.5)*2;
      vel[i*3]=(Math.random()-0.5)*0.6; vel[i*3+1]=(Math.random()-0.5)*0.6-0.1; vel[i*3+2]=(Math.random()-0.5)*0.6;
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const emberMat=new THREE.PointsMaterial({color:mode==='burnup'?0xff7a1a:0xffd27a,size:0.45,transparent:true,opacity:0.95});
    if(dustParticles){scene.remove(dustParticles);dustParticles.geometry.dispose();dustParticles.material.dispose();}
    dustParticles=new THREE.Points(geo,emberMat); dustParticles._vel=vel; scene.add(dustParticles);
    // 공중 분해: 큰 조각 몇 개가 흩어짐
    if(mode==='disintegrate'){
      if(thermalDebris){scene.remove(thermalDebris);}
      thermalDebris=new THREE.Group();
      const dm=new THREE.MeshStandardMaterial({color:0x555a61,roughness:0.7,metalness:0.3});
      for(let i=0;i<5;i++){
        const m=new THREE.Mesh(FRAG_GEO_SHARED,dm);
        m.position.set(x+(Math.random()-0.5)*3,y+(Math.random()-0.5)*3,z+(Math.random()-0.5)*3);
        m.scale.setScalar(0.8+Math.random()*1.2); m.castShadow=true;
        thermalDebris.add(m);
      }
      scene.add(thermalDebris);
    }
    atmBadge.textContent = mode==='burnup' ? 'BURNED UP (소멸)' : 'DISINTEGRATED (공중 분해)';
    atmBadge.style.color = '#f0883e';
    playing=false;            // 시뮬 종료
    emitResults(true);        // 결과창(열 파괴)
    requestRender();
  }

  // 휨 강도 슬라이더 — 진행 중이면 즉시 목표값 갱신
  {
    const sl = document.getElementById('inp-bend-strength');
    const lbl = document.getElementById('bend-strength-val');
    if (sl) {
      const fmt = v => (Math.round(v*10)/10).toFixed(1) + '×';
      if (lbl) lbl.textContent = fmt(+sl.value || 1);
      sl.addEventListener('input', () => {
        if (lbl) lbl.textContent = fmt(+sl.value || 1);
        // 이미 휘어 있는 경우 목표값 재계산
        if (bendCurDepth > 0 && simResult && fallingMesh) {
          startPlateBend(bendCenter.x, bendCenter.z, Math.abs(simResult.impactVelocity || 5));
        }
      });
    }
  }

  function createCrater(radius) {
    if(craterGroup){scene.remove(craterGroup);craterGroup.children.forEach(m=>{m.geometry.dispose();m.material.dispose();});craterGroup=null;}
    if(!features.crater)return;
    craterGroup=new THREE.Group();
    const r=Math.max(0.5,radius)*2.5;
    const floor=new THREE.Mesh(new THREE.CircleGeometry(r,32),
      new THREE.MeshStandardMaterial({color:0x1a1a1a,roughness:1}));
    floor.rotation.x=-Math.PI/2; floor.position.y=0.02; craterGroup.add(floor);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(r,r*0.18,8,32),
      new THREE.MeshStandardMaterial({color:0x4a4040,roughness:0.9}));
    rim.rotation.x=-Math.PI/2; rim.position.y=0.05; craterGroup.add(rim);
    scene.add(craterGroup); requestRender();
  }

  // [F5] Trajectory line (toggleable)
  function buildTrajLine(result) {
    if(trajLine){scene.remove(trajLine);trajLine.geometry.dispose();trajLine.material.dispose();trajLine=null;}
    if(!result||!result.frames)return;
    const frames=result.frames, visualH=Math.min(currentH0,1500);
    const positions=new Float32Array(frames.length*3);
    for(let i=0;i<frames.length;i++){
      const f=frames[i], pct=Math.max(0,Math.min(1,f.h/currentH0));
      positions[i*3]=(f.px||0)*0.05; positions[i*3+1]=pct*visualH; positions[i*3+2]=(f.pz||0)*0.05;
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
    trajLine=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0x58a6ff,transparent:true,opacity:0.6}));
    if(showTraj)scene.add(trajLine);
    requestRender();
  }

  // [F14] Fragment system — InstancedMesh or individual meshes
  const FRAG_GEO_SHARED = new THREE.IcosahedronGeometry(0.6,0);
  function clearFragments() {
    if(fragInstanced){scene.remove(fragInstanced);fragInstanced.material.dispose();fragInstanced=null;}
    fragMeshes.forEach(m=>{scene.remove(m);m.geometry.dispose();m.material.dispose();});
    fragMeshes=[];jsFragments=[];
    if(dustParticles){scene.remove(dustParticles);dustParticles.geometry.dispose();dustParticles.material.dispose();dustParticles=null;}
    fracturing=false;
  }

  function spawnFragments(fractureData,targetMaterial) {
    clearFragments();
    if(!fractureData||fractureData.mode==='none')return;
    const cfg=TARGET_CFG[targetMaterial]||TARGET_CFG.concrete;
    if(fractureData.mode==='deform'&&targetMesh){
      const pos=targetMesh.geometry.attributes.position;
      fractureData.deformations.forEach(d=>{
        if(d.index<pos.count){
          pos.setX(d.index,pos.getX(d.index)+d.dx);
          pos.setY(d.index,pos.getY(d.index)+d.dy);
          pos.setZ(d.index,pos.getZ(d.index)+d.dz);
        }
      });
      pos.needsUpdate=true; targetMesh.geometry.computeVertexNormals();
    } else {
      if(targetMesh)targetMesh.visible=false;
      const frags=fractureData.fragments||[];
      // build JS physics state
      frags.forEach(f=>{
        jsFragments.push({
          pos:[f.position[0],f.position[1],f.position[2]],
          vel:[(f.velocity&&f.velocity[0])||0,(f.velocity&&f.velocity[1])||0,(f.velocity&&f.velocity[2])||0],
          ang:[(Math.random()-0.5)*8,(Math.random()-0.5)*8,(Math.random()-0.5)*8],
          quat:[0,0,0,1], active:true, scale:0.5+Math.random()*1.0,
        });
      });
      // 'split'(금속 3조각 등)은 큰 덩어리라 인스턴싱(공용 작은 지오) 대신 개별 메시로 그린다.
      useInstanced = features.instfrag && fractureData.mode!=='split';
      if(useInstanced && jsFragments.length>0){
        // [F14] single draw call
        const mat=new THREE.MeshStandardMaterial({color:cfg.color,roughness:0.8,metalness:cfg.metalness||0.1});
        fragInstanced=new THREE.InstancedMesh(FRAG_GEO_SHARED,mat,jsFragments.length);
        fragInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        fragInstanced.castShadow=true;
        jsFragments.forEach((f,i)=>{
          _p.set(f.pos[0],f.pos[1],f.pos[2]); _q.set(0,0,0,1); _s.setScalar(f.scale);
          fragInstanced.setMatrixAt(i, _m4.compose(_p,_q,_s));
        });
        fragInstanced.instanceMatrix.needsUpdate=true;
        scene.add(fragInstanced);
      } else if(frags.length>0){
        const fragMat=new THREE.MeshStandardMaterial({color:cfg.color,roughness:0.8,metalness:cfg.metalness||0.1,side:THREE.DoubleSide});
        frags.forEach((f,i)=>{
          const geo=new THREE.BufferGeometry();
          geo.setAttribute('position',new THREE.Float32BufferAttribute(f.vertices,3));
          if(f.indices&&f.indices.length>0)geo.setIndex(new THREE.Uint32BufferAttribute(f.indices,1));
          geo.computeVertexNormals();
          const mesh=new THREE.Mesh(geo,fragMat);
          mesh.position.set(...f.position); mesh.castShadow=true;
          scene.add(mesh); fragMeshes.push(mesh);
        });
      }
    }
    if(fractureData.dustParticleCount>0){
      const n=Math.min(fractureData.dustParticleCount,300);
      const pos=new Float32Array(n*3), vel=new Float32Array(n*3);
      for(let i=0;i<n;i++){
        pos[i*3]=(Math.random()-0.5)*10; pos[i*3+1]=Math.random()*4; pos[i*3+2]=(Math.random()-0.5)*10;
        vel[i*3]=(Math.random()-0.5)*0.15; vel[i*3+1]=Math.random()*0.12+0.02; vel[i*3+2]=(Math.random()-0.5)*0.15;
      }
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
      dustParticles=new THREE.Points(geo,new THREE.PointsMaterial({color:0xd4b896,size:0.15,transparent:true,opacity:0.9}));
      dustParticles._vel=vel; scene.add(dustParticles);
    }
    fracturing=jsFragments.length>0; requestRender();
  }

  function stepFragmentsJS(dt,g) {
    const n=jsFragments.length;
    let active=0;

    // 1단계: 중력 적분 + 지면 충돌
    for(let i=0;i<n;i++){
      const f=jsFragments[i]; if(!f.active)continue;
      f.vel[1]-=g*dt;
      f.pos[0]+=f.vel[0]*dt; f.pos[1]+=f.vel[1]*dt; f.pos[2]+=f.vel[2]*dt;
      const ground=-0.5+f.scale*0.6;
      if(f.pos[1]<ground){
        f.pos[1]=ground; f.vel[1]*=-0.4; f.vel[0]*=0.7; f.vel[2]*=0.7;
        f.ang[0]*=0.55; f.ang[2]*=0.55;
        if(Math.abs(f.vel[1])<0.08)f.active=false;
      }
    }

    // 2단계: 파편끼리 구(sphere) 충돌 판정 (toggleable: feat-fragcol)
    if(features.fragcol && n>1){
      for(let i=0;i<n-1;i++){
        const a=jsFragments[i]; if(!a.active)continue;
        const rA=a.scale*0.6; // IcosahedronGeometry 반지름 × 스케일
        for(let j=i+1;j<n;j++){
          const b=jsFragments[j]; if(!b.active)continue;
          const rB=b.scale*0.6;
          const dx=b.pos[0]-a.pos[0], dy=b.pos[1]-a.pos[1], dz=b.pos[2]-a.pos[2];
          const dist2=dx*dx+dy*dy+dz*dz;
          const minD=rA+rB;
          if(dist2<minD*minD && dist2>1e-9){
            const dist=Math.sqrt(dist2);
            // 충돌 법선 (a→b)
            const nx=dx/dist, ny=dy/dist, nz=dz/dist;
            // 겹침 해소 (절반씩 밀어냄)
            const overlap=(minD-dist)*0.5;
            a.pos[0]-=nx*overlap; a.pos[1]-=ny*overlap; a.pos[2]-=nz*overlap;
            b.pos[0]+=nx*overlap; b.pos[1]+=ny*overlap; b.pos[2]+=nz*overlap;
            // 상대속도
            const dvx=b.vel[0]-a.vel[0], dvy=b.vel[1]-a.vel[1], dvz=b.vel[2]-a.vel[2];
            const dvn=dvx*nx+dvy*ny+dvz*nz;
            if(dvn<0){ // 접근 중일 때만 충격량 적용
              const restitution=0.45;
              const imp=(1+restitution)*dvn*0.5; // 같은 질량 가정
              a.vel[0]+=imp*nx; a.vel[1]+=imp*ny; a.vel[2]+=imp*nz;
              b.vel[0]-=imp*nx; b.vel[1]-=imp*ny; b.vel[2]-=imp*nz;
              // 충돌로 회전속도 살짝 교란
              a.ang[0]+=(Math.random()-0.5)*2; b.ang[2]+=(Math.random()-0.5)*2;
            }
          }
        }
      }
    }

    // 3단계: 쿼터니언 회전 업데이트 + 메시 동기화
    for(let i=0;i<n;i++){
      const f=jsFragments[i]; if(!f.active)continue;
      const ax=f.ang[0]*dt,ay=f.ang[1]*dt,az=f.ang[2]*dt;
      const qx=f.quat[0],qy=f.quat[1],qz=f.quat[2],qw=f.quat[3];
      f.quat[0]=qx+(qw*ax-qz*ay+qy*az)*0.5;
      f.quat[1]=qy+(qz*ax+qw*ay-qx*az)*0.5;
      f.quat[2]=qz+(-qy*ax+qx*ay+qw*az)*0.5;
      f.quat[3]=qw+(-qx*ax-qy*ay-qz*az)*0.5;
      const len=Math.hypot(f.quat[0],f.quat[1],f.quat[2],f.quat[3]);
      if(len>0){f.quat[0]/=len;f.quat[1]/=len;f.quat[2]/=len;f.quat[3]/=len;}
      if(useInstanced&&fragInstanced){
        _p.set(f.pos[0],f.pos[1],f.pos[2]); _q.set(f.quat[0],f.quat[1],f.quat[2],f.quat[3]); _s.setScalar(f.scale);
        fragInstanced.setMatrixAt(i, _m4.compose(_p,_q,_s));
      } else {
        const mesh=fragMeshes[i];
        if(mesh){mesh.position.set(f.pos[0],f.pos[1],f.pos[2]);mesh.quaternion.set(f.quat[0],f.quat[1],f.quat[2],f.quat[3]);}
      }
      active++;
    }
    if(useInstanced&&fragInstanced)fragInstanced.instanceMatrix.needsUpdate=true;
    return active;
  }

  // [F11] Multi-object
  function clearMoGlb(o) {
    if (!o.glbMesh) return;
    scene.remove(o.glbMesh);
    o.glbMesh.traverse(c=>{ if(c.geometry)c.geometry.dispose(); if(c.material)c.material.dispose(); });
    o.glbMesh = null;
  }
  function clearMultiObjects() {
    moObjects.forEach(o=>{
      clearMoGlb(o);
      if(o.mesh){scene.remove(o.mesh);o.mesh.geometry.dispose();o.mesh.material.dispose();}
    });
    moObjects=[];
  }
  function renderMoList() {
    moList.innerHTML='';
    btnAddObj.style.display=moObjects.length>=3?'none':'block';
    moObjects.forEach((o,i)=>{
      const hex='#'+MO_COLORS[i].toString(16).padStart(6,'0');
      const div=document.createElement('div'); div.className='mo-item';
      const glbOpts = [
        ['','— 없음 (구 형상) —'],
        ['assets/Classic_table.glb','Classic_table.glb'],
        ['assets/screwdriver.glb','screwdriver.glb'],
        ['assets/Hyperbolic.glb','Hyperbolic.glb'],
      ].map(([v,t])=>`<option value="${v}"${o.glbPath===v?' selected':''}>${t}</option>`).join('');
      div.innerHTML=
        `<div class="mo-item-hdr">`+
        `<span class="mo-dot" style="background:${hex}"></span>`+
        `<span class="mo-label">Object ${i+2}</span>`+
        `<button class="mo-remove" data-i="${i}">×</button></div>`+
        `<div class="field"><label>3D 모델 (GLB)</label><select class="mo-glb" data-i="${i}">${glbOpts}</select></div>`+
        `<div class="row2">`+
        `<div class="field"><label>Mass <span>kg</span></label><input type="number" class="mo-f" data-k="mass" data-i="${i}" value="${o.mass}" min="0.01" step="0.1"></div>`+
        `<div class="field"><label>Area <span>m²</span></label><input type="number" class="mo-f" data-k="area" data-i="${i}" value="${o.area}" min="0.0001" step="0.001"></div>`+
        `</div>`+
        `<div class="field"><label>Cd</label><input type="number" class="mo-f" data-k="cd" data-i="${i}" value="${o.cd}" min="0.01" step="0.01"></div>`;
      moList.appendChild(div);
    });
    moList.querySelectorAll('.mo-remove').forEach(b=>b.addEventListener('click',()=>{
      const i=+b.dataset.i; const o=moObjects[i];
      if(o){ clearMoGlb(o); if(o.mesh){scene.remove(o.mesh);o.mesh.geometry.dispose();o.mesh.material.dispose();} }
      moObjects.splice(i,1); renderMoList(); requestRender();
    }));
    moList.querySelectorAll('.mo-f').forEach(inp=>inp.addEventListener('input',()=>{
      moObjects[+inp.dataset.i][inp.dataset.k]=+inp.value;
    }));
    moList.querySelectorAll('.mo-glb').forEach(sel=>sel.addEventListener('change',()=>{
      const i=+sel.dataset.i; const o=moObjects[i]; if(!o)return;
      o.glbPath=sel.value;
      clearMoGlb(o);
      if(!sel.value){ o.mesh.visible=true; requestRender(); return; }
      if(!gltfLoader){ console.warn('[GLB] loader unavailable'); return; }
      gltfLoader.load(sel.value, gltf=>{
        const root=gltf.scene;
        const box=new THREE.Box3().setFromObject(root);
        const sz=new THREE.Vector3(); box.getSize(sz);
        const maxS=Math.max(sz.x,sz.y,sz.z)||1;
        root.scale.setScalar(2/maxS);
        const ctr=new THREE.Vector3(); box.getCenter(ctr);
        root.position.sub(ctr.multiplyScalar(2/maxS));
        root.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true;}});
        o.glbMesh=root; o.mesh.visible=false;
        scene.add(root); requestRender();
        // 물리값 자동 설정
        const p=GLB_PHYS[sel.value];
        if(p){ o.mass=p.mass; o.area=p.area; o.cd=p.cd; renderMoList(); }
      }, undefined, err=>console.warn('[MO-GLB] failed:',err));
    }));
  }
  btnAddObj.addEventListener('click',()=>{
    if(moObjects.length>=3)return;
    const i=moObjects.length;
    const mat=new THREE.MeshStandardMaterial({color:MO_COLORS[i],roughness:0.35,metalness:0.3});
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,20,20),mat);
    mesh.castShadow=true; mesh.visible=false; scene.add(mesh);
    moObjects.push({mass:2*(i+1),area:0.02,cd:0.47,result:null,mesh,color:MO_COLORS[i],glbMesh:null,glbPath:''});
    renderMoList(); requestRender();
  });

  // ── Data table ──
  let rowByTime=new Map();
  function buildTable(result) {
    rowByTime=new Map();
    const frames=result.frames, vt=result.terminalVelocity;
    const hasDrift=features.wind?(Math.abs(+inpWindX.value)>0.01||Math.abs(+inpWindZ.value)>0.01):false;
    const showDrift=hasDrift||features.projectile||features.magnus;
    const STEP=0.1; let nextT=0,rowCount=0;
    const html=[];
    for(let i=0;i<frames.length;i++){
      const f=frames[i]; if(f.t<nextT-0.001)continue;
      nextT=Math.round((f.t+STEP)*10)/10;
      const pct=vt>0?Math.min(999,Math.abs(f.v)/vt*100):0;
      const barW=Math.min(80,pct*0.8);
      const barColor=pct<50?'#58a6ff':pct<90?'#f0a500':'#f85149';
      const atmColor=ATM_COLOR[f.atm]||'#6e7681';
      const driftCols=showDrift
        ?`<td>${(f.px||0).toFixed(1)}</td><td>${(f.pz||0).toFixed(1)}</td>`
        :`<td style="color:#6e7681">—</td><td style="color:#6e7681">—</td>`;
      const heatCols=features.heat
        ?`<td style="color:#f97316">${Math.round(f.T_surface||0)}</td><td style="color:#f85149">${((f.heatFlux||0)/1000).toFixed(2)}</td>`
        :``;
      html.push(`<tr data-t="${f.t.toFixed(1)}">`+
        `<td>${f.t.toFixed(1)}</td><td>${f.h.toFixed(1)}</td>`+
        `<td>${Math.abs(f.v).toFixed(2)}</td>`+
        `<td>${pct.toFixed(1)}%<span class="pct-bar" style="width:${barW}px;background:${barColor}"></span></td>`+
        `<td>${f.a.toFixed(3)}</td><td>${(f.rho||1.225).toFixed(5)}</td>`+
        `<td style="color:${atmColor}">${f.atm||'Troposphere'}</td>`+
        driftCols+heatCols+`</tr>`);
      rowCount++;
    }
    tblBody.innerHTML=html.join('');
    for(const tr of tblBody.children)rowByTime.set(tr.dataset.t,tr);
    tblPlaceholder.style.display='none'; dataTable.style.display='table';
    tblInfo.textContent=`${rowCount} rows  ·  terminal vel. ${vt.toFixed(2)} m/s`;
  }

  let lastHighlightedRow=null;
  function highlightTable(ph){
    if(!simResult||!rowByTime.size)return;
    const key=(Math.floor(ph*10)/10).toFixed(1), row=rowByTime.get(key);
    if(!row||row===lastHighlightedRow)return;
    if(lastHighlightedRow)lastHighlightedRow.classList.remove('highlight');
    row.classList.add('highlight'); row.scrollIntoView({block:'nearest'}); lastHighlightedRow=row;
  }

  // ── Graph ──
  function getDatasets(result,alpha,upTo) {
    const a=alpha??1;
    const c=(hex,al)=>{const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return`rgba(${r},${g},${b},${al})`;};
    const frames=upTo!=null?result.frames.filter(f=>f.t<=upTo):result.frames;
    const sf=us().speedF, sl=us().speedL, df=us().distF, dl=us().distL;
    if(activeTab==='velocity')return[
      {label:`Velocity (${sl})`,color:c('#58a6ff',a),data:frames.map(f=>({x:f.t,y:Math.abs(f.v)*sf}))},
      {label:`Terminal Vel.`,color:c('#f0a500',a),dashed:true,data:frames.map(f=>({x:f.t,y:result.terminalVelocity*sf}))},
    ];
    if(activeTab==='height')return[{label:`Height (${dl})`,color:c('#3fb950',a),data:frames.map(f=>({x:f.t,y:f.h*df}))}];
    if(activeTab==='acceleration')return[{label:'Acceleration (m/s²)',color:c('#f85149',a),data:frames.map(f=>({x:f.t,y:f.a}))}];
    return[{label:'Air Density (kg/m³)',color:c('#a371f7',a),data:frames.map(f=>({x:f.t,y:f.rho||0}))}];
  }

  function drawGraph(tab) {
    if(!simResult)return;
    if(tab)activeTab=tab;
    const dpr=Math.min(window.devicePixelRatio||1,1.75);
    const W=graphCanvas.offsetWidth, H=graphCanvas.offsetHeight; if(!W||!H)return;
    const needW=Math.round(W*dpr), needH=Math.round(H*dpr);
    if(graphCanvas.width!==needW||graphCanvas.height!==needH){graphCanvas.width=needW;graphCanvas.height=needH;}
    const ctx=graphCanvas.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle='#0d1117'; ctx.fillRect(0,0,W,H);
    const pad={l:46,r:14,t:12,b:28}, gW=W-pad.l-pad.r, gH=H-pad.t-pad.b;
    const cutoff=realtimeGraph&&playing?playHead:null;
    const mainDs=getDatasets(simResult,1,cutoff);
    const cmpDs=compareResult?getDatasets(compareResult,0.35):[];
    const sf=us().speedF;
    const moDs=features.multiobj&&activeTab==='velocity'
      ?moObjects.filter(o=>o.result).map((o,i)=>({
          label:`Obj ${i+2}`, color:'#'+MO_COLORS[i].toString(16).padStart(6,'0'),
          data:(cutoff!=null?o.result.frames.filter(f=>f.t<=cutoff):o.result.frames).map(f=>({x:f.t,y:Math.abs(f.v)*sf})),
        })):[];
    const allDs=[...mainDs,...cmpDs,...moDs];
    const allFrames=[...simResult.frames,...(compareResult?compareResult.frames:[]),
      ...moObjects.flatMap(o=>o.result?o.result.frames:[])];
    const minX=allFrames[0].t; let maxX=0, maxY=0;
    for(const f of allFrames)if(f.t>maxX)maxX=f.t;
    for(const d of allDs)for(const p of d.data)if(p.y>maxY)maxY=p.y;
    maxY=maxY*1.08||1;
    const px=x=>pad.l+((x-minX)/(maxX-minX||1))*gW;
    const py=y=>pad.t+gH-(y/maxY)*gH;
    ctx.strokeStyle='#21262d'; ctx.lineWidth=1;
    for(let i=0;i<=5;i++){
      const y=pad.t+gH*(i/5);
      ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(pad.l+gW,y);ctx.stroke();
      ctx.fillStyle='#6e7681';ctx.font='9px Consolas';ctx.textAlign='right';
      ctx.fillText((maxY*(1-i/5)).toFixed(2),pad.l-3,y+3);
    }
    for(let i=0;i<=4;i++){
      const x=pad.l+gW*(i/4);
      ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,pad.t+gH);ctx.stroke();
      ctx.fillStyle='#6e7681';ctx.font='9px Consolas';ctx.textAlign='center';
      ctx.fillText((minX+(maxX-minX)*(i/4)).toFixed(1)+'s',x,pad.t+gH+14);
    }
    allDs.forEach(ds=>{
      ctx.strokeStyle=ds.color; ctx.lineWidth=ds.dashed?1.5:2;
      ctx.setLineDash(ds.dashed?[5,4]:[]);
      ctx.beginPath();
      ds.data.forEach((p,i)=>i===0?ctx.moveTo(px(p.x),py(p.y)):ctx.lineTo(px(p.x),py(p.y)));
      ctx.stroke(); ctx.setLineDash([]);
    });
    if(playHead>0){
      ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(px(playHead),pad.t);ctx.lineTo(px(playHead),pad.t+gH);ctx.stroke();
    }
    const legendItems=mainDs.map(ds=>`<div class="leg-item"><div class="leg-dot" style="background:${ds.color}"></div>${ds.label}</div>`);
    if(compareResult)legendItems.push(`<div class="leg-item"><div class="leg-dashed"></div>REF</div>`);
    moDs.forEach(ds=>legendItems.push(`<div class="leg-item"><div class="leg-dot" style="background:${ds.color}"></div>${ds.label}</div>`));
    graphLegend.innerHTML=legendItems.join('');
  }

  document.querySelectorAll('.tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      const tb=tab.dataset.tab;
      if(tb==='history'){
        chartArea.style.display='none'; historyArea.style.display='block'; renderHistoryList();
      } else {
        chartArea.style.display='flex'; historyArea.style.display='none';
        activeTab=tb; if(simResult)drawGraph(activeTab);
      }
    });
  });

  // [F3] Reference compare
  btnCompare.addEventListener('click',()=>{
    if(!simResult)return;
    if(compareResult){compareResult=null;cmpBadge.style.display='none';btnCompare.classList.remove('active');}
    else{compareResult=simResult;cmpBadge.style.display='block';btnCompare.classList.add('active');}
    drawGraph(activeTab);
  });

  // [F5] Trajectory toggle (button keeps in sync with checkbox)
  btnTraj.addEventListener('click',()=>{
    showTraj=!showTraj; features.traj=showTraj;
    const cb=$('feat-traj'); if(cb)cb.checked=showTraj;
    btnTraj.classList.toggle('active',showTraj);
    if(trajLine){showTraj?scene.add(trajLine):scene.remove(trajLine);requestRender();}
  });

  // [F15] REC button
  btnRecord.addEventListener('click',()=>{
    if(!features.record){
      features.record=true;
      const cb=$('feat-record');
      if(cb){cb.checked=true;$('body-record').classList.remove('collapsed');}
    }
    recording=!recording;
    btnRecord.classList.toggle('rec-on',recording);
  });

  // [F4] Export
  function exportPNG(){
    if(!simResult)return;
    drawGraph(activeTab);
    const link=document.createElement('a');
    link.download=`sim-${activeTab}.png`; link.href=graphCanvas.toDataURL('image/png'); link.click();
  }
  function exportCSV(){
    if(!simResult)return;
    const showDrift=features.wind&&(Math.abs(+inpWindX.value)>0.01||Math.abs(+inpWindZ.value)>0.01)||features.projectile||features.magnus;
    const header='Time(s),Altitude(m),Velocity(m/s),Acceleration(m/s2),AirDensity(kg/m3),Atmosphere'+(showDrift?',DriftX(m),DriftZ(m)':'');
    const rows=simResult.frames.map(f=>{
      const base=`${f.t.toFixed(3)},${f.h.toFixed(2)},${Math.abs(f.v).toFixed(3)},${f.a.toFixed(4)},${(f.rho||1.225).toFixed(5)},${f.atm}`;
      return showDrift?`${base},${(f.px||0).toFixed(2)},${(f.pz||0).toFixed(2)}`:base;
    });
    const blob=new Blob([header+'\n'+rows.join('\n')],{type:'text/csv'});
    const link=document.createElement('a');
    link.download='sim-trajectory.csv'; link.href=URL.createObjectURL(blob);
    link.click(); setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }
  function collectSettings() {
    return {
      version:'2026-6-25(2)',
      mass:+inpMass.value,area:+inpArea.value,cd:+inpCd.value,
      height:+inpHeight.value,v0:+inpV0.value,gravity:+inpG.value,
      windX:+inpWindX.value,windZ:+inpWindZ.value,
      tempOffset:+inpTemp.value,humidity:+inpHumidity.value,
      shape:selShape.value,targetIdx:+selTarget.value,
      thickness:+inpThickness.value,yieldStrength:+inpYield.value,
      launchAngle:+inpLaunchAngle.value,launchAzimuth:+inpLaunchAzimuth.value,
      spinRpm:+inpSpinRpm.value,spinAxis:selSpinAxis.value,
      terrain:selTerrain.value,slope:+inpSlope.value,
      features:{...features},
    };
  }
  function saveJSON(){
    const blob=new Blob([JSON.stringify(collectSettings(),null,2)],{type:'application/json'});
    const link=document.createElement('a');
    link.download='sim-settings.json'; link.href=URL.createObjectURL(blob);
    link.click(); setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }
  function applySettings(d){
    if(d.mass!=null)inpMass.value=d.mass;
    if(d.area!=null)inpArea.value=d.area;
    if(d.cd!=null)inpCd.value=d.cd;
    if(d.height!=null)inpHeight.value=d.height;
    if(d.v0!=null)inpV0.value=d.v0;
    if(d.gravity!=null)inpG.value=d.gravity;
    if(d.windX!=null)inpWindX.value=d.windX;
    if(d.windZ!=null)inpWindZ.value=d.windZ;
    if(d.tempOffset!=null)inpTemp.value=d.tempOffset;
    if(d.humidity!=null)inpHumidity.value=d.humidity;
    if(d.shape)selShape.value=d.shape;
    if(d.targetIdx!=null){selTarget.value=d.targetIdx;syncTargetFields();}
    if(d.thickness!=null)inpThickness.value=d.thickness;
    if(d.yieldStrength!=null)inpYield.value=d.yieldStrength;
    if(d.launchAngle!=null)inpLaunchAngle.value=d.launchAngle;
    if(d.launchAzimuth!=null)inpLaunchAzimuth.value=d.launchAzimuth;
    if(d.spinRpm!=null)inpSpinRpm.value=d.spinRpm;
    if(d.spinAxis)selSpinAxis.value=d.spinAxis;
    if(d.terrain)selTerrain.value=d.terrain;
    if(d.slope!=null)inpSlope.value=d.slope;
    fieldSlope.style.display=selTerrain.value==='slope'?'block':'none';
    if(d.features){
      Object.keys(features).forEach(k=>{
        if(d.features[k]!=null){
          features[k]=d.features[k];
          const cb=$('feat-'+k); if(cb)cb.checked=d.features[k];
          const bi=FEAT_BODY[k]; if(bi)$(bi).classList.toggle('collapsed',!d.features[k]);
        }
      });
    }
    updateTV(); updateWindHint(); updateAtmHint(); updateMagnusHint();
    rebuildFallingMesh(); rebuildTargetMesh(); rebuildTerrain();
  }
  fileJson.addEventListener('change',()=>{
    const f=fileJson.files[0]; if(!f)return;
    const reader=new FileReader();
    reader.onload=e=>{try{applySettings(JSON.parse(e.target.result));}catch(err){console.error('Load JSON failed:',err);}};
    reader.readAsText(f); fileJson.value='';
  });
  btnExportPng.addEventListener('click',exportPNG);
  btnExportCsv.addEventListener('click',exportCSV);
  btnSaveJson.addEventListener('click',saveJSON);
  btnLoadJson.addEventListener('click',()=>fileJson.click());

  // Unit conversion toggle
  function updateUnitLabels() {
    const u = us();
    if(uVt) uVt.textContent = u.speedL;
    if(uVi) uVi.textContent = u.speedL;
    if(uOvH) uOvH.textContent = u.distL;
    if(uOvV) uOvV.textContent = u.speedL;
    if(simResult) {
      mVt.textContent = dispSpeed(simResult.terminalVelocity);
      mVi.textContent = dispSpeed(simResult.impactVelocity);
      drawGraph(activeTab);
    }
  }
  btnUnit && btnUnit.addEventListener('click', () => {
    unitIdx = (unitIdx + 1) % UNIT_SYSTEMS.length;
    btnUnit.textContent = us().key;
    updateUnitLabels();
  });

  // Real-time graph toggle
  btnRealtime && btnRealtime.addEventListener('click', () => {
    realtimeGraph = !realtimeGraph;
    btnRealtime.classList.toggle('active', realtimeGraph);
    if (!realtimeGraph && simResult) drawGraph(activeTab);
  });

  // localStorage named presets
  const LS_KEY = 'sim_presets_v1';
  function getLsPresets() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)||'{}'); } catch { return {}; }
  }
  function refreshLsPresets() {
    if (!selLs) return;
    const keys = Object.keys(getLsPresets());
    selLs.innerHTML = '<option value="">저장된 프리셋...</option>' +
      keys.map(k => `<option value="${k}">${k}</option>`).join('');
  }
  refreshLsPresets();
  btnLsSave && btnLsSave.addEventListener('click', () => {
    const name = inpLsName ? inpLsName.value.trim() : ''; if (!name) return;
    const presets = getLsPresets();
    presets[name] = collectSettings();
    localStorage.setItem(LS_KEY, JSON.stringify(presets));
    refreshLsPresets();
    if (selLs) selLs.value = name;
    inpLsName.value = '';
  });
  btnLsLoad && btnLsLoad.addEventListener('click', () => {
    const name = selLs ? selLs.value : ''; if (!name) return;
    const p = getLsPresets()[name]; if (p) applySettings(p);
  });
  btnLsDel && btnLsDel.addEventListener('click', () => {
    const name = selLs ? selLs.value : ''; if (!name) return;
    const presets = getLsPresets();
    delete presets[name];
    localStorage.setItem(LS_KEY, JSON.stringify(presets));
    refreshLsPresets();
  });

  // [F15] Recording / History (on-demand)
  function saveRecording(result){
    const tgt=targetObjects[+selTarget.value];
    const rec={
      id:Date.now(), ts:new Date().toLocaleTimeString(),
      label:`${selShape.value} → ${tgt?.name||'target'}`,
      settings:collectSettings(),
      summary:{
        vt:result.terminalVelocity, vi:result.impactVelocity, fallTime:result.fallTime,
        ke:result.impactData?result.impactData.impactEnergy:0,
        level:result.impactData?result.impactData.destructionLevel:'—',
        drift:Math.hypot(result.driftX||0,result.driftZ||0),
      },
      frames:result.frames,
    };
    recordings.unshift(rec);
    if(recordings.length>20)recordings.pop();
    renderHistoryList();
  }

  function renderHistoryList(){
    if(recordings.length===0){histEmpty.style.display='block';histList.innerHTML='';return;}
    histEmpty.style.display='none';
    histList.innerHTML=recordings.map(r=>`<div class="hist-item" data-id="${r.id}">`+
      `<div class="hist-hdr"><span class="hist-label">${r.label}</span>`+
      `<span class="hist-ts">${r.ts}</span>`+
      `<button class="hist-del" data-id="${r.id}">×</button></div>`+
      `<div class="hist-meta">vᵢ ${r.summary.vi.toFixed(1)} m/s · ${r.summary.fallTime.toFixed(1)}s · `+
      `KE ${(r.summary.ke/1000).toFixed(1)} kJ · ${r.summary.level}</div>`+
      `<div class="hist-actions">`+
      `<button class="hist-btn" data-action="replay" data-id="${r.id}">▶ Replay</button>`+
      `<button class="hist-btn" data-action="load"   data-id="${r.id}">⚙ Load</button>`+
      `<button class="hist-btn" data-action="export" data-id="${r.id}">⬇ JSON</button>`+
      `</div></div>`
    ).join('');
    histList.querySelectorAll('.hist-del').forEach(b=>b.addEventListener('click',()=>{
      recordings=recordings.filter(r=>r.id!=+b.dataset.id); renderHistoryList();
    }));
    histList.querySelectorAll('.hist-btn').forEach(b=>b.addEventListener('click',()=>{
      const r=recordings.find(x=>x.id==+b.dataset.id); if(!r)return;
      const action=b.dataset.action;
      if(action==='replay')replayRecording(r);
      else if(action==='load')applySettings(r.settings);
      else{
        const blob=new Blob([JSON.stringify(r,null,2)],{type:'application/json'});
        const link=document.createElement('a');
        link.download=`rec-${r.id}.json`; link.href=URL.createObjectURL(blob);
        link.click(); setTimeout(()=>URL.revokeObjectURL(link.href),1000);
      }
    }));
  }

  function replayRecording(r){
    applySettings(r.settings);
    simResult={...r.summary,frames:r.frames,terminalVelocity:r.summary.vt,
               impactVelocity:r.summary.vi,fallTime:r.summary.fallTime,
               timeToTerminal:r.frames[r.frames.length-1].t,impactData:null};
    currentH0=r.settings.height||500; currentG=r.settings.gravity||9.81;
    chartArea.style.display='flex'; historyArea.style.display='none';
    document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab==='velocity'));
    chartPh.style.display='none'; graphCanvas.style.display='block'; graphLegend.style.display='flex';
    activeTab='velocity'; drawGraph(activeTab); buildTable(simResult); buildTrajLine(simResult);
    positionClouds(currentH0);
    const visualH=Math.min(currentH0,1500);
    const baseY=getTargetBaseY();
    clearFragments(); impacted=false; bouncing=false; resetPlateBend(); clearThermalFailure();
    if(targetMesh)targetMesh.visible=true;
    fallingMesh.position.set(0,baseY+visualH,0); fallingMesh.visible=!glbMesh;
    if(glbMesh){ glbMesh.position.set(0,baseY+visualH+glbGroundOffset(),0); glbMesh.visible=true; }
    liveOverlay.style.display='block';
    orbitTarget.set(0,baseY+visualH*0.4,0); orbitRadius=visualH*0.5+30; updateCamera();
    playing=true; playHead=0; playState.c=0; lastHighlightedRow=null; requestRender();
  }

  btnSaveHist.addEventListener('click',()=>{
    if(recordings.length===0)return;
    const blob=new Blob([JSON.stringify(recordings,null,2)],{type:'application/json'});
    const link=document.createElement('a');
    link.download='all-recordings.json'; link.href=URL.createObjectURL(blob);
    link.click(); setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  });

  // ── Run simulation ──
  btnRun.addEventListener('click',async()=>{
    // Custom(GLB) 모드 안내: 모델 미선택/로딩중이면 구로 떨어지므로 알려준다
    if(selShape.value==='custom'){
      if(glbLoading) toast('GLB 로딩 중입니다 — 잠시 후 다시 실행하면 모델로 떨어집니다.', 'info', 3500);
      else if(!glbMesh) toast('Custom(GLB) 모드인데 모델이 선택되지 않았습니다. 프리셋이나 파일을 먼저 고르세요. (지금은 기본 구로 낙하)', 'error', 6000);
    }
    btnRun.disabled=true; btnRun.textContent='Computing...';
    clearFragments(); impacted=false; bouncing=false; resetPlateBend(); clearThermalFailure();
    if(targetMesh)targetMesh.visible=true;
    if(craterGroup){scene.remove(craterGroup);craterGroup.children.forEach(m=>{m.geometry.dispose();m.material.dispose();});craterGroup=null;}
    currentH0=+inpHeight.value; currentG=+inpG.value;
    const presetIdx=parseInt(selPreset.value);
    const falling=presetIdx>=0?fallingPresets[presetIdx]:{
      name:selShape.value,mass:+inpMass.value,cd:+inpCd.value,
      area:+inpArea.value,radius:Math.sqrt(+inpArea.value/Math.PI),
    };
    const tgt=currentTarget();

    // JS sim (always run — provides frames and drift)
    let result=localSimulate(falling.mass,falling.area,falling.cd);

    // C++ sim for impact physics
    if(window.physics&&tgt){
      try{
        const inp={
          falling,target:tgt,height:currentH0,gravity:currentG,v0:+inpV0.value,
          windX:features.wind?(+inpWindX.value||0):0,
          windZ:features.wind?(+inpWindZ.value||0):0,
          tempOffset:+inpTemp.value||0,humidity:+inpHumidity.value||50,
        };
        if(features.projectile){inp.launchAngle=+inpLaunchAngle.value||45;inp.launchAzimuth=+inpLaunchAzimuth.value||0;}
        if(features.magnus){
          const ax=spinAxisVec();
          inp.spinRate=(+inpSpinRpm.value||0)*2*Math.PI/60;
          inp.spinAxisX=ax[0];inp.spinAxisY=ax[1];inp.spinAxisZ=ax[2];
        }
        if(features.terrain&&selTerrain.value==='slope')inp.terrainSlope=+inpSlope.value||0;
        const res=await window.physics.simulate(inp);
        const data=res&&res.ok?res.data:res;
        if(data&&data.terminalVelocity!=null){
          result.terminalVelocity=data.terminalVelocity;
          result.impactVelocity=data.impactVelocity;
          result.impactData=data;
        }
      }catch(err){console.warn('native simulate failed, using JS fallback',err);}
    }
    simResult=result;

    // [F11] extra objects
    if(features.multiobj){
      moObjects.forEach(o=>{ o.result=localSimulate(o.mass,o.area,o.cd); });
    }

    mVt.textContent=dispSpeed(result.terminalVelocity);
    mVi.textContent=dispSpeed(result.impactVelocity);
    mFt.textContent=result.fallTime.toFixed(2);
    mTt.textContent=result.timeToTerminal.toFixed(2);

    // [F9] energy box
    if(features.energy&&result.impactData){
      energyBox.style.display='flex';
      eKe.textContent=`${(result.impactData.impactEnergy/1000).toFixed(2)} kJ`;
      eMom.textContent=`${result.impactData.impactMomentum.toFixed(1)} kg·m/s`;
      eForce.textContent=`${(result.impactData.impactForce/1000).toFixed(1)} kN`;
    } else {
      energyBox.style.display='none';
    }

    // Switch back to chart view if on history tab
    if(activeTab==='history'){activeTab='velocity';chartArea.style.display='flex';historyArea.style.display='none';}
    document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===activeTab));
    chartPh.style.display='none'; graphCanvas.style.display='block'; graphLegend.style.display='flex';
    drawGraph(activeTab); buildTable(result); buildTrajLine(result);
    positionClouds(currentH0);   // 드롭 높이에 맞춰 구름 재배치(하단/troposphere 포함)

    // overlay rows
    const hasDrift=(features.wind&&(Math.abs(+inpWindX.value)>0.01||Math.abs(+inpWindZ.value)>0.01))||features.projectile||features.magnus;
    ovDriftRow.style.display=hasDrift?'flex':'none';
    ovSpinRow.style.display=features.magnus?'flex':'none';

    const visualH=Math.min(currentH0,1500);
    const baseY=getTargetBaseY();
    fallingMesh.position.set(0,baseY+visualH,0); fallingMesh.visible=!glbMesh;
    if(glbMesh){ glbMesh.position.set(0,baseY+visualH+glbGroundOffset(),0); glbMesh.visible=true; }
    if(features.multiobj){
      moObjects.forEach((o,i)=>{
        const ox=(i+1)*5;
        if(o.mesh){ o.mesh.position.set(ox,baseY+visualH,0); o.mesh.visible=!o.glbMesh; }
        if(o.glbMesh){ o.glbMesh.position.set(ox,baseY+visualH,0); o.glbMesh.visible=true; }
      });
    }
    liveOverlay.style.display='block';
    orbitTarget.set(0,baseY+visualH*0.4,0); orbitRadius=visualH*0.5+30; updateCamera();
    playing=true; playHead=0; playState.c=0; lastHighlightedRow=null;

    // [F15] on-demand save
    if(features.record&&recording)saveRecording(result);

    btnRun.disabled=false; btnRun.textContent='Run Simulation'; requestRender();
  });

  btnPlay.addEventListener('click',()=>{if(simResult)playing=true;});
  btnStop.addEventListener('click',()=>{playing=false;});
  btnReset.addEventListener('click',()=>{
    playing=false;playHead=0;playState.c=0;impacted=false;bouncing=false;
    tDisp.textContent='0.000';hBar.style.height='100%';
    const baseY=getTargetBaseY();
    if(fallingMesh){fallingMesh.position.set(0,baseY,0);fallingMesh.visible=!glbMesh;}
    if(glbMesh){glbMesh.position.set(0,baseY+glbGroundOffset(),0);glbMesh.visible=true;}
    moObjects.forEach(o=>{ if(o.mesh)o.mesh.visible=false; if(o.glbMesh)o.glbMesh.visible=false; });
    clearFragments();
    resetPlateBend();        // 휨 원복
    clearThermalFailure();   // 열 파괴 상태/잔해 원복
    positionClouds(+inpHeight.value||500);
    if(targetMesh)targetMesh.visible=true;
    if(craterGroup){scene.remove(craterGroup);craterGroup.children.forEach(m=>{m.geometry.dispose();m.material.dispose();});craterGroup=null;}
    liveOverlay.style.display='none';
    atmBadge.textContent='Ready';atmBadge.style.color='';
    skyMat.uniforms.altitudeFrac.value=0;
    if(lastHighlightedRow){lastHighlightedRow.classList.remove('highlight');lastHighlightedRow=null;}
    if(simResult)drawGraph(activeTab);
    requestRender();
  });

  // ── 결과 데이터 수집 + 결과창 표시 ──
  function buildResultData(thermalFail){
    const d = simResult && simResult.impactData ? simResult.impactData : {};
    const tgt = currentTarget();
    return {
      material: tgt ? tgt.name : '—',
      terminalVelocity: simResult ? simResult.terminalVelocity : d.terminalVelocity,
      impactVelocity:   simResult ? simResult.impactVelocity : d.impactVelocity,
      impactForce:      d.impactForce,
      impactPressure:   d.impactPressure,
      impactEnergy:     d.impactEnergy,
      impactMomentum:   d.impactMomentum,
      fallTime:         simResult ? simResult.fallTime : null,
      destructionRatio: d.destructionRatio,
      destructionLevel: d.destructionLevel,
      withstood: !d.destructionLevel || (d.destructionRatio!=null && d.destructionRatio<=0.001),
      driftX: simResult ? simResult.driftX : null,
      driftZ: simResult ? simResult.driftZ : null,
      maxSurfaceTemp: features.heat ? maxSurfaceTemp : null,
      thermalFail: thermalFail ? (heatFailMode()==='burnup'?'Burn up':'Disintegrate') : null,
    };
  }
  function emitResults(thermalFail){
    const data = buildResultData(thermalFail);
    lastResultData = data;
    scheduleSnapshot();  // lastResult 갱신 반영
    if(view.autoResults && window.appBridge) window.appBridge.showResults(data);
  }

  // ── 설정 동기화 브릿지 (메인 렌더러 = 단일 출처) ──
  // 메뉴/별도 팝업 창은 이 스냅샷을 읽고, 변경을 settings:apply 로 보낸다.
  const VALUE_IDS = ['sel-preset','sel-shape','inp-mass','inp-area','inp-cd','sel-glb-preset','inp-glb-scale',
    'sel-target','inp-thickness','inp-yield','inp-bend-strength','inp-elevate',
    'inp-height','inp-v0','inp-g','inp-wind-x','inp-wind-z','inp-temp','inp-humidity',
    'inp-spin-rpm','sel-spin-axis','inp-launch-angle','inp-launch-azimuth','sel-terrain','inp-slope',
    'sel-heat-fail','inp-heat-threshold','sel-fps-cap'];
  const OPTION_IDS = ['sel-preset','sel-shape','sel-glb-preset','sel-target','sel-spin-axis','sel-terrain'];
  let lastResultData = null;
  function buildSnapshot(){
    const values={}, checks={}, options={};
    VALUE_IDS.forEach(id=>{ const el=$(id); if(el) values[id]=el.value; });
    Object.keys(features).forEach(k=>{ checks['feat-'+k]=!!features[k]; });
    OPTION_IDS.forEach(id=>{ const el=$(id); if(el) options[id]=Array.from(el.options).map(o=>({value:o.value,label:o.textContent})); });
    return { values, checks, options,
      view:{ alwaysGraph:view.alwaysGraph, alwaysTraj:view.alwaysTraj, alwaysSettings:view.alwaysSettings,
             autoResults:view.autoResults, realtime:view.realtime, graphTab:view.graphTab, simOnly:view.simOnly },
      lastResult: lastResultData };
  }
  let snapTimer=null;
  function scheduleSnapshot(){
    if(!window.appBridge) return;
    clearTimeout(snapTimer);
    snapTimer=setTimeout(()=>window.appBridge.sendSnapshot(buildSnapshot()), 60);
  }
  // 팝업/메뉴에서 온 설정 변경을 메인 렌더러에 적용
  function applySettingChange(change){
    if(!change) return;
    const {kind,id,value}=change;
    if(kind==='value'){
      const el=$(id); if(!el) return;
      el.value=value;
      el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));
    } else if(kind==='feat'){
      const key=id.replace(/^feat-/,'');
      if(!(key in features)) return;
      features[key]=!!value;
      const cb=$(id); if(cb) cb.checked=!!value;
      const bodyId=FEAT_BODY[key]; if(bodyId&&$(bodyId)) $(bodyId).classList.toggle('collapsed',!value);
      applyFeature(key);
    } else if(kind==='view'){
      applyViewSetting(id,value);
    } else if(kind==='action'){
      const el=$(id); if(el) el.click();   // btn-unit 등
    }
    scheduleSnapshot();
  }
  function applyViewSetting(key,value){
    view[key]=value;
    if(key==='realtime'){
      realtimeGraph=!!value; if(btnRealtime) btnRealtime.classList.toggle('active',realtimeGraph);
      if(simResult)drawGraph(activeTab);
    } else if(key==='graphTab'){
      activeTab=value; document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===value));
      if(simResult)drawGraph(activeTab);
    } else if(key==='alwaysGraph'){
      if(value){ realtimeGraph=true; if(btnRealtime) btnRealtime.classList.add('active'); }  // ON이면 실시간 자동
      applyViewLayout();
    } else if(key==='alwaysTraj'||key==='alwaysSettings'){
      applyViewLayout();
    } else if(key==='simOnly'){
      applySimOnly(!!value);
    }
    if(typeof syncMenubar==='function') syncMenubar();
    scheduleSnapshot();
  }
  // ── 시뮬레이터 전용 모드: 주변 툴(메뉴/툴/패널/표) 숨기고 캔버스만 ──
  const SIM_ONLY_KEY='sim_only_mode';
  function applySimOnly(on){
    view.simOnly=!!on;
    document.body.classList.toggle('sim-only', !!on);
    try{ localStorage.setItem(SIM_ONLY_KEY, on?'1':'0'); }catch(e){}
    // 메뉴/툴바 체크상태 동기화
    const mc=$('mv-simonly'); if(mc) mc.checked=!!on;
    const bt=$('btn-sim-only'); if(bt) bt.classList.toggle('active', !!on);
    // 캔버스/그래프가 새 크기로 즉시 갱신되도록 (ResizeObserver도 잡지만 확실히)
    requestAnimationFrame(()=>{ window.dispatchEvent(new Event('resize')); requestRender(); });
  }
  // 패널 상시 표시 레이아웃 적용
  function applyViewLayout(){
    const lp=document.querySelector('.left-panel');
    const rp=document.querySelector('.right-panel');
    const dt=document.querySelector('.data-table-wrap');
    // 좌측 폭은 CSS 변수(--left-w)를 그대로 써서 리사이저 드래그가 계속 동작하게 한다.
    const leftW = view.alwaysSettings ? 'var(--left-w,230px)' : '0px';
    const resW  = view.alwaysSettings ? '5px' : '0px';
    const graphW= view.alwaysGraph ? '300px' : '0px';
    if(workspaceEl) workspaceEl.style.gridTemplateColumns=`${leftW} ${resW} 1fr ${graphW}`;
    if(lp) lp.style.display=view.alwaysSettings?'':'none';
    if(panelResizer) panelResizer.style.display=view.alwaysSettings?'':'none';
    if(rp) rp.style.display=view.alwaysGraph?'':'none';
    if(dt) dt.style.display=view.alwaysTraj?'':'none';
    // 레이아웃이 바뀌면 캔버스/그래프가 새 크기로 갱신되도록
    setTimeout(()=>{ window.dispatchEvent(new Event('resize')); requestRender(); },0);
  }
  // 좌측 패널의 어떤 컨트롤이든 바뀌면 스냅샷 재전송(메뉴/팝업 동기화)
  document.querySelector('.left-panel') && document.querySelector('.left-panel')
    .addEventListener('input', scheduleSnapshot, true);
  document.querySelector('.left-panel') && document.querySelector('.left-panel')
    .addEventListener('change', scheduleSnapshot, true);

  // 메뉴/결과창 이벤트 연결
  if(window.appBridge){
    // 네이티브 메뉴(File→Upload)에서 메인 프로세스가 고른 파일 바이트를 받아 로드한다.
    // 기존 업로드 로직(loadLocalModelFile: assets 복사→경로 로드, 실패 시 blob 폴백)을 그대로 재사용.
    if(window.appBridge.onFilePicked) window.appBridge.onFilePicked(p=>{
      if(!p || !p.bytes) return;
      try{
        const file = new File([new Uint8Array(p.bytes)], p.name || 'model');
        loadLocalModelFile(file, p.kind==='glb' ? btnShapeGlbFile : btnStl);
      }catch(e){ toast('파일 로드 실패: '+(e&&e.message||e), 'error', 6000); }
    });
    window.appBridge.onSettingsApply(applySettingChange);
    window.appBridge.onResultsAction(a=>{
      if(!a) return;
      if(a.action==='png') exportPNG();
      else if(a.action==='csv') exportCSV();
    });
    window.appBridge.onResultsRequest(()=>{ if(window.appBridge) window.appBridge.showResults(buildResultData(thermalFailed)); });
    // realtime 토글 버튼이 눌리면 view.realtime 동기화
    if(btnRealtime) btnRealtime.addEventListener('click',()=>{ view.realtime=realtimeGraph; scheduleSnapshot(); });
    applyViewLayout();
    scheduleSnapshot();
  }

  // ── 메뉴는 OS 네이티브 메뉴(main.js의 Menu.setApplicationMenu)로 일원화됨 ──
  // File(업로드)·Edit(설정 창)·View(상시 표시/전용 모드)는 모두 네이티브 메뉴가 처리하고,
  // 체크 상태는 settings:snapshot → buildMenu 로 동기화된다. (창 안 HTML 메뉴바 제거)

  // ── 시뮬레이터 전용 모드 토글 버튼/종료 버튼 연결 + 시작 시 복원 ──
  const btnSimOnly=$('btn-sim-only'), simOnlyExit=$('sim-only-exit');
  if(btnSimOnly) btnSimOnly.addEventListener('click',()=>applyViewSetting('simOnly',!view.simOnly));
  if(simOnlyExit) simOnlyExit.addEventListener('click',()=>applyViewSetting('simOnly',false));
  try{ if(localStorage.getItem(SIM_ONLY_KEY)==='1') applyViewSetting('simOnly',true); }catch(e){}

  // ── Animation loop ──
  let cloudTick=0;
  let fpsAccumTime=0;
  function animLoop(now){
    requestAnimationFrame(animLoop);
    let dt=Math.min((now-lastFrameTime)/1000,0.05);
    lastFrameTime=now;
    // 프레임레이트 상한: 0이 아니면 목표 간격보다 짧게 지난 프레임은 건너뛴다.
    // 건너뛴 시간은 누적해, 실제 처리하는 프레임의 dt 로 합산(재생 속도 유지).
    const cap=fpsCap();
    if(cap>0){
      fpsAccumTime+=dt;
      if(fpsAccumTime < (1/cap)-0.0005) return;
      dt=Math.min(fpsAccumTime,0.1);   // 누적 경과 시간만큼 진행
      fpsAccumTime=0;
    }

    if(playing){
      cloudTick++;
      if(cloudTick%3===0){
        cloudGroup.children.forEach((c,i)=>{c.position.x+=(i%2===0?0.4:-0.3);if(c.position.x>2000)c.position.x=-2000;});
      }
    }

    if(playing&&simResult){
      const mainFallTime=simResult.fallTime;
      const moMaxTime=features.multiobj&&moObjects.some(o=>o.result)
        ?Math.max(...moObjects.filter(o=>o.result).map(o=>o.result.fallTime)):0;
      const totalSim=Math.max(mainFallTime,moMaxTime);
      const PLAYBACK=Math.max(4,totalSim/15);
      playHead=Math.min(playHead+dt/PLAYBACK*totalSim,totalSim);
      // 프레임 사이를 보간해 위치/속도가 연속적으로 변하게 한다 (끊김 제거)
      const frame=lerpFrame(simResult.frames,playHead,playState);
      tDisp.textContent=frame.t.toFixed(3);
      ovT.textContent=frame.t.toFixed(3);
      ovH.textContent=dispDist(frame.h);
      ovV.textContent=dispSpeed(Math.abs(frame.v));
      ovRho.textContent=(frame.rho||1.225).toFixed(4);
      ovAtm.textContent=frame.atm||'Troposphere';
      ovAtm.style.color=ATM_COLOR[frame.atm]||'#58a6ff';
      if(!impacted){
        atmBadge.textContent=frame.atm||'Troposphere';
        atmBadge.style.color=ATM_COLOR[frame.atm]||'#58a6ff';
      }
      if(frame.px!=null){ovPx.textContent=(frame.px||0).toFixed(1);ovPz.textContent=(frame.pz||0).toFixed(1);}
      // [F7] Magnus force magnitude (live from JS result)
      if(features.magnus&&ovMf){
        const omega=(+inpSpinRpm.value||0)*2*Math.PI/60;
        const rho=frame.rho||1.225;
        const Fm=0.5*0.25*rho*(+inpArea.value||0.01)*omega*Math.abs(frame.v);
        ovMf.textContent=Fm.toFixed(2);
      }
      const pct=Math.max(0,Math.min(1,frame.h/currentH0));
      hBar.style.height=(pct*100)+'%';
      skyMat.uniforms.altitudeFrac.value=Math.min(1,frame.h/40000);
      const visualH=Math.min(currentH0,1500);
      const baseY=getTargetBaseY();
      // GLB 메시가 있으면 같은 위치로 동기화 (착지 후엔 bounce가 담당)
      if(glbMesh&&!impacted){
        glbMesh.position.x=(frame.px||0)*0.05;
        glbMesh.position.y=baseY+pct*visualH+glbGroundOffset();  // 바닥 잠김 방지(모델 높이만큼 위로)
        glbMesh.position.z=(frame.pz||0)*0.05;
        const sGlb=features.magnus?(0.04+(+inpSpinRpm.value||0)/3000):0.05;
        glbMesh.rotation.y+=sGlb;
      }
      if(fallingMesh&&!impacted){
        fallingMesh.position.x=(frame.px||0)*0.05;
        fallingMesh.position.y=baseY+pct*visualH;
        fallingMesh.position.z=(frame.pz||0)*0.05;
        // [F10] spin animation
        const spinMul=features.magnus?(0.04+(+inpSpinRpm.value||0)/3000):0.05;
        fallingMesh.rotation.x+=spinMul;
        fallingMesh.rotation.z+=spinMul*0.5;
        // [F16] 가열 색상: 상온(파랑) → 200°C(주황) → 1000°C+(빨강) 그라데이션
        if(features.heat&&fallingMesh.material&&fallingMesh.material.color){
          const t_hot=Math.max(0,Math.min(1,(frame.T_surface-20)/980));
          const r=Math.round(60+195*t_hot), g=Math.round(130*(1-t_hot)*0.6), b=Math.round(246*(1-t_hot));
          fallingMesh.material.color.setRGB(r/255,g/255,b/255);
        }
      }
      // [F16] 열 오버레이 업데이트
      if(features.heat){
        if(ovTemp) ovTemp.textContent=Math.round(frame.T_surface||0);
        if(ovFlux) ovFlux.textContent=((frame.heatFlux||0)/1000).toFixed(2)+' kW/m²';
        if(ovHeatRow) ovHeatRow.style.display='flex';
        if(ovFluxRow) ovFluxRow.style.display='flex';
      } else {
        if(ovHeatRow) ovHeatRow.style.display='none';
        if(ovFluxRow) ovFluxRow.style.display='none';
      }
      // 최고 표면온도 기록 + 표면온도 한계 초과 시 열 파괴(타서 소멸/공중 분해)
      if(features.heat && frame.T_surface>maxSurfaceTemp) maxSurfaceTemp=frame.T_surface;
      if(features.heat && !impacted && !thermalFailed && heatFailMode()!=='off'
         && frame.T_surface>=heatThreshold() && !bouncing){
        triggerThermalFailure(frame, baseY+pct*visualH);
      }
      // [F11] animate extra objects
      if(features.multiobj){
        moObjects.forEach((o,i)=>{
          if(!o.result||!o.mesh)return;
          if(!o._cs)o._cs={c:0};
          const fr2=lerpFrame(o.result.frames,playHead,o._cs);
          const p2=Math.max(0,Math.min(1,fr2.h/currentH0));
          const ox=(i+1)*5+(fr2.px||0)*0.05;
          o.mesh.position.set(ox, baseY+p2*visualH, 0);
          const airborne=p2>0.001;
          if(airborne) o.mesh.rotation.x+=0.05;
          // GLB 메시가 있으면 구와 동일 위치에 동기화
          if(o.glbMesh){
            o.glbMesh.position.set(ox, baseY+p2*visualH, 0);
            if(airborne) o.glbMesh.rotation.y+=0.05;
          }
        });
      }
      // 카메라 추적 — 착지 전후 모두 작동(착지 후엔 약간 부드럽게)
      if(camFollowMode){
        const kFollow = dampK(impacted ? 8 : 18, dt);   // 낙하 중엔 강하게, 착지 후엔 부드럽게
        orbitTarget.lerp(fallingMesh.position, kFollow);
        // 시야 거리도 동적으로 — 너무 가깝거나 너무 멀어지지 않도록 적당히 유지
        const targetR = Math.min(120, Math.max(18, fallingMesh.position.y * 0.18 + 22));
        orbitRadius += (targetR - orbitRadius) * dampK(impacted ? 3 : 6, dt);
      } else if(!impacted) {
        const ty=fallingMesh.position.y*0.5;
        orbitTarget.y+=(ty-orbitTarget.y)*dampK(6,dt);
      }
      updateCamera();
      graphAccum+=dt; if(graphAccum>=(realtimeGraph?0.05:0.12)){drawGraph(activeTab);graphAccum=0;}
      highlightAccum+=dt; if(highlightAccum>=0.1){highlightTable(playHead);highlightAccum=0;}
      needsRender=true;

      // 주 물체 착지 시 충돌 이펙트 (부가 오브젝트는 계속 낙하)
      if(playHead>=mainFallTime&&!impacted){
        impacted=true;
        skyMat.uniforms.altitudeFrac.value=0;
        const dr=simResult.impactData?simResult.impactData.destructionRatio:0;
        const withstood = !simResult.impactData || dr<=0.001;
        if(simResult.impactData){
          destrFill.style.width=(dr*100).toFixed(1)+'%';
          destrFill.className='destr-fill'+(dr>0.6?' danger':'');
          destrLevel.textContent=simResult.impactData.destructionLevel;
          destrLevel.className='destr-level '+(LEVEL_CLASS[simResult.impactData.destructionLevel]||'');
        }
        if(withstood){
          atmBadge.textContent='WITHSTOOD (버팀)'; atmBadge.style.color='#3fb950';
          if(fallingMesh)fallingMesh.visible=!glbMesh;
          if(glbMesh)glbMesh.visible=true;
          startBounce();
        } else {
          atmBadge.textContent='IMPACT!'; atmBadge.style.color='#f85149';
          if(fallingMesh)fallingMesh.visible=false;
          if(glbMesh)glbMesh.visible=false;
          createCrater(Math.sqrt(+inpArea.value/Math.PI));
          if(simResult.impactData&&window.physics){
            const tgt=currentTarget();
            window.physics.computeFracture(simResult.impactData,tgt,Math.sqrt(+inpArea.value/Math.PI))
              .then(res=>{const data=res&&res.ok?res.data:res;if(data)spawnFragments(data,tgt.material);});
          }
        }
        drawGraph(activeTab);
        emitResults(false);   // 시뮬 종료 → 결과창(자동 표시 설정 시)
      }
      // 모든 오브젝트(주 + 부가)가 착지하면 재생 종료
      // moObjects 는 착지 위치(지면)에 그대로 남겨둠 — Reset 시 정리됨
      if(playHead>=totalSim&&impacted){
        playing=false;
      }
    }

    // 버팀 시 공 바운스 애니메이션 (감쇠 반발)
    if(bouncing&&fallingMesh){
      bounceVel-=currentG*2*dt;
      bounceY+=bounceVel*dt;
      const targetTopY=getTargetBaseY()+(targetMesh?targetMesh.geometry.parameters.height*0.5:0.6)+0.8;
      if(bounceY<=targetTopY){
        bounceY=targetTopY; bounceVel*=-0.55;
        if(Math.abs(bounceVel)<0.6){bouncing=false;bounceVel=0;}
      }
      fallingMesh.position.y=bounceY;
      fallingMesh.rotation.x+=0.06;
      if(glbMesh){glbMesh.position.y=bounceY+glbGroundOffset();glbMesh.rotation.y+=0.06;}
      if(camFollowMode){
        orbitTarget.lerp(fallingMesh.position, dampK(14, dt));
        const targetR = Math.min(80, Math.max(18, fallingMesh.position.y * 0.18 + 22));
        orbitRadius += (targetR - orbitRadius) * dampK(4, dt);
        updateCamera();
      }
      needsRender=true;
    }

    // 판 휨 애니메이션 진행 (버틸 때만 활성)
    if(bendActive) stepPlateBend(dt);

    if(fracturing&&jsFragments.length>0){
      const active=stepFragmentsJS(dt,currentG);
      if(active===0)fracturing=false;
      needsRender=true;
    }

    if(dustParticles){
      const pos=dustParticles.geometry.attributes.position.array, vel=dustParticles._vel;
      for(let i=0;i<pos.length;i+=3){pos[i]+=vel[i];pos[i+1]+=vel[i+1];vel[i+1]-=0.001;pos[i+2]+=vel[i+2];}
      dustParticles.geometry.attributes.position.needsUpdate=true;
      dustParticles.material.opacity-=0.005;
      if(dustParticles.material.opacity<=0){scene.remove(dustParticles);dustParticles.geometry.dispose();dustParticles.material.dispose();dustParticles=null;}
      needsRender=true;
    }

    if(needsRender){
      // 정지 상태에선 항상 그림자 갱신(상호작용 정확도), 재생 중엔 2프레임당 1회로
      // 제한해 비싼 그림자맵 렌더 비용을 줄이고 FPS를 안정화한다.
      renderer3.shadowMap.needsUpdate = !playing || (shadowTick++ % 2 === 0);
      renderer3.render(scene,camera);
      needsRender=false;
    }
  }
  requestAnimationFrame(animLoop);
  window.addEventListener('resize',()=>{if(simResult)drawGraph(activeTab);requestRender();});

  // GLB 로더가 안 떴으면 시작 시 한 번 안내 (렌더링 자체는 정상 동작)
  if (!gltfLoader) {
    setTimeout(() => toast(
      'GLB 모델 로더를 불러오지 못해 GLB 선택이 동작하지 않습니다(렌더링은 정상).\n' +
      (glbLoaderError ? String(glbLoaderError.message || glbLoaderError) : '') +
      '\n→ 앱을 재시작하거나 재설치해 보세요.', 'error', 9000), 800);
  }
})();
