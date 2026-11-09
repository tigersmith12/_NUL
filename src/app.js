/**
 * NUL Browser & Desktop Companion UI Controller (v0.02.001 · SUBSTRATE/0.2)
 * Connects `NULCore` (`src/engine.js`) to multi-lens Canvas 2D rendering
 * (`Combined` / `Agent` / `Medium`), ontology mode controls (`Emergent` / `None` / `Imported`),
 * inspectable causal cycle diagnostics, local storage autosave, and portable snapshots/ontologies.
 */
(() => {
  'use strict';

  const Core = window.NULCore;
  if (!Core) throw new Error('NULCore (src/engine.js) must be loaded before src/app.js.');

  const {
    APP_VERSION,
    RULESET_VERSION,
    STORAGE_KEY,
    GRID_W,
    GRID_H,
    CHANNELS,
    clamp,
    pad,
    esc,
    safeGlyph,
    glyphSVG,
    createEngine
  } = Core;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const canvas = $('#world');
  const ctx = canvas.getContext('2d');
  const wrap = $('#canvas-wrap');

  let dpr = 1;
  let monoFont = 'monospace';
  let activeTab = 'mind';
  let accumulator = 0;
  let previousTime = performance.now();
  let toastTimer = null;
  let inspectedTarget = null;

  const engine = createEngine({ width: 800, height: 520 });

  function refreshMonoFont() {
    try {
      const val = getComputedStyle(document.documentElement).getPropertyValue('--mono').trim();
      monoFont = val || 'monospace';
    } catch {
      monoFont = 'monospace';
    }
  }

  function resizeCanvas() {
    const rect = wrap._mockWidth && wrap._mockHeight
      ? { width: wrap._mockWidth, height: wrap._mockHeight }
      : wrap.getBoundingClientRect();
    const { width, height } = engine.setDimensions(rect.width, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    refreshMonoFont();
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
  }

  function renderLog() {
    const log = $('#log');
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 35;
    log.className = `log mode-${engine.logMode}`;
    log.innerHTML = engine.logs.map((entry) => (
      `<div class="log-entry ${entry.kind === 'system' ? 'system' : ''}">` +
      `<div class="log-time">T+${pad(entry.tick)}</div>` +
      `<div><div class="log-raw">${esc(entry.raw)}</div><div class="log-translation">${esc(entry.translation)}</div></div>` +
      `</div>`
    )).join('');
    if (atBottom || engine.logs.length < 4) log.scrollTop = log.scrollHeight;
  }

  function updateControls() {
    $('#play-button').textContent = engine.running ? 'Pause' : 'Resume';
    $('#run-label').textContent = engine.running ? 'Running' : 'Suspended';
    $('#run-state').classList.toggle('paused', !engine.running);
    $$('.lens-mode').forEach((btn) => btn.classList.toggle('active', btn.dataset.lens === engine.canvasLens));
    if (engine.agent) {
      $$('.ont-mode').forEach((btn) => btn.classList.toggle('active', btn.dataset.ontmode === engine.agent.ontologyMode));
    }
  }

  function saveWorld(notify = false) {
    if (!engine.agent || engine.rngState === null) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(engine.createSnapshot()));
      $('#save-indicator').textContent = `Autosaved locally · T+${pad(engine.tick)}`;
      if (notify) showToast(`World saved in this browser at T+${pad(engine.tick)}.`);
      return true;
    } catch {
      $('#save-indicator').textContent = 'Storage blocked · use snapshots';
      if (notify) showToast('Browser storage is unavailable. Download a snapshot instead.');
      return false;
    }
  }

  function updateSaveUI() {
    const restoreButton = $('#restore-button');
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      restoreButton.disabled = !raw;
      if (!raw) {
        $('#save-summary').textContent = 'No browser autosave exists yet.';
        return;
      }
      const data = JSON.parse(raw);
      if (!engine.validSnapshot(data)) throw new Error('Invalid save');
      const when = new Date(data.savedAt).toLocaleString();
      $('#save-summary').innerHTML = `<strong>T+${pad(data.tick)}</strong> · seed ${esc(data.seed)} · ontology: ${esc(data.agent.ontologyMode || 'emergent')}<br>${esc(data.agent.concepts.length)} concepts · ${esc((data.agent.macros || []).length)} operators · ${esc(data.artifacts.length)} structures<br>Saved ${esc(when)}`;
    } catch {
      restoreButton.disabled = true;
      $('#save-summary').textContent = 'Browser storage is unavailable or the autosave is invalid. Portable snapshots still work.';
    }
  }

  async function downloadJSON(data, filename, successMessage) {
    try {
      const contents = JSON.stringify(data, null, 2);
      if (window.nulDesktop?.saveJSON) {
        const result = await window.nulDesktop.saveJSON({ contents, suggestedName: filename });
        if (result.saved) showToast(successMessage);
        return;
      }
      const blob = new Blob([contents], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      showToast(successMessage);
    } catch {
      showToast('The file could not be saved.');
    }
  }

  function downloadSnapshot() {
    downloadJSON(
      engine.createSnapshot(),
      `nul-world-${engine.seed}-t${engine.tick}.json`,
      'Complete world snapshot downloaded.'
    );
  }

  function downloadOntology() {
    downloadJSON(
      engine.exportOntology(),
      `nul-ontology-${engine.seed}-t${engine.tick}.json`,
      'Ontology exported as JSON.'
    );
  }

  // ---------- Multi-Lens Canvas Rendering (Zero Pre-Drawn Observer Grid) ----------
  function drawGlyphCanvas(glyph, x, y, size, color, alpha = 1) {
    const safe = safeGlyph(glyph);
    if (!safe) return;
    ctx.save();
    ctx.translate(x - size / 2, y - size / 2);
    ctx.scale(size / 28, size / 28);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.1;
    const path = new Path2D(safe.path);
    ctx.stroke(path);
    if (safe.dot) {
      ctx.beginPath();
      ctx.arc(safe.dot[0], safe.dot[1], 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSubstrateMedium(lens) {
    const { width, height, field, imprint } = engine;
    ctx.fillStyle = lens === 'agent' ? '#080a07' : '#0b0e0a';
    ctx.fillRect(0, 0, width, height);

    const cellW = width / GRID_W;
    const cellH = height / GRID_H;

    for (let gy = 0; gy < GRID_H; gy++) {
      const py = gy * cellH;
      const row = gy * GRID_W;
      for (let gx = 0; gx < GRID_W; gx++) {
        const cell = row + gx;
        const imp = imprint[cell];
        const base = cell * CHANNELS;
        const u0 = field[base];
        const u1 = field[base + 1];
        const u2 = field[base + 2];
        const u3 = field[base + 3];

        if (lens === 'agent') {
          // Purely what the agent itself has physically imprinted/sculpted on the canvas!
          if (imp < 0.035) continue;
          const slowTone = clamp((u2 + u3 + 2) * 0.25, 0, 1);
          const rCol = Math.round(145 + slowTone * 82);
          const gCol = Math.round(175 + (1 - slowTone) * 55);
          const bCol = Math.round(88 + slowTone * 24);
          ctx.fillStyle = `rgba(${rCol},${gCol},${bCol},${(imp * 0.34).toFixed(3)})`;
          ctx.fillRect(gx * cellW, py, cellW + 0.6, cellH + 0.6);
          continue;
        }

        const fastAmp = Math.sqrt((u0 * u0 + u1 * u1) * 0.5);
        const slowAmp = Math.sqrt((u2 * u2 + u3 * u3) * 0.5);
        const total = fastAmp * 0.6 + slowAmp * 0.75 + imp * 0.5;
        if (total < (lens === 'medium' ? 0.05 : 0.085)) continue;

        const alphaScale = lens === 'medium' ? 0.38 : 0.16;
        const rCol = Math.round(78 + slowAmp * 145 + imp * 40);
        const gCol = Math.round(108 + fastAmp * 118 + imp * 35);
        const bCol = Math.round(72 + Math.max(0, -u0) * 85);
        const alpha = clamp(total * alphaScale, 0, 0.42);
        ctx.fillStyle = `rgba(${rCol},${gCol},${bCol},${alpha.toFixed(3)})`;
        ctx.fillRect(gx * cellW, py, cellW + 0.6, cellH + 0.6);

        // In raw Medium lens, also render subtle fast-channel vector ticks
        if (lens === 'medium' && fastAmp > 0.16 && (gx + gy) % 2 === 0) {
          const cx = (gx + 0.5) * cellW;
          const cy = py + 0.5 * cellH;
          ctx.strokeStyle = 'rgba(198,224,148,.28)';
          ctx.lineWidth = 0.75;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + u0 * cellW * 0.55, cy + u1 * cellH * 0.55);
          ctx.stroke();
        }
      }
    }
  }

  function drawSegmentedLocus(locus) {
    const c = locus.conceptId ? engine.conceptById(locus.conceptId) : null;
    const pulse = (Math.sin(engine.tick * 0.065 + (locus.phase || 0)) + 1) * 0.5;
    const contour = Array.isArray(locus.contour) && locus.contour.length === 8 ? locus.contour : [18, 18, 18, 18, 18, 18, 18, 18];
    const isSculpted = (locus.sculpted || 0) > 0.22;

    ctx.save();
    ctx.globalAlpha = clamp(0.38 + locus.salience * 0.55, 0.25, 0.9);
    ctx.strokeStyle = c ? '#b7cf78' : (isSculpted ? '#d8b46a' : '#859277');
    ctx.fillStyle = c ? 'rgba(183,207,120,.06)' : (isSculpted ? 'rgba(216,180,106,.05)' : 'rgba(133,146,119,.035)');
    ctx.lineWidth = c || isSculpted ? 1.0 : 0.75;

    // Draw agent-segmented 8-direction organic contour polygon
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const angle = (k / 8) * Math.PI * 2;
      const rad = contour[k] + pulse * 2.2;
      const px = locus.x + Math.cos(angle) * rad;
      const py = locus.y + Math.sin(angle) * rad;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (c) {
      drawGlyphCanvas(c.glyph, locus.x, locus.y, 19 + locus.salience * 6, '#b7cf78', 0.8);
    } else {
      ctx.fillStyle = isSculpted ? '#e0b96c' : '#a6b198';
      ctx.beginPath();
      ctx.arc(locus.x, locus.y, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }

    if (locus.id === engine.agent.targetId) {
      ctx.globalAlpha = 0.45;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.arc(locus.x, locus.y, 24 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawStigmergicMarks() {
    const marks = engine.agent.marks || [];
    if (!marks.length) return;
    ctx.save();
    for (const m of marks) {
      const col = m.valence > 0.08 ? 'rgba(214,250,114,.42)' : m.valence < -0.08 ? 'rgba(231,132,112,.42)' : 'rgba(202,180,125,.36)';
      ctx.strokeStyle = col;
      ctx.lineWidth = 0.9;
      const dx = (m.vec?.[0] || 0) * 9;
      const dy = (m.vec?.[1] || 0) * 9;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 4.2, 0, Math.PI * 2);
      ctx.moveTo(m.x - dx, m.y - dy);
      ctx.lineTo(m.x + dx, m.y + dy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSculptedBridges() {
    const arts = engine.artifacts;
    if (arts.length < 2) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(224,185,108,.14)';
    ctx.lineWidth = 0.85;
    ctx.setLineDash([3, 5]);
    for (let i = 0; i < arts.length; i++) {
      for (let j = i + 1; j < arts.length; j++) {
        const d = Math.hypot(arts[i].x - arts[j].x, arts[i].y - arts[j].y);
        if (d < 155) {
          ctx.beginPath();
          ctx.moveTo(arts[i].x, arts[i].y);
          ctx.lineTo(arts[j].x, arts[j].y);
          ctx.stroke();
        }
      }
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawArtifact(artifact) {
    const pulse = Math.sin(engine.tick * 0.025 + artifact.phase) * 2.8;
    const strength = artifact.strength || 0.65;
    ctx.save();
    ctx.strokeStyle = `rgba(224,185,108,${(0.14 + strength * 0.16).toFixed(3)})`;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(artifact.x, artifact.y, 25 + pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.arc(artifact.x, artifact.y, 18 - pulse * 0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    drawGlyphCanvas(artifact.glyph, artifact.x, artifact.y, 25, '#e0b96c', 0.9);
    ctx.fillStyle = 'rgba(202,180,125,.68)';
    ctx.font = '9px ' + monoFont;
    ctx.textAlign = 'center';
    ctx.fillText(artifact.name, artifact.x, artifact.y + 40);
    ctx.restore();
  }

  function drawAgent() {
    const agent = engine.agent;
    if (agent.trail.length > 1) {
      ctx.save();
      ctx.lineWidth = 0.8;
      for (let i = 1; i < agent.trail.length; i++) {
        ctx.strokeStyle = `rgba(188,214,116,${(i / agent.trail.length) * 0.15})`;
        ctx.beginPath();
        ctx.moveTo(agent.trail[i - 1][0], agent.trail[i - 1][1]);
        ctx.lineTo(agent.trail[i][0], agent.trail[i][1]);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (engine.canvasLens !== 'medium') {
      ctx.save();
      ctx.strokeStyle = 'rgba(170,193,115,.075)';
      ctx.lineWidth = 0.7;
      ctx.setLineDash([2, 7]);
      ctx.beginPath();
      ctx.arc(agent.x, agent.y, agent.senseRange, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    const target = engine.locusById(agent.targetId);
    if (target && engine.canvasLens !== 'medium') {
      ctx.save();
      ctx.strokeStyle = 'rgba(190,213,126,.13)';
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.moveTo(agent.x, agent.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.restore();
    }

    const glow = ctx.createRadialGradient(agent.x, agent.y, 0, agent.x, agent.y, 28);
    glow.addColorStop(0, 'rgba(214,250,114,.25)');
    glow.addColorStop(1, 'rgba(214,250,114,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(agent.x, agent.y, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(agent.x, agent.y);
    ctx.rotate(engine.tick * 0.006);
    ctx.strokeStyle = '#d6fa72';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 10, -0.4, 1.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 10, 2.7, 4.8);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#e7ffc0';
    ctx.beginPath();
    ctx.arc(agent.x, agent.y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    const label = agent.ontologyMode === 'none' ? null : agent.selfName;
    if (label) {
      ctx.fillStyle = 'rgba(210,229,170,.72)';
      ctx.font = '9px ' + monoFont;
      ctx.textAlign = 'center';
      ctx.fillText(label, agent.x, agent.y - 20);
    }
  }

  // ---------- Observer Inspection (Zero PRNG or State Perturbation) ----------
  function findEntityAt(x, y) {
    const agent = engine.agent;
    if (!agent) return null;
    if (Math.hypot(agent.x - x, agent.y - y) <= 22) return { kind: 'agent', id: 0, entity: agent };
    let best = null;
    let bestDist = Infinity;
    for (const artifact of engine.artifacts) {
      const d = Math.hypot(artifact.x - x, artifact.y - y);
      if (d <= 29 && d < bestDist) {
        bestDist = d;
        best = { kind: 'artifact', id: artifact.id, entity: artifact };
      }
    }
    for (const locus of engine.loci) {
      const d = Math.hypot(locus.x - x, locus.y - y);
      if (d <= 26 && d < bestDist) {
        bestDist = d;
        best = { kind: 'signal', id: locus.id, entity: locus };
      }
    }
    return best;
  }

  function resolveInspectedEntity() {
    const agent = engine.agent;
    if (!inspectedTarget || !agent) return null;
    if (inspectedTarget.kind === 'agent') return { kind: 'agent', entity: agent };
    if (inspectedTarget.kind === 'artifact') {
      const item = engine.artifacts.find((a) => a.id === inspectedTarget.id);
      return item ? { kind: 'artifact', entity: item } : null;
    }
    if (inspectedTarget.kind === 'signal') {
      const item = engine.loci.find((s) => s.id === inspectedTarget.id);
      return item ? { kind: 'signal', entity: item } : null;
    }
    return null;
  }

  function clearInspection() {
    inspectedTarget = null;
    const box = $('#entity-inspector');
    if (box) box.hidden = true;
  }

  function renderInspector() {
    const box = $('#entity-inspector');
    if (!box) return;
    const resolved = resolveInspectedEntity();
    if (!resolved) {
      inspectedTarget = null;
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const { kind, entity } = resolved;
    const agent = engine.agent;
    const defaultSvg = '<svg viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="5" stroke="currentColor"/></svg>';
    if (kind === 'agent') {
      $('#inspector-glyph').innerHTML = agent.selfGlyph ? glyphSVG(agent.selfGlyph) : defaultSvg;
      $('#inspector-title').textContent = agent.ontologyMode === 'none'
        ? 'ontology-free locus'
        : (agent.selfName || 'pre-symbolic locus');
      $('#inspector-kicker').textContent = `Embodied agent · ontology: ${agent.ontologyMode}`;
      $('#inspector-meta').innerHTML = `Viability ${Math.round(agent.energy * 100)}% · ${agent.interactions} cycles · ${(agent.macros || []).length} operators<br>${agent.concepts.length} concepts · ${agent.beliefs.length} beliefs · ${engine.artifacts.length} sculpted structures`;
    } else if (kind === 'artifact') {
      const parents = entity.parents.map(engine.conceptById).filter(Boolean).map((c) => c.name).join(` ${agent.operators.join} `);
      const macro = entity.macroId ? `μ${pad(entity.macroId, 2)}` : 'raw coupling';
      const vec = entity.features.map((v) => v.toFixed(2)).join(', ');
      $('#inspector-glyph').innerHTML = glyphSVG(entity.glyph) || defaultSvg;
      $('#inspector-title').textContent = entity.name;
      $('#inspector-kicker').textContent = `Sculpted structure #${pad(entity.id, 2)} · via ${macro}`;
      $('#inspector-meta').innerHTML = `Context: ${esc(parents || 'ontology-free imprint')} · born T+${pad(entity.born)}<br>Medium state [${esc(vec)}]`;
    } else if (kind === 'signal') {
      const c = entity.conceptId ? engine.conceptById(entity.conceptId) : null;
      const vec = entity.features.map((v) => v.toFixed(2)).join(', ');
      const deltaStr = Array.isArray(entity.causalDelta)
        ? entity.causalDelta.map((v) => (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2))).join(', ')
        : 'unprobed';
      $('#inspector-glyph').innerHTML = c ? glyphSVG(c.glyph) : defaultSvg;
      $('#inspector-title').textContent = c ? c.name : `segmented locus #${pad(entity.id, 2)}`;
      $('#inspector-kicker').textContent = c
        ? `Compressed into symbol #${pad(c.id, 2)}`
        : `Agent-segmented boundary · sculpted ${Math.round((entity.sculpted || 0) * 100)}%`;
      $('#inspector-meta').innerHTML = `Medium [${esc(vec)}]<br>Observed Δ [${esc(deltaStr)}]`;
    }
  }

  function inspectAt(x, y) {
    const hit = findEntityAt(x, y);
    if (!hit) return null;
    inspectedTarget = { kind: hit.kind, id: hit.id };
    renderInspector();
    return hit;
  }

  function renderWorld() {
    if (!engine.agent) return;
    const lens = engine.canvasLens;
    drawSubstrateMedium(lens);

    for (const ripple of engine.ripples) {
      const progress = ripple.age / ripple.max;
      const colors = { positive: '214,250,114', negative: '231,132,112', artifact: '232,189,114', concept: '190,218,124', event: '135,148,119' };
      ctx.strokeStyle = `rgba(${colors[ripple.color] || colors.event},${(1 - progress) * 0.35})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, 5 + progress * ripple.max, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (lens !== 'medium') {
      drawSculptedBridges();
      drawStigmergicMarks();
      engine.loci.forEach(drawSegmentedLocus);
      engine.artifacts.forEach(drawArtifact);
    }

    for (const p of engine.particles) {
      const colors = { positive: '#d6fa72', negative: '#e78470', artifact: '#e8bd72', concept: '#b8d37a' };
      ctx.globalAlpha = 1 - p.age / p.max;
      ctx.fillStyle = colors[p.color] || '#a9b598';
      ctx.fillRect(p.x, p.y, 1.2, 1.2);
    }
    ctx.globalAlpha = 1;
    drawAgent();

    const inspectedEntity = resolveInspectedEntity();
    if (inspectedEntity) {
      ctx.save();
      ctx.strokeStyle = inspectedEntity.kind === 'artifact' ? 'rgba(232,189,114,.78)' : 'rgba(214,250,114,.78)';
      ctx.lineWidth = 1.1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(inspectedEntity.entity.x, inspectedEntity.entity.y, inspectedEntity.kind === 'artifact' ? 31 : 25, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function renderIdentity() {
    const agent = engine.agent;
    const defaultSvg = '<svg viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="3" stroke="currentColor"/><circle cx="14" cy="14" r="10" stroke="currentColor" stroke-opacity=".35" stroke-dasharray="2 3"/></svg>';

    if (agent.ontologyMode === 'none') {
      $('#identity-name').textContent = 'ontology-free';
      $('#companion-agent-name').textContent = `ontology-free · ${(agent.macros || []).length} ops`;
      $('#identity-sub').textContent = `Sub-symbolic causal mode · ${agent.causalTraces.length} delta traces`;
      $('#identity-glyph').innerHTML = defaultSvg;
      return;
    }

    $('#identity-name').textContent = agent.selfName || 'unnamed';
    $('#companion-agent-name').textContent = agent.selfName
      ? `${agent.selfName} · ${agent.concepts.length} concepts`
      : `pre-symbolic · ${(agent.macros || []).length} ops`;
    $('#identity-sub').textContent = agent.selfName
      ? `Self-symbol authored at T+${pad(agent.selfBorn)} (${agent.ontologyMode})`
      : `Pre-symbolic · ${agent.causalTraces.length}/12 causal traces before compression`;
    $('#identity-glyph').innerHTML = agent.selfGlyph ? glyphSVG(agent.selfGlyph) : defaultSvg;
  }

  function renderCausalCycle() {
    const cyc = engine.agent.lastCycle;
    const driveEl = $('#causal-drive');
    if (!driveEl) return;
    if (!cyc) {
      driveEl.textContent = 'drive: sampling medium';
      $('#causal-acc').textContent = 'acc —';
      $('#causal-meta').textContent = 'Executing initial 8-tick motor coupling episode.';
      $('#causal-deltas').innerHTML = 'pred Δ [ · ]<br>real Δ [ · ]';
      return;
    }
    const fmt = (arr) => arr.map((v) => (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2))).join(', ');
    driveEl.textContent = `${cyc.drive} → ${cyc.proposalLabel}`;
    $('#causal-acc').textContent = `acc ${Math.round(cyc.evaluation.accuracy * 100)}% · fit ${Math.round(cyc.evaluation.overall * 100)}%`;
    $('#causal-meta').textContent = `${cyc.purposeSummary}. ${cyc.criticNote}.`;
    $('#causal-deltas').innerHTML = `pred Δ [${esc(fmt(cyc.predictedDelta))}]<br>real Δ [${esc(fmt(cyc.actualDelta))}]`;
  }

  function renderMemories() {
    const recent = engine.agent.memories.slice(-5).reverse();
    $('#memory-list').innerHTML = recent.length
      ? recent.map((m) => {
          const c = m.conceptId ? engine.conceptById(m.conceptId) : null;
          const label = c ? c.name : (m.label || 'Δ-cycle');
          const accBadge = Number.isFinite(m.accuracy) ? ` · acc ${Math.round(m.accuracy * 100)}%` : '';
          return `<div class="memory"><span class="memory-dot ${m.effect > 0.015 ? 'positive' : m.effect < -0.015 ? 'negative' : ''}"></span><span class="memory-name">${esc(label)}</span><span class="memory-meta">${m.effect >= 0 ? '+' : ''}${m.effect.toFixed(2)}${accBadge} · T+${pad(m.tick)}</span></div>`;
        }).join('')
      : '<div class="empty-panel">No episodes have been stored.</div>';
  }

  function renderLexicon() {
    const agent = engine.agent;
    if (agent.ontologyMode === 'none') {
      $('#concept-list').innerHTML = '<div class="empty-panel"><svg viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="9" stroke="currentColor" stroke-dasharray="2 3"/></svg><br>Ontology mode is <strong>None</strong>.<br>The agent defines contours, operators, and canvas structures purely via continuous causal deltas without coining words.</div>';
      return;
    }
    const concepts = agent.concepts;
    $('#concept-list').innerHTML = concepts.length
      ? concepts.map((c) => {
          const sign = c.valence > 0.04 ? 'positive' : c.valence < -0.04 ? 'negative' : '';
          const deltaPreview = Array.isArray(c.causalPrototype)
            ? `Δ[${c.causalPrototype.map((v) => (v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1))).join(',')}]`
            : `${c.contacts} contacts`;
          return `<article class="concept-card"><div class="concept-top">${glyphSVG(c.glyph, 'concept-glyph')}<div><div class="concept-name">${esc(c.name)}</div><div class="concept-id">CAUSAL SYMBOL ${pad(c.id, 2)} · ${esc(deltaPreview)}</div></div><div class="concept-valence ${sign}">${c.valence >= 0 ? '+' : ''}${c.valence.toFixed(2)}</div></div><div class="concept-bottom"><span>${c.seen} traces · ${c.contacts} cycles</span><span>born T+${pad(c.born)}</span></div></article>`;
        }).join('')
      : `<div class="empty-panel"><svg viewBox="0 0 28 28" fill="none"><path d="M5 7h18M5 14h12M5 21h16" stroke="currentColor"/></svg><br>Pre-symbolic phase (${agent.causalTraces.length}/12 causal traces).<br>Symbols emerge only when recurring causal deltas require compression.</div>`;
  }

  function renderLaws() {
    const agent = engine.agent;
    const macroEl = $('#macro-list');
    if (macroEl) {
      const macros = agent.macros || [];
      macroEl.innerHTML = macros.length
        ? macros.map((m) => {
            const cVec = m.gesture.coupling.map((v) => (v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1))).join(', ');
            const dVec = m.meanDelta.map((v) => (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2))).join(', ');
            return `<article class="macro-card"><div><div class="macro-code">${esc(m.code || `μ${pad(m.id, 2)}`)}</div><div class="macro-vec">motor [${esc(cVec)}] ↦ Δ[${esc(dVec)}]</div></div><div class="macro-rel">${Math.round(m.reliability * 100)}% rel<br>${m.trials} trials</div></article>`;
          }).join('')
        : '<div class="empty-panel">No repeatable motor gesture has crystallized into a macro-operator yet.</div>';
    }

    $('#law-list').innerHTML = agent.ontologyMode === 'none'
      ? '<div class="empty-panel">Linguistic beliefs are disabled in Ontology-Free mode.<br>Planning uses raw delta traces &amp; motor operators above.</div>'
      : (agent.beliefs.length
          ? agent.beliefs.map((b) => {
              const from = engine.conceptById(b.fromId);
              const to = engine.conceptById(b.toId);
              if (!from || !to) return '';
              const falsNote = b.falsifications ? ` · ${b.falsifications} falsifications` : '';
              return `<article class="law-card"><div class="law-raw">${esc(from.name)} ${esc(agent.operators.sequence)} ${esc(to.name)}</div><div class="law-translation">“${esc(from.name)}” preceded “${esc(to.name)}” in ${b.count} causal cycles${esc(falsNote)}.</div><div class="law-confidence"><span>${Math.round(b.confidence * 100)}%</span><div class="bar"><i style="width:${b.confidence * 100}%"></i></div><span>critic-tested</span></div></article>`;
            }).join('')
          : '<div class="empty-panel">No causal transition has stabilized enough<br>to become a symbolic belief.</div>');

    $('#artifact-list').innerHTML = engine.artifacts.length
      ? engine.artifacts.map((a) => {
          const parents = a.parents.map(engine.conceptById).filter(Boolean).map((c) => c.name).join(` ${agent.operators.join} `);
          const via = a.macroId ? `μ${pad(a.macroId, 2)}` : 'raw coupling';
          return `<article class="artifact-card">${glyphSVG(a.glyph)}<div><div class="artifact-name">${esc(a.name)}</div><div class="artifact-parents">${esc(parents || via)} · born T+${pad(a.born)}</div></div></article>`;
        }).join('')
      : '<div class="empty-panel">The agent has not yet sculpted a persistent<br>slow-channel structure on the canvas.</div>';
  }

  function renderAll() {
    const agent = engine.agent;
    if (!agent) return;
    $('#empty-state').classList.toggle('hidden', engine.loci.length > 0 || engine.artifacts.length > 0 || engine.tick > 15);
    $('#world-time').textContent = pad(engine.tick);
    $('#event-count').textContent = pad(engine.loci.length, 2);
    $('#stat-concepts').textContent = agent.concepts.length;
    $('#stat-memories').textContent = agent.memories.length;
    $('#stat-laws').textContent = agent.beliefs.length;
    const totalCreated = agent.totalArtifactsCreated || engine.artifacts.length;
    $('#stat-artifacts').textContent = totalCreated;
    $('#stat-artifacts').title = totalCreated > engine.artifacts.length
      ? `${engine.artifacts.length} active on canvas (capped at ${Core.MAX_ARTIFACTS}) · ${totalCreated} sculpted total`
      : `${engine.artifacts.length} active on canvas`;
    $('#lexicon-count').textContent = agent.concepts.length;
    $('#world-count').textContent = (agent.macros ? agent.macros.length : 0) + agent.beliefs.length + engine.artifacts.length;
    $('#intent-raw').textContent = agent.goal ? agent.goal.raw : '·';
    $('#intent-description').textContent = agent.goal ? agent.goal.description : 'Sampling local 4-channel gradients before forming first purpose seed.';
    $('#energy-value').textContent = Math.round(agent.energy * 100) + '%';
    $('#energy-bar').style.width = agent.energy * 100 + '%';
    $('#novelty-value').textContent = Math.round(agent.novelty * 100) + '%';
    $('#novelty-bar').style.width = agent.novelty * 100 + '%';
    const coh = engine.coherence();
    $('#coherence-value').textContent = Math.round(coh * 100) + '%';
    $('#coherence-bar').style.width = coh * 100 + '%';

    $$('.ont-mode').forEach((btn) => btn.classList.toggle('active', btn.dataset.ontmode === agent.ontologyMode));
    $$('.lens-mode').forEach((btn) => btn.classList.toggle('active', btn.dataset.lens === engine.canvasLens));

    renderIdentity();
    renderCausalCycle();
    renderMemories();
    renderInspector();
    if (activeTab === 'lexicon') renderLexicon();
    if (activeTab === 'laws') renderLaws();
  }

  function syncSeedUI() {
    $('#seed-readout').textContent = engine.seed;
    const seedInput = $('#seed-input');
    if (seedInput) seedInput.value = String(engine.seed);
  }

  engine.setHooks({
    onLog: () => renderLog(),
    onIdentity: () => renderIdentity(),
    onRender: () => renderAll(),
    onAutosave: (notify) => saveWorld(notify),
    onControls: () => updateControls(),
    onWorldReset: () => {
      accumulator = 0;
      inspectedTarget = null;
      $('#empty-state').classList.remove('hidden');
      syncSeedUI();
    },
    onSnapshotRestored: () => {
      accumulator = 0;
      previousTime = performance.now();
      inspectedTarget = null;
      syncSeedUI();
      $('#empty-state').classList.toggle('hidden', engine.loci.length > 0 || engine.artifacts.length > 0 || engine.tick > 15);
      $$('.speed-button').forEach((button) => button.classList.toggle('active', Number(button.dataset.speed) === engine.speed));
      $$('.log-mode').forEach((button) => button.classList.toggle('active', button.dataset.logmode === engine.logMode));
      $$('.lens-mode').forEach((button) => button.classList.toggle('active', button.dataset.lens === engine.canvasLens));
    },
    onOntologyImported: () => {
      inspectedTarget = null;
    }
  });

  function frame(now) {
    const elapsed = Math.min(80, now - previousTime);
    previousTime = now;
    if (engine.running) {
      accumulator += elapsed * engine.speed;
      const tickDuration = 1000 / 12;
      let safety = 0;
      while (accumulator >= tickDuration && safety < 30) {
        engine.simulate();
        accumulator -= tickDuration;
        safety++;
      }
    }
    renderWorld();
    requestAnimationFrame(frame);
  }

  // ---------- Controls & Desktop / Iframe Mode ----------
  let desktopMode = 'lab';
  let desktopPinned = true;

  function applyDesktopMode(next) {
    desktopMode = next.mode === 'companion' ? 'companion' : 'lab';
    desktopPinned = next.pinned !== false;
    document.body.classList.toggle('companion-mode', desktopMode === 'companion');
    $('#companion-pin').classList.toggle('active', desktopPinned);
    $('#companion-pin').textContent = desktopPinned ? 'Pinned' : 'Pin';
    $('#companion-pin').setAttribute('aria-pressed', String(desktopPinned));
    $('#companion-button').textContent = desktopMode === 'companion' ? 'Lab view' : 'Companion';
    setTimeout(() => { resizeCanvas(); renderAll(); saveWorld(false); }, 120);
  }

  async function requestMode(nextMode) {
    if (window.nulDesktop?.setMode) applyDesktopMode(await window.nulDesktop.setMode(nextMode));
    else applyDesktopMode({ mode: nextMode, pinned: desktopPinned });
  }

  if (window.nulDesktop?.isDesktop) {
    document.body.classList.add('desktop-runtime');
    window.nulDesktop.onModeChanged(applyDesktopMode);
  } else {
    try {
      const params = new URLSearchParams(window.location?.search || '');
      if (params.get('mode') === 'companion') {
        applyDesktopMode({ mode: 'companion', pinned: desktopPinned });
      }
    } catch {}
  }

  $('#companion-button').addEventListener('click', () => requestMode(desktopMode === 'companion' ? 'lab' : 'companion'));
  $('#companion-expand').addEventListener('click', () => requestMode('lab'));
  $('#companion-pin').addEventListener('click', async () => {
    if (window.nulDesktop?.setPinned) applyDesktopMode(await window.nulDesktop.setPinned(!desktopPinned));
  });
  $('#companion-hide').addEventListener('click', () => window.nulDesktop?.windowControl('hide'));
  $('#window-minimize').addEventListener('click', () => window.nulDesktop?.windowControl('minimize'));
  $('#window-maximize').addEventListener('click', () => window.nulDesktop?.windowControl('maximize'));
  $('#window-hide').addEventListener('click', () => window.nulDesktop?.windowControl('hide'));

  function toggleRunning() {
    engine.running = !engine.running;
    accumulator = 0;
    updateControls();
    renderAll();
    saveWorld(false);
  }

  $('#play-button').addEventListener('click', toggleRunning);
  $('#step-button').addEventListener('click', () => {
    engine.running = false;
    engine.simulate();
    updateControls();
    renderAll();
    saveWorld(false);
  });

  $$('.speed-button').forEach((button) => button.addEventListener('click', () => {
    engine.speed = Number(button.dataset.speed);
    $$('.speed-button').forEach((b) => b.classList.toggle('active', b === button));
  }));

  $$('.lens-mode').forEach((button) => button.addEventListener('click', () => {
    engine.setCanvasLens(button.dataset.lens);
    saveWorld(false);
  }));

  $$('.ont-mode').forEach((button) => button.addEventListener('click', () => {
    const mode = button.dataset.ontmode;
    if (mode === 'none' && engine.agent?.concepts.length > 0 && !confirm('Switch to strictly Ontology-Free mode? Existing words and beliefs in this run will be cleared so agency runs purely on continuous causal deltas.')) {
      return;
    }
    engine.setOntologyMode(mode);
    showToast(`Ontology mode: ${mode}.`);
  }));

  function triggerPerturb(at) {
    engine.perturb(at);
    $('#empty-state').classList.add('hidden');
  }

  $('#perturb-button').addEventListener('click', () => triggerPerturb());
  $('#inspector-close').addEventListener('click', () => clearInspection());

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const hit = findEntityAt(event.clientX - rect.left, event.clientY - rect.top);
    canvas.style.cursor = hit && !event.shiftKey ? 'pointer' : 'crosshair';
  });

  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (!event.shiftKey && inspectAt(x, y)) return;
    triggerPerturb({ x, y });
  });

  function replaceWorld(newSeed, explicitSeed = null) {
    if (engine.agent && engine.agent.interactions > 0 && !confirm('Replace the current world and its autosave? Download a snapshot first if you want to keep it.')) {
      return false;
    }
    engine.resetWorld(newSeed, explicitSeed);
    return true;
  }

  $('#reset-button').addEventListener('click', () => replaceWorld(false));
  $('#new-world-button').addEventListener('click', () => replaceWorld(true));

  $$('.tab').forEach((button) => button.addEventListener('click', () => {
    activeTab = button.dataset.tab;
    $$('.tab').forEach((b) => b.classList.toggle('active', b === button));
    $$('.tab-pane').forEach((pane) => { pane.hidden = pane.id !== `pane-${activeTab}`; });
    if (activeTab === 'lexicon') renderLexicon();
    if (activeTab === 'laws') renderLaws();
  }));

  $$('.log-mode').forEach((button) => button.addEventListener('click', () => {
    engine.logMode = button.dataset.logmode;
    $$('.log-mode').forEach((b) => b.classList.toggle('active', b === button));
    renderLog();
  }));

  const dialog = $('#method-dialog');
  $('#method-button').addEventListener('click', () => dialog.showModal());
  $('#close-method').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

  const saveDialog = $('#save-dialog');
  function openSaveDialog(focusSeed = false) {
    updateSaveUI();
    const seedInput = $('#seed-input');
    if (seedInput) seedInput.value = String(engine.seed);
    saveDialog.showModal();
    if (focusSeed && seedInput) {
      seedInput.focus();
      seedInput.select();
    }
  }

  $('#save-button').addEventListener('click', () => openSaveDialog(false));
  $('#seed-badge').addEventListener('click', () => openSaveDialog(true));
  $('#close-save').addEventListener('click', () => saveDialog.close());
  saveDialog.addEventListener('click', (event) => { if (event.target === saveDialog) saveDialog.close(); });

  $('#export-button').addEventListener('click', downloadOntology);
  const saveExportOntologyBtn = $('#save-export-ontology-button');
  if (saveExportOntologyBtn) saveExportOntologyBtn.addEventListener('click', downloadOntology);

  const importOntologyInput = $('#import-ontology-file');
  const triggerOntologyFilePicker = () => { if (importOntologyInput) importOntologyInput.click(); };
  const importOntologyBtn = $('#import-ontology-button');
  if (importOntologyBtn) importOntologyBtn.addEventListener('click', triggerOntologyFilePicker);
  const saveImportOntologyBtn = $('#save-import-ontology-button');
  if (saveImportOntologyBtn) saveImportOntologyBtn.addEventListener('click', triggerOntologyFilePicker);

  if (importOntologyInput) {
    importOntologyInput.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        if (file.size > 8 * 1024 * 1024) throw new Error('Ontology file is too large.');
        const data = JSON.parse(await file.text());
        const summary = engine.importOntology(data);
        $('#save-indicator').textContent = `Imported ontology · T+${pad(engine.tick)}`;
        if (saveDialog.open) saveDialog.close();
        showToast(`Imported ontology (${summary.concepts} concepts, ${summary.beliefs} beliefs).`);
      } catch (error) {
        showToast(error.message || 'The ontology could not be imported.');
      }
      event.target.value = '';
    });
  }

  $('#apply-seed-button').addEventListener('click', () => {
    const parsed = Number.parseInt($('#seed-input').value, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 2147483647) {
      showToast('Enter an integer seed between 1 and 2147483647.');
      return;
    }
    if (replaceWorld(true, parsed)) {
      saveDialog.close();
      showToast(`Started deterministic world with seed ${parsed}.`);
    }
  });

  $('#seed-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      $('#apply-seed-button').click();
    }
  });

  $('#copy-seed-button').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(String(engine.seed));
      showToast(`Copied seed ${engine.seed} to clipboard.`);
    } catch {
      $('#seed-input').select();
      showToast(`Seed: ${engine.seed}`);
    }
  });

  $('#save-now-button').addEventListener('click', () => { saveWorld(true); updateSaveUI(); });
  $('#restore-button').addEventListener('click', () => {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      engine.restoreSnapshot(data);
      $('#save-indicator').textContent = `Restored autosave · T+${pad(engine.tick)}`;
      saveDialog.close();
      showToast(`Autosave restored at T+${pad(engine.tick)}.`);
    } catch {
      showToast('The autosave could not be restored.');
      updateSaveUI();
    }
  });

  $('#download-snapshot-button').addEventListener('click', downloadSnapshot);
  $('#import-snapshot-button').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 12 * 1024 * 1024) throw new Error('Snapshot is too large.');
      const data = JSON.parse(await file.text());
      engine.restoreSnapshot(data);
      saveWorld(false);
      $('#save-indicator').textContent = `Imported snapshot · T+${pad(engine.tick)}`;
      saveDialog.close();
      showToast(`World snapshot restored at T+${pad(engine.tick)}.`);
    } catch (error) {
      showToast(error.message || 'The snapshot could not be imported.');
    }
    event.target.value = '';
  });

  const lensOrder = ['combined', 'agent', 'medium'];
  window.addEventListener('pagehide', () => saveWorld(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveWorld(false); });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'KeyC' && !dialog.open && !saveDialog.open) {
      event.preventDefault();
      requestMode(desktopMode === 'companion' ? 'lab' : 'companion');
      return;
    }
    if (dialog.open || saveDialog.open || ['INPUT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement.tagName)) return;
    if (event.code === 'Escape' && inspectedTarget) { clearInspection(); return; }
    if (event.code === 'Space') { event.preventDefault(); toggleRunning(); }
    if (event.key.toLowerCase() === 'n') triggerPerturb();
    if (event.key.toLowerCase() === 'l') {
      const nextLens = lensOrder[(lensOrder.indexOf(engine.canvasLens) + 1) % lensOrder.length];
      engine.setCanvasLens(nextLens);
      showToast(`Canvas lens: ${nextLens}.`);
    }
  });

  ['#brand-version', '#controls-version', '#footer-version'].forEach((selector) => {
    const el = $(selector);
    if (el) el.textContent = `v${APP_VERSION}`;
  });
  const companionTitle = $('#companion-version-title');
  if (companionTitle) companionTitle.title = `NUL v${APP_VERSION} · ${RULESET_VERSION}`;

  new ResizeObserver(() => resizeCanvas()).observe(wrap);
  resizeCanvas();

  let restored = false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) restored = engine.restoreSnapshot(JSON.parse(raw));
  } catch {
    restored = false;
  }
  if (!restored) engine.resetWorld(true);
  else {
    $('#save-indicator').textContent = `Restored autosave · T+${pad(engine.tick)}`;
    setTimeout(() => showToast(`Welcome back. World restored at T+${pad(engine.tick)}.`), 250);
  }
  updateSaveUI();

  if (window.__NUL_ENABLE_TEST_HOOK__) {
    window.__NUL_LAB__ = {
      step: () => engine.simulate(),
      steps: (count) => engine.steps(count),
      resetWorld: (newSeed = true, explicitSeed = null, opts = {}) => engine.resetWorld(newSeed, explicitSeed, opts),
      perturb: (at) => triggerPerturb(at),
      inspectAt: (x, y) => inspectAt(x, y),
      clearInspection: () => clearInspection(),
      setCanvasLens: (lens) => engine.setCanvasLens(lens),
      setOntologyMode: (mode) => engine.setOntologyMode(mode),
      sampleFieldAt: (x, y) => engine.sampleFieldAt(x, y),
      createSnapshot: () => engine.createSnapshot(),
      restoreSnapshot: (data) => engine.restoreSnapshot(data),
      validSnapshot: (data) => engine.validSnapshot(data),
      exportOntology: () => engine.exportOntology(),
      validateOntology: (data) => engine.validateOntology(data),
      validOntology: (data) => engine.validOntology(data),
      importOntology: (data) => engine.importOntology(data),
      saveWorld: (notify = false) => saveWorld(notify),
      requestMode: (mode) => requestMode(mode),
      getDesktopMode: () => desktopMode,
      setViewport: (w, h) => {
        wrap._mockWidth = w;
        wrap._mockHeight = h;
        resizeCanvas();
      },
      getState: () => ({
        ...engine.getState(),
        inspectedTarget,
        desktopMode
      }),
      constants: engine.constants
    };
  }

  requestAnimationFrame(frame);
})();
