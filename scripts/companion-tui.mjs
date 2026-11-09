#!/usr/bin/env node
/**
 * NUL Single-Process Terminal Companion (< 50 MB total RAM)
 * Imports the pure DOM-free `src/engine.js` (SUBSTRATE/0.2) core directly in a single
 * Node process with zero Chromium/VM/DOM overhead, reading and writing lossless
 * `nul-resumable-world` v2 JSON snapshots and `nul-ontology` v1/v2 files.
 *
 * Usage:
 *   npm run start:tui
 *   node scripts/companion-tui.mjs --save ./my-world.json
 *   node scripts/companion-tui.mjs --once --ticks 600 --seed 424242 --ontology-mode none
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import NULCore from '../src/engine.js';

function parseArgs(argv) {
  const opts = {
    savePath: path.join(os.homedir(), '.nul-companion-world-v2.json'),
    ontologyMode: 'emergent',
    importOntology: null,
    exportOntology: null,
    seed: null,
    once: false,
    ticks: 240
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--save' && argv[i + 1]) opts.savePath = path.resolve(argv[++i]);
    else if (a === '--ontology-mode' && argv[i + 1]) opts.ontologyMode = argv[++i];
    else if (a === '--import-ontology' && argv[i + 1]) opts.importOntology = path.resolve(argv[++i]);
    else if (a === '--export-ontology' && argv[i + 1]) opts.exportOntology = path.resolve(argv[++i]);
    else if (a === '--seed' && argv[i + 1]) opts.seed = Number.parseInt(argv[++i], 10);
    else if (a === '--once') opts.once = true;
    else if (a === '--ticks' && argv[i + 1]) opts.ticks = Math.max(1, Number.parseInt(argv[++i], 10));
  }
  return opts;
}

function renderAsciiBox(snapshot, savePath, paused, speed) {
  const cols = 46;
  const rows = 13;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(' '));
  const sx = cols / snapshot.world.width;
  const sy = rows / snapshot.world.height;
  const place = (x, y, ch) => {
    const gx = Math.max(0, Math.min(cols - 1, Math.floor(x * sx)));
    const gy = Math.max(0, Math.min(rows - 1, Math.floor(y * sy)));
    grid[gy][gx] = ch;
  };

  const lociList = snapshot.loci || snapshot.signals || [];
  for (const s of lociList) place(s.x, s.y, s.conceptId ? '◦' : (s.sculpted > 0.22 ? '▫' : '·'));
  for (const m of (snapshot.agent.marks || [])) place(m.x, m.y, '×');
  for (const a of snapshot.artifacts) place(a.x, a.y, '✦');
  place(snapshot.agent.x, snapshot.agent.y, '◉');

  const memMb = (process.memoryUsage().rss / (1024 * 1024)).toFixed(1);
  const ontMode = snapshot.agent.ontologyMode || 'emergent';
  const selfLabel = ontMode === 'none' ? 'ontology-free' : (snapshot.agent.selfName || 'pre-symbolic');
  const energyPct = Math.round(snapshot.agent.energy * 100);
  const intent = snapshot.agent.goal ? snapshot.agent.goal.raw : '·';
  const recentLog = snapshot.logs[snapshot.logs.length - 1];
  const macrosCount = (snapshot.agent.macros || []).length;

  const lines = [
    `┌${'─'.repeat(cols)}┐`,
    `│ NUL v${snapshot.appVersion || NULCore.APP_VERSION} · T+${String(snapshot.tick).padStart(5, '0')} · ${paused ? 'PAUSED' : `${speed}x`} · ${ontMode}`.padEnd(cols + 1) + '│',
    `│ Agent: ${selfLabel} · Viab ${energyPct}% · RAM ${memMb} MB`.padEnd(cols + 1) + '│',
    `├${'─'.repeat(cols)}┤`,
    ...grid.map((row) => `│${row.join('')}│`),
    `├${'─'.repeat(cols)}┤`,
    `│ Concepts ${snapshot.agent.concepts.length}/8 · Ops ${macrosCount}/8 · Structures ${snapshot.artifacts.length}/24`.padEnd(cols + 1) + '│',
    `│ Intent : ${intent.slice(0, cols - 10)}`.padEnd(cols + 1) + '│',
    `│ Stream : ${(recentLog ? recentLog.raw : '·').slice(0, cols - 10)}`.padEnd(cols + 1) + '│',
    `└${'─'.repeat(cols)}┘`,
    `Save: ${savePath}`,
    `Keys: [Space] pause  [N] perturb  [M] ontology-mode  [1/2/4/8] speed  [S] save  [O] ontology  [Q] quit`
  ];
  return lines.join('\n');
}

function saveSnapshotFile(engine, savePath) {
  try {
    fs.mkdirSync(path.dirname(savePath), { recursive: true });
    fs.writeFileSync(savePath, JSON.stringify(engine.createSnapshot(), null, 2));
    return true;
  } catch {
    return false;
  }
}

function saveOntologyFile(engine, outPath) {
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(engine.exportOntology(), null, 2));
    return true;
  } catch {
    return false;
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const engine = NULCore.createEngine({ width: 360, height: 480 });

  let restored = false;
  if (opts.seed && Number.isInteger(opts.seed)) {
    engine.resetWorld(true, opts.seed, { ontologyMode: opts.ontologyMode });
  } else if (fs.existsSync(opts.savePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(opts.savePath, 'utf8'));
      restored = engine.restoreSnapshot(data);
    } catch {
      restored = false;
    }
  }
  if (!restored && !opts.seed) engine.resetWorld(true, null, { ontologyMode: opts.ontologyMode });

  if (opts.importOntology) {
    const rawOnt = JSON.parse(fs.readFileSync(opts.importOntology, 'utf8'));
    engine.importOntology(rawOnt);
  }

  if (opts.once) {
    engine.steps(opts.ticks);
    saveSnapshotFile(engine, opts.savePath);
    if (opts.exportOntology) saveOntologyFile(engine, opts.exportOntology);
    console.log(renderAsciiBox(engine.createSnapshot(), opts.savePath, false, 1));
    return;
  }

  let paused = false;
  let speed = 1;
  let tickCounter = 0;

  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.on('keypress', (_str, key) => {
      if (!key) return;
      if ((key.ctrl && key.name === 'c') || key.name === 'q') {
        saveSnapshotFile(engine, opts.savePath);
        process.stdout.write('\x1b[?25h\n');
        process.exit(0);
      }
      if (key.name === 'space') paused = !paused;
      if (key.name === 'n') engine.perturb();
      if (key.name === 'm') {
        const nextMode = engine.agent.ontologyMode === 'none' ? 'emergent' : 'none';
        engine.setOntologyMode(nextMode);
      }
      if (key.name === 's') saveSnapshotFile(engine, opts.savePath);
      if (key.name === 'o') {
        const ontPath = opts.exportOntology || opts.savePath.replace(/\.json$/i, '') + '.ontology.json';
        saveOntologyFile(engine, ontPath);
      }
      if (['1', '2', '4', '8'].includes(key.sequence)) speed = Number(key.sequence);
    });
  }

  process.stdout.write('\x1b[?25l\x1b[2J');
  const interval = setInterval(() => {
    if (!paused) {
      engine.steps(speed);
      tickCounter += speed;
      if (tickCounter >= 120) {
        saveSnapshotFile(engine, opts.savePath);
        tickCounter = 0;
      }
    }
    const output = renderAsciiBox(engine.createSnapshot(), opts.savePath, paused, speed);
    process.stdout.write(`\x1b[H${output}\n`);
  }, Math.round(1000 / 12));

  process.on('SIGINT', () => {
    clearInterval(interval);
    saveSnapshotFile(engine, opts.savePath);
    process.stdout.write('\x1b[?25h\n');
    process.exit(0);
  });
}

main();
