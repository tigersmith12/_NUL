/**
 * NUL Core Simulation, Persistence & Ontology Engine
 * Zero external dependencies, zero DOM requirements, deterministic seeded PRNG.
 * Works identically in Browser (<script src="src/engine.js">), Electron, and Node.js.
 */
(function (root, factory) {
  const api = factory();
  root.NULCore = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  const APP_VERSION = '0.01.003';
  const RULESET_VERSION = 'BOOTSTRAP/0.1';
  const STORAGE_KEY = 'nul.world.autosave.v1';
  const SAVE_FORMAT = 'nul-resumable-world';
  const SAVE_VERSION = 1;
  const ONTOLOGY_FORMAT = 'nul-ontology';
  const ONTOLOGY_VERSION = 1;

  const MAX_CONCEPTS = 8;
  const MAX_ARTIFACTS = 24;
  const MAX_MEMORIES = 100;
  const MAX_LOGS = 70;
  const MAX_TRAIL = 65;
  const MAX_FEATURE_HISTORY = 24;
  const MAX_SIGNALS = 18;
  const MAX_PARTICLES = 160;
  const MAX_RIPPLES = 40;

  const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
  const pad = (n, length = 5) => String(n).padStart(length, '0');
  const esc = (value) => String(value).replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));

  // Allocation-free RMS feature distance (bit-for-bit identical to reduce/sqrt).
  function distance(a, b) {
    let sum = 0;
    const len = a.length;
    for (let i = 0; i < len; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum / len);
  }

  function mulberry32(initialSeed) {
    let state = initialSeed >>> 0;
    const random = function () {
      let t = state = (state + 0x6D2B79F5) >>> 0;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    random.getState = () => state;
    random.setState = (value) => { state = value >>> 0; };
    return random;
  }

  function safeGlyph(glyph) {
    if (!glyph || typeof glyph.path !== 'string') return null;
    const path = /^[ML0-9 ]+$/.test(glyph.path) ? glyph.path : 'M4 4 L24 24';
    const dot = Array.isArray(glyph.dot) && glyph.dot.length === 2 && glyph.dot.every((n) => Number.isFinite(n))
      ? glyph.dot.map((n) => clamp(n, 0, 28))
      : null;
    return { path, dot };
  }

  // Deterministic fallback glyph derived from a symbol string without touching world PRNG.
  function deterministicGlyphFromText(text) {
    const str = String(text || 'nul');
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    const pts = [4, 14, 24];
    const next = () => {
      h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
      return h;
    };
    const coords = [];
    const count = 4 + (next() % 3);
    for (let i = 0; i < count; i++) {
      coords.push([pts[next() % 3], pts[next() % 3]]);
    }
    let path = `M${coords[0][0]} ${coords[0][1]}`;
    for (let i = 1; i < coords.length; i++) path += ` L${coords[i][0]} ${coords[i][1]}`;
    if ((next() % 100) > 52) path += ` L${coords[0][0]} ${coords[0][1]}`;
    const dot = (next() % 100) > 45 ? [pts[next() % 3], pts[next() % 3]] : null;
    return { path, dot };
  }

  function glyphSVG(glyph, className = '') {
    const safe = safeGlyph(glyph);
    if (!safe) return '';
    const dot = safe.dot ? `<circle cx="${safe.dot[0]}" cy="${safe.dot[1]}" r="1.6" fill="currentColor"/>` : '';
    return `<svg class="${esc(className)}" viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="${safe.path}" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>${dot}</svg>`;
  }

  function validSnapshot(data) {
    const finite = Number.isFinite;
    const vector = (value) => Array.isArray(value) && value.length === 4 && value.every(finite);
    const point = (value) => Boolean(value && finite(value.x) && finite(value.y));
    const numbers = (object, keys) => keys.every((key) => finite(object[key]));
    if (!data || data.format !== SAVE_FORMAT || data.version !== SAVE_VERSION ||
      !Number.isInteger(data.seed) || !finite(data.rngState) || !Number.isInteger(data.tick) || data.tick < 0 ||
      !Number.isInteger(data.totalEvents) || !finite(data.nextSpawn) ||
      !data.world || !finite(data.world.width) || data.world.width <= 0 || !finite(data.world.height) || data.world.height <= 0 ||
      !data.agent || !point(data.agent) || !Array.isArray(data.agent.usedNames) ||
      !data.agent.relationCounts || !data.agent.operators ||
      !['signals', 'artifacts', 'particles', 'ripples', 'featureHistory', 'logs'].every((key) => Array.isArray(data[key]))) return false;
    const a = data.agent;
    return a.usedNames.every((name) => typeof name === 'string') &&
      numbers(a, ['vx', 'vy', 'energy', 'senseRange', 'interactions', 'lastInteractionTick', 'lastArtifactTick', 'novelty']) &&
      Array.isArray(a.concepts) && Array.isArray(a.memories) && Array.isArray(a.beliefs) && Array.isArray(a.trail) &&
      Object.values(a.operators).every((value) => typeof value === 'string') &&
      a.concepts.every((c) => typeof c.name === 'string' && vector(c.prototype) && numbers(c, ['id', 'born', 'seen', 'contacts', 'valence', 'totalEffect', 'examples'])) &&
      a.memories.every((m) => numbers(m, ['tick', 'conceptId', 'signalId', 'effect', 'energyAfter'])) &&
      a.beliefs.every((b) => typeof b.key === 'string' && numbers(b, ['fromId', 'toId', 'count', 'born', 'confidence'])) &&
      a.trail.every((p) => Array.isArray(p) && p.length === 2 && p.every(finite)) &&
      data.signals.every((s) => point(s) && vector(s.features) && numbers(s, ['id', 'vx', 'vy', 'effect', 'born', 'life', 'phase'])) &&
      data.artifacts.every((item) => point(item) && vector(item.features) && Array.isArray(item.parents) && numbers(item, ['id', 'born', 'phase'])) &&
      data.particles.every((p) => point(p) && numbers(p, ['vx', 'vy', 'age', 'max'])) &&
      data.ripples.every((r) => point(r) && numbers(r, ['age', 'max'])) &&
      data.featureHistory.every(vector) &&
      data.logs.every((entry) => finite(entry.tick) && typeof entry.raw === 'string' && typeof entry.translation === 'string');
  }

  function validateOntology(data) {
    const finite = Number.isFinite;
    const vector = (value) => Array.isArray(value) && value.length === 4 && value.every((n) => finite(n) && n >= -0.01 && n <= 1.01);
    if (!data || typeof data !== 'object') {
      return { valid: false, reason: 'This is not a valid NUL ontology JSON file.' };
    }
    if (data.format === SAVE_FORMAT) {
      return {
        valid: false,
        reason: 'This file is a complete world snapshot, not an ontology export. Use "Import snapshot" in Saves instead.'
      };
    }
    if (data.format !== undefined && data.format !== ONTOLOGY_FORMAT) {
      return { valid: false, reason: `Unsupported ontology format "${String(data.format)}".` };
    }
    if (data.version !== undefined && data.version !== ONTOLOGY_VERSION) {
      return { valid: false, reason: `Unsupported ontology schema version "${String(data.version)}".` };
    }

    const a = data.agent;
    if (!a || typeof a !== 'object' || !Array.isArray(a.concepts) || !Array.isArray(a.beliefs)) {
      return { valid: false, reason: 'Ontology JSON is missing agent.concepts or agent.beliefs.' };
    }
    if (a.concepts.length > MAX_CONCEPTS) {
      return { valid: false, reason: `Ontology exceeds MAX_CONCEPTS (${MAX_CONCEPTS}).` };
    }

    const conceptIds = new Set();
    const conceptNames = new Set();
    for (const c of a.concepts) {
      if (!c || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 32 ||
        !Number.isInteger(c.id) || c.id < 1 || !vector(c.prototype) ||
        !['born', 'seen', 'contacts', 'valence', 'totalEffect', 'examples'].every((k) => finite(c[k]))) {
        return { valid: false, reason: 'One or more ontology concepts have invalid structure or non-finite values.' };
      }
      if (conceptIds.has(c.id) || conceptNames.has(c.name)) {
        return { valid: false, reason: 'Ontology contains duplicate concept IDs or symbol names.' };
      }
      conceptIds.add(c.id);
      conceptNames.add(c.name);
    }

    for (const b of a.beliefs) {
      if (!b || typeof b.key !== 'string' || !Number.isInteger(b.fromId) || !Number.isInteger(b.toId) ||
        b.fromId === b.toId || !conceptIds.has(b.fromId) || !conceptIds.has(b.toId) ||
        !['count', 'born', 'confidence'].every((k) => finite(b[k])) || b.count < 1) {
        return { valid: false, reason: 'One or more ontology beliefs reference missing concepts or invalid counts.' };
      }
    }

    const ops = a.generatedOperators || a.operators;
    if (ops !== undefined) {
      if (!ops || typeof ops !== 'object' ||
        !['is', 'sequence', 'join', 'create'].every((k) => typeof ops[k] === 'string' && ops[k].trim().length > 0 && ops[k].length <= 6)) {
        return { valid: false, reason: 'Ontology generatedOperators must include non-empty is, sequence, join, and create symbols.' };
      }
    }

    if (a.selfSymbol !== undefined && a.selfSymbol !== null && (typeof a.selfSymbol !== 'string' || a.selfSymbol.length > 32)) {
      return { valid: false, reason: 'Invalid agent selfSymbol in ontology JSON.' };
    }

    return { valid: true };
  }

  function validOntology(data) {
    return validateOntology(data).valid;
  }

  function defaultRandomSeed() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      return (crypto.getRandomValues(new Uint32Array(1))[0] % 900000) + 100000;
    }
    return (Math.floor(Math.random() * 900000) + 100000);
  }

  function createEngine(options = {}) {
    let width = Math.max(280, Number(options.width) || 800);
    let height = Math.max(300, Number(options.height) || 520);
    let running = true;
    let speed = 1;
    let logMode = 'dual';
    let seed = 0;
    let tick = 0;
    let totalEvents = 0;
    let nextSpawn = 12;
    let signals = [];
    let artifacts = [];
    let particles = [];
    let ripples = [];
    let featureHistory = [];
    let agent = null;
    let logs = [];
    let rng = () => 0.5;

    const hooks = {
      onLog: options.onLog || null,
      onIdentity: options.onIdentity || null,
      onRender: options.onRender || null,
      onAutosave: options.onAutosave || null,
      onControls: options.onControls || null,
      onWorldReset: options.onWorldReset || null,
      onSnapshotRestored: options.onSnapshotRestored || null,
      onOntologyImported: options.onOntologyImported || null
    };

    const randomBetween = (a, b) => a + rng() * (b - a);
    const pick = (array) => array[Math.floor(rng() * array.length)];

    function freshAgent() {
      return {
        x: width / 2, y: height / 2, vx: 0, vy: 0, heading: 0,
        energy: 0.72, senseRange: 146, concepts: [], memories: [], beliefs: [], artifacts,
        totalArtifactsCreated: 0,
        selfName: null, selfGlyph: null, selfBorn: null, interactions: 0, targetId: null, goal: null,
        lastConceptId: null, lastInteractionTick: -999, lastArtifactTick: -150,
        lastGoalKey: '', usedNames: new Set(), relationCounts: {}, trail: [],
        operators: {
          is: pick(['::', '≔', '↦']),
          sequence: pick(['›', '⇝', '⊸']),
          join: pick(['⊕', '⋈', '∧']),
          create: pick(['≪', '✣', '∴'])
        },
        novelty: 0
      };
    }

    function pruneUnusedNames() {
      if (!agent) return;
      const active = new Set();
      if (agent.selfName) active.add(agent.selfName);
      for (const c of agent.concepts) active.add(c.name);
      for (const a of artifacts) active.add(a.name);
      const ordered = new Set();
      for (const existing of agent.usedNames) {
        if (active.has(existing)) ordered.add(existing);
      }
      for (const req of active) ordered.add(req);
      agent.usedNames = ordered;
    }

    function setDimensions(nextWidth, nextHeight) {
      const oldWidth = width;
      const oldHeight = height;
      width = Math.max(280, Number(nextWidth) || width);
      height = Math.max(300, Number(nextHeight) || height);
      if (agent && oldWidth && oldHeight && (oldWidth !== width || oldHeight !== height)) {
        const sx = width / oldWidth;
        const sy = height / oldHeight;
        agent.x *= sx; agent.y *= sy;
        for (const s of signals) { s.x *= sx; s.y *= sy; }
        for (const a of artifacts) { a.x *= sx; a.y *= sy; }
        for (const p of particles) { p.x *= sx; p.y *= sy; }
        for (const r of ripples) { r.x *= sx; r.y *= sy; }
        for (const point of agent.trail) { point[0] *= sx; point[1] *= sy; }
      }
      return { width, height };
    }

    function makeGlyph() {
      const points = [4, 14, 24];
      const count = 4 + Math.floor(rng() * 3);
      const coords = [];
      for (let i = 0; i < count; i++) coords.push([pick(points), pick(points)]);
      let path = `M${coords[0][0]} ${coords[0][1]}`;
      coords.slice(1).forEach((p) => { path += ` L${p[0]} ${p[1]}`; });
      if (rng() > 0.52) path += ` L${coords[0][0]} ${coords[0][1]}`;
      return { path, dot: rng() > 0.45 ? [pick(points), pick(points)] : null };
    }

    function makeName() {
      const consonants = ['m', 'n', 's', 't', 'r', 'l', 'k', 'v', 'z', 'p', 'h', 'd', 'sh', 'th'];
      const vowels = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'eo'];
      let name = '';
      do {
        const syllables = 2 + (rng() > 0.72 ? 1 : 0);
        name = '';
        for (let i = 0; i < syllables; i++) name += pick(consonants) + pick(vowels);
        name = name.replace(/([a-z])\1+/g, '$1');
      } while (agent && agent.usedNames.has(name));
      if (agent) agent.usedNames.add(name);
      return name;
    }

    function addLog(raw, translation, kind = 'agent') {
      logs.push({ tick, raw, translation, kind });
      if (logs.length > MAX_LOGS) logs.shift();
      if (hooks.onLog) hooks.onLog(logs);
    }

    function conceptById(id) {
      return agent ? agent.concepts.find((c) => c.id === id) : undefined;
    }

    function signalById(id) {
      return signals.find((s) => s.id === id);
    }

    function burst(x, y, color, count) {
      for (let i = 0; i < count; i++) {
        const angle = randomBetween(0, Math.PI * 2);
        const velocity = randomBetween(0.2, 1.25);
        particles.push({
          x, y,
          vx: Math.cos(angle) * velocity,
          vy: Math.sin(angle) * velocity,
          age: 0,
          max: randomBetween(25, 70),
          color
        });
      }
      if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
    }

    function spawnSignal(opts = {}) {
      const angle = randomBetween(0, Math.PI * 2);
      const radius = opts.near ? randomBetween(55, 120) : randomBetween(75, 175);
      const x = opts.x ?? clamp(agent.x + Math.cos(angle) * radius, 30, width - 30);
      const y = opts.y ?? clamp(agent.y + Math.sin(angle) * radius, 55, height - 35);
      let features;
      if (opts.novel || featureHistory.length === 0 || rng() < 0.31) {
        features = [rng(), rng(), rng(), rng()];
      } else {
        const parent = pick(featureHistory);
        features = parent.map((v) => clamp(v + randomBetween(-0.105, 0.105), 0.02, 0.98));
      }
      const signal = {
        id: ++totalEvents,
        x, y,
        vx: randomBetween(-0.075, 0.075),
        vy: randomBetween(-0.075, 0.075),
        features,
        effect: randomBetween(-0.085, 0.135),
        born: tick,
        life: tick + Math.floor(randomBetween(250, 480)),
        phase: randomBetween(0, Math.PI * 2),
        conceptId: null,
        touched: false,
        manual: Boolean(opts.manual)
      };
      signals.push(signal);
      if (signals.length > MAX_SIGNALS) signals.shift();
      featureHistory.push(features.slice());
      if (featureHistory.length > MAX_FEATURE_HISTORY) featureHistory.shift();
      ripples.push({ x, y, age: 0, max: 48, color: 'event' });
      if (ripples.length > MAX_RIPPLES) ripples.shift();
      return signal;
    }

    function classify(signal) {
      let nearest = null;
      let nearestDistance = Infinity;
      for (const concept of agent.concepts) {
        const d = distance(signal.features, concept.prototype);
        if (d < nearestDistance) {
          nearestDistance = d;
          nearest = concept;
        }
      }
      const threshold = 0.27;
      if (!nearest || (nearestDistance > threshold && agent.concepts.length < MAX_CONCEPTS)) {
        const index = agent.concepts.length + 1;
        const concept = {
          id: index,
          name: makeName(),
          glyph: makeGlyph(),
          prototype: signal.features.slice(),
          born: tick,
          seen: 0,
          contacts: 0,
          valence: 0,
          totalEffect: 0,
          examples: 1
        };
        agent.concepts.push(concept);
        nearest = concept;
        nearestDistance = 0;
        addLog(
          `${concept.name} ${agent.operators.is} [${signal.features.map((v) => Math.round(v * 9)).join('·')}]`,
          `A sensation is differentiated from the void. Its new symbol is “${concept.name}.”`
        );
        burst(signal.x, signal.y, 'concept', 13);
      } else {
        nearest.examples++;
        const rate = Math.min(0.22, 1 / (nearest.examples + 2));
        nearest.prototype = nearest.prototype.map((v, i) => v + (signal.features[i] - v) * rate);
      }
      nearest.seen++;
      signal.conceptId = nearest.id;
      agent.novelty = clamp(nearestDistance / 0.5);
      return nearest;
    }

    function setGoal(type, concept, description) {
      const key = type + ':' + (concept ? concept.id : 0);
      const rawName = concept ? concept.name : '?';
      agent.goal = {
        type,
        conceptId: concept ? concept.id : null,
        raw: `${rawName} ${agent.operators.sequence} ${type === 'restore' ? '+' : type === 'wait' ? '·' : '?'}`,
        description,
        key
      };
      if (agent.lastGoalKey && agent.lastGoalKey !== key && type === 'restore') {
        addLog(agent.goal.raw, description);
      }
      agent.lastGoalKey = key;
    }

    function chooseGoal() {
      const available = signals.filter((s) => !s.touched && tick - s.born > 3);
      if (!available.length) {
        agent.targetId = null;
        setGoal('wait', null, 'Attend to whatever arrives next; no object is preferred.');
        return;
      }
      let best = null;
      let bestUtility = -Infinity;
      let bestNovelty = 0;
      for (const signal of available) {
        const concept = signal.conceptId ? conceptById(signal.conceptId) : null;
        const d = Math.hypot(signal.x - agent.x, signal.y - agent.y);
        let nearestPrototypeDistance = 1;
        if (agent.concepts.length) {
          for (const c of agent.concepts) {
            const pd = distance(signal.features, c.prototype);
            if (pd < nearestPrototypeDistance) nearestPrototypeDistance = pd;
          }
        }
        const novelty = concept ? clamp(1 / (1 + concept.seen * 0.17)) : clamp(nearestPrototypeDistance * 2.2);
        const valence = concept ? concept.valence : 0;
        const need = (1 - agent.energy) * Math.max(0, valence) * 1.4;
        const aversion = valence < -0.18 && agent.energy < 0.65 ? valence * 1.2 : valence * 0.25;
        const utility = novelty * 0.62 + aversion + need - d / 700 + rng() * 0.08;
        if (utility > bestUtility) {
          best = signal;
          bestUtility = utility;
          bestNovelty = novelty;
        }
      }
      agent.targetId = best.id;
      agent.novelty = bestNovelty;
      const concept = best.conceptId ? conceptById(best.conceptId) : null;
      if (concept && concept.valence > 0.18 && agent.energy < 0.52) {
        setGoal('restore', concept, `Attend to “${concept.name}”; past contact with this self-named pattern restored energy.`);
      } else if (concept && concept.seen > 4 && bestNovelty < 0.3) {
        setGoal('revisit', concept, `Revisit “${concept.name}” and test whether its stored value remains stable.`);
      } else if (concept) {
        setGoal('inspect', concept, `Inspect the pattern currently associated with “${concept.name}.”`);
      } else {
        setGoal('unknown', null, 'Approach a sensation that does not yet belong to a named concept.');
      }
    }

    function perceive() {
      for (const signal of signals) {
        if (signal.conceptId || signal.touched) continue;
        const d = Math.hypot(signal.x - agent.x, signal.y - agent.y);
        if (d < agent.senseRange) classify(signal);
      }
    }

    function learnSequence(fromId, toId) {
      const key = `${fromId}>${toId}`;
      agent.relationCounts[key] = (agent.relationCounts[key] || 0) + 1;
      const count = agent.relationCounts[key];
      if (count === 2 && !agent.beliefs.some((b) => b.key === key)) {
        const from = conceptById(fromId);
        const to = conceptById(toId);
        agent.beliefs.push({ key, fromId, toId, count, born: tick, confidence: 0.52 });
        addLog(
          `${from.name} ${agent.operators.sequence} ${to.name}`,
          `A candidate regularity is recorded: encounters with “${from.name}” have preceded “${to.name}.” It is a belief, not a guaranteed law.`
        );
      } else if (count > 2) {
        const belief = agent.beliefs.find((b) => b.key === key);
        if (belief) {
          belief.count = count;
          belief.confidence = clamp(0.42 + Math.log(count) * 0.18, 0, 0.94);
        }
      }
    }

    function authorArtifact() {
      const candidates = [...agent.concepts].sort((a, b) => (b.contacts + b.valence * 2) - (a.contacts + a.valence * 2));
      const a = candidates[0];
      const b = candidates.find((c) => c.id !== a.id) || candidates[1];
      if (!a || !b) return;
      const name = makeName();
      agent.totalArtifactsCreated = (agent.totalArtifactsCreated || artifacts.length) + 1;
      const artifact = {
        id: agent.totalArtifactsCreated,
        name,
        glyph: makeGlyph(),
        parents: [a.id, b.id],
        x: clamp(agent.x + randomBetween(-60, 60), 35, width - 35),
        y: clamp(agent.y + randomBetween(-60, 60), 55, height - 35),
        born: tick,
        phase: randomBetween(0, Math.PI * 2),
        features: a.prototype.map((v, i) => clamp((v + b.prototype[i]) / 2 + randomBetween(-0.08, 0.08)))
      };
      artifacts.push(artifact);
      if (agent.artifacts !== artifacts) agent.artifacts = artifacts;
      if (artifacts.length > MAX_ARTIFACTS) {
        artifacts.shift();
        pruneUnusedNames();
      }
      agent.lastArtifactTick = tick;
      agent.energy = clamp(agent.energy - 0.08);
      featureHistory.push(artifact.features.slice());
      if (featureHistory.length > MAX_FEATURE_HISTORY) featureHistory.shift();
      addLog(
        `${agent.selfName || '·'} ${agent.operators.create} ${name} ${agent.operators.is} ${a.name} ${agent.operators.join} ${b.name}`,
        `Two self-named patterns, “${a.name}” and “${b.name},” are combined. The resulting persistent artifact is named “${name}.”`
      );
      ripples.push({ x: artifact.x, y: artifact.y, age: 0, max: 90, color: 'artifact' });
      if (ripples.length > MAX_RIPPLES) ripples.shift();
      burst(artifact.x, artifact.y, 'artifact', 22);
    }

    function interact(signal) {
      if (signal.touched) return;
      signal.touched = true;
      signal.life = Math.min(signal.life, tick + 32);
      const concept = signal.conceptId || classify(signal).id;
      const c = conceptById(concept);
      agent.interactions++;
      agent.energy = clamp(agent.energy + signal.effect, 0.05, 1);
      c.contacts++;
      c.totalEffect += signal.effect;
      c.valence = clamp(c.totalEffect / (c.contacts * 0.09), -1, 1);
      const episode = { tick, conceptId: c.id, signalId: signal.id, effect: signal.effect, energyAfter: agent.energy };
      agent.memories.push(episode);
      if (agent.memories.length > MAX_MEMORIES) agent.memories.shift();
      ripples.push({ x: signal.x, y: signal.y, age: 0, max: 58, color: signal.effect >= 0 ? 'positive' : 'negative' });
      if (ripples.length > MAX_RIPPLES) ripples.shift();
      burst(signal.x, signal.y, signal.effect >= 0 ? 'positive' : 'negative', 8);

      if (agent.lastConceptId && agent.lastConceptId !== c.id && tick - agent.lastInteractionTick < 100) {
        learnSequence(agent.lastConceptId, c.id);
      }
      agent.lastConceptId = c.id;
      agent.lastInteractionTick = tick;

      if (c.contacts === 2) {
        const sign = c.valence >= 0 ? '+' : '−';
        addLog(
          `${c.name} ${agent.operators.is} ${sign}${Math.abs(c.valence).toFixed(2)}`,
          `Repeated contact gives “${c.name}” a ${c.valence >= 0 ? 'positive' : 'negative'} association. The category now carries a learned preference.`
        );
      }
      if (!agent.selfName && agent.interactions >= 4) {
        agent.selfName = makeName();
        agent.selfGlyph = makeGlyph();
        agent.selfBorn = tick;
        addLog(
          `${agent.selfName} ${agent.operators.is} [${agent.memories.length}]`,
          `One locus persists across ${agent.memories.length} episodes. The agent assigns that recurring locus the self-symbol “${agent.selfName}.”`
        );
        if (hooks.onIdentity) hooks.onIdentity();
      }
      if (agent.concepts.length >= 2 && agent.interactions >= 8 && tick - agent.lastArtifactTick > 115 && agent.energy > 0.42) {
        authorArtifact();
      }
      agent.targetId = null;
      chooseGoal();
    }

    function simulate() {
      tick++;
      agent.energy = clamp(agent.energy - 0.00055, 0.05, 1);
      if (tick >= nextSpawn && signals.length < 9) {
        spawnSignal();
        nextSpawn = tick + Math.floor(randomBetween(20, 34));
      }
      if (tick % 4 === 0) perceive();
      if (tick % 30 === 0 || (!agent.targetId && !agent.goal)) chooseGoal();

      for (const signal of signals) {
        signal.x += signal.vx;
        signal.y += signal.vy;
        if (signal.x < 20 || signal.x > width - 20) signal.vx *= -1;
        if (signal.y < 35 || signal.y > height - 20) signal.vy *= -1;
      }
      signals = signals.filter((s) => tick < s.life);

      let target = signalById(agent.targetId);
      if (!target || target.touched) {
        if (tick % 15 === 0 || !target) chooseGoal();
        target = signalById(agent.targetId);
      }
      if (target) {
        const dx = target.x - agent.x;
        const dy = target.y - agent.y;
        const d = Math.max(0.001, Math.hypot(dx, dy));
        agent.heading = Math.atan2(dy, dx);
        if (d > 19) {
          const velocity = 1.5 + agent.energy * 1.05;
          agent.vx += ((dx / d) * velocity - agent.vx) * 0.13;
          agent.vy += ((dy / d) * velocity - agent.vy) * 0.13;
        } else {
          agent.vx *= 0.75;
          agent.vy *= 0.75;
          interact(target);
        }
      } else {
        const angle = tick * 0.008 + (seed % 100) * 0.1;
        agent.vx += (Math.cos(angle) * 0.48 - agent.vx) * 0.03;
        agent.vy += (Math.sin(angle * 0.83) * 0.48 - agent.vy) * 0.03;
      }
      agent.x += agent.vx;
      agent.y += agent.vy;
      if (agent.x < 22 || agent.x > width - 22) {
        agent.vx *= -0.7;
        agent.x = clamp(agent.x, 22, width - 22);
      }
      if (agent.y < 45 || agent.y > height - 25) {
        agent.vy *= -0.7;
        agent.y = clamp(agent.y, 45, height - 25);
      }
      if (tick % 3 === 0) {
        agent.trail.push([agent.x, agent.y]);
        if (agent.trail.length > MAX_TRAIL) agent.trail.shift();
      }
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.age++;
      }
      particles = particles.filter((p) => p.age < p.max);
      for (const r of ripples) r.age++;
      ripples = ripples.filter((r) => r.age < r.max);

      if (tick % 12 === 0 && hooks.onRender) hooks.onRender();
      if (tick % 120 === 0 && hooks.onAutosave) hooks.onAutosave(false);
    }

    function resetWorld(newSeed = true, explicitSeed = null) {
      if (Number.isInteger(explicitSeed) && explicitSeed >= 1 && explicitSeed <= 2147483647) {
        seed = explicitSeed;
      } else if (newSeed) {
        seed = defaultRandomSeed();
      }
      rng = mulberry32(seed);
      tick = 0;
      totalEvents = 0;
      nextSpawn = 14;
      signals = [];
      artifacts = [];
      particles = [];
      ripples = [];
      featureHistory = [];
      logs = [];
      agent = freshAgent();
      running = true;
      addLog('·', 'No symbols. No observations. The world has not yet been differentiated.', 'system');
      if (hooks.onWorldReset) hooks.onWorldReset();
      if (hooks.onControls) hooks.onControls();
      if (hooks.onRender) hooks.onRender();
      if (hooks.onAutosave) hooks.onAutosave(false);
    }

    function perturb(at) {
      const sig = spawnSignal({
        x: at ? at.x : undefined,
        y: at ? at.y : undefined,
        novel: true,
        manual: true,
        near: true
      });
      if (hooks.onRender) hooks.onRender();
      if (hooks.onAutosave) hooks.onAutosave(false);
      return sig;
    }

    function coherence() {
      if (!agent || !agent.concepts.length) return 0;
      return agent.concepts.reduce((sum, c) => sum + clamp(c.contacts / 5), 0) / agent.concepts.length;
    }

    function createSnapshot() {
      return {
        format: SAVE_FORMAT,
        version: SAVE_VERSION,
        appVersion: APP_VERSION,
        savedAt: new Date().toISOString(),
        seed,
        rngState: rng.getState(),
        tick,
        totalEvents,
        nextSpawn,
        world: { width, height },
        signals,
        artifacts,
        particles,
        ripples,
        featureHistory,
        logs,
        agent: { ...agent, usedNames: [...agent.usedNames] },
        ui: { running, speed, logMode }
      };
    }

    function restoreSnapshot(data) {
      if (!validSnapshot(data)) throw new Error('This is not a valid NUL world snapshot.');
      seed = data.seed;
      rng = mulberry32(seed);
      rng.setState(data.rngState);
      tick = data.tick;
      totalEvents = data.totalEvents;
      nextSpawn = data.nextSpawn;

      const seenArtifactIds = new Set();
      const dedupedArtifacts = [];
      for (const item of data.artifacts) {
        if (!seenArtifactIds.has(item.id)) {
          seenArtifactIds.add(item.id);
          dedupedArtifacts.push(item);
        }
      }
      while (dedupedArtifacts.length > MAX_ARTIFACTS) dedupedArtifacts.shift();

      signals = data.signals.slice(-MAX_SIGNALS);
      artifacts = dedupedArtifacts;
      particles = data.particles.slice(-MAX_PARTICLES);
      ripples = data.ripples.slice(-MAX_RIPPLES);
      featureHistory = data.featureHistory.slice(-MAX_FEATURE_HISTORY);
      logs = data.logs.slice(-MAX_LOGS);
      agent = data.agent;
      agent.usedNames = new Set(data.agent.usedNames);
      agent.artifacts = artifacts;
      const maxArtifactId = artifacts.reduce((max, item) => Math.max(max, item.id), 0);
      agent.totalArtifactsCreated = Number.isFinite(data.agent.totalArtifactsCreated)
        ? Math.max(data.agent.totalArtifactsCreated, maxArtifactId, artifacts.length)
        : Math.max(maxArtifactId, artifacts.length);
      pruneUnusedNames();

      const sx = width / data.world.width;
      const sy = height / data.world.height;
      const scalePoint = (object) => {
        if (object && Number.isFinite(object.x) && Number.isFinite(object.y)) {
          object.x *= sx;
          object.y *= sy;
        }
      };
      [agent, ...signals, ...artifacts, ...particles, ...ripples].forEach(scalePoint);
      agent.trail.forEach((point) => {
        if (Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])) {
          point[0] *= sx;
          point[1] *= sy;
        }
      });

      running = data.ui ? data.ui.running !== false : true;
      speed = data.ui && [1, 2, 4, 8].includes(data.ui.speed) ? data.ui.speed : 1;
      logMode = data.ui && ['dual', 'agent', 'observer'].includes(data.ui.logMode) ? data.ui.logMode : 'dual';

      if (hooks.onSnapshotRestored) hooks.onSnapshotRestored();
      if (hooks.onLog) hooks.onLog(logs);
      if (hooks.onControls) hooks.onControls();
      if (hooks.onRender) hooks.onRender();
      return true;
    }

    function exportOntology() {
      return {
        format: ONTOLOGY_FORMAT,
        version: ONTOLOGY_VERSION,
        experiment: `NUL v${APP_VERSION} / bootstrap 0.1`,
        appVersion: APP_VERSION,
        ruleset: RULESET_VERSION,
        exportedAt: new Date().toISOString(),
        architecture: 'Non-LLM symbolic artificial life; seeded rules + vector similarity + episodic memory',
        seed,
        tick,
        observerNote: 'Names and categories below were generated during this run. Observer metadata is not supplied to the agent.',
        agent: {
          selfSymbol: agent.selfName,
          selfGlyph: agent.selfGlyph ? safeGlyph(agent.selfGlyph) : null,
          selfBorn: agent.selfBorn,
          energy: agent.energy,
          currentIntent: agent.goal,
          concepts: agent.concepts.map((c) => ({
            ...c,
            glyph: safeGlyph(c.glyph) || deterministicGlyphFromText(c.name),
            prototype: c.prototype.slice()
          })),
          beliefs: agent.beliefs.map((b) => ({ ...b })),
          relationCounts: { ...agent.relationCounts },
          artifacts: artifacts.map((a) => ({
            ...a,
            glyph: safeGlyph(a.glyph) || deterministicGlyphFromText(a.name),
            parents: a.parents.slice(),
            features: a.features.slice()
          })),
          episodicMemory: agent.memories.map((m) => ({ ...m })),
          generatedOperators: { ...agent.operators }
        },
        unclassifiedEvents: signals
          .filter((s) => !s.conceptId)
          .map((s) => ({ id: s.id, born: s.born, features: s.features.slice() }))
      };
    }

    // Transplants an exported ontology (mind) into the current world without altering world PRNG.
    function importOntology(data) {
      const check = validateOntology(data);
      if (!check.valid) throw new Error(check.reason);

      const src = data.agent;
      const importedConcepts = src.concepts
        .slice(0, MAX_CONCEPTS)
        .map((c, idx) => ({
          id: idx + 1,
          name: c.name.trim(),
          glyph: safeGlyph(c.glyph) || deterministicGlyphFromText(c.name),
          prototype: c.prototype.map((v) => clamp(Number(v), 0, 1)),
          born: Math.max(0, Math.round(c.born)),
          seen: Math.max(0, Math.round(c.seen)),
          contacts: Math.max(0, Math.round(c.contacts)),
          valence: clamp(Number(c.valence), -1, 1),
          totalEffect: Number(c.totalEffect),
          examples: Math.max(1, Math.round(c.examples))
        }));

      const idMap = new Map();
      src.concepts.slice(0, MAX_CONCEPTS).forEach((orig, idx) => {
        idMap.set(orig.id, idx + 1);
      });

      const importedBeliefs = [];
      const importedRelations = {};
      if (src.relationCounts && typeof src.relationCounts === 'object') {
        for (const [rawKey, rawVal] of Object.entries(src.relationCounts)) {
          const m = rawKey.match(/^(\d+)>(\d+)$/);
          if (m && Number.isFinite(rawVal) && rawVal > 0) {
            const fromMapped = idMap.get(Number(m[1]));
            const toMapped = idMap.get(Number(m[2]));
            if (fromMapped && toMapped && fromMapped !== toMapped) {
              importedRelations[`${fromMapped}>${toMapped}`] = Math.round(rawVal);
            }
          }
        }
      }

      for (const b of src.beliefs) {
        const fromId = idMap.get(b.fromId);
        const toId = idMap.get(b.toId);
        if (!fromId || !toId || fromId === toId) continue;
        const key = `${fromId}>${toId}`;
        if (importedBeliefs.some((existing) => existing.key === key)) continue;
        const count = Math.max(2, Math.round(b.count));
        importedRelations[key] = Math.max(importedRelations[key] || 0, count);
        importedBeliefs.push({
          key,
          fromId,
          toId,
          count,
          born: Math.max(0, Math.round(b.born)),
          confidence: clamp(Number(b.confidence), 0, 0.99)
        });
      }

      const ops = src.generatedOperators || src.operators;
      if (ops) {
        agent.operators = {
          is: ops.is,
          sequence: ops.sequence,
          join: ops.join,
          create: ops.create
        };
      }

      if (typeof src.selfSymbol === 'string' && src.selfSymbol.trim()) {
        agent.selfName = src.selfSymbol.trim();
        agent.selfGlyph = safeGlyph(src.selfGlyph) || deterministicGlyphFromText(agent.selfName);
        agent.selfBorn = Number.isFinite(src.selfBorn) ? Math.max(0, Math.round(src.selfBorn)) : tick;
      }

      agent.concepts = importedConcepts;
      agent.beliefs = importedBeliefs;
      agent.relationCounts = importedRelations;
      agent.memories = [];
      agent.lastConceptId = null;
      agent.targetId = null;
      agent.goal = null;
      agent.lastGoalKey = '';

      // Re-associate active signals in this world against the imported prototypes (zero PRNG calls).
      for (const signal of signals) {
        signal.conceptId = null;
        if (signal.touched || !importedConcepts.length) continue;
        let nearest = null;
        let nearestDist = Infinity;
        for (const c of importedConcepts) {
          const d = distance(signal.features, c.prototype);
          if (d < nearestDist) {
            nearestDist = d;
            nearest = c;
          }
        }
        if (nearest && nearestDist <= 0.27) {
          signal.conceptId = nearest.id;
        }
      }

      pruneUnusedNames();
      addLog(
        `${agent.selfName || '·'} ${agent.operators.is} {${importedConcepts.length}/${importedBeliefs.length}}`,
        `Imported ontology into world ${seed}: ${importedConcepts.length} concepts and ${importedBeliefs.length} beliefs active.`,
        'system'
      );

      if (hooks.onOntologyImported) hooks.onOntologyImported();
      if (hooks.onIdentity) hooks.onIdentity();
      if (hooks.onRender) hooks.onRender();
      if (hooks.onAutosave) hooks.onAutosave(false);
      return { concepts: importedConcepts.length, beliefs: importedBeliefs.length, selfName: agent.selfName };
    }

    return {
      constants: {
        APP_VERSION,
        RULESET_VERSION,
        STORAGE_KEY,
        SAVE_FORMAT,
        SAVE_VERSION,
        ONTOLOGY_FORMAT,
        ONTOLOGY_VERSION,
        MAX_CONCEPTS,
        MAX_ARTIFACTS,
        MAX_MEMORIES,
        MAX_LOGS,
        MAX_TRAIL,
        MAX_FEATURE_HISTORY,
        MAX_SIGNALS,
        MAX_PARTICLES,
        MAX_RIPPLES
      },
      get width() { return width; },
      get height() { return height; },
      get running() { return running; },
      set running(val) { running = Boolean(val); },
      get speed() { return speed; },
      set speed(val) { if ([1, 2, 4, 8].includes(Number(val))) speed = Number(val); },
      get logMode() { return logMode; },
      set logMode(val) { if (['dual', 'agent', 'observer'].includes(val)) logMode = val; },
      get seed() { return seed; },
      get tick() { return tick; },
      get totalEvents() { return totalEvents; },
      get nextSpawn() { return nextSpawn; },
      get rngState() { return rng.getState ? rng.getState() : null; },
      get signals() { return signals; },
      get artifacts() { return artifacts; },
      get particles() { return particles; },
      get ripples() { return ripples; },
      get featureHistory() { return featureHistory; },
      get agent() { return agent; },
      get logs() { return logs; },
      setHooks: (nextHooks) => Object.assign(hooks, nextHooks),
      setDimensions,
      resetWorld,
      simulate,
      steps: (count) => { for (let i = 0; i < count; i++) simulate(); },
      perturb,
      conceptById,
      signalById,
      coherence,
      createSnapshot,
      validSnapshot,
      restoreSnapshot,
      exportOntology,
      validateOntology,
      validOntology,
      importOntology,
      getState: () => ({
        seed,
        tick,
        totalEvents,
        nextSpawn,
        rngState: rng.getState ? rng.getState() : null,
        width,
        height,
        running,
        speed,
        counts: {
          concepts: agent.concepts.length,
          memories: agent.memories.length,
          beliefs: agent.beliefs.length,
          artifacts: artifacts.length,
          totalArtifactsCreated: agent.totalArtifactsCreated || artifacts.length,
          usedNames: agent.usedNames.size,
          relationKeys: Object.keys(agent.relationCounts).length,
          signals: signals.length,
          particles: particles.length,
          ripples: ripples.length,
          logs: logs.length,
          trail: agent.trail.length,
          featureHistory: featureHistory.length
        }
      })
    };
  }

  return {
    APP_VERSION,
    RULESET_VERSION,
    STORAGE_KEY,
    SAVE_FORMAT,
    SAVE_VERSION,
    ONTOLOGY_FORMAT,
    ONTOLOGY_VERSION,
    MAX_CONCEPTS,
    MAX_ARTIFACTS,
    MAX_MEMORIES,
    MAX_LOGS,
    MAX_TRAIL,
    MAX_FEATURE_HISTORY,
    MAX_SIGNALS,
    MAX_PARTICLES,
    MAX_RIPPLES,
    clamp,
    pad,
    esc,
    distance,
    mulberry32,
    safeGlyph,
    glyphSVG,
    validSnapshot,
    validateOntology,
    validOntology,
    createEngine
  };
});
