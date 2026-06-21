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
  const selTarget = document.getElementById('sel-target');
  const tvLive    = document.getElementById('tv-live');
  const btnRun    = document.getElementById('btn-run');
  const btnPlay   = document.getElementById('btn-play');
  const btnStop   = document.getElementById('btn-stop');
  const btnReset  = document.getElementById('btn-reset');
  const tDisp     = document.getElementById('t-disp');
  const hBar      = document.getElementById('h-bar');
  const btnStl    = document.getElementById('btn-stl');
  const fileStl   = document.getElementById('file-stl');
  const mVt       = document.getElementById('m-vt');
  const mVi       = document.getElementById('m-vi');
  const mFt       = document.getElementById('m-ft');
  const mTt       = document.getElementById('m-tt');
  const destrFill  = document.getElementById('destr-fill');
  const destrLevel = document.getElementById('destr-level');
  const chartPh    = document.getElementById('chart-ph');
  const graphCanvas = document.getElementById('graph-canvas');
  const graphLegend = document.getElementById('graph-legend');
  const canvasWrap  = document.getElementById('canvas-wrap');

  let activeTab  = 'velocity';
  let simResult  = null;
  let playing    = false;
  let playStart  = null;
  let playHead   = 0;
  let impacted   = false;
  let targetObjects = [];
  let fragmentMeshes = [];
  let dustParticles  = null;
  let fracturing     = false;

  const SHAPE_CD = { sphere: 0.47, cylinder: 0.82, box: 1.05, cone: 0.50 };

  if (window.physics) {
    targetObjects = await window.physics.getTargetObjects();
    targetObjects.forEach((t, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = t.name;
      selTarget.appendChild(opt);
    });
  }

  function calcTV() {
    const m = +inpMass.value, A = +inpArea.value, Cd = +inpCd.value;
    const g = +inpG.value,    rho = +inpRho.value;
    if (!m || !A || !Cd || !g || !rho) return null;
    return Math.sqrt((2 * m * g) / (rho * Cd * A));
  }

  function updateTV() {
    const vt = calcTV();
    tvLive.textContent = vt ? vt.toFixed(3) : '—';
  }

  [inpMass, inpArea, inpCd, inpG, inpRho].forEach(el => el.addEventListener('input', updateTV));
  updateTV();

  selShape.addEventListener('change', () => {
    inpCd.value = SHAPE_CD[selShape.value];
    updateTV();
    rebuildFallingMesh();
  });

  btnStl.addEventListener('click', () => fileStl.click());
  fileStl.addEventListener('change', () => {
    if (fileStl.files[0]) btnStl.textContent = fileStl.files[0].name;
  });

  const scene    = new THREE.Scene();
  const camera   = new THREE.PerspectiveCamera(45, 1, 0.1, 100000);
  const renderer3 = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer3.setPixelRatio(window.devicePixelRatio);
  renderer3.shadowMap.enabled = true;
  canvasWrap.appendChild(renderer3.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const dir = new THREE.DirectionalLight(0x9bbfff, 1.1);
  dir.position.set(8, 20, 8);
  dir.castShadow = true;
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0xffffff, 0.25);
  fill.position.set(-5, 5, -5);
  scene.add(fill);

  const grid = new THREE.GridHelper(400, 40, 0x21262d, 0x21262d);
  scene.add(grid);

  camera.position.set(18, 12, 28);
  camera.lookAt(0, 0, 0);

  let orbitTarget = new THREE.Vector3(0, 0, 0);
  let orbitRadius = Math.sqrt(18*18 + 12*12 + 28*28);
  let orbitTheta  = Math.atan2(18, 28);
  let orbitPhi    = Math.acos(12 / orbitRadius);

  let isDragging  = false;
  let isPanning   = false;
  let lastMouse   = { x: 0, y: 0 };

  renderer3.domElement.addEventListener('mousedown', e => {
    if (e.button === 0) isDragging = true;
    if (e.button === 2) isPanning  = true;
    lastMouse = { x: e.clientX, y: e.clientY };
  });
  renderer3.domElement.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('mouseup', () => { isDragging = false; isPanning = false; });
  window.addEventListener('mousemove', e => {
    const dx = e.clientX - lastMouse.x;
    const dy = e.clientY - lastMouse.y;
    lastMouse = { x: e.clientX, y: e.clientY };
    if (isDragging) {
      orbitTheta -= dx * 0.008;
      orbitPhi    = Math.max(0.05, Math.min(Math.PI * 0.48, orbitPhi + dy * 0.008));
      updateCamera();
    }
    if (isPanning) {
      const right = new THREE.Vector3();
      const up    = new THREE.Vector3(0, 1, 0);
      right.crossVectors(camera.getWorldDirection(new THREE.Vector3()), up).normalize();
      orbitTarget.addScaledVector(right, -dx * 0.05);
      orbitTarget.y += dy * 0.05;
      updateCamera();
    }
  });
  renderer3.domElement.addEventListener('wheel', e => {
    orbitRadius = Math.max(5, Math.min(500, orbitRadius + e.deltaY * 0.05));
    updateCamera();
  });

  function updateCamera() {
    camera.position.set(
      orbitTarget.x + orbitRadius * Math.sin(orbitPhi) * Math.sin(orbitTheta),
      orbitTarget.y + orbitRadius * Math.cos(orbitPhi),
      orbitTarget.z + orbitRadius * Math.sin(orbitPhi) * Math.cos(orbitTheta)
    );
    camera.lookAt(orbitTarget);
  }

  function resize3() {
    const w = canvasWrap.clientWidth, h = canvasWrap.clientHeight;
    renderer3.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize3();
  new ResizeObserver(resize3).observe(canvasWrap);

  let fallingMesh = null;

  const MAT = {
    sphere:   new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.3, metalness: 0.3 }),
    cylinder: new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.4, metalness: 0.2 }),
    box:      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5, metalness: 0.1 }),
    cone:     new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4, metalness: 0.2 }),
  };

  function rebuildFallingMesh() {
    if (fallingMesh) { scene.remove(fallingMesh); fallingMesh = null; }
    let geo;
    switch (selShape.value) {
      case 'sphere':   geo = new THREE.SphereGeometry(1, 32, 32); break;
      case 'cylinder': geo = new THREE.CylinderGeometry(0.7, 0.7, 1.8, 32); break;
      case 'box':      geo = new THREE.BoxGeometry(1.4, 1.4, 1.4); break;
      case 'cone':     geo = new THREE.ConeGeometry(1, 2, 32); break;
      default:         geo = new THREE.SphereGeometry(1, 32, 32);
    }
    fallingMesh = new THREE.Mesh(geo, MAT[selShape.value]);
    fallingMesh.castShadow = true;
    scene.add(fallingMesh);
  }
  rebuildFallingMesh();

  let targetMesh = null;

  const TARGET_CONFIGS = {
    wood:     { color: 0x8b5e3c, roughness: 0.9, metalness: 0.0, geo: () => new THREE.BoxGeometry(6, 0.3, 6) },
    concrete: { color: 0x6b7280, roughness: 1.0, metalness: 0.0, geo: () => new THREE.BoxGeometry(8, 0.5, 8) },
    steel:    { color: 0x9ca3af, roughness: 0.2, metalness: 0.9, geo: () => new THREE.BoxGeometry(6, 0.1, 6) },
    glass:    { color: 0x93c5fd, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45, geo: () => new THREE.BoxGeometry(5, 0.08, 5) },
    brick:    { color: 0xa0522d, roughness: 0.95, metalness: 0.0, geo: () => new THREE.BoxGeometry(5, 1.5, 2) },
  };

  function rebuildTargetMesh() {
    if (targetMesh) { scene.remove(targetMesh); targetMesh = null; }
    const t = targetObjects[+selTarget.value];
    if (!t) return;
    const cfg = TARGET_CONFIGS[t.material] || TARGET_CONFIGS.concrete;
    const mat = new THREE.MeshStandardMaterial({
      color: cfg.color,
      roughness: cfg.roughness,
      metalness: cfg.metalness,
      transparent: cfg.transparent || false,
      opacity: cfg.opacity || 1.0,
    });
    targetMesh = new THREE.Mesh(cfg.geo(), mat);
    targetMesh.position.y = -0.25;
    targetMesh.receiveShadow = true;
    scene.add(targetMesh);
  }
  rebuildTargetMesh();
  selTarget.addEventListener('change', rebuildTargetMesh);

  function clearFragments() {
    fragmentMeshes.forEach(m => scene.remove(m));
    fragmentMeshes = [];
    if (dustParticles) { scene.remove(dustParticles); dustParticles = null; }
    fracturing = false;
  }

  function spawnFragments(fractureData, targetMaterial) {
    clearFragments();
    if (!fractureData || fractureData.mode === 'none') return;

    const fragMat = new THREE.MeshStandardMaterial({
      color: TARGET_CONFIGS[targetMaterial]?.color || 0x6b7280,
      roughness: 0.8, metalness: 0.1,
      side: THREE.DoubleSide,
    });

    if (fractureData.mode === 'deform' && targetMesh) {
      const pos = targetMesh.geometry.attributes.position;
      fractureData.deformations.forEach(d => {
        if (d.index < pos.count) {
          pos.setX(d.index, pos.getX(d.index) + d.dx);
          pos.setY(d.index, pos.getY(d.index) + d.dy);
          pos.setZ(d.index, pos.getZ(d.index) + d.dz);
        }
      });
      pos.needsUpdate = true;
      targetMesh.geometry.computeVertexNormals();
    } else {
      if (targetMesh) targetMesh.visible = false;

      (fractureData.fragments || []).forEach(f => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(f.vertices, 3));
        if (f.indices && f.indices.length > 0)
          geo.setIndex(new THREE.Uint32BufferAttribute(f.indices, 1));
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, fragMat.clone());
        mesh.position.set(...f.position);
        mesh.castShadow = true;
        scene.add(mesh);
        fragmentMeshes.push(mesh);
      });
    }

    if (fractureData.dustParticleCount > 0) {
      const n = Math.min(fractureData.dustParticleCount, 200);
      const positions = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        positions[i*3]   = (Math.random()-0.5) * 4;
        positions[i*3+1] = Math.random() * 2;
        positions[i*3+2] = (Math.random()-0.5) * 4;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      dustParticles = new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0xd1d5db, size: 0.08, transparent: true, opacity: 0.8
      }));
      scene.add(dustParticles);
    }

    fracturing = true;
  }

  function localSimulate() {
    const m = +inpMass.value, A = +inpArea.value, Cd = +inpCd.value;
    const h0 = +inpHeight.value, v0 = +inpV0.value;
    const g  = +inpG.value,  rho = +inpRho.value;
    const vt = Math.sqrt((2*m*g)/(rho*Cd*A));
    const dt = 0.05;
    let v = -v0, h = h0, t = 0;
    const frames = [];
    let ttReached = null;
    while (h > 0 && t < 3600) {
      const drag = 0.5*rho*Cd*A*v*v;
      const netF = m*g - drag;
      const acc  = netF/m;
      frames.push({ t, v, h, a: acc });
      if (!ttReached && Math.abs(v) >= vt*0.99) ttReached = t;
      v += acc*dt; h -= v*dt; t = Math.round((t+dt)*1000)/1000;
    }
    const last = frames[frames.length-1];
    return { frames, terminalVelocity: vt, impactVelocity: Math.abs(last.v), fallTime: last.t, timeToTerminal: ttReached ?? last.t };
  }

  function drawGraph(tab) {
    if (!simResult) return;
    const dpr = window.devicePixelRatio || 1;
    const W = graphCanvas.offsetWidth, H = graphCanvas.offsetHeight;
    graphCanvas.width = W*dpr; graphCanvas.height = H*dpr;
    const ctx = graphCanvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    const pad = { l: 44, r: 14, t: 12, b: 28 };
    const gW = W-pad.l-pad.r, gH = H-pad.t-pad.b;

    let datasets = [];
    if (tab === 'velocity') {
      datasets = [
        { label: 'Velocity (m/s)',   color: '#58a6ff', data: simResult.frames.map(f => ({ x: f.t, y: Math.abs(f.v) })) },
        { label: 'Terminal Vel.',    color: '#f0a500', data: simResult.frames.map(f => ({ x: f.t, y: simResult.terminalVelocity })), dashed: true },
      ];
    } else if (tab === 'height') {
      datasets = [
        { label: 'Height (m)', color: '#3fb950', data: simResult.frames.map(f => ({ x: f.t, y: f.h })) },
      ];
    } else {
      datasets = [
        { label: 'Acceleration (m/s²)', color: '#f85149', data: simResult.frames.map(f => ({ x: f.t, y: f.a })) },
      ];
    }

    const allY  = datasets.flatMap(d => d.data.map(p => p.y));
    const minX  = simResult.frames[0].t;
    const maxX  = simResult.frames[simResult.frames.length-1].t;
    const maxY  = Math.max(...allY) * 1.08 || 1;

    const px = x => pad.l + ((x-minX)/(maxX-minX||1)) * gW;
    const py = y => pad.t + gH - (y/maxY) * gH;

    ctx.strokeStyle = '#21262d'; ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = pad.t + gH*(i/5);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l+gW, y); ctx.stroke();
      ctx.fillStyle = '#6e7681'; ctx.font = '9px Consolas'; ctx.textAlign = 'right';
      ctx.fillText((maxY*(1-i/5)).toFixed(1), pad.l-3, y+3);
    }
    for (let i = 0; i <= 4; i++) {
      const x = pad.l + gW*(i/4);
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t+gH); ctx.stroke();
      ctx.fillStyle = '#6e7681'; ctx.font = '9px Consolas'; ctx.textAlign = 'center';
      ctx.fillText((minX+(maxX-minX)*(i/4)).toFixed(1)+'s', x, pad.t+gH+14);
    }

    datasets.forEach(ds => {
      ctx.strokeStyle = ds.color; ctx.lineWidth = ds.dashed ? 1.5 : 2;
      ctx.setLineDash(ds.dashed ? [5,4] : []);
      ctx.beginPath();
      ds.data.forEach((p,i) => { i===0 ? ctx.moveTo(px(p.x),py(p.y)) : ctx.lineTo(px(p.x),py(p.y)); });
      ctx.stroke(); ctx.setLineDash([]);
    });

    if (playHead > 0) {
      const xp = px(playHead);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xp, pad.t); ctx.lineTo(xp, pad.t+gH); ctx.stroke();
    }

    graphLegend.innerHTML = datasets.map(ds =>
      `<div class="leg-item"><div class="leg-dot" style="background:${ds.color}"></div>${ds.label}</div>`
    ).join('');
  }

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      if (simResult) drawGraph(activeTab);
    });
  });

  btnRun.addEventListener('click', async () => {
    btnRun.disabled = true;
    btnRun.textContent = 'Computing...';
    clearFragments();
    impacted = false;
    if (targetMesh) targetMesh.visible = true;

    const t = targetObjects[+selTarget.value];
    const falling = {
      name: selShape.value,
      mass: +inpMass.value, cd: +inpCd.value,
      area: +inpArea.value,
      radius: Math.sqrt(+inpArea.value / Math.PI),
    };

    let result = localSimulate();

    if (window.physics && t) {
      const res = await window.physics.simulate({
        falling, target: t,
        height: +inpHeight.value,
        airDensity: +inpRho.value,
        gravity: +inpG.value,
      });
      if (res.ok) {
        result.terminalVelocity = res.data.terminalVelocity;
        result.impactVelocity   = res.data.impactVelocity;
        result.impactData       = res.data;
      }
    }

    simResult = result;

    mVt.textContent = result.terminalVelocity.toFixed(3);
    mVi.textContent = result.impactVelocity.toFixed(3);
    mFt.textContent = result.fallTime.toFixed(2);
    mTt.textContent = result.timeToTerminal.toFixed(2);

    chartPh.style.display    = 'none';
    graphCanvas.style.display = 'block';
    graphLegend.style.display = 'flex';
    drawGraph(activeTab);

    btnRun.disabled = false;
    btnRun.textContent = 'Run Simulation';

    const h0 = +inpHeight.value;
    fallingMesh.position.set(0, Math.min(h0, 40), 0);
    fallingMesh.visible = true;
    orbitTarget.set(0, Math.min(h0*0.3, 10), 0);
    orbitRadius = Math.min(h0*0.6, 60) + 20;
    updateCamera();

    playing = true; playStart = performance.now(); playHead = 0;
  });

  btnPlay.addEventListener('click',  () => { if (simResult) { playing = true; playStart = performance.now() - playHead * 300; } });
  btnStop.addEventListener('click',  () => { playing = false; });
  btnReset.addEventListener('click', () => {
    playing = false; playHead = 0; impacted = false;
    tDisp.textContent = '0.000';
    hBar.style.height = '100%';
    if (fallingMesh) { fallingMesh.position.y = 0; fallingMesh.visible = true; }
    clearFragments();
    if (targetMesh) targetMesh.visible = true;
    if (simResult) drawGraph(activeTab);
  });

  const LEVEL_CLASS = {
    'No Damage': 'lv0', 'Minor Damage': 'lv1',
    'Moderate Damage': 'lv2', 'Severe Damage': 'lv3', 'Total Destruction': 'lv4',
  };

  let fragStepAcc = 0;

  function animLoop(now) {
    requestAnimationFrame(animLoop);

    if (playing && simResult) {
      const elapsed = (now - playStart) / 1000 * 0.25;
      playHead = Math.min(elapsed, simResult.fallTime);

      const frame = simResult.frames.find(f => f.t >= playHead)
                    || simResult.frames[simResult.frames.length-1];
      tDisp.textContent = frame.t.toFixed(3);

      const h0  = +inpHeight.value;
      const pct = Math.max(0, Math.min(1, frame.h / h0));
      hBar.style.height = (pct * 100) + '%';

      const visualH = Math.min(h0, 40);
      if (fallingMesh) fallingMesh.position.y = pct * visualH;
      fallingMesh.rotation.x += 0.01;

      if (playHead >= simResult.fallTime && !impacted) {
        impacted = true;
        playing  = false;
        if (fallingMesh) fallingMesh.visible = false;

        if (simResult.impactData && window.physics) {
          const t = targetObjects[+selTarget.value];
          const dr = simResult.impactData.destructionRatio;
          const pct = (dr * 100).toFixed(1);
          destrFill.style.width = pct + '%';
          destrFill.className = 'destr-fill' + (dr > 0.6 ? ' danger' : '');
          destrLevel.textContent = simResult.impactData.destructionLevel;
          destrLevel.className = 'destr-level ' + (LEVEL_CLASS[simResult.impactData.destructionLevel] || '');

          window.physics.computeFracture(
            simResult.impactData, t, Math.sqrt(+inpArea.value / Math.PI)
          ).then(res => {
            if (res.ok) spawnFragments(res.data, t.material);
          });
        }
      }

      if (simResult) drawGraph(activeTab);
    }

    if (fracturing && fragmentMeshes.length > 0 && window.physics) {
      fragStepAcc++;
      if (fragStepAcc % 2 === 0) {
        window.physics.stepFragments(0.032, +inpG.value).then(states => {
          states.forEach((s, i) => {
            if (i < fragmentMeshes.length) {
              fragmentMeshes[i].position.set(...s.position);
              fragmentMeshes[i].quaternion.set(s.rotation[0], s.rotation[1], s.rotation[2], s.rotation[3]);
            }
          });
        });
      }
    }

    if (dustParticles) {
      const pos = dustParticles.geometry.attributes.position.array;
      for (let i = 0; i < pos.length; i += 3) {
        pos[i]   += (Math.random()-0.5) * 0.02;
        pos[i+1] -= 0.01;
        pos[i+2] += (Math.random()-0.5) * 0.02;
      }
      dustParticles.geometry.attributes.position.needsUpdate = true;
      dustParticles.material.opacity -= 0.003;
      if (dustParticles.material.opacity <= 0) {
        scene.remove(dustParticles);
        dustParticles = null;
      }
    }

    renderer3.render(scene, camera);
  }
  requestAnimationFrame(animLoop);

  window.addEventListener('resize', () => {
    if (simResult) setTimeout(() => drawGraph(activeTab), 50);
  });

})();
