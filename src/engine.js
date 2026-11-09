/**
 * NUL Core Simulation, Persistence & Ontology Engine (v0.02.001 · SUBSTRATE/0.2)
 * Zero external dependencies, zero DOM requirements, deterministic seeded PRNG.
 *
 * SUBSTRATE/0.2 Architecture:
 * - Zero pre-defined objects or high-level verbs: the world is a continuous 4-channel
 *   numerical medium Φ(x,y,t) ∈ [-1,1]^4 governed by a seed-derived skew-symmetric
 *   conservative coupling kernel + sorted fast-to-plastic timescale spectrum.
 * - The agent autonomously segments coherent medium pockets into Loci contours,
 *   couples with the medium via raw 6D motor vectors (dx, dy, a0..a3), crystallizes
 *   repeatable gestures into reusable Macro-Operators, sculpts persistent slow-channel
 *   structures, and inscribes external stigmergic marks onto the canvas.
 * - Meaning is grounded in a 4-stage causal cycle (PurposeSeed -> Proposer/Critic/Synthesizer
 *   -> Physical Execution -> Delta Evaluation) operable across three ontology modes:
 *   'emergent' (starts ontology-free; coins symbols under causal trace compression pressure),
 *   'none' (strictly ontology-free forever), and 'imported' (cross-world mind testing & falsification).
 */
