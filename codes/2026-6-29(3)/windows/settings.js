// 별도 설정 팝업 창의 로직. 패널 종류를 URL ?panel= 로 받아 해당 컨트롤을 그린다.
// 단일 출처는 메인 렌더러 → 값은 settingsBridge 로 읽고(set 요청) 변경 알림(onUpdate)으로 갱신.
'use strict';

const PANELS = {
  preset: { title: 'Preset', fields: [
    { id: 'sel-preset', kind: 'value', type: 'select', label: 'Falling preset' },
    { id: 'sel-shape',  kind: 'value', type: 'select', label: 'Shape' },
  ]},
  falling: { title: 'Falling Object', fields: [
    { id: 'inp-mass', kind: 'value', type: 'number', label: 'Mass (kg)', step: 0.1 },
    { id: 'inp-area', kind: 'value', type: 'number', label: 'Area (m²)', step: 0.001 },
    { id: 'inp-cd',   kind: 'value', type: 'number', label: 'Drag coefficient Cd', step: 0.01 },
    { id: 'sel-glb-preset', kind: 'value', type: 'select', label: '3D model (GLB)' },
    { id: 'inp-glb-scale',  kind: 'value', type: 'range', label: 'Model scale (×)', min: 0.1, max: 5, step: 0.05 },
  ]},
  target: { title: 'Target Object', fields: [
    { id: 'sel-target',   kind: 'value', type: 'select', label: 'Material' },
    { id: 'inp-thickness',kind: 'value', type: 'number', label: 'Thickness (mm)', step: 1 },
    { id: 'inp-yield',    kind: 'value', type: 'number', label: 'Yield strength (MPa)', step: 1 },
    { id: 'feat-crater',  kind: 'feat',  type: 'toggle', label: 'Impact crater' },
    { id: 'feat-bend',    kind: 'feat',  type: 'toggle', label: 'Plate bend' },
    { id: 'inp-bend-strength', kind: 'value', type: 'range', label: 'Bend strength (×)', min: 0.2, max: 3, step: 0.1 },
    { id: 'feat-elevate', kind: 'feat',  type: 'toggle', label: 'Elevate target' },
    { id: 'inp-elevate',  kind: 'value', type: 'range', label: 'Elevation (m)', min: 0, max: 20, step: 1 },
  ]},
  initial: { title: 'Initial Conditions', fields: [
    { id: 'inp-height', kind: 'value', type: 'number', label: 'Drop height (m)', step: 1 },
    { id: 'inp-v0',     kind: 'value', type: 'number', label: 'Initial velocity (m/s)', step: 1 },
    { id: 'inp-g',      kind: 'value', type: 'number', label: 'Gravity (m/s²)', step: 0.01 },
  ]},
  others: { title: 'Other Settings', fields: [
    { id: 'feat-wind',   kind: 'feat',  type: 'toggle', label: 'Wind' },
    { id: 'inp-wind-x',  kind: 'value', type: 'number', label: 'Wind X (m/s)', step: 0.5 },
    { id: 'inp-wind-z',  kind: 'value', type: 'number', label: 'Wind Z (m/s)', step: 0.5 },
    { id: 'inp-temp',    kind: 'value', type: 'number', label: 'Temp offset (°C)', step: 1 },
    { id: 'inp-humidity',kind: 'value', type: 'number', label: 'Humidity (%)', step: 1 },
    { id: 'feat-magnus', kind: 'feat',  type: 'toggle', label: 'Magnus effect' },
    { id: 'inp-spin-rpm',kind: 'value', type: 'number', label: 'Spin (RPM)', step: 10 },
    { id: 'sel-spin-axis', kind: 'value', type: 'select', label: 'Spin axis' },
    { id: 'feat-projectile', kind: 'feat', type: 'toggle', label: 'Projectile mode' },
    { id: 'inp-launch-angle',   kind: 'value', type: 'number', label: 'Launch angle (°)', step: 1 },
    { id: 'inp-launch-azimuth', kind: 'value', type: 'number', label: 'Launch azimuth (°)', step: 1 },
    { id: 'feat-terrain', kind: 'feat', type: 'toggle', label: 'Terrain' },
    { id: 'sel-terrain',  kind: 'value', type: 'select', label: 'Terrain type' },
    { id: 'inp-slope',    kind: 'value', type: 'number', label: 'Slope (°)', step: 1 },
    { id: 'feat-heat',    kind: 'feat',  type: 'toggle', label: 'Aerodynamic heating' },
    { id: 'sel-heat-fail',kind: 'value', type: 'select', label: 'Over-temperature behavior',
      options: [{value:'off',label:'None'},{value:'burnup',label:'Burn up (소멸)'},{value:'disintegrate',label:'Disintegrate (공중 분해)'}] },
    { id: 'inp-heat-threshold', kind: 'value', type: 'number', label: 'Over-temp threshold (°C)', step: 50 },
    { id: 'sel-fps-cap',  kind: 'value', type: 'select', label: 'Frame rate cap',
      options: [{value:'0',label:'Unlimited'},{value:'30',label:'30 fps'},{value:'60',label:'60 fps'},{value:'120',label:'120 fps'}] },
    { id: 'feat-multiobj',kind: 'feat', type: 'toggle', label: 'Multi-object' },
    { id: 'feat-energy',  kind: 'feat', type: 'toggle', label: 'Energy dashboard' },
    { id: 'feat-tooltip', kind: 'feat', type: 'toggle', label: 'Material tooltip' },
    { id: 'feat-fragcol', kind: 'feat', type: 'toggle', label: 'Fragment collision' },
    { id: 'feat-instfrag',kind: 'feat', type: 'toggle', label: 'Instanced fragments' },
    { id: 'feat-resize',  kind: 'feat', type: 'toggle', label: 'Panel resize (drag)' },
    { id: 'autoResults',  kind: 'view', type: 'toggle', label: 'Auto-show result window' },
  ]},
  graph: { title: 'Graph', fields: [
    { id: 'realtime', kind: 'view', type: 'toggle', label: 'Realtime graph' },
    { id: 'graphTab', kind: 'view', type: 'select', label: 'Active graph',
      options: [{value:'velocity',label:'Velocity'},{value:'height',label:'Height'},{value:'acceleration',label:'Acceleration'},{value:'density',label:'Air density'}] },
  ]},
  trajectory: { title: 'Trajectory Data', fields: [
    { id: 'btn-unit', kind: 'action', type: 'button', label: 'Cycle units (SI / km·h / imperial)' },
  ], note: '상시 표시는 메뉴 View → "Always show trajectory data" 로 켤 수 있습니다.' },
};

