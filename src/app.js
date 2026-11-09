/**
 * NUL Browser & Desktop Companion UI Controller
 * Connects `NULCore` (`src/engine.js`) to Canvas 2D rendering, sticky Lab/Companion
 * layouts, local storage autosave, portable snapshots, and portable ontology import/export.
 */
(() => {
  'use strict';

  const Core = window.NULCore;
  if (!Core) throw new Error('NULCore (src/engine.js) must be loaded before src/app.js.');

  const {
    APP_VERSION,
    RULESET_VERSION,
    STORAGE_KEY,
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
      $('#save-summary').innerHTML = `<strong>T+${pad(data.tick)}</strong> · seed ${esc(data.seed)}<br>${esc(data.agent.concepts.length)} concepts · ${esc(data.artifacts.length)} artifacts<br>Saved ${esc(when)}`;
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

  // ---------- Observer rendering ----------
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

  function drawBackground() {
    const { width, height, agent } = engine;
    ctx.fillStyle = '#0d0f0c';
    ctx.fillRect(0, 0, width, height);
    const gradient = ctx.createRadialGradient(
      agent ? agent.x : width / 2,
      agent ? agent.y : height / 2,
      0,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.7
    );
    gradient.addColorStop(0, 'rgba(47,56,35,.10)');
    gradient.addColorStop(1, 'rgba(7,9,6,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(128,143,104,.035)';
    ctx.lineWidth = 1;
    const spacing = 80;
    for (let x = spacing; x < width; x += spacing) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = spacing; y < height; y += spacing) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
  }

  function drawSignal(signal) {
    const c = signal.conceptId ? engine.conceptById(signal.conceptId) : null;
    const pulse = (Math.sin(engine.tick * 0.075 + signal.phase) + 1) / 2;
    const size = 2.6 + signal.features[1] * 3.4;
    const alpha = signal.touched ? clamp((signal.life - engine.tick) / 32) : 0.55 + pulse * 0.35;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = c ? '#b5ca79' : '#89957a';
    ctx.fillStyle = c ? '#d6fa72' : '#a6b198';
    ctx.lineWidth = 0.8;
    if (c) {
      drawGlyphCanvas(c.glyph, signal.x, signal.y, 20 + signal.features[0] * 7, '#a9c466', alpha * 0.7);
    } else {
      ctx.beginPath(); ctx.arc(signal.x, signal.y, 6 + pulse * 3, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(signal.x, signal.y, size * 0.5, 0, Math.PI * 2); ctx.fill();
    }
    if (signal.id === engine.agent.targetId && !signal.touched) {
      ctx.globalAlpha = 0.4;
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.arc(signal.x, signal.y, 18 + pulse * 3, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawArtifact(artifact) {
    const pulse = Math.sin(engine.tick * 0.025 + artifact.phase) * 3;
    ctx.save();
    ctx.strokeStyle = 'rgba(224,185,108,.17)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(artifact.x, artifact.y, 28 + pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([2, 5]);
    ctx.beginPath(); ctx.arc(artifact.x, artifact.y, 20 - pulse * 0.2, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    drawGlyphCanvas(artifact.glyph, artifact.x, artifact.y, 27, '#e0b96c', 0.88);
    ctx.fillStyle = 'rgba(202,180,125,.65)';
    ctx.font = '9px ' + monoFont;
    ctx.textAlign = 'center';
    ctx.fillText(artifact.name, artifact.x, artifact.y + 43);
    ctx.restore();
  }

  function drawAgent() {
    const agent = engine.agent;
    if (agent.trail.length > 1) {
      ctx.save();
      ctx.lineWidth = 0.7;
      for (let i = 1; i < agent.trail.length; i++) {
        ctx.strokeStyle = `rgba(188,214,116,${(i / agent.trail.length) * 0.13})`;
        ctx.beginPath();
        ctx.moveTo(agent.trail[i - 1][0], agent.trail[i - 1][1]);
        ctx.lineTo(agent.trail[i][0], agent.trail[i][1]);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.save();
    ctx.strokeStyle = 'rgba(170,193,115,.075)';
    ctx.lineWidth = 0.7;
    ctx.setLineDash([2, 7]);
    ctx.beginPath(); ctx.arc(agent.x, agent.y, agent.senseRange, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    const target = engine.signalById(agent.targetId);
    if (target) {
      ctx.save();
      ctx.strokeStyle = 'rgba(190,213,126,.10)';
      ctx.setLineDash([2, 6]);
      ctx.beginPath(); ctx.moveTo(agent.x, agent.y); ctx.lineTo(target.x, target.y); ctx.stroke();
      ctx.restore();
    }
    const glow = ctx.createRadialGradient(agent.x, agent.y, 0, agent.x, agent.y, 28);
    glow.addColorStop(0, 'rgba(214,250,114,.24)');
    glow.addColorStop(1, 'rgba(214,250,114,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(agent.x, agent.y, 28, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.translate(agent.x, agent.y);
    ctx.rotate(engine.tick * 0.006);
    ctx.strokeStyle = '#d6fa72';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, 10, -0.4, 1.8); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 10, 2.7, 4.8); ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#e7ffc0';
    ctx.beginPath(); ctx.arc(agent.x, agent.y, 2.5, 0, Math.PI * 2); ctx.fill();
    if (agent.selfName) {
      ctx.fillStyle = 'rgba(210,229,170,.7)';
      ctx.font = '9px ' + monoFont;
      ctx.textAlign = 'center';
      ctx.fillText(agent.selfName, agent.x, agent.y - 20);
    }
  }

  // ---------- Observer inspection (pure readout; never touches PRNG or agent state) ----------
  function findEntityAt(x, y) {
    const agent = engine.agent;
    if (!agent) return null;
    if (Math.hypot(agent.x - x, agent.y - y) <= 22) return { kind: 'agent', id: 0, entity: agent };
    let best = null;
    let bestDist = Infinity;
    for (const artifact of engine.artifacts) {
      const d = Math.hypot(artifact.x - x, artifact.y - y);
      if (d <= 29 && d < bestDist) { bestDist = d; best = { kind: 'artifact', id: artifact.id, entity: artifact }; }
    }
    for (const signal of engine.signals) {
      const d = Math.hypot(signal.x - x, signal.y - y);
      if (d <= 21 && d < bestDist) { bestDist = d; best = { kind: 'signal', id: signal.id, entity: signal }; }
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
      const item = engine.signals.find((s) => s.id === inspectedTarget.id);
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
      $('#inspector-title').textContent = agent.selfName || 'unnamed locus';
      $('#inspector-kicker').textContent = 'Persistent embodied agent';
      $('#inspector-meta').innerHTML = `Energy ${Math.round(agent.energy * 100)}% · ${agent.interactions} contacts<br>${agent.concepts.length} concepts · ${agent.beliefs.length} beliefs · ${engine.artifacts.length} active creations`;
    } else if (kind === 'artifact') {
      const parents = entity.parents.map(engine.conceptById).filter(Boolean).map((c) => c.name).join(` ${agent.operators.join} `);
      const vec = entity.features.map((v) => v.toFixed(2)).join(', ');
      $('#inspector-glyph').innerHTML = glyphSVG(entity.glyph) || defaultSvg;
      $('#inspector-title').textContent = entity.name;
      $('#inspector-kicker').textContent = `Authored artifact #${pad(entity.id, 2)}`;
      $('#inspector-meta').innerHTML = `Combined: ${esc(parents || '—')} · born T+${pad(entity.born)}<br>Vector [${esc(vec)}]`;
    } else if (kind === 'signal') {
      const c = entity.conceptId ? engine.conceptById(entity.conceptId) : null;
      const vec = entity.features.map((v) => v.toFixed(2)).join(', ');
      $('#inspector-glyph').innerHTML = c ? glyphSVG(c.glyph) : defaultSvg;
      $('#inspector-title').textContent = c ? c.name : 'unclassified sensation';
      $('#inspector-kicker').textContent = c ? `Assigned to symbol #${pad(c.id, 2)}` : `Unlabelled event #${pad(entity.id, 2)}`;
      const valenceInfo = c ? `learned valence ${c.valence >= 0 ? '+' : ''}${c.valence.toFixed(2)}` : 'not yet perceived within sense range';
      $('#inspector-meta').innerHTML = `${esc(valenceInfo)}<br>Raw 4D vector [${esc(vec)}]`;
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
    drawBackground();
    for (const ripple of engine.ripples) {
      const progress = ripple.age / ripple.max;
      const colors = { positive: '214,250,114', negative: '231,132,112', artifact: '232,189,114', concept: '190,218,124', event: '135,148,119' };
      ctx.strokeStyle = `rgba(${colors[ripple.color] || colors.event},${(1 - progress) * 0.35})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(ripple.x, ripple.y, 5 + progress * ripple.max, 0, Math.PI * 2); ctx.stroke();
    }
    engine.signals.forEach(drawSignal);
    engine.artifacts.forEach(drawArtifact);
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
      ctx.strokeStyle = inspectedEntity.kind === 'artifact' ? 'rgba(232,189,114,.75)' : 'rgba(214,250,114,.75)';
      ctx.lineWidth = 1.1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(inspectedEntity.entity.x, inspectedEntity.entity.y, inspectedEntity.kind === 'artifact' ? 33 : 23, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function renderIdentity() {
    const agent = engine.agent;
    $('#identity-name').textContent = agent.selfName || 'unnamed';
    $('#companion-agent-name').textContent = agent.selfName ? `${agent.selfName} · ${agent.concepts.length} concepts` : 'learning to notice';
    $('#identity-sub').textContent = agent.selfName ? `Self-symbol authored at T+${pad(agent.selfBorn)}` : 'No self-symbol has formed';
    $('#identity-glyph').innerHTML = agent.selfGlyph
      ? glyphSVG(agent.selfGlyph)
      : '<svg viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="3" stroke="currentColor"/><circle cx="14" cy="14" r="10" stroke="currentColor" stroke-opacity=".35" stroke-dasharray="2 3"/></svg>';
  }

  function renderMemories() {
    const recent = engine.agent.memories.slice(-5).reverse();
    $('#memory-list').innerHTML = recent.length
      ? recent.map((m) => {
          const c = engine.conceptById(m.conceptId);
          return `<div class="memory"><span class="memory-dot ${m.effect > 0.025 ? 'positive' : m.effect < -0.02 ? 'negative' : ''}"></span><span class="memory-name">${esc(c ? c.name : '?')}</span><span class="memory-meta">${m.effect >= 0 ? '+' : ''}${m.effect.toFixed(2)} · T+${pad(m.tick)}</span></div>`;
        }).join('')
      : '<div class="empty-panel">No episodes have been stored.</div>';
  }

  function renderLexicon() {
    const concepts = engine.agent.concepts;
    $('#concept-list').innerHTML = concepts.length
      ? concepts.map((c) => {
          const sign = c.valence > 0.04 ? 'positive' : c.valence < -0.04 ? 'negative' : '';
          return `<article class="concept-card"><div class="concept-top">${glyphSVG(c.glyph, 'concept-glyph')}<div><div class="concept-name">${esc(c.name)}</div><div class="concept-id">SELF-AUTHORED SYMBOL ${pad(c.id, 2)}</div></div><div class="concept-valence ${sign}">${c.valence >= 0 ? '+' : ''}${c.valence.toFixed(2)}</div></div><div class="concept-bottom"><span>${c.seen} sensations · ${c.contacts} contacts</span><span>born T+${pad(c.born)}</span></div></article>`;
        }).join('')
      : '<div class="empty-panel"><svg viewBox="0 0 28 28" fill="none"><path d="M5 7h18M5 14h12M5 21h16" stroke="currentColor"/></svg><br>The symbol table is empty.<br>No word has been necessary yet.</div>';
  }

  function renderLaws() {
    const agent = engine.agent;
    $('#law-list').innerHTML = agent.beliefs.length
      ? agent.beliefs.map((b) => {
          const from = engine.conceptById(b.fromId);
          const to = engine.conceptById(b.toId);
          if (!from || !to) return '';
          return `<article class="law-card"><div class="law-raw">${esc(from.name)} ${esc(agent.operators.sequence)} ${esc(to.name)}</div><div class="law-translation">“${esc(from.name)}” preceded “${esc(to.name)}” in ${b.count} remembered transitions.</div><div class="law-confidence"><span>${Math.round(b.confidence * 100)}%</span><div class="bar"><i style="width:${b.confidence * 100}%"></i></div><span>fallible</span></div></article>`;
        }).join('')
      : '<div class="empty-panel">No sequence has repeated enough<br>to become a belief.</div>';

    $('#artifact-list').innerHTML = engine.artifacts.length
      ? engine.artifacts.map((a) => {
          const parents = a.parents.map(engine.conceptById).filter(Boolean).map((c) => c.name).join(` ${agent.operators.join} `);
          return `<article class="artifact-card">${glyphSVG(a.glyph)}<div><div class="artifact-name">${esc(a.name)}</div><div class="artifact-parents">${esc(parents)} · born T+${pad(a.born)}</div></div></article>`;
        }).join('')
      : '<div class="empty-panel">The agent has not yet combined<br>any of its own concepts.</div>';
  }

  function renderAll() {
    const agent = engine.agent;
    if (!agent) return;
    $('#empty-state').classList.toggle('hidden', engine.totalEvents > 0 || engine.artifacts.length > 0);
    $('#world-time').textContent = pad(engine.tick);
    $('#event-count').textContent = pad(engine.totalEvents, 2);
    $('#stat-concepts').textContent = agent.concepts.length;
    $('#stat-memories').textContent = agent.memories.length;
    $('#stat-laws').textContent = agent.beliefs.length;
    const totalCreated = agent.totalArtifactsCreated || engine.artifacts.length;
    $('#stat-artifacts').textContent = totalCreated;
    $('#stat-artifacts').title = totalCreated > engine.artifacts.length
      ? `${engine.artifacts.length} active in world (capped at ${Core.MAX_ARTIFACTS}) · ${totalCreated} authored total`
      : `${engine.artifacts.length} active in world`;
    $('#lexicon-count').textContent = agent.concepts.length;
    $('#world-count').textContent = agent.beliefs.length + engine.artifacts.length;
    $('#intent-raw').textContent = agent.goal ? agent.goal.raw : '·';
    $('#intent-description').textContent = agent.goal ? agent.goal.description : 'No preference has formed. The agent is only capable of noticing.';
    $('#energy-value').textContent = Math.round(agent.energy * 100) + '%';
    $('#energy-bar').style.width = agent.energy * 100 + '%';
    $('#novelty-value').textContent = Math.round(agent.novelty * 100) + '%';
    $('#novelty-bar').style.width = agent.novelty * 100 + '%';
    const coh = engine.coherence();
    $('#coherence-value').textContent = Math.round(coh * 100) + '%';
    $('#coherence-bar').style.width = coh * 100 + '%';
    renderIdentity();
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
      $('#empty-state').classList.toggle('hidden', engine.totalEvents > 0 || engine.artifacts.length > 0);
      $$('.speed-button').forEach((button) => button.classList.toggle('active', Number(button.dataset.speed) === engine.speed));
      $$('.log-mode').forEach((button) => button.classList.toggle('active', button.dataset.logmode === engine.logMode));
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
      resetWorld: (newSeed = true, explicitSeed = null) => engine.resetWorld(newSeed, explicitSeed),
      perturb: (at) => triggerPerturb(at),
      inspectAt: (x, y) => inspectAt(x, y),
      clearInspection: () => clearInspection(),
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
