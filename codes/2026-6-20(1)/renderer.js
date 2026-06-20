(async () => {
  const THREE = await import('./node_modules/three/build/three.module.js');

  const inpMass   = document.getElementById('inp-mass');
  const inpArea   = document.getElementById('inp-area');
  const inpCd     = document.getElementById('inp-cd');
  const inpHeight = document.getElementById('inp-height');
  const inpV0     = document.getElementById('inp-v0');
  const inpG      = document.getElementById('inp-g');
  const inpRho    = document.getElementById('inp-rho');
  const selShape  = document.getElementById('sel-shape');
  const tvLive    = document.getElementById('tv-live');
  const btnRun    = document.getElementById('btn-run');
  const btnPlay   = document.getElementById('btn-play');
  const btnStop   = document.getElementById('btn-stop');
  const btnReset  = document.getElementById('btn-reset');
  const tDisplay  = document.getElementById('t-display');
  const hBar      = document.getElementById('h-bar');
  const btnStl    = document.getElementById('btn-stl');
  const fileStl   = document.getElementById('file-stl');

  const mVt = document.getElementById('m-vt');
  const mVi = document.getElementById('m-vi');
  const mFt = document.getElementById('m-ft');
  const mTt = document.getElementById('m-tt');

  const tabs            = document.querySelectorAll('.tab');
  const chartPlaceholder = document.getElementById('chart-placeholder');
  const graphCanvas     = document.getElementById('graph-canvas');
  const graphLegend     = document.getElementById('graph-legend');

  let activeTab = 'velocity';
  let simResult = null;
  let playing   = false;
  let playStart = null;
  let playHead  = 0;

  function calcTerminalVelocity() {
    const m   = parseFloat(inpMass.value);
    const A   = parseFloat(inpArea.value);
    const Cd  = parseFloat(inpCd.value);
    const g   = parseFloat(inpG.value);
    const rho = parseFloat(inpRho.value);
    if (!m || !A || !Cd || !g || !rho) return null;
    return Math.sqrt((2 * m * g) / (rho * Cd * A));
  }

  function updateLiveTerminalVel() {
    const vt = calcTerminalVelocity();
    tvLive.textContent = vt ? vt.toFixed(3) : '—';
  }

  [inpMass, inpArea, inpCd, inpG, inpRho].forEach(el => {
    el.addEventListener('input', updateLiveTerminalVel);
  });
  updateLiveTerminalVel();

  const SHAPE_CD = { sphere: 0.47, cylinder: 0.82, box: 1.05, cone: 0.50 };
  selShape.addEventListener('change', () => {
    inpCd.value = SHAPE_CD[selShape.value];
    updateLiveTerminalVel();
    rebuildMesh();
  });

  btnStl.addEventListener('click', () => fileStl.click());
  fileStl.addEventListener('change', () => {
    if (fileStl.files[0]) btnStl.textContent = `Model: ${fileStl.files[0].name}`;
  });

  const canvasWrap = document.getElementById('canvas-wrap');
  const scene    = new THREE.Scene();
  const camera   = new THREE.PerspectiveCamera(45, 1, 0.1, 100000);
  const renderer3d = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer3d.setPixelRatio(window.devicePixelRatio);
  canvasWrap.appendChild(renderer3d.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dir = new THREE.DirectionalLight(0x7eb3ff, 1.0);
  dir.position.set(5, 10, 5);
  scene.add(dir);

  const grid = new THREE.GridHelper(300, 30, 0x21262d, 0x21262d);
  scene.add(grid);

  let mesh = null;

  function rebuildMesh() {
    if (mesh) { scene.remove(mesh); mesh = null; }
    const mat = new THREE.MeshStandardMaterial({ color: 0x3fb950, roughness: 0.4, metalness: 0.2 });
    let geo;
    switch (selShape.value) {
      case 'sphere':   geo = new THREE.SphereGeometry(1, 32, 32); break;
      case 'cylinder': geo = new THREE.CylinderGeometry(0.7, 0.7, 1.8, 32); break;
      case 'box':      geo = new THREE.BoxGeometry(1.4, 1.4, 1.4); break;
      case 'cone':     geo = new THREE.ConeGeometry(1, 2, 32); break;
      default:         geo = new THREE.SphereGeometry(1, 32, 32);
    }
    mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
  }
  rebuildMesh();

  camera.position.set(0, 15, 30);
  camera.lookAt(0, 0, 0);

  function resize3d() {
    const w = canvasWrap.clientWidth, h = canvasWrap.clientHeight;
    renderer3d.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize3d();
  new ResizeObserver(resize3d).observe(canvasWrap);

  let animId = null;
  function render3d() {
    animId = requestAnimationFrame(render3d);
    if (mesh) mesh.rotation.y += 0.005;
    renderer3d.render(scene, camera);
  }
  render3d();

  function runPhysicsSim() {
    const m   = parseFloat(inpMass.value);
    const A   = parseFloat(inpArea.value);
    const Cd  = parseFloat(inpCd.value);
    const h0  = parseFloat(inpHeight.value);
    const v0  = parseFloat(inpV0.value);
    const g   = parseFloat(inpG.value);
    const rho = parseFloat(inpRho.value);

    const vt = Math.sqrt((2 * m * g) / (rho * Cd * A));
    const dt = 0.05;
    let v = -v0;
    let h = h0;
    let t = 0;

    const frames = [];
    let ttReached = null;

    while (h > 0 && t < 3600) {
      const drag = 0.5 * rho * Cd * A * v * v;
      const netF = m * g - drag;
      const acc  = netF / m;

      frames.push({ t, v, h, a: acc });

      if (!ttReached && Math.abs(v) >= vt * 0.99) ttReached = t;

      v += acc * dt;
      h -= v * dt;
      t  = Math.round((t + dt) * 1000) / 1000;
    }

    const last = frames[frames.length - 1];
    return {
      frames,
      terminalVelocity: vt,
      impactVelocity:   Math.abs(last.v),
      fallTime:         last.t,
      timeToTerminal:   ttReached ?? last.t,
    };
  }

  function drawGraph(tab) {
    if (!simResult) return;

    const frames = simResult.frames;
    const dpr = window.devicePixelRatio || 1;
    const W = graphCanvas.offsetWidth;
    const H = graphCanvas.offsetHeight;
    graphCanvas.width  = W * dpr;
    graphCanvas.height = H * dpr;
    const ctx = graphCanvas.getContext('2d');
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    const pad = { l: 46, r: 16, t: 14, b: 30 };
    const gW  = W - pad.l - pad.r;
    const gH  = H - pad.t - pad.b;

    let datasets = [];
    if (tab === 'velocity') {
      datasets = [
        { label: 'Velocity (m/s)', color: '#58a6ff', data: frames.map(f => ({ x: f.t, y: Math.abs(f.v) })) },
        { label: 'Terminal Vel.', color: '#f0a500', data: frames.map(f => ({ x: f.t, y: simResult.terminalVelocity })), dashed: true },
      ];
    } else if (tab === 'height') {
      datasets = [
        { label: 'Height (m)', color: '#3fb950', data: frames.map(f => ({ x: f.t, y: f.h })) },
      ];
    } else {
      datasets = [
        { label: 'Acceleration (m/s²)', color: '#f85149', data: frames.map(f => ({ x: f.t, y: f.a })) },
      ];
    }

    const allX = frames.map(f => f.t);
    const allY = datasets.flatMap(d => d.data.map(p => p.y));
    const minX = Math.min(...allX), maxX = Math.max(...allX);
    const minY = 0, maxY = Math.max(...allY) * 1.08;

    function px(x) { return pad.l + ((x - minX) / (maxX - minX)) * gW; }
    function py(y) { return pad.t + gH - ((y - minY) / (maxY - minY)) * gH; }

    ctx.strokeStyle = '#21262d';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = pad.t + gH * (i / 5);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + gW, y); ctx.stroke();
      const val = maxY * (1 - i / 5);
      ctx.fillStyle = '#6e7681';
      ctx.font = `9px Consolas`;
      ctx.textAlign = 'right';
      ctx.fillText(val.toFixed(1), pad.l - 4, y + 3);
    }
    for (let i = 0; i <= 4; i++) {
      const x = pad.l + gW * (i / 4);
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + gH); ctx.stroke();
      const val = minX + (maxX - minX) * (i / 4);
      ctx.fillStyle = '#6e7681';
      ctx.font = `9px Consolas`;
      ctx.textAlign = 'center';
      ctx.fillText(val.toFixed(1) + 's', x, pad.t + gH + 14);
    }

    datasets.forEach(ds => {
      ctx.strokeStyle = ds.color;
      ctx.lineWidth = ds.dashed ? 1.5 : 2;
      if (ds.dashed) ctx.setLineDash([5, 4]);
      else ctx.setLineDash([]);
      ctx.beginPath();
      ds.data.forEach((p, i) => {
        const x = px(p.x), y = py(p.y);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    });

    if (playHead > 0 && playHead <= frames[frames.length - 1].t) {
      const xp = px(playHead);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xp, pad.t); ctx.lineTo(xp, pad.t + gH); ctx.stroke();
    }

    graphLegend.innerHTML = datasets.map(ds =>
      `<div class="legend-item">
        <div class="legend-dot" style="background:${ds.color};${ds.dashed ? 'border-top:1px dashed '+ds.color+';background:none' : ''}"></div>
        ${ds.label}
      </div>`
    ).join('');
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      if (simResult) drawGraph(activeTab);
    });
  });

  btnRun.addEventListener('click', async () => {
    btnRun.disabled = true;
    btnRun.textContent = 'Computing...';

    let result;
    if (window.physics) {
      const falling = {
        name: selShape.value,
        mass:   parseFloat(inpMass.value),
        cd:     parseFloat(inpCd.value),
        area:   parseFloat(inpArea.value),
        radius: Math.sqrt(parseFloat(inpArea.value) / Math.PI),
      };
      const target = { name: 'ground', yieldStrength: 30, thickness: 0.2 };
      const res = await window.physics.simulate({
        falling, target,
        height:     parseFloat(inpHeight.value),
        airDensity: parseFloat(inpRho.value),
        gravity:    parseFloat(inpG.value),
      });
      if (res.ok) {
        result = runPhysicsSim();
        result.terminalVelocity = res.data.terminalVelocity;
        result.impactVelocity   = res.data.impactVelocity;
      } else {
        result = runPhysicsSim();
      }
    } else {
      result = runPhysicsSim();
    }

    simResult = result;

    mVt.textContent = result.terminalVelocity.toFixed(3);
    mVi.textContent = result.impactVelocity.toFixed(3);
    mFt.textContent = result.fallTime.toFixed(2);
    mTt.textContent = result.timeToTerminal.toFixed(2);

    chartPlaceholder.style.display = 'none';
    graphCanvas.style.display      = 'block';
    graphLegend.style.display      = 'flex';
    drawGraph(activeTab);

    btnRun.disabled = false;
    btnRun.textContent = 'Run Simulation';

    startPlayback();
  });

  function startPlayback() {
    playing   = true;
    playStart = performance.now();
    playHead  = 0;
  }

  btnPlay.addEventListener('click', () => {
    if (simResult) { playing = true; playStart = performance.now() - playHead * 333; }
  });
  btnStop.addEventListener('click', () => { playing = false; });
  btnReset.addEventListener('click', () => {
    playing  = false;
    playHead = 0;
    tDisplay.textContent = '0.000';
    hBar.style.height = '100%';
    if (mesh) mesh.position.y = 0;
    if (simResult) drawGraph(activeTab);
  });

  const PLAYBACK_SPEED = 0.3;

  function animLoop() {
    requestAnimationFrame(animLoop);

    if (playing && simResult) {
      const elapsed = (performance.now() - playStart) / 1000 * PLAYBACK_SPEED;
      playHead = Math.min(elapsed, simResult.fallTime);

      const frame = simResult.frames.find(f => f.t >= playHead)
                    || simResult.frames[simResult.frames.length - 1];

      tDisplay.textContent = frame.t.toFixed(3);

      const h0 = parseFloat(inpHeight.value);
      const pct = Math.max(0, Math.min(1, frame.h / h0));
      hBar.style.height = (pct * 100) + '%';

      if (mesh) {
        const visualScale = Math.min(h0, 15);
        mesh.position.y = pct * visualScale;
        camera.position.y = mesh.position.y + 5;
        camera.lookAt(0, mesh.position.y, 0);
      }

      if (simResult) drawGraph(activeTab);

      if (playHead >= simResult.fallTime) playing = false;
    }
  }
  animLoop();

  window.addEventListener('resize', () => {
    if (simResult) setTimeout(() => drawGraph(activeTab), 50);
  });

})();