const panel = new URLSearchParams(location.search).get('panel') || 'others';
const def = PANELS[panel] || PANELS.others;
document.getElementById('title').textContent = def.title;
if (def.note) document.getElementById('note').textContent = def.note;

const host = document.getElementById('fields');
const controls = {}; // id → {field, el, valEl}

function readSnapshotValue(snap, f) {
  if (f.kind === 'feat') return !!(snap.checks && snap.checks[f.id]);
  if (f.kind === 'view') return snap.view ? snap.view[f.id] : undefined;
  return snap.values ? snap.values[f.id] : undefined; // value
}

function buildField(f, snap) {
  const wrap = document.createElement('div');
  if (f.type === 'toggle') {
    wrap.className = 'row-toggle';
    const span = document.createElement('span'); span.textContent = f.label;
    const cb = document.createElement('input'); cb.type = 'checkbox';
    cb.addEventListener('change', () => bridgeSet(f, cb.checked));
    wrap.appendChild(span); wrap.appendChild(cb);
    controls[f.id] = { field: f, el: cb };
  } else if (f.type === 'button') {
    wrap.className = 'field';
    const btn = document.createElement('button');
    btn.textContent = f.label;
    btn.style.cssText = 'width:100%;background:#161b22;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:7px;cursor:pointer;';
    btn.addEventListener('click', () => window.settingsBridge.set({ kind: 'action', id: f.id, value: true }));
    wrap.appendChild(btn);
  } else {
    wrap.className = 'field';
    const label = document.createElement('label'); label.textContent = f.label;
    const valEl = document.createElement('span'); valEl.className = 'val';
    label.appendChild(valEl);
    wrap.appendChild(label);
    let el;
    if (f.type === 'select') {
      el = document.createElement('select');
      const opts = (f.options) || (snap.options && snap.options[f.id]) || [];
      opts.forEach(o => { const op = document.createElement('option'); op.value = o.value; op.textContent = o.label; el.appendChild(op); });
      el.addEventListener('change', () => bridgeSet(f, el.value));
    } else { // number / range
      el = document.createElement('input');
      el.type = f.type;
      if (f.min != null) el.min = f.min; if (f.max != null) el.max = f.max; if (f.step != null) el.step = f.step;
      const ev = f.type === 'range' ? 'input' : 'change';
      el.addEventListener(ev, () => { bridgeSet(f, el.value); if (f.type === 'range') valEl.textContent = el.value; });
    }
    wrap.appendChild(el);
    controls[f.id] = { field: f, el, valEl };
  }
  host.appendChild(wrap);
}

function bridgeSet(f, value) {
  window.settingsBridge.set({ kind: f.kind, id: f.id, value });
}

function refill(snap) {
  for (const id in controls) {
    const { field, el, valEl } = controls[id];
    const v = readSnapshotValue(snap, field);
    if (field.type === 'toggle') { el.checked = !!v; }
    else if (field.type === 'select') {
      // 동적 옵션(프리셋/타깃 등)이 비어 있으면 채운다
      if (!field.options && snap.options && snap.options[id] && el.options.length !== snap.options[id].length) {
        el.innerHTML = '';
        snap.options[id].forEach(o => { const op = document.createElement('option'); op.value = o.value; op.textContent = o.label; el.appendChild(op); });
      }
      if (v != null) el.value = v;
    } else {
      if (v != null && document.activeElement !== el) el.value = v;
      if (field.type === 'range' && valEl) valEl.textContent = el.value;
    }
  }
}

(async () => {
  const snap = await window.settingsBridge.current();
  def.fields.forEach(f => buildField(f, snap || {}));
  if (snap) refill(snap);
  window.settingsBridge.onUpdate(refill);
})();
