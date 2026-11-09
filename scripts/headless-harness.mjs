/**
 * Zero-dependency headless execution harness for NUL's `index.html` simulation engine.
 * Executes the exact inline script from `index.html` inside an isolated Node `vm` context
 * so tests, soak benchmarks, and the single-process TUI companion share one source of truth.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import NULCore from '../src/engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeClassList(initial = []) {
  const set = new Set(initial);
  return {
    add: (...names) => names.forEach(n => set.add(n)),
    remove: (...names) => names.forEach(n => set.delete(n)),
    toggle: (name, force) => {
      const next = force === undefined ? !set.has(name) : Boolean(force);
      if (next) set.add(name);
      else set.delete(name);
      return next;
    },
    contains: name => set.has(name),
    toArray: () => [...set]
  };
}

function makeCanvasContext2D() {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '9px monospace',
    textAlign: 'left',
    setTransform() {},
    save() {},
    restore() {},
    translate() {},
    scale() {},
    rotate() {},
    fillRect() {},
    clearRect() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    stroke() {},
    fill() {},
    setLineDash() {},
    fillText() {},
    createRadialGradient() {
      return { addColorStop() {} };
    }
  };
}

function makeElement(id = '', tagName = 'DIV', dataset = {}, defaultSize = { width: 800, height: 520 }) {
  const listeners = new Map();
  const ctx2d = makeCanvasContext2D();
  const el = {
    id,
    tagName,
    textContent: '',
    innerHTML: '',
    className: '',
    value: '',
    title: '',
    hidden: false,
    disabled: false,
    open: false,
    width: defaultSize.width,
    height: defaultSize.height,
    _mockWidth: defaultSize.width,
    _mockHeight: defaultSize.height,
    scrollHeight: 0,
    scrollTop: 0,
    clientHeight: 198,
    dataset: { ...dataset },
    style: {},
    files: [],
    classList: makeClassList(),
    attributes: new Map(),
    setAttribute(k, v) { this.attributes.set(k, String(v)); },
    getAttribute(k) { return this.attributes.get(k) ?? null; },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatchEvent(type, eventObj = {}) {
      const handlers = listeners.get(type) || [];
      for (const fn of handlers) fn({ preventDefault() {}, target: el, ...eventObj });
    },
    getBoundingClientRect() {
      return {
        left: 0,
        top: 0,
        width: this._mockWidth || defaultSize.width,
        height: this._mockHeight || defaultSize.height
      };
    },
    getContext() { return ctx2d; },
    showModal() { this.open = true; },
    close() { this.open = false; },
    focus() {},
    select() {},
    click() { this.dispatchEvent('click'); }
  };
  return el;
}

export function createHeadlessLab(options = {}) {
  const {
    width = 800,
    height = 520,
    blockStorage = false,
    initialStorage = {},
    confirmResult = true,
    locationSearch = ''
  } = options;

  const elementsById = new Map();
  const getById = id => {
    if (!elementsById.has(id)) {
      const tag = id.includes('input') || id.includes('file') ? 'INPUT'
        : id.includes('dialog') ? 'DIALOG'
        : id === 'world' ? 'CANVAS'
        : 'DIV';
      elementsById.set(id, makeElement(id, tag, {}, { width, height }));
    }
    return elementsById.get(id);
  };

  const speedButtons = [1, 2, 4, 8].map(s =>
    makeElement(`speed-${s}`, 'BUTTON', { speed: String(s) }, { width, height })
  );
  const logModes = ['dual', 'agent', 'observer'].map(m =>
    makeElement(`logmode-${m}`, 'BUTTON', { logmode: m }, { width, height })
  );
  const lensModes = ['combined', 'agent', 'medium'].map(l =>
    makeElement(`lens-${l}`, 'BUTTON', { lens: l }, { width, height })
  );
  const ontModes = ['emergent', 'none', 'imported'].map(m =>
    makeElement(`ontmode-${m}`, 'BUTTON', { ontmode: m }, { width, height })
  );
  const tabs = ['mind', 'lexicon', 'laws'].map(t =>
    makeElement(`tab-${t}`, 'BUTTON', { tab: t }, { width, height })
  );
  const tabPanes = ['mind', 'lexicon', 'laws'].map(t => {
    const pane = getById(`pane-${t}`);
    pane.hidden = t !== 'mind';
    return pane;
  });

  const storageMap = new Map(Object.entries(initialStorage));
  const localStorage = {
    getItem(key) {
      if (blockStorage) throw new Error('SecurityError: Storage is disabled inside sandboxed context.');
      return storageMap.has(key) ? storageMap.get(key) : null;
    },
    setItem(key, value) {
      if (blockStorage) throw new Error('SecurityError: Storage is disabled inside sandboxed context.');
      storageMap.set(String(key), String(value));
    },
    removeItem(key) {
      if (blockStorage) throw new Error('SecurityError: Storage is disabled inside sandboxed context.');
      storageMap.delete(String(key));
    },
    clear() {
      if (blockStorage) throw new Error('SecurityError: Storage is disabled inside sandboxed context.');
      storageMap.clear();
    }
  };

  const body = makeElement('body', 'BODY', {}, { width, height });
  const documentElement = makeElement('html', 'HTML', {}, { width, height });

  const document = {
    body,
    documentElement,
    hidden: false,
    activeElement: body,
    querySelector(selector) {
      if (selector.startsWith('#')) return getById(selector.slice(1));
      if (selector === 'body') return body;
      return makeElement(selector, 'DIV', {}, { width, height });
    },
    querySelectorAll(selector) {
      if (selector === '.speed-button') return speedButtons;
      if (selector === '.log-mode') return logModes;
      if (selector === '.lens-mode') return lensModes;
      if (selector === '.ont-mode') return ontModes;
      if (selector === '.tab') return tabs;
      if (selector === '.tab-pane') return tabPanes;
      return [];
    },
    createElement(tag) {
      return makeElement('', String(tag).toUpperCase(), {}, { width, height });
    },
    addEventListener() {}
  };

  let lastFrameCallback = null;
  const windowObj = {
    __NUL_ENABLE_TEST_HOOK__: true,
    devicePixelRatio: 1,
    location: { search: locationSearch },
    document,
    localStorage,
    crypto: crypto.webcrypto,
    performance,
    navigator: { clipboard: { writeText: async () => {} } },
    ResizeObserver: class { observe() {} disconnect() {} },
    Path2D: class { constructor() {} },
    Blob,
    structuredClone,
    URL: { createObjectURL: () => 'blob:nul', revokeObjectURL: () => {} },
    URLSearchParams,
    getComputedStyle: () => ({ getPropertyValue: () => 'monospace' }),
    requestAnimationFrame: cb => { lastFrameCallback = cb; return 1; },
    setTimeout: () => 1,
    clearTimeout: () => {},
    confirm: () => confirmResult,
    addEventListener() {},
    NULCore
  };
  windowObj.window = windowObj;
  windowObj.globalThis = windowObj;

  const context = vm.createContext(windowObj);
  const appPath = path.join(ROOT, 'src', 'app.js');
  if (fs.existsSync(appPath)) {
    new vm.Script(fs.readFileSync(appPath, 'utf8'), { filename: 'src/app.js' }).runInContext(context);
  } else {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const match = html.match(/<script>([\s\S]*?)<\/script>/);
    if (!match) throw new Error('Simulation script not found in src/ or index.html');
    new vm.Script(match[1], { filename: 'index.html' }).runInContext(context);
  }

  const lab = windowObj.__NUL_LAB__;
  if (!lab) throw new Error('window.__NUL_LAB__ hook was not initialized');

  return {
    lab,
    document,
    elementsById,
    getElement: id => getById(id),
    storageMap,
    renderFrame: (now = performance.now()) => { if (lastFrameCallback) lastFrameCallback(now); }
  };
}
