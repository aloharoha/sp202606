// 시뮬레이션 결과창. 메인 렌더러가 보내준 결과 데이터를 표로 보여주고,
// PNG 저장 / CSV 내보내기 동작을 메인 렌더러에 요청한다.
'use strict';

const LEVEL_COLOR = {
  'Withstood': '#3fb950', 'Minor Damage': '#58a6ff', 'Moderate Damage': '#d29922',
  'Severe Damage': '#f0883e', 'Total Destruction': '#f85149',
};

function render(d) {
  const levelEl = document.getElementById('level');
  const rows = document.getElementById('rows');
  if (!d) { rows.innerHTML = '<tr><td class="empty">결과 데이터가 없습니다.</td></tr>'; return; }
  const lvl = d.destructionLevel || (d.withstood ? 'Withstood' : '—');
  levelEl.textContent = d.thermalFail ? `THERMAL FAILURE — ${d.thermalFail}` : lvl;
  levelEl.style.color = d.thermalFail ? '#f0883e' : (LEVEL_COLOR[lvl] || '#e6edf3');

  const fmt = (x, n = 2, unit = '') => (x == null || isNaN(x)) ? '—' : (Number(x).toFixed(n) + (unit ? ' ' + unit : ''));
  const r = [
    ['Material', d.material || '—'],
    ['Terminal velocity', fmt(d.terminalVelocity, 2, 'm/s')],
    ['Impact velocity', fmt(d.impactVelocity, 2, 'm/s')],
    ['Impact force', d.impactForce != null ? fmt(d.impactForce / 1000, 1, 'kN') : '—'],
    ['Impact pressure', fmt(d.impactPressure, 2, 'MPa')],
    ['Kinetic energy', d.impactEnergy != null ? fmt(d.impactEnergy / 1000, 2, 'kJ') : '—'],
    ['Momentum', fmt(d.impactMomentum, 1, 'kg·m/s')],
    ['Fall time', fmt(d.fallTime, 2, 's')],
    ['Destruction', d.destructionRatio != null ? fmt(d.destructionRatio * 100, 1, '%') : '—'],
    ['Drift (X, Z)', (d.driftX != null) ? `${fmt(d.driftX,1)}, ${fmt(d.driftZ,1)} m` : '—'],
    ['Max surface temp', d.maxSurfaceTemp != null ? fmt(d.maxSurfaceTemp, 0, '°C') : '—'],
  ];
  rows.innerHTML = r.map(([k, v]) => `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`).join('');
}

document.getElementById('btn-png').addEventListener('click',  () => window.resultsBridge.action({ action: 'png' }));
document.getElementById('btn-xlsx').addEventListener('click', () => window.resultsBridge.action({ action: 'xlsx' }));
document.getElementById('btn-csv').addEventListener('click',  () => window.resultsBridge.action({ action: 'csv' }));
document.getElementById('btn-close').addEventListener('click', () => window.close());

window.resultsBridge.onData(render);
(async () => { const d = await window.resultsBridge.get(); if (d) render(d); })();