(function (root, factory) {
  const api = factory();
  root.NULCore = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  const APP_VERSION = '0.02.001';
  const RULESET_VERSION = 'SUBSTRATE/0.2';
  const STORAGE_KEY = 'nul.world.autosave.v2';
  const SAVE_FORMAT = 'nul-resumable-world';
  const SAVE_VERSION = 2;
  const ONTOLOGY_FORMAT = 'nul-ontology';
  const ONTOLOGY_VERSION = 2;

  const GRID_W = 32;
  const GRID_H = 20;
  const CHANNELS = 4;
  const FIELD_LEN = GRID_W * GRID_H * CHANNELS;
  const CELLS_LEN = GRID_W * GRID_H;

  const MAX_CONCEPTS = 8;
  const MAX_ARTIFACTS = 24;
  const MAX_LOCI = 16;
  const MAX_MACROS = 8;
  const MAX_TRACES = 22;
  const MAX_MARKS = 18;
  const MAX_MEMORIES = 60;
  const MAX_LOGS = 70;
  const MAX_TRAIL = 65;
  const MAX_FEATURE_HISTORY = 24;
  const MAX_PARTICLES = 120;
  const MAX_RIPPLES = 32;
  const VALID_ONTOLOGY_MODES = ['emergent', 'none', 'imported'];
  const VALID_CANVAS_LENSES = ['combined', 'agent', 'medium'];

  const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
  const cloneData = (val) => (val === undefined ? undefined : JSON.parse(JSON.stringify(val)));
  const pad = (n, length = 5) => String(n).padStart(length, '0');
  const esc = (value) => String(value).replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));

  function distance(a, b) {
    let sum = 0;
    const len = Math.min(a.length, b.length);
    if (len === 0) return 0;
    for (let i = 0; i < len; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum / len);
  }

  function vecNorm(a) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i] * a[i];
    return Math.sqrt(sum / a.length);
  }

  function cosineAlignment(a, b) {
    let dot = 0;
    let na = 0;
    let nb = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (na < 1e-9 || nb < 1e-9) return 0;
    return dot / Math.sqrt(na * nb);
  }

  // Lossless IEEE-754 Float32Array <-> Base64 (browser, Electron & Node compatible)
  const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const B64_LOOKUP = new Uint8Array(128);
  for (let i = 0; i < B64_CHARS.length; i++) B64_LOOKUP[B64_CHARS.charCodeAt(i)] = i;

  function encodeFloat32Base64(f32) {
    const bytes = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
    let out = '';
    const len = bytes.length;
    for (let i = 0; i < len; i += 3) {
      const b0 = bytes[i];
      const b1 = i + 1 < len ? bytes[i + 1] : 0;
      const b2 = i + 2 < len ? bytes[i + 2] : 0;
      out += B64_CHARS[b0 >> 2];
      out += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
      out += i + 1 < len ? B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
      out += i + 2 < len ? B64_CHARS[b2 & 63] : '=';
    }
    return out;
  }

  function decodeFloat32Base64(b64, expectedFloats) {
    if (typeof b64 !== 'string') return null;
    const clean = b64.replace(/=+$/, '');
    const byteLen = Math.floor((clean.length * 3) / 4);
    if (byteLen !== expectedFloats * 4) return null;
    const bytes = new Uint8Array(byteLen);
    let p = 0;
    for (let i = 0; i < clean.length; i += 4) {
      const c0 = B64_LOOKUP[clean.charCodeAt(i) & 127];
      const c1 = B64_LOOKUP[clean.charCodeAt(i + 1) & 127];
      const c2 = i + 2 < clean.length ? B64_LOOKUP[clean.charCodeAt(i + 2) & 127] : 0;
      const c3 = i + 3 < clean.length ? B64_LOOKUP[clean.charCodeAt(i + 3) & 127] : 0;
      bytes[p++] = (c0 << 2) | (c1 >> 4);
      if (p < byteLen) bytes[p++] = ((c1 & 15) << 4) | (c2 >> 2);
      if (p < byteLen) bytes[p++] = ((c2 & 3) << 6) | c3;
    }
    const f32 = new Float32Array(bytes.buffer);
    for (let i = 0; i < f32.length; i++) {
      if (!Number.isFinite(f32[i])) return null;
    }
    return f32;
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
    for (let i = 0; i < count; i++) coords.push([pts[next() % 3], pts[next() % 3]]);
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
    const vec4 = (v) => Array.isArray(v) && v.length === 4 && v.every(finite);
    const point = (v) => Boolean(v && finite(v.x) && finite(v.y));
    const numbers = (obj, keys) => Boolean(obj && keys.every((k) => finite(obj[k])));

    if (!data || data.format !== SAVE_FORMAT || data.version !== SAVE_VERSION ||
      !Number.isInteger(data.seed) || !finite(data.rngState) || !Number.isInteger(data.tick) || data.tick < 0 ||
      !Number.isInteger(data.totalEvents) ||
      !data.world || !finite(data.world.width) || data.world.width <= 0 || !finite(data.world.height) || data.world.height <= 0 ||
      data.world.gridW !== GRID_W || data.world.gridH !== GRID_H ||
      typeof data.fieldB64 !== 'string' || typeof data.imprintB64 !== 'string' ||
      !data.worldPhysics || !Array.isArray(data.worldPhysics.tau) || data.worldPhysics.tau.length !== 4 ||
      !data.agent || !point(data.agent) || !Array.isArray(data.agent.usedNames) ||
      !data.agent.relationCounts || !data.agent.operators ||
      !['loci', 'artifacts', 'particles', 'ripples', 'featureHistory', 'logs'].every((k) => Array.isArray(data[k]))) {
      return false;
    }

    if (data.signals !== undefined) {
      if (!Array.isArray(data.signals) || !data.signals.every((s) => point(s) && vec4(s.features) && numbers(s, ['id', 'born']))) {
        return false;
      }
    }

    if (!decodeFloat32Base64(data.fieldB64, FIELD_LEN)) return false;
    if (!decodeFloat32Base64(data.imprintB64, CELLS_LEN)) return false;

    const a = data.agent;
    return VALID_ONTOLOGY_MODES.includes(a.ontologyMode || 'emergent') &&
      a.usedNames.every((name) => typeof name === 'string') &&
      vec4(a.bodyState) && vec4(a.setpoint) &&
      numbers(a, ['vx', 'vy', 'energy', 'senseRange', 'interactions', 'lastInteractionTick', 'lastArtifactTick', 'novelty']) &&
      Array.isArray(a.concepts) && Array.isArray(a.memories) && Array.isArray(a.beliefs) &&
      Array.isArray(a.macros) && Array.isArray(a.causalTraces) && Array.isArray(a.marks) && Array.isArray(a.trail) &&
      Object.values(a.operators).every((v) => typeof v === 'string') &&
      a.concepts.every((c) => typeof c.name === 'string' && vec4(c.prototype) && numbers(c, ['id', 'born', 'seen', 'contacts', 'valence', 'totalEffect', 'examples'])) &&
      a.memories.every((m) => numbers(m, ['tick', 'effect', 'energyAfter'])) &&
      a.beliefs.every((b) => typeof b.key === 'string' && numbers(b, ['fromId', 'toId', 'count', 'born', 'confidence'])) &&
      a.trail.every((p) => Array.isArray(p) && p.length === 2 && p.every(finite)) &&
      data.loci.every((l) => point(l) && vec4(l.features) && numbers(l, ['id', 'born', 'lastSeen', 'salience'])) &&
      data.artifacts.every((item) => point(item) && vec4(item.features) && Array.isArray(item.parents) && numbers(item, ['id', 'born', 'phase'])) &&
      data.particles.every((p) => point(p) && numbers(p, ['vx', 'vy', 'age', 'max'])) &&
      data.ripples.every((r) => point(r) && numbers(r, ['age', 'max'])) &&
      data.featureHistory.every(vec4) &&
      data.logs.every((entry) => finite(entry.tick) && typeof entry.raw === 'string' && typeof entry.translation === 'string');
  }

  function validateOntology(data) {
    const finite = Number.isFinite;
    const vector = (value) => Array.isArray(value) && value.length === 4 && value.every((n) => finite(n) && n >= -1.05 && n <= 1.05);
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
    if (data.version !== undefined && data.version !== 1 && data.version !== ONTOLOGY_VERSION) {
      return { valid: false, reason: `Unsupported ontology schema version "${String(data.version)}".` };
    }

    const a = data.agent;
    if (!a || typeof a !== 'object' || !Array.isArray(a.concepts) || !Array.isArray(a.beliefs)) {
      return { valid: false, reason: 'Ontology JSON is missing agent.concepts or agent.beliefs.' };
    }
    if (a.concepts.length > MAX_CONCEPTS) {
      return { valid: false, reason: `Ontology contains ${a.concepts.length} concepts (maximum is ${MAX_CONCEPTS}).` };
    }

    const conceptIds = new Set();
    const names = new Set();
    for (const c of a.concepts) {
      if (!c || typeof c.name !== 'string' || c.name.trim().length < 2 || c.name.length > 24) {
        return { valid: false, reason: 'Every concept in the ontology must have a valid symbol name.' };
      }
      if (!Number.isInteger(c.id) || c.id < 1 || conceptIds.has(c.id)) {
        return { valid: false, reason: 'Every concept must have a unique positive integer id.' };
      }
      if (names.has(c.name)) {
        return { valid: false, reason: `Duplicate concept symbol "${c.name}" in ontology.` };
      }
      if (!vector(c.prototype)) {
        return { valid: false, reason: `Concept "${c.name}" is missing a valid 4D prototype vector.` };
      }
      for (const k of ['born', 'seen', 'contacts', 'valence', 'totalEffect', 'examples']) {
        if (!finite(c[k])) {
          return { valid: false, reason: `Concept "${c.name}" is missing numeric field "${k}".` };
        }
      }
      conceptIds.add(c.id);
      names.add(c.name);
    }

    for (const b of a.beliefs) {
      if (!b || typeof b.key !== 'string' || !Number.isInteger(b.fromId) || !Number.isInteger(b.toId)) {
        return { valid: false, reason: 'Every belief must specify key, fromId, and toId.' };
      }
      if (!conceptIds.has(b.fromId) || !conceptIds.has(b.toId)) {
        return { valid: false, reason: `Belief "${b.key}" references a concept id not present in agent.concepts.` };
      }
      for (const k of ['count', 'born', 'confidence']) {
        if (!finite(b[k])) return { valid: false, reason: `Belief "${b.key}" is missing numeric field "${k}".` };
      }
    }

    if (a.generatedOperators !== undefined) {
      const ops = a.generatedOperators;
      if (!ops || typeof ops !== 'object' || !['is', 'sequence', 'join', 'create'].every((k) => typeof ops[k] === 'string' && ops[k].length > 0 && ops[k].length <= 8)) {
        return { valid: false, reason: 'generatedOperators must define string symbols for is, sequence, join, and create.' };
      }
    }

    if (a.macros !== undefined) {
      if (!Array.isArray(a.macros) || a.macros.length > MAX_MACROS) {
        return { valid: false, reason: 'Ontology agent.macros exceeds bounds or is malformed.' };
      }
    }

    if (a.selfSymbol !== undefined && a.selfSymbol !== null && (typeof a.selfSymbol !== 'string' || a.selfSymbol.length > 24)) {
      return { valid: false, reason: 'agent.selfSymbol must be null or a short string.' };
    }

    return { valid: true, reason: null };
  }

  function validOntology(data) {
    return validateOntology(data).valid;
  }

  function createEngine(options = {}) {
    let width = Math.max(240, Math.floor(options.width || 800));
    let height = Math.max(220, Math.floor(options.height || 520));
    let hooks = options.hooks || {};

    let seed = 0;
    let rand = mulberry32(1);
    let tick = 0;
    let running = true;
    let speed = 1;
    let logMode = 'dual';
    let canvasLens = VALID_CANVAS_LENSES.includes(options.canvasLens) ? options.canvasLens : 'combined';
    let totalEvents = 0;

    let field = new Float32Array(FIELD_LEN);
    let fieldNext = new Float32Array(FIELD_LEN);
    let imprint = new Float32Array(CELLS_LEN);
    let worldPhysics = null;

    let loci = [];
    let artifacts = [];
    let particles = [];
    let ripples = [];
    let logs = [];
    let featureHistory = [];
    let ids = { locus: 1, concept: 1, artifact: 1, macro: 1, mark: 1 };
    let agent = null;

    const r = (min = 0, max = 1) => min + rand() * (max - min);
    const ri = (min, max) => Math.floor(r(min, max + 1));
    const pick = (items) => items[Math.floor(rand() * items.length)];

    function setHooks(nextHooks) {
      hooks = { ...hooks, ...nextHooks };
    }

    function setDimensions(w, h) {
      width = Math.max(240, Math.floor(w));
      height = Math.max(220, Math.floor(h));
      if (agent) {
        agent.x = clamp(agent.x, 24, width - 24);
        agent.y = clamp(agent.y, 24, height - 24);
      }
      return { width, height };
    }

    function setCanvasLens(lens) {
      if (VALID_CANVAS_LENSES.includes(lens)) {
        canvasLens = lens;
        hooks.onRender?.();
      }
      return canvasLens;
    }

    function worldToGrid(x, y) {
      return [
        clamp((x / Math.max(1, width)) * (GRID_W - 1), 0, GRID_W - 1.001),
        clamp((y / Math.max(1, height)) * (GRID_H - 1), 0, GRID_H - 1.001)
      ];
    }

    function sampleFieldAt(x, y) {
      const [gx, gy] = worldToGrid(x, y);
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = gx - x0;
      const ty = gy - y0;
      const x1 = Math.min(GRID_W - 1, x0 + 1);
      const y1 = Math.min(GRID_H - 1, y0 + 1);

      const i00 = (y0 * GRID_W + x0) * CHANNELS;
      const i10 = (y0 * GRID_W + x1) * CHANNELS;
      const i01 = (y1 * GRID_W + x0) * CHANNELS;
      const i11 = (y1 * GRID_W + x1) * CHANNELS;

      const channels = [0, 0, 0, 0];
      for (let c = 0; c < 4; c++) {
        const top = field[i00 + c] * (1 - tx) + field[i10 + c] * tx;
        const bot = field[i01 + c] * (1 - tx) + field[i11 + c] * tx;
        channels[c] = top * (1 - ty) + bot * ty;
      }

      const xl = Math.max(0, x0 - 1);
      const xr = Math.min(GRID_W - 1, x0 + 1);
      const yu = Math.max(0, y0 - 1);
      const yd = Math.min(GRID_H - 1, y0 + 1);
      let gradFast = 0;
      let gradSlow = 0;
      for (let c = 0; c < 4; c++) {
        const dx = (field[(y0 * GRID_W + xr) * CHANNELS + c] - field[(y0 * GRID_W + xl) * CHANNELS + c]) * 0.5;
        const dy = (field[(yd * GRID_W + x0) * CHANNELS + c] - field[(yu * GRID_W + x0) * CHANNELS + c]) * 0.5;
        const g = Math.hypot(dx, dy);
        if (c < 2) gradFast += g * 0.5;
        else gradSlow += g * 0.5;
      }

      const imp = imprint[y0 * GRID_W + x0];
      const features = channels.map((v) => clamp((v + 1) * 0.5, 0, 1));
      const energyDensity = Math.sqrt((channels[0] ** 2 + channels[1] ** 2 + channels[2] ** 2 + channels[3] ** 2) * 0.25);

      return {
        gx,
        gy,
        channels,
        features,
        gradFast: clamp(gradFast, 0, 1),
        gradSlow: clamp(gradSlow, 0, 1),
        imprint: clamp(imp, 0, 1),
        salience: clamp(energyDensity * 0.72 + (gradFast + gradSlow) * 0.48, 0, 1)
      };
    }

    function createWorldPhysics() {
      return {
        tau: [
          +r(0.17, 0.23).toFixed(4),
          +r(0.09, 0.14).toFixed(4),
          +r(0.028, 0.044).toFixed(4),
          +r(0.007, 0.013).toFixed(4)
        ],
        diff: [
          +r(0.16, 0.21).toFixed(4),
          +r(0.11, 0.16).toFixed(4),
          +r(0.038, 0.062).toFixed(4),
          +r(0.008, 0.016).toFixed(4)
        ],
        skew: [
          +r(-0.24, 0.24).toFixed(4),
          +r(-0.18, 0.18).toFixed(4),
          +r(-0.14, 0.14).toFixed(4),
          +r(-0.20, 0.20).toFixed(4),
          +r(-0.15, 0.15).toFixed(4),
          +r(-0.18, 0.18).toFixed(4)
        ],
        pinning: [0.0, 0.04, 0.19, 0.38],
        damping: [0.045, 0.035, 0.014, 0.004],
        harmonics: Array.from({ length: 4 }, () => ({
          gx: +r(4, GRID_W - 5).toFixed(2),
          gy: +r(4, GRID_H - 5).toFixed(2),
          vx: +r(-0.022, 0.022).toFixed(4),
          vy: +r(-0.022, 0.022).toFixed(4),
          freq: +r(0.014, 0.038).toFixed(4),
          phase: +r(0, Math.PI * 2).toFixed(4),
          weights: [+r(-1, 1).toFixed(3), +r(-1, 1).toFixed(3), +r(-0.55, 0.55).toFixed(3), +r(-0.25, 0.25).toFixed(3)]
        }))
      };
    }

    function depositWavepacket(gxCenter, gyCenter, amps, radiusCells = 2.8, imprintAmount = 0) {
      const rCeil = Math.ceil(radiusCells * 2.1);
      const xMin = Math.max(0, Math.floor(gxCenter - rCeil));
      const xMax = Math.min(GRID_W - 1, Math.ceil(gxCenter + rCeil));
      const yMin = Math.max(0, Math.floor(gyCenter - rCeil));
      const yMax = Math.min(GRID_H - 1, Math.ceil(gyCenter + rCeil));
      const denom = 2 * radiusCells * radiusCells;

      for (let y = yMin; y <= yMax; y++) {
        for (let x = xMin; x <= xMax; x++) {
          const d2 = (x - gxCenter) ** 2 + (y - gyCenter) ** 2;
          const w = Math.exp(-d2 / denom);
          if (w < 0.015) continue;
          const cellIdx = y * GRID_W + x;
          const base = cellIdx * CHANNELS;
          for (let c = 0; c < 4; c++) {
            field[base + c] = clamp(field[base + c] + amps[c] * w, -1, 1);
          }
          if (imprintAmount > 0) {
            imprint[cellIdx] = clamp(imprint[cellIdx] + imprintAmount * w, 0, 1);
          }
        }
      }
    }

    function stepContinuousMedium() {
      const { tau, diff, skew, pinning, damping, harmonics } = worldPhysics;
      const [j01, j02, j03, j12, j13, j23] = skew;

      for (let h = 0; h < harmonics.length; h++) {
        const src = harmonics[h];
        src.gx += src.vx;
        src.gy += src.vy;
        if (src.gx < 3 || src.gx > GRID_W - 4) src.vx *= -1;
        if (src.gy < 3 || src.gy > GRID_H - 4) src.vy *= -1;
        const osc = Math.sin(tick * src.freq + src.phase) * 0.044;
        const ix = Math.round(clamp(src.gx, 1, GRID_W - 2));
        const iy = Math.round(clamp(src.gy, 1, GRID_H - 2));
        const base = (iy * GRID_W + ix) * CHANNELS;
        for (let c = 0; c < 4; c++) {
          field[base + c] = clamp(field[base + c] + src.weights[c] * osc, -1, 1);
        }
      }

      for (let i = 0; i < artifacts.length; i++) {
        const art = artifacts[i];
        const [gx, gy] = worldToGrid(art.x, art.y);
        const ix = Math.round(gx);
        const iy = Math.round(gy);
        const cell = iy * GRID_W + ix;
        const base = cell * CHANNELS;
        const s2 = (art.features[2] * 2 - 1) * 0.045;
        const s3 = (art.features[3] * 2 - 1) * 0.055;
        field[base + 2] = clamp(field[base + 2] + s2, -1, 1);
        field[base + 3] = clamp(field[base + 3] + s3, -1, 1);
        imprint[cell] = clamp(imprint[cell] + 0.008, 0, 1);
      }

      for (let y = 0; y < GRID_H; y++) {
        const yu = y > 0 ? y - 1 : 0;
        const yd = y < GRID_H - 1 ? y + 1 : GRID_H - 1;
        const row = y * GRID_W;
        const rowU = yu * GRID_W;
        const rowD = yd * GRID_W;

        for (let x = 0; x < GRID_W; x++) {
          const xl = x > 0 ? x - 1 : 0;
          const xr = x < GRID_W - 1 ? x + 1 : GRID_W - 1;
          const cell = row + x;
          const idx = cell * CHANNELS;
          const iL = (row + xl) * CHANNELS;
          const iR = (row + xr) * CHANNELS;
          const iU = (rowU + x) * CHANNELS;
          const iD = (rowD + x) * CHANNELS;

          const u0 = field[idx];
          const u1 = field[idx + 1];
          const u2 = field[idx + 2];
          const u3 = field[idx + 3];

          const rot0 = j01 * u1 + j02 * u2 + j03 * u3;
          const rot1 = -j01 * u0 + j12 * u2 + j13 * u3;
          const rot2 = -j02 * u0 - j12 * u1 + j23 * u3;
          const rot3 = -j03 * u0 - j13 * u1 - j23 * u2;

          const barrierFactor = 1 - Math.min(0.68, (u2 * u2 + u3 * u3) * 0.45);

          const lap0 = (field[iL] + field[iR] + field[iU] + field[iD] - 4 * u0) * barrierFactor;
          const lap1 = (field[iL + 1] + field[iR + 1] + field[iU + 1] + field[iD + 1] - 4 * u1) * barrierFactor;
          const lap2 = field[iL + 2] + field[iR + 2] + field[iU + 2] + field[iD + 2] - 4 * u2;
          const lap3 = field[iL + 3] + field[iR + 3] + field[iU + 3] + field[iD + 3] - 4 * u3;

          const du0 = tau[0] * (diff[0] * lap0 + rot0 - damping[0] * u0 - 0.28 * u0 * u0 * u0);
          const du1 = tau[1] * (diff[1] * lap1 + rot1 + pinning[1] * u1 * (1 - u1 * u1) - damping[1] * u1 - 0.26 * u1 * u1 * u1);
          const du2 = tau[2] * (diff[2] * lap2 + rot2 + pinning[2] * u2 * (1 - u2 * u2) - damping[2] * u2);
          const du3 = tau[3] * (diff[3] * lap3 + rot3 + pinning[3] * u3 * (1 - u3 * u3) - damping[3] * u3);

          fieldNext[idx] = clamp(u0 + du0, -1, 1);
          fieldNext[idx + 1] = clamp(u1 + du1, -1, 1);
          fieldNext[idx + 2] = clamp(u2 + du2, -1, 1);
          fieldNext[idx + 3] = clamp(u3 + du3, -1, 1);

          const structHold = Math.abs(fieldNext[idx + 2]) + Math.abs(fieldNext[idx + 3]);
          imprint[cell] = clamp(imprint[cell] * (structHold > 0.30 ? 0.9995 : 0.9965), 0, 1);
        }
      }

      const swap = field;
      field = fieldNext;
      fieldNext = swap;
    }

    function makeName(usedSet) {
      const onsets = ['k', 's', 't', 'n', 'm', 'r', 'l', 'v', 'z', 'p', 'h', 'd', 'kr', 'st', 'vr', 'th'];
      const nuclei = ['a', 'e', 'i', 'o', 'u', 'ae', 'io', 'oa'];
      const codas = ['', '', '', 'n', 'r', 'l', 's', 'x', 'k'];
      for (let attempt = 0; attempt < 90; attempt++) {
        const syllables = rand() < 0.72 ? 2 : 3;
        let out = '';
        for (let i = 0; i < syllables; i++) out += pick(onsets) + pick(nuclei) + (i === syllables - 1 ? pick(codas) : '');
        if (out.length >= 3 && out.length <= 8 && !usedSet.has(out)) {
          usedSet.add(out);
          return out;
        }
      }
      const fallback = `nul${usedSet.size + 1}`;
      usedSet.add(fallback);
      return fallback;
    }

    function makeGlyph() {
      const pts = [4, 14, 24];
      const coords = [];
      const count = ri(4, 6);
      while (coords.length < count) {
        const candidate = [pick(pts), pick(pts)];
        const prev = coords[coords.length - 1];
        if (!prev || prev[0] !== candidate[0] || prev[1] !== candidate[1]) coords.push(candidate);
      }
      let path = `M${coords[0][0]} ${coords[0][1]}`;
      for (let i = 1; i < coords.length; i++) path += ` L${coords[i][0]} ${coords[i][1]}`;
      if (rand() > 0.52) path += ` L${coords[0][0]} ${coords[0][1]}`;
      const dot = rand() > 0.45 ? [pick(pts), pick(pts)] : null;
      return { path, dot };
    }

    function addLog(raw, translation, kind = 'thought') {
      logs.push({ tick, raw, translation, kind });
      if (logs.length > MAX_LOGS) logs.shift();
      hooks.onLog?.(logs[logs.length - 1]);
    }

    function addRipple(x, y, max = 38, color = 'positive') {
      ripples.push({ x, y, age: 0, max, color });
      if (ripples.length > MAX_RIPPLES) ripples.splice(0, ripples.length - MAX_RIPPLES);
    }

    function burst(x, y, color = 'positive', count = 10) {
      for (let i = 0; i < count; i++) {
        const angle = r(0, Math.PI * 2);
        const sp = r(0.35, 1.8);
        particles.push({ x, y, vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp, age: 0, max: ri(20, 42), color });
      }
      if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
    }

    const conceptById = (id) => (agent ? agent.concepts.find((c) => c.id === id) : undefined);
    const locusById = (id) => loci.find((l) => l.id === id);
    const macroById = (id) => (agent ? agent.macros.find((m) => m.id === id) : undefined);

    function pruneUnusedNames() {
      if (!agent) return;
      const active = new Set();
      if (agent.selfName) active.add(agent.selfName);
      for (const c of agent.concepts) active.add(c.name);
      for (const a of artifacts) active.add(a.name);
      const preserved = [];
      for (const name of agent.usedNames) {
        if (active.has(name)) preserved.push(name);
      }
      for (const name of active) {
        if (!preserved.includes(name)) preserved.push(name);
      }
      agent.usedNames = new Set(preserved);
    }

    function createAgent(ontologyMode = 'emergent') {
      const usedNames = new Set();
      const sp = sampleFieldAt(width * 0.5, height * 0.5);
      return {
        x: width * 0.5,
        y: height * 0.5,
        vx: r(-0.35, 0.35),
        vy: r(-0.35, 0.35),
        energy: 0.72,
        novelty: 0.65,
        senseRange: 138,
        ontologyMode: VALID_ONTOLOGY_MODES.includes(ontologyMode) ? ontologyMode : 'emergent',
        bodyState: sp.channels.map((v) => clamp(v * 0.5, -1, 1)),
        setpoint: sp.channels.map((v) => clamp(v * 0.35, -0.6, 0.6)),
        selfName: null,
        selfGlyph: null,
        selfBorn: null,
        usedNames,
        concepts: [],
        memories: [],
        beliefs: [],
        relationCounts: {},
        macros: [],
        causalTraces: [],
        marks: [],
        totalArtifactsCreated: 0,
        falsificationsCount: 0,
        operators: {
          is: pick(['::', '≔', '≡']),
          sequence: pick(['↦', '›', '→']),
          join: pick(['⊕', '⊗', '⋈']),
          create: pick(['∴', '⊢', '✣'])
        },
        goal: null,
        targetId: null,
        activeEpisode: null,
        lastCycle: null,
        interactions: 0,
        lastInteractionTick: -999,
        lastArtifactTick: -999,
        trail: []
      };
    }

    // Allocation-free fast salience lookup for contour raymarching
    function fastSalienceAt(x, y) {
      const gx = clamp((x / Math.max(1, width)) * (GRID_W - 1), 0, GRID_W - 1.001);
      const gy = clamp((y / Math.max(1, height)) * (GRID_H - 1), 0, GRID_H - 1.001);
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const base = (y0 * GRID_W + x0) * CHANNELS;
      const u0 = field[base];
      const u1 = field[base + 1];
      const u2 = field[base + 2];
      const u3 = field[base + 3];
      const ed = Math.sqrt((u0 * u0 + u1 * u1 + u2 * u2 + u3 * u3) * 0.25);
      return ed * 0.82 + imprint[y0 * GRID_W + x0] * 0.25;
    }

    function computeLocusContour(cx, cy, baseSalience) {
      const radii = [];
      const threshold = Math.max(0.08, baseSalience * 0.52);
      for (let k = 0; k < 8; k++) {
        const angle = (k / 8) * Math.PI * 2;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        let rad = 12;
        for (let step = 12; step <= 42; step += 10) {
          if (fastSalienceAt(cx + dx * step, cy + dy * step) >= threshold) rad = step;
          else break;
        }
        radii.push(rad);
      }
      return radii;
    }

    function matchConceptForLocus(features, causalDelta = null) {
      if (!agent || agent.ontologyMode === 'none' || !agent.concepts.length) return null;
      let best = null;
      let bestScore = Infinity;
      for (const c of agent.concepts) {
        const featDist = distance(features, c.prototype);
        const causalDist = causalDelta && Array.isArray(c.causalPrototype)
          ? distance(causalDelta, c.causalPrototype)
          : featDist;
        const combined = causalDelta ? featDist * 0.45 + causalDist * 0.55 : featDist;
        if (combined < bestScore) {
          bestScore = combined;
          best = c;
        }
      }
      return best && bestScore < 0.29 ? best : null;
    }

    function segmentLocalMedium() {
      const rings = [
        [0, 0],
        [0.48, 0], [-0.48, 0], [0, 0.48], [0, -0.48],
        [0.78, 0.55], [-0.78, 0.55], [0.78, -0.55], [-0.78, -0.55],
        [0.25, -0.85], [-0.25, 0.85]
      ];

      for (let i = 0; i < rings.length; i++) {
        const px = clamp(agent.x + rings[i][0] * agent.senseRange * 0.82, 24, width - 24);
        const py = clamp(agent.y + rings[i][1] * agent.senseRange * 0.82, 24, height - 24);
        const sample = sampleFieldAt(px, py);

        if (sample.salience < 0.14 && sample.imprint < 0.20) continue;

        let cx = px;
        let cy = py;
        let bestS = sample;
        const stepPx = 14;
        for (const [ox, oy] of [[stepPx, 0], [-stepPx, 0], [0, stepPx], [0, -stepPx]]) {
          const candX = clamp(cx + ox, 24, width - 24);
          const candY = clamp(cy + oy, 24, height - 24);
          const cs = sampleFieldAt(candX, candY);
          if (cs.salience > bestS.salience + 0.012) {
            cx = candX;
            cy = candY;
            bestS = cs;
          }
        }

        let existing = null;
        let nearestDist = Infinity;
        for (const l of loci) {
          const d = Math.hypot(l.x - cx, l.y - cy);
          if (d < 44 && d < nearestDist) {
            nearestDist = d;
            existing = l;
          }
        }

        const matchedConcept = matchConceptForLocus(bestS.features, existing?.causalDelta || null);

        if (existing) {
          existing.vx = (cx - existing.x) * 0.25;
          existing.vy = (cy - existing.y) * 0.25;
          existing.x = +(existing.x * 0.72 + cx * 0.28).toFixed(2);
          existing.y = +(existing.y * 0.72 + cy * 0.28).toFixed(2);
          existing.features = existing.features.map((v, k) => +(v * 0.65 + bestS.features[k] * 0.35).toFixed(4));
          existing.salience = +bestS.salience.toFixed(4);
          existing.sculpted = +Math.max(existing.sculpted || 0, bestS.imprint).toFixed(4);
          if (tick - existing.lastSeen >= 18) {
            existing.contour = computeLocusContour(existing.x, existing.y, bestS.salience);
          }
          existing.lastSeen = tick;
          existing.conceptId = matchedConcept ? matchedConcept.id : (agent.ontologyMode === 'none' ? null : existing.conceptId);
        } else {
          const contour = computeLocusContour(cx, cy, bestS.salience);
          const newLocus = {
            id: ids.locus++,
            x: +cx.toFixed(2),
            y: +cy.toFixed(2),
            vx: 0,
            vy: 0,
            features: bestS.features.map((v) => +v.toFixed(4)),
            causalDelta: null,
            salience: +bestS.salience.toFixed(4),
            sculpted: +bestS.imprint.toFixed(4),
            contour,
            born: tick,
            lastSeen: tick,
            probedCount: 0,
            conceptId: matchedConcept ? matchedConcept.id : null,
            phase: +r(0, Math.PI * 2).toFixed(3)
          };
          loci.push(newLocus);
          totalEvents++;
          featureHistory.push(newLocus.features.slice());
          if (featureHistory.length > MAX_FEATURE_HISTORY) featureHistory.shift();
        }
      }

      for (let i = loci.length - 1; i >= 0; i--) {
        const l = loci[i];
        const d = Math.hypot(l.x - agent.x, l.y - agent.y);
        if (d < agent.senseRange * 0.9 && tick - l.lastSeen > 18) {
          const check = sampleFieldAt(l.x, l.y);
          if (check.salience < 0.08 && check.imprint < 0.14) {
            loci.splice(i, 1);
            continue;
          }
          l.salience = +check.salience.toFixed(4);
          l.lastSeen = tick;
        }
      }

      if (loci.length > MAX_LOCI) {
        loci.sort((a, b) => (b.sculpted * 40 + b.lastSeen) - (a.sculpted * 40 + a.lastSeen));
        loci.length = MAX_LOCI;
      }
    }

    function updateViabilityAndBody(localSample, motorCoupling, motionMag) {
      const prevEnergy = agent.energy;
      let homeostaticError = 0;
      for (let c = 0; c < 4; c++) {
        const ambient = localSample.channels[c];
        const reaction = motorCoupling[c] * 0.035;
        agent.bodyState[c] = clamp(
          agent.bodyState[c] + (ambient - agent.bodyState[c]) * 0.045 - reaction + (agent.setpoint[c] - agent.bodyState[c]) * 0.018,
          -1,
          1
        );
        const diff = agent.bodyState[c] - agent.setpoint[c];
        homeostaticError += diff * diff;
      }
      homeostaticError = Math.sqrt(homeostaticError * 0.25);

      const fastShear = localSample.gradFast;
      const slowStructure = Math.abs(localSample.channels[2]) * 0.5 + Math.abs(localSample.channels[3]) * 0.5;
      const shelterBonus = slowStructure > 0.18 && fastShear < 0.34 ? 0.0017 * (0.45 + localSample.imprint) : 0;
      const resonanceBonus = homeostaticError < 0.28 ? (0.28 - homeostaticError) * 0.0020 : -(homeostaticError - 0.34) * 0.0038;
      const metabolicLoad = agent.energy > 0.72 ? (agent.energy - 0.72) * 0.0048 : 0;
      const effortCost = (vecNorm(motorCoupling) * 0.0014) + (motionMag * 0.00042) + 0.00042 + metabolicLoad;
      const shearDrain = fastShear > 0.38 ? (fastShear - 0.38) * 0.0052 : 0;

      agent.energy = clamp(agent.energy + shelterBonus + resonanceBonus - effortCost - shearDrain, 0.08, 1);
      return agent.energy - prevEnergy;
    }

    function randomGesture() {
      return {
        biasAngle: +r(-Math.PI, Math.PI).toFixed(3),
        thrust: +r(0.25, 0.95).toFixed(3),
        coupling: [
          +r(-0.85, 0.85).toFixed(3),
          +r(-0.85, 0.85).toFixed(3),
          +r(-0.95, 0.95).toFixed(3),
          +r(-0.95, 0.95).toFixed(3)
        ]
      };
    }

    function mutateGesture(base) {
      return {
        biasAngle: +(base.biasAngle + r(-0.55, 0.55)).toFixed(3),
        thrust: +clamp(base.thrust + r(-0.22, 0.22), 0.1, 1).toFixed(3),
        coupling: base.coupling.map((v) => +clamp(v + r(-0.32, 0.32), -1, 1).toFixed(3))
      };
    }

    function formPurposeSeed() {
      const unprobed = loci.filter((l) => l.probedCount < 2);
      const sculptedLoci = loci.filter((l) => l.sculpted > 0.25);

      if (agent.energy < 0.44) {
        return {
          drive: 'stabilize',
          targetDelta: [-0.18, -0.14, 0.22, 0.28],
          locusId: sculptedLoci[0]?.id ?? loci[0]?.id ?? null,
          explorationGuidance: 0.22,
          summary: 'Dampen fast shear & reinforce calm slow-channel equilibrium'
        };
      }

      if (unprobed.length > 0 && rand() < 0.55) {
        unprobed.sort((a, b) => b.salience - a.salience);
        const target = unprobed[0];
        return {
          drive: 'probe',
          targetDelta: [0.24, -0.20, 0.08, 0.05],
          locusId: target.id,
          explorationGuidance: 0.65,
          summary: `Test causal response of segmented locus #${pad(target.id, 2)}`
        };
      }

      if (loci.length > 0 && (agent.macros.length > 0 || tick > 45) && rand() < 0.66) {
        const anchor = sculptedLoci.length > 0 ? pick(sculptedLoci) : pick(loci);
        return {
          drive: 'sculpt',
          targetDelta: [0.04, 0.08, 0.32, 0.42],
          locusId: anchor.id,
          explorationGuidance: 0.38,
          summary: `Sculpt persistent slow-channel structure near locus #${pad(anchor.id, 2)}`
        };
      }

      return {
        drive: 'explore',
        targetDelta: [0.15, 0.15, 0.12, 0.16],
        locusId: loci[0]?.id ?? null,
        explorationGuidance: 0.78,
        summary: 'Traverse unmapped canvas medium & segment new regions'
      };
    }

    function deliberateAndStartEpisode(localSample) {
      const purpose = formPurposeSeed();
      const proposals = [];

      for (const m of agent.macros) {
        const align = cosineAlignment(m.meanDelta, purpose.targetDelta);
        proposals.push({
          source: 'macro',
          macroId: m.id,
          label: m.code || `μ${pad(m.id, 2)}`,
          gesture: m.gesture,
          predictedDelta: m.meanDelta.slice(),
          alignment: align,
          reliability: m.reliability,
          viabilityBias: m.viabilityEffect,
          failures: m.failures || 0
        });
      }

      let bestTrace = null;
      let bestTraceScore = -Infinity;
      for (const tr of agent.causalTraces) {
        const ctxSim = 1 - distance(localSample.features, tr.contextFeatures);
        const goalAlign = cosineAlignment(tr.actualDelta, purpose.targetDelta);
        const score = ctxSim * 0.45 + goalAlign * 0.55;
        if (score > bestTraceScore) {
          bestTraceScore = score;
          bestTrace = tr;
        }
      }
      if (bestTrace) {
        proposals.push({
          source: 'trace',
          macroId: bestTrace.macroId || null,
          label: bestTrace.macroId ? `μ${pad(bestTrace.macroId, 2)}` : 'trace:Δ',
          gesture: mutateGesture(bestTrace.gesture),
          predictedDelta: bestTrace.actualDelta.slice(),
          alignment: cosineAlignment(bestTrace.actualDelta, purpose.targetDelta),
          reliability: bestTrace.accuracy,
          viabilityBias: bestTrace.viabilityDelta * 8,
          failures: bestTrace.accuracy < 0.4 ? 1 : 0
        });
      }

      const expGesture = randomGesture();
      if (purpose.drive === 'sculpt') {
        expGesture.coupling[2] = +r(0.50, 0.98).toFixed(3);
        expGesture.coupling[3] = +r(0.55, 0.99).toFixed(3);
      } else if (purpose.drive === 'stabilize') {
        expGesture.coupling[0] = +(-localSample.channels[0] * 0.65).toFixed(3);
        expGesture.coupling[1] = +(-localSample.channels[1] * 0.65).toFixed(3);
        expGesture.coupling[3] = +r(0.35, 0.75).toFixed(3);
      }
      proposals.push({
        source: 'explore',
        macroId: null,
        label: 'explore:raw',
        gesture: expGesture,
        predictedDelta: expGesture.coupling.map((v, k) => +(v * (k >= 2 ? 0.24 : 0.22)).toFixed(4)),
        alignment: cosineAlignment(expGesture.coupling, purpose.targetDelta),
        reliability: 0.45,
        viabilityBias: 0,
        failures: 0
      });

      let winner = proposals[0];
      let bestGateScore = -Infinity;
      let criticRejections = 0;

      for (const p of proposals) {
        const failurePenalty = p.failures * 0.18;
        const energyRiskPenalty = agent.energy < 0.38 && p.viabilityBias < -0.01 ? 0.35 : 0;
        const explorationBonus = p.source === 'explore' ? purpose.explorationGuidance * 0.28 : 0;
        const gateScore = p.alignment * 0.52 + p.reliability * 0.32 + p.viabilityBias * 0.25 + explorationBonus - failurePenalty - energyRiskPenalty;
        p.gateScore = +gateScore.toFixed(3);
        if (failurePenalty > 0.2 || energyRiskPenalty > 0) criticRejections++;
        if (gateScore > bestGateScore) {
          bestGateScore = gateScore;
          winner = p;
        }
      }

      const targetLocus = purpose.locusId ? locusById(purpose.locusId) : null;
      agent.targetId = targetLocus ? targetLocus.id : null;

      const criticNote = criticRejections > 0
        ? `Gated ${proposals.length} proposals (${criticRejections} penalized for delta error/risk)`
        : `Validated ${proposals.length} proposals across ${agent.causalTraces.length} causal traces`;

      const targetConcept = targetLocus?.conceptId ? conceptById(targetLocus.conceptId) : null;
      if (agent.ontologyMode === 'none' || (!targetConcept && !winner.macroId)) {
        const dVec = purpose.targetDelta.map((v) => (v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1))).join(',');
        agent.goal = {
          raw: `Δ[${dVec}] ${agent.operators.sequence} ${winner.label}`,
          description: `${purpose.summary} · ${criticNote}.`
        };
      } else {
        const symLabel = targetConcept ? targetConcept.name : `loc#${pad(targetLocus?.id || 0, 2)}`;
        agent.goal = {
          raw: `${agent.selfName || '∅'} ${agent.operators.sequence} ${symLabel} (${winner.label})`,
          description: `${purpose.summary} using ${winner.label} · ${criticNote}.`
        };
      }

      agent.novelty = clamp(purpose.explorationGuidance * 0.7 + (1 - winner.reliability) * 0.3, 0.08, 0.98);

      agent.activeEpisode = {
        startTick: tick,
        ticksLeft: 8,
        startX: agent.x,
        startY: agent.y,
        purpose,
        proposalLabel: winner.label,
        macroId: winner.macroId,
        locusId: targetLocus ? targetLocus.id : null,
        gesture: winner.gesture,
        predictedDelta: winner.predictedDelta,
        startSample: localSample,
        startEnergy: agent.energy,
        proposalsCount: proposals.length,
        criticNote,
        prevConceptId: targetConcept ? targetConcept.id : null
      };
    }

    function maybeCompressCausalTracesIntoOntology(trace, targetLocus) {
      if (agent.ontologyMode === 'none') return null;

      let matched = null;
      let bestDist = Infinity;
      for (const c of agent.concepts) {
        const dFeat = distance(trace.contextFeatures, c.prototype);
        const dCausal = Array.isArray(c.causalPrototype)
          ? distance(trace.actualDelta, c.causalPrototype)
          : dFeat;
        const jointDist = dFeat * 0.42 + dCausal * 0.58;
        if (jointDist < bestDist) {
          bestDist = jointDist;
          matched = c;
        }
      }

      if (matched && bestDist < 0.26) {
        const causalErr = Array.isArray(matched.causalPrototype)
          ? distance(trace.actualDelta, matched.causalPrototype)
          : 0;
        if (causalErr > 0.46 && agent.concepts.length < MAX_CONCEPTS && matched.contacts >= 3) {
          const splitConcept = {
            id: ids.concept++,
            name: makeName(agent.usedNames),
            glyph: makeGlyph(),
            prototype: trace.contextFeatures.slice(),
            causalPrototype: trace.actualDelta.slice(),
            born: tick,
            seen: 1,
            contacts: 1,
            valence: clamp(trace.viabilityDelta * 12, -1, 1),
            totalEffect: trace.viabilityDelta,
            examples: 1
          };
          agent.concepts.push(splitConcept);
          if (targetLocus) targetLocus.conceptId = splitConcept.id;
          addLog(
            `${matched.name} ≠ ${splitConcept.name} ${agent.operators.is} Δ!`,
            `Critic split “${matched.name}” → coined “${splitConcept.name}” after divergent causal response.`
          );
          return splitConcept;
        }

        const n = matched.examples + 1;
        matched.prototype = matched.prototype.map((v, i) => +((v * matched.examples + trace.contextFeatures[i]) / n).toFixed(4));
        const baseCausal = Array.isArray(matched.causalPrototype) ? matched.causalPrototype : trace.actualDelta;
        matched.causalPrototype = baseCausal.map((v, i) => +((v * matched.examples + trace.actualDelta[i]) / n).toFixed(4));
        matched.examples = n;
        matched.seen++;
        matched.contacts++;
        matched.totalEffect = +(matched.totalEffect + trace.viabilityDelta).toFixed(4);
        matched.valence = clamp(matched.valence * 0.76 + clamp(trace.viabilityDelta * 14 + (trace.structuralGain || 0) * 0.45, -1, 1) * 0.24, -1, 1);
        if (targetLocus) targetLocus.conceptId = matched.id;
        return matched;
      }

      const pressureThreshold = agent.ontologyMode === 'imported' ? 6 : 12;
      if (agent.causalTraces.length < pressureThreshold) return null;

      let clusterCount = 0;
      for (const other of agent.causalTraces) {
        const d = distance(trace.contextFeatures, other.contextFeatures) * 0.45 + distance(trace.actualDelta, other.actualDelta) * 0.55;
        if (d < 0.26) clusterCount++;
      }
      if (clusterCount < 3) return null;

      if (agent.concepts.length >= MAX_CONCEPTS) {
        if (matched) {
          matched.seen++;
          matched.contacts++;
          if (targetLocus) targetLocus.conceptId = matched.id;
        }
        return matched;
      }

      const concept = {
        id: ids.concept++,
        name: makeName(agent.usedNames),
        glyph: makeGlyph(),
        prototype: trace.contextFeatures.slice(),
        causalPrototype: trace.actualDelta.slice(),
        born: tick,
        seen: clusterCount,
        contacts: 1,
        valence: clamp(trace.viabilityDelta * 14 + (trace.structuralGain || 0) * 0.4, -1, 1),
        totalEffect: trace.viabilityDelta,
        examples: 1
      };
      agent.concepts.push(concept);
      if (targetLocus) targetLocus.conceptId = concept.id;
      addRipple(agent.x, agent.y, 40, 'concept');
      addLog(
        `${concept.name} ${agent.operators.is} Φ(${clusterCount})`,
        `Trace pressure compressed ${clusterCount} causal episodes into self-authored symbol “${concept.name}”.`
      );
      return concept;
    }

    function updateBeliefsAndFalsification(prevConceptId, nextConcept, trace) {
      if (agent.ontologyMode === 'none' || !prevConceptId || !nextConcept || prevConceptId === nextConcept.id) return;

      const key = `${prevConceptId}>${nextConcept.id}`;
      for (let i = agent.beliefs.length - 1; i >= 0; i--) {
        const b = agent.beliefs[i];
        if (b.fromId === prevConceptId && b.toId !== nextConcept.id && trace.accuracy < 0.42) {
          b.falsifications = (b.falsifications || 0) + 1;
          b.confidence = clamp(b.confidence - 0.16, 0.05, 0.99);
          agent.falsificationsCount = (agent.falsificationsCount || 0) + 1;
          if (b.falsifications >= 3 && b.confidence <= 0.24) {
            const fromC = conceptById(b.fromId);
            const toC = conceptById(b.toId);
            agent.beliefs.splice(i, 1);
            delete agent.relationCounts[b.key];
            addLog(
              `¬(${fromC ? fromC.name : '?'} ${agent.operators.sequence} ${toC ? toC.name : '?'})`,
              `Critic falsified & retired broken belief after ${b.falsifications} failed delta predictions.`
            );
          }
        }
      }

      agent.relationCounts[key] = (agent.relationCounts[key] || 0) + 1;
      const count = agent.relationCounts[key];
      let belief = agent.beliefs.find((b) => b.key === key);
      if (!belief && count >= 2) {
        belief = {
          key,
          fromId: prevConceptId,
          toId: nextConcept.id,
          macroId: trace.macroId || null,
          count,
          falsifications: 0,
          born: tick,
          confidence: 0.48
        };
        agent.beliefs.push(belief);
        const fromC = conceptById(prevConceptId);
        if (fromC) {
          addLog(
            `${fromC.name} ${agent.operators.sequence} ${nextConcept.name}`,
            `Inferred fallible causal regularity: “${fromC.name}” precedes “${nextConcept.name}”.`
          );
        }
      } else if (belief) {
        belief.count = count;
        belief.confidence = clamp(0.36 + count * 0.13 - (belief.falsifications || 0) * 0.12, 0.1, 0.96);
      }

      if (agent.beliefs.length > 18) {
        agent.beliefs.sort((a, b) => b.confidence - a.confidence);
        agent.beliefs.length = 18;
      }
    }

    function maybeCrystallizeMacro(trace) {
      const effectMag = vecNorm(trace.actualDelta);
      if (effectMag < 0.09) return;

      let match = null;
      let bestDist = Infinity;
      for (const m of agent.macros) {
        const d = distance(m.gesture.coupling, trace.gesture.coupling);
        if (d < bestDist) {
          bestDist = d;
          match = m;
        }
      }

      if (match && bestDist < 0.28) {
        const predErr = distance(match.meanDelta, trace.actualDelta);
        const n = match.trials + 1;
        match.meanDelta = match.meanDelta.map((v, k) => +((v * match.trials + trace.actualDelta[k]) / n).toFixed(4));
        match.trials = n;
        match.viabilityEffect = +((match.viabilityEffect * 0.75) + trace.viabilityDelta * 0.25).toFixed(4);
        if (predErr > 0.42) match.failures = (match.failures || 0) + 1;
        match.reliability = +clamp(match.reliability * 0.8 + (1 - predErr) * 0.2, 0.1, 0.98).toFixed(3);
        trace.macroId = match.id;
        return;
      }

      if (agent.macros.length >= MAX_MACROS) return;

      let consistentPeers = 0;
      for (const prev of agent.causalTraces) {
        if (distance(prev.gesture.coupling, trace.gesture.coupling) < 0.30 &&
            distance(prev.actualDelta, trace.actualDelta) < 0.28) {
          consistentPeers++;
        }
      }
      if (consistentPeers < 1) return;

      const macroIdx = ids.macro++;
      const code = `μ${pad(macroIdx, 2)}`;
      const macro = {
        id: macroIdx,
        code,
        gesture: cloneData(trace.gesture),
        meanDelta: trace.actualDelta.slice(),
        trials: 2,
        failures: 0,
        reliability: +clamp(0.58 + trace.accuracy * 0.25, 0.4, 0.95).toFixed(3),
        viabilityEffect: +trace.viabilityDelta.toFixed(4),
        born: tick
      };
      agent.macros.push(macro);
      trace.macroId = macro.id;
      addLog(
        `${code} ${agent.operators.create} [${macro.gesture.coupling.map((v) => v.toFixed(1)).join(',')}]`,
        `Crystallized repeatable motor gesture into reusable operator “${code}”.`
      );
    }

    function maybeRegisterSculptedStructure(endSample, trace, concept) {
      if (tick - agent.lastArtifactTick < 95) return;
      const slowAmp = Math.abs(endSample.channels[2]) + Math.abs(endSample.channels[3]);
      if (slowAmp < 0.32 || endSample.imprint < 0.16) return;

      for (let i = Math.max(0, artifacts.length - 6); i < artifacts.length; i++) {
        const a = artifacts[i];
        if (Math.hypot(a.x - agent.x, a.y - agent.y) < 30) {
          a.strength = +clamp((a.strength || 0.6) + 0.08, 0.2, 1).toFixed(3);
          return;
        }
      }

      const isSymbolic = agent.ontologyMode !== 'none';
      const parentConcepts = isSymbolic && agent.concepts.length >= 2
        ? agent.concepts.slice(-2).map((c) => c.id)
        : (concept ? [concept.id] : []);
      const name = isSymbolic ? makeName(agent.usedNames) : `anchor-${pad(ids.artifact, 2)}`;
      const glyph = isSymbolic ? makeGlyph() : deterministicGlyphFromText(name);

      const structure = {
        id: ids.artifact++,
        name,
        glyph,
        parents: parentConcepts,
        macroId: trace.macroId || null,
        features: endSample.features.map((v) => +v.toFixed(4)),
        x: +clamp(agent.x, 34, width - 34).toFixed(2),
        y: +clamp(agent.y, 34, height - 34).toFixed(2),
        born: tick,
        phase: +r(0, Math.PI * 2).toFixed(3),
        strength: +clamp(endSample.imprint, 0.3, 1).toFixed(3)
      };

      artifacts.push(structure);
      if (artifacts.length > MAX_ARTIFACTS) {
        artifacts.splice(0, artifacts.length - MAX_ARTIFACTS);
        pruneUnusedNames();
      }
      agent.totalArtifactsCreated = (agent.totalArtifactsCreated || 0) + 1;
      agent.lastArtifactTick = tick;
      addRipple(structure.x, structure.y, 52, 'artifact');
      burst(structure.x, structure.y, 'artifact', 14);
      addLog(
        `${agent.operators.create} ${structure.name} @(${Math.round(structure.x)},${Math.round(structure.y)})`,
        `Stabilized persistent slow-channel structure “${structure.name}” on the canvas.`
      );
    }

    function maybeInscribeCanvasMark(trace, endSample) {
      const highValue = Math.abs(trace.viabilityDelta) > 0.015 || trace.surprise > 0.34;
      if (!highValue) return;
      for (const m of agent.marks) {
        if (Math.hypot(m.x - agent.x, m.y - agent.y) < 34) {
          m.vec = endSample.channels.map((v) => +v.toFixed(3));
          m.valence = +clamp(m.valence * 0.6 + trace.viabilityDelta * 12 * 0.4, -1, 1).toFixed(3);
          m.tick = tick;
          return;
        }
      }
      agent.marks.push({
        id: ids.mark++,
        x: +agent.x.toFixed(1),
        y: +agent.y.toFixed(1),
        vec: endSample.channels.map((v) => +v.toFixed(3)),
        macroId: trace.macroId || null,
        valence: +clamp(trace.viabilityDelta * 14, -1, 1).toFixed(3),
        tick
      });
      if (agent.marks.length > MAX_MARKS) agent.marks.shift();
    }

    function evaluateAndCloseEpisode(endSample) {
      const ep = agent.activeEpisode;
      if (!ep) return;

      const originAfter = sampleFieldAt(ep.startX ?? agent.x, ep.startY ?? agent.y);
      const actualDelta = [
        +((endSample.channels[0] * 0.5 + originAfter.channels[0] * 0.5) - ep.startSample.channels[0]).toFixed(4),
        +((endSample.channels[1] * 0.5 + originAfter.channels[1] * 0.5) - ep.startSample.channels[1]).toFixed(4),
        +((endSample.channels[2] * 0.5 + originAfter.channels[2] * 0.5) - ep.startSample.channels[2]).toFixed(4),
        +((endSample.channels[3] * 0.5 + originAfter.channels[3] * 0.5) - ep.startSample.channels[3]).toFixed(4)
      ];
      const viabilityDelta = +(agent.energy - ep.startEnergy).toFixed(4);
      const predError = distance(ep.predictedDelta, actualDelta);
      const accuracy = +clamp(1 - predError, 0, 1).toFixed(3);
      const completion = +clamp((cosineAlignment(actualDelta, ep.purpose.targetDelta) + 1) * 0.5, 0, 1).toFixed(3);
      const effort = Math.max(0.15, vecNorm(ep.gesture.coupling));
      const efficiency = +clamp((vecNorm(actualDelta) / effort) * 0.65, 0, 1).toFixed(3);
      const overall = +((accuracy * 0.4 + completion * 0.4 + efficiency * 0.2)).toFixed(3);
      const structuralGain = Math.max(0, Math.max(endSample.imprint, originAfter.imprint) - ep.startSample.imprint);

      const trace = {
        tick,
        contextFeatures: ep.startSample.features.slice(),
        gesture: ep.gesture,
        macroId: ep.macroId,
        predictedDelta: ep.predictedDelta.slice(),
        actualDelta,
        viabilityDelta,
        structuralGain: +structuralGain.toFixed(4),
        accuracy,
        surprise: +clamp(predError, 0, 1).toFixed(3),
        locusId: ep.locusId
      };
      agent.causalTraces.push(trace);
      if (agent.causalTraces.length > MAX_TRACES) agent.causalTraces.shift();

      agent.interactions++;
      agent.lastInteractionTick = tick;

      const targetLocus = ep.locusId ? locusById(ep.locusId) : null;
      if (targetLocus) {
        targetLocus.probedCount = (targetLocus.probedCount || 0) + 1;
        targetLocus.causalDelta = actualDelta.slice();
      }

      maybeCrystallizeMacro(trace);
      const concept = maybeCompressCausalTracesIntoOntology(trace, targetLocus);
      updateBeliefsAndFalsification(ep.prevConceptId, concept, trace);
      maybeRegisterSculptedStructure(originAfter.imprint > endSample.imprint ? originAfter : endSample, trace, concept);
      maybeInscribeCanvasMark(trace, endSample);

      if (agent.ontologyMode !== 'none' && !agent.selfName && agent.interactions >= 5 && agent.concepts.length >= 2) {
        agent.selfName = makeName(agent.usedNames);
        agent.selfGlyph = makeGlyph();
        agent.selfBorn = tick;
        addLog(
          `${agent.selfName} ${agent.operators.is} ◉`,
          `Assigned persistent self-symbol “${agent.selfName}” to its own causal locus.`
        );
        hooks.onIdentity?.();
      }

      const lastPrevMem = agent.memories[agent.memories.length - 1];
      if (lastPrevMem?.conceptId && concept && lastPrevMem.conceptId !== concept.id) {
        updateBeliefsAndFalsification(lastPrevMem.conceptId, concept, trace);
      }

      agent.memories.push({
        tick,
        conceptId: concept ? concept.id : 0,
        signalId: ep.locusId || 0,
        label: concept ? concept.name : (ep.proposalLabel || `Δ${overall.toFixed(2)}`),
        effect: +(viabilityDelta + structuralGain * 0.18).toFixed(4),
        accuracy,
        energyAfter: +agent.energy.toFixed(4)
      });
      if (agent.memories.length > MAX_MEMORIES) agent.memories.shift();

      agent.lastCycle = {
        tick,
        drive: ep.purpose.drive,
        purposeSummary: ep.purpose.summary,
        proposalLabel: ep.proposalLabel,
        proposalsCount: ep.proposalsCount,
        criticNote: ep.criticNote,
        predictedDelta: ep.predictedDelta,
        actualDelta,
        evaluation: { accuracy, completion, efficiency, overall }
      };

      if (agent.interactions <= 4 || tick % 32 === 0 || predError > 0.52) {
        const dStr = actualDelta.map((v) => (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2))).join(',');
        if (agent.ontologyMode === 'none' || !concept) {
          addLog(
            `${ep.proposalLabel} ${agent.operators.sequence} Δ[${dStr}] (${Math.round(accuracy * 100)}%)`,
            `Executed ${ep.purpose.drive} cycle · delta accuracy ${Math.round(accuracy * 100)}%, overall ${Math.round(overall * 100)}%.`
          );
        } else {
          addLog(
            `${agent.selfName || '∅'} · ${concept.name} ${agent.operators.sequence} Δ[${dStr}]`,
            `Evaluated “${concept.name}” (${ep.purpose.drive}) · prediction accuracy ${Math.round(accuracy * 100)}%.`
          );
        }
      }

      agent.activeEpisode = null;
    }

    function stepAgent() {
      if (tick % 6 === 0) segmentLocalMedium();

      const localSample = sampleFieldAt(agent.x, agent.y);

      if (!agent.activeEpisode) {
        deliberateAndStartEpisode(localSample);
      }

      const ep = agent.activeEpisode;
      const targetLocus = ep.locusId ? locusById(ep.locusId) : null;

      let desiredAngle = ep.gesture.biasAngle;
      if (targetLocus) {
        desiredAngle = Math.atan2(targetLocus.y - agent.y, targetLocus.x - agent.x) + ep.gesture.biasAngle * 0.22;
      } else {
        desiredAngle += Math.sin(tick * 0.04) * 0.35;
      }

      const thrust = ep.gesture.thrust * 0.22;
      agent.vx = (agent.vx + Math.cos(desiredAngle) * thrust) * 0.89;
      agent.vy = (agent.vy + Math.sin(desiredAngle) * thrust) * 0.89;

      const maxSpeed = 2.25;
      const sp = Math.hypot(agent.vx, agent.vy);
      if (sp > maxSpeed) {
        agent.vx = (agent.vx / sp) * maxSpeed;
        agent.vy = (agent.vy / sp) * maxSpeed;
      }

      agent.x += agent.vx;
      agent.y += agent.vy;
      const margin = 28;
      if (agent.x < margin) { agent.x = margin; agent.vx = Math.abs(agent.vx) * 0.7; }
      if (agent.x > width - margin) { agent.x = width - margin; agent.vx = -Math.abs(agent.vx) * 0.7; }
      if (agent.y < margin) { agent.y = margin; agent.vy = Math.abs(agent.vy) * 0.7; }
      if (agent.y > height - margin) { agent.y = height - margin; agent.vy = -Math.abs(agent.vy) * 0.7; }

      if (tick % 2 === 0) {
        agent.trail.push([+agent.x.toFixed(2), +agent.y.toFixed(2)]);
        if (agent.trail.length > MAX_TRAIL) agent.trail.shift();
      }

      const [gx, gy] = worldToGrid(agent.x, agent.y);
      const coupling = ep.gesture.coupling;
      const slowWork = (Math.abs(coupling[2]) + Math.abs(coupling[3])) * 0.052;
      depositWavepacket(
        gx,
        gy,
        [coupling[0] * 0.09, coupling[1] * 0.09, coupling[2] * 0.085, coupling[3] * 0.085],
        1.55,
        slowWork
      );

      updateViabilityAndBody(localSample, coupling, sp);

      ep.ticksLeft--;
      if (ep.ticksLeft <= 0) {
        const endSample = sampleFieldAt(agent.x, agent.y);
        evaluateAndCloseEpisode(endSample);
      }
    }

    function coherence() {
      if (!agent) return 0;
      if (agent.ontologyMode === 'none') {
        const recent = agent.causalTraces.slice(-16);
        if (!recent.length) return 0;
        const meanAcc = recent.reduce((s, t) => s + t.accuracy, 0) / recent.length;
        const macroFactor = Math.min(1, agent.macros.length / 4);
        return clamp(meanAcc * 0.7 + macroFactor * 0.3, 0, 1);
      }
      if (!agent.concepts.length) {
        const recent = agent.causalTraces.slice(-10);
        return recent.length ? clamp((recent.reduce((s, t) => s + t.accuracy, 0) / recent.length) * 0.45, 0, 1) : 0;
      }
      const conceptFactor = Math.min(1, agent.concepts.length / 5);
      const beliefConf = agent.beliefs.length
        ? agent.beliefs.reduce((sum, b) => sum + b.confidence, 0) / agent.beliefs.length
        : 0.25;
      const recent = agent.causalTraces.slice(-12);
      const predFactor = recent.length ? recent.reduce((s, t) => s + t.accuracy, 0) / recent.length : 0.4;
      return clamp(conceptFactor * 0.32 + beliefConf * 0.34 + predFactor * 0.34 + (agent.selfName ? 0.08 : 0), 0, 1);
    }

    let batching = false;
    let autosaveDue = false;

    function simulate() {
      tick++;
      stepContinuousMedium();
      stepAgent();

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.age++;
      }
      particles = particles.filter((p) => p.age < p.max);
      for (const rp of ripples) rp.age++;
      ripples = ripples.filter((rp) => rp.age < rp.max);

      if (!batching) {
        hooks.onTick?.(tick);
        if (tick % 3 === 0) hooks.onRender?.();
        if (tick % 120 === 0) hooks.onAutosave?.(false);
      } else if (tick % 120 === 0) {
        autosaveDue = true;
      }
    }

    function steps(count) {
      const total = Math.max(0, Math.floor(count));
      batching = true;
      autosaveDue = false;
      try {
        for (let i = 0; i < total; i++) simulate();
      } finally {
        batching = false;
      }
      hooks.onTick?.(tick);
      hooks.onRender?.();
      if (autosaveDue) hooks.onAutosave?.(false);
      return tick;
    }

    function perturb(at = null) {
      const px = at && Number.isFinite(at.x) ? clamp(at.x, 24, width - 24) : r(40, width - 40);
      const py = at && Number.isFinite(at.y) ? clamp(at.y, 24, height - 24) : r(40, height - 40);
      const [gx, gy] = worldToGrid(px, py);
      const amps = [r(-0.92, 0.92), r(-0.92, 0.92), r(-0.75, 0.75), r(-0.65, 0.65)];
      depositWavepacket(gx, gy, amps, 2.4, 0);
      totalEvents++;
      addRipple(px, py, 34, 'event');
      burst(px, py, 'concept', 8);
      hooks.onRender?.();
      hooks.onAutosave?.(false);
    }

    function setOntologyMode(nextMode) {
      if (!VALID_ONTOLOGY_MODES.includes(nextMode) || !agent) {
        throw new Error(`Invalid ontology mode "${String(nextMode)}". Expected emergent, none, or imported.`);
      }
      agent.ontologyMode = nextMode;
      if (nextMode === 'none') {
        agent.concepts = [];
        agent.beliefs = [];
        agent.relationCounts = {};
        agent.selfName = null;
        agent.selfGlyph = null;
        agent.selfBorn = null;
        for (const l of loci) l.conceptId = null;
        pruneUnusedNames();
        addLog('∅ :: ontology-off', 'Switched to strictly ontology-free mode; agency operates purely on continuous causal deltas & canvas marks.', 'system');
      } else {
        addLog(`Φ :: ontology-${nextMode}`, `Ontology mode set to "${nextMode}".`, 'system');
      }
      hooks.onIdentity?.();
      hooks.onRender?.();
      hooks.onAutosave?.(false);
      return agent.ontologyMode;
    }

    function createSnapshot() {
      return {
        format: SAVE_FORMAT,
        version: SAVE_VERSION,
        appVersion: APP_VERSION,
        ruleset: RULESET_VERSION,
        savedAt: new Date().toISOString(),
        seed,
        rngState: rand.getState(),
        tick,
        running,
        speed,
        logMode,
        canvasLens,
        totalEvents,
        world: { width, height, gridW: GRID_W, gridH: GRID_H },
        worldPhysics: cloneData(worldPhysics),
        fieldB64: encodeFloat32Base64(field),
        imprintB64: encodeFloat32Base64(imprint),
        ids: { ...ids },
        loci: cloneData(loci),
        artifacts: cloneData(artifacts),
        particles: cloneData(particles),
        ripples: cloneData(ripples),
        featureHistory: cloneData(featureHistory),
        logs: cloneData(logs),
        agent: {
          ...cloneData({ ...agent, usedNames: undefined }),
          usedNames: [...agent.usedNames]
        }
      };
    }

    function restoreSnapshot(data) {
      if (!validSnapshot(data)) throw new Error('This file is not a valid NUL world snapshot.');
      const nextField = decodeFloat32Base64(data.fieldB64, FIELD_LEN);
      const nextImprint = decodeFloat32Base64(data.imprintB64, CELLS_LEN);
      if (!nextField || !nextImprint) throw new Error('This file is not a valid NUL world snapshot.');

      const sx = data.world.width ? width / data.world.width : 1;
      const sy = data.world.height ? height / data.world.height : 1;
      const scalePoint = (item) => ({
        ...item,
        x: clamp(item.x * sx, 12, width - 12),
        y: clamp(item.y * sy, 12, height - 12)
      });

      seed = data.seed >>> 0;
      rand = mulberry32(seed);
      rand.setState(data.rngState >>> 0);
      tick = data.tick;
      running = Boolean(data.running);
      speed = [1, 2, 4, 8].includes(data.speed) ? data.speed : 1;
      logMode = ['dual', 'agent', 'observer'].includes(data.logMode) ? data.logMode : 'dual';
      if (VALID_CANVAS_LENSES.includes(data.canvasLens)) canvasLens = data.canvasLens;
      totalEvents = data.totalEvents;
      worldPhysics = cloneData(data.worldPhysics);
      field = nextField;
      fieldNext = new Float32Array(FIELD_LEN);
      imprint = nextImprint;

      ids = {
        locus: Number.isInteger(data.ids?.locus) ? data.ids.locus : 1,
        concept: Number.isInteger(data.ids?.concept) ? data.ids.concept : 1,
        artifact: Number.isInteger(data.ids?.artifact) ? data.ids.artifact : 1,
        macro: Number.isInteger(data.ids?.macro) ? data.ids.macro : 1,
        mark: Number.isInteger(data.ids?.mark) ? data.ids.mark : 1
      };

      loci = cloneData(data.loci).slice(-MAX_LOCI).map(scalePoint);
      artifacts = cloneData(data.artifacts).slice(-MAX_ARTIFACTS).map(scalePoint);
      particles = cloneData(data.particles).slice(-MAX_PARTICLES).map(scalePoint);
      ripples = cloneData(data.ripples).slice(-MAX_RIPPLES).map(scalePoint);
      featureHistory = cloneData(data.featureHistory).slice(-MAX_FEATURE_HISTORY);
      logs = cloneData(data.logs).slice(-MAX_LOGS);

      const restoredAgent = cloneData(data.agent);
      agent = {
        ...restoredAgent,
        ontologyMode: VALID_ONTOLOGY_MODES.includes(restoredAgent.ontologyMode) ? restoredAgent.ontologyMode : 'emergent',
        x: clamp(restoredAgent.x * sx, 12, width - 12),
        y: clamp(restoredAgent.y * sy, 12, height - 12),
        concepts: restoredAgent.concepts.slice(0, MAX_CONCEPTS),
        memories: restoredAgent.memories.slice(-MAX_MEMORIES),
        beliefs: restoredAgent.beliefs.slice(0, 18),
        macros: (restoredAgent.macros || []).slice(0, MAX_MACROS),
        causalTraces: (restoredAgent.causalTraces || []).slice(-MAX_TRACES),
        marks: (restoredAgent.marks || []).slice(-MAX_MARKS).map(scalePoint),
        totalArtifactsCreated: Number.isInteger(restoredAgent.totalArtifactsCreated)
          ? Math.max(restoredAgent.totalArtifactsCreated, artifacts.length)
          : artifacts.length,
        usedNames: new Set(restoredAgent.usedNames),
        trail: restoredAgent.trail.slice(-MAX_TRAIL).map(([x, y]) => [
          clamp(x * sx, 12, width - 12),
          clamp(y * sy, 12, height - 12)
        ])
      };
      pruneUnusedNames();

      hooks.onSnapshotRestored?.();
      hooks.onControls?.();
      hooks.onLog?.();
      hooks.onRender?.();
      return true;
    }

    function exportOntology() {
      return {
        format: ONTOLOGY_FORMAT,
        version: ONTOLOGY_VERSION,
        experiment: `NUL v${APP_VERSION} / ${RULESET_VERSION}`,
        appVersion: APP_VERSION,
        ruleset: RULESET_VERSION,
        exportedAt: new Date().toISOString(),
        seed,
        tick,
        agent: {
          ontologyMode: agent.ontologyMode,
          selfSymbol: agent.selfName,
          selfGlyph: safeGlyph(agent.selfGlyph),
          selfBorn: agent.selfBorn,
          energy: +agent.energy.toFixed(3),
          concepts: cloneData(agent.concepts),
          beliefs: cloneData(agent.beliefs),
          relationCounts: cloneData(agent.relationCounts),
          macros: cloneData(agent.macros),
          artifacts: cloneData(artifacts),
          episodicMemory: agent.memories.slice(-30),
          generatedOperators: cloneData(agent.operators)
        }
      };
    }

    function importOntology(data) {
      const check = validateOntology(data);
      if (!check.valid) throw new Error(check.reason);
      if (!agent) throw new Error('World is not initialized yet.');

      const src = data.agent;
      const importedConcepts = src.concepts.slice(0, MAX_CONCEPTS).map((c) => ({
        id: c.id,
        name: c.name,
        glyph: safeGlyph(c.glyph) || deterministicGlyphFromText(c.name),
        prototype: c.prototype.map((n) => +clamp(n, 0, 1).toFixed(4)),
        causalPrototype: Array.isArray(c.causalPrototype) && c.causalPrototype.length === 4
          ? c.causalPrototype.map((n) => +clamp(n, -1, 1).toFixed(4))
          : null,
        born: Math.max(0, Math.floor(c.born)),
        seen: Math.max(0, Math.floor(c.seen)),
        contacts: Math.max(0, Math.floor(c.contacts)),
        valence: clamp(c.valence, -1, 1),
        totalEffect: +Number(c.totalEffect).toFixed(4),
        examples: Math.max(1, Math.floor(c.examples))
      }));

      const validIds = new Set(importedConcepts.map((c) => c.id));
      const importedBeliefs = src.beliefs
        .filter((b) => validIds.has(b.fromId) && validIds.has(b.toId))
        .map((b) => ({
          key: `${b.fromId}>${b.toId}`,
          fromId: b.fromId,
          toId: b.toId,
          macroId: Number.isInteger(b.macroId) ? b.macroId : null,
          count: Math.max(1, Math.floor(b.count)),
          falsifications: Math.max(0, Math.floor(b.falsifications || 0)),
          born: Math.max(0, Math.floor(b.born)),
          confidence: clamp(b.confidence, 0, 1)
        }));

      const nextRelations = {};
      if (src.relationCounts && typeof src.relationCounts === 'object') {
        for (const [k, v] of Object.entries(src.relationCounts)) {
          const parts = k.split('>').map(Number);
          if (parts.length === 2 && validIds.has(parts[0]) && validIds.has(parts[1]) && Number.isFinite(v) && v > 0) {
            nextRelations[k] = Math.floor(v);
          }
        }
      }
      for (const b of importedBeliefs) {
        if (!nextRelations[b.key] || nextRelations[b.key] < b.count) nextRelations[b.key] = b.count;
      }

      agent.ontologyMode = 'imported';
      agent.concepts = importedConcepts;
      agent.beliefs = importedBeliefs;
      agent.relationCounts = nextRelations;

      if (Array.isArray(src.macros) && src.macros.length > 0) {
        agent.macros = cloneData(src.macros).slice(0, MAX_MACROS);
        const maxMacroId = agent.macros.reduce((m, op) => Math.max(m, op.id || 0), 0);
        ids.macro = Math.max(ids.macro, maxMacroId + 1);
      }

      if (src.generatedOperators) {
        agent.operators = {
          is: src.generatedOperators.is,
          sequence: src.generatedOperators.sequence,
          join: src.generatedOperators.join,
          create: src.generatedOperators.create
        };
      }

      if (typeof src.selfSymbol === 'string' && src.selfSymbol.trim().length > 0) {
        agent.selfName = src.selfSymbol.trim();
        agent.selfGlyph = safeGlyph(src.selfGlyph) || deterministicGlyphFromText(agent.selfName);
        agent.selfBorn = Number.isFinite(src.selfBorn) ? Math.max(0, Math.floor(src.selfBorn)) : tick;
      } else {
        agent.selfName = null;
        agent.selfGlyph = null;
        agent.selfBorn = null;
      }

      const maxConceptId = importedConcepts.reduce((m, c) => Math.max(m, c.id), 0);
      ids.concept = Math.max(ids.concept, maxConceptId + 1);
      agent.targetId = null;
      agent.activeEpisode = null;

      for (const l of loci) {
        const match = matchConceptForLocus(l.features, l.causalDelta);
        l.conceptId = match ? match.id : null;
      }

      pruneUnusedNames();

      const label = agent.selfName ? `“${agent.selfName}”` : 'unnamed mind';
      addLog(
        `ontology ⇐ ${importedConcepts.length}c · ${importedBeliefs.length}b`,
        `Imported ontology (${label}: ${importedConcepts.length} concepts, ${importedBeliefs.length} beliefs) for cross-world testing.`,
        'system'
      );

      hooks.onOntologyImported?.();
      hooks.onIdentity?.();
      hooks.onRender?.();
      hooks.onAutosave?.(false);
      return {
        concepts: importedConcepts.length,
        beliefs: importedBeliefs.length,
        macros: agent.macros.length,
        selfSymbol: agent.selfName
      };
    }

    function resetWorld(newSeed = true, explicitSeed = null, optionsReset = {}) {
      if (Number.isInteger(explicitSeed) && explicitSeed >= 1 && explicitSeed <= 2147483647) {
        seed = explicitSeed;
      } else if (newSeed || !seed) {
        if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
          seed = (crypto.getRandomValues(new Uint32Array(1))[0] % 2147483646) + 1;
        } else {
          seed = (Math.floor(Math.random() * 2147483646) + 1) >>> 0;
        }
      }
      rand = mulberry32(seed);
      tick = 0;
      totalEvents = 0;
      field = new Float32Array(FIELD_LEN);
      fieldNext = new Float32Array(FIELD_LEN);
      imprint = new Float32Array(CELLS_LEN);
      worldPhysics = createWorldPhysics();

      loci = [];
      artifacts = [];
      particles = [];
      ripples = [];
      logs = [];
      featureHistory = [];
      ids = { locus: 1, concept: 1, artifact: 1, macro: 1, mark: 1 };

      for (let i = 0; i < 6; i++) {
        const gx = r(4, GRID_W - 5);
        const gy = r(4, GRID_H - 5);
        const amps = [r(-0.85, 0.85), r(-0.85, 0.85), r(-0.65, 0.65), r(-0.55, 0.55)];
        depositWavepacket(gx, gy, amps, r(2.2, 3.6), 0);
      }

      const modeToUse = VALID_ONTOLOGY_MODES.includes(optionsReset.ontologyMode)
        ? optionsReset.ontologyMode
        : (agent && agent.ontologyMode !== 'imported' ? agent.ontologyMode : 'emergent');
      agent = createAgent(modeToUse);
      running = true;

      addLog(
        `0000 :: Φ[${GRID_W}×${GRID_H}×4] · ∅`,
        `World initialized (${RULESET_VERSION}) · continuous 4-channel medium, ontology=${agent.ontologyMode}.`,
        'system'
      );
      hooks.onWorldReset?.();
      hooks.onControls?.();
      hooks.onRender?.();
      hooks.onAutosave?.(false);
      return seed;
    }

    function getState() {
      return {
        appVersion: APP_VERSION,
        ruleset: RULESET_VERSION,
        seed,
        rngState: rand ? rand.getState() : null,
        tick,
        running,
        speed,
        logMode,
        canvasLens,
        ontologyMode: agent ? agent.ontologyMode : 'emergent',
        width,
        height,
        gridW: GRID_W,
        gridH: GRID_H,
        counts: {
          signals: loci.length,
          loci: loci.length,
          artifacts: artifacts.length,
          totalArtifactsCreated: agent ? (agent.totalArtifactsCreated || 0) : 0,
          concepts: agent ? agent.concepts.length : 0,
          memories: agent ? agent.memories.length : 0,
          beliefs: agent ? agent.beliefs.length : 0,
          macros: agent ? agent.macros.length : 0,
          causalTraces: agent ? agent.causalTraces.length : 0,
          marks: agent ? agent.marks.length : 0,
          falsifications: agent ? (agent.falsificationsCount || 0) : 0,
          usedNames: agent ? agent.usedNames.size : 0,
          trail: agent ? agent.trail.length : 0,
          logs: logs.length,
          particles: particles.length,
          ripples: ripples.length
        }
      };
    }

    return {
      get seed() { return seed; },
      get rngState() { return rand ? rand.getState() : null; },
      get tick() { return tick; },
      get running() { return running; },
      set running(val) { running = Boolean(val); },
      get speed() { return speed; },
      set speed(val) { if ([1, 2, 4, 8].includes(val)) speed = val; },
      get logMode() { return logMode; },
      set logMode(val) { if (['dual', 'agent', 'observer'].includes(val)) logMode = val; },
      get canvasLens() { return canvasLens; },
      set canvasLens(val) { setCanvasLens(val); },
      get width() { return width; },
      get height() { return height; },
      get totalEvents() { return totalEvents; },
      get agent() { return agent; },
      get loci() { return loci; },
      get signals() { return loci; },
      get artifacts() { return artifacts; },
      get particles() { return particles; },
      get ripples() { return ripples; },
      get logs() { return logs; },
      get field() { return field; },
      get imprint() { return imprint; },
      get worldPhysics() { return worldPhysics; },
      setHooks,
      setDimensions,
      setCanvasLens,
      setOntologyMode,
      sampleFieldAt,
      conceptById,
      locusById,
      signalById: locusById,
      macroById,
      coherence,
      simulate,
      steps,
      perturb,
      resetWorld,
      createSnapshot,
      restoreSnapshot,
      validSnapshot,
      exportOntology,
      validateOntology,
      validOntology,
      importOntology,
      getState,
      constants: {
        APP_VERSION,
        RULESET_VERSION,
        STORAGE_KEY,
        SAVE_FORMAT,
        SAVE_VERSION,
        ONTOLOGY_FORMAT,
        ONTOLOGY_VERSION,
        GRID_W,
        GRID_H,
        CHANNELS,
        MAX_CONCEPTS,
        MAX_ARTIFACTS,
        MAX_LOCI,
        MAX_MACROS,
        MAX_TRACES,
        MAX_MARKS,
        MAX_MEMORIES,
        MAX_LOGS,
        MAX_TRAIL,
        MAX_FEATURE_HISTORY,
        MAX_SIGNALS: MAX_LOCI,
        MAX_PARTICLES,
        MAX_RIPPLES
      }
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
    GRID_W,
    GRID_H,
    CHANNELS,
    MAX_CONCEPTS,
    MAX_ARTIFACTS,
    MAX_LOCI,
    MAX_MACROS,
    MAX_TRACES,
    MAX_MARKS,
    MAX_MEMORIES,
    MAX_LOGS,
    MAX_TRAIL,
    MAX_FEATURE_HISTORY,
    MAX_SIGNALS: MAX_LOCI,
    MAX_PARTICLES,
    MAX_RIPPLES,
    clamp,
    pad,
    esc,
    distance,
    mulberry32,
    safeGlyph,
    deterministicGlyphFromText,
    glyphSVG,
    validSnapshot,
    validateOntology,
    validOntology,
    createEngine
  };
});
