#!/usr/bin/env node
/**
 * NUL Single-Process Terminal Companion (< 55 MB total RAM)
 * Runs the exact `BOOTSTRAP/0.1` simulation engine from `index.html` in a single
 * Node process with zero Chromium/Electron overhead, reading and writing portable
 * `nul-resumable-world` v1 JSON snapshots interchangeable with Browser & Electron.
 *
 * Usage:
 *   npm run start:tui
 *   node scripts/companion-tui.mjs --save ./my-world.json
 *   node scripts/companion-tui.mjs --once --ticks 600 --seed 424242
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { createHeadlessLab } from './headless-harness.mjs';

function parseArgs(argv) {
  const opts = {
    savePath: path.join(os.homedir(), '.nul-companion-world.json'),
    seed: null,
    once: false,
    ticks: 240
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--save' && argv[i + 1]) opts.savePath = path.resolve(argv[++i]);
    else if (a === '--seed' && argv[i + 1]) opts.seed = Number.parseInt(argv[++i], 10);
    else if (a === '--once') opts.once = true;
    else if (a === '--ticks' && argv[i + 1]) opts.ticks = Math.max(1, Number.parseInt(argv[++i], 10));
  }
  return opts;
}

function renderAsciiBox(snapshot, savePath, paused, speed) {
  const cols = 44;
  const rows = 13;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(' '));
  const sx = cols / snapshot.world.width;
  const sy = rows / snapshot.world.height;
  const place = (x, y, ch) => {
    const gx = Math.max(0, Math.min(cols - 1, Math.floor(x * sx)));
    const gy = Math.max(0, Math.min(rows - 1, Math.floor(y * sy)));
    grid[gy][gx] = ch;
  };

  for (const s of snapshot.signals) place(s.x, s.y, s.conceptId ? '◦' : '·');
  for (const a of snapshot.artifacts) place(a.x, a.y, '✦');
  place(snapshot.agent.x, snapshot.agent.y, '◉');

  const memMb = (process.memoryUsage().rss / (1024 * 1024)).toFixed(1);
  const selfLabel = snapshot.agent.selfName || 'unnamed';
  const energyPct = Math.round(snapshot.agent.energy * 100);
  const intent = snapshot.agent.goal ? snapshot.agent.goal.raw : '·';
  const recentLog = snapshot.logs[snapshot.logs.length - 1];

  const lines = [
    `┌${'─'.repeat(cols)}┐`,
    `│ NUL v${snapshot.appVersion || '0.01.002'} · T+${String(snapshot.tick).padStart(5, '0')} · ${paused ? 'PAUSED' : `${speed}x`}`.padEnd(cols + 1) + '│',
    `│ Agent: ${selfLabel} · Energy ${energyPct}% · RAM ${memMb} MB`.padEnd(cols + 1) + '│',
    `├${'─'.repeat(cols)}┤`,
    ...grid.map(row => `│${row.join('')}│`),
    `├${'─'.repeat(cols)}┤`,
    `│ Concepts ${snapshot.agent.concepts.length}/8 · Beliefs ${snapshot.agent.beliefs.length} · Artifacts ${snapshot.artifacts.length}/24`.padEnd(cols + 1) + '│',
    `│ Intent : ${intent.slice(0, cols - 10)}`.padEnd(cols + 1) + '│',
    `│ Stream : ${(recentLog ? recentLog.raw : '·').slice(0, cols - 10)}`.padEnd(cols + 1) + '│',
    `└${'─'.repeat(cols)}┘`,
    `Save: ${savePath}`,
    `Keys: [Space] pause  [N] perturb  [1/2/4/8] speed  [S] save  [Q] save & quit`
  ];
  return lines.join('\n');
}

function saveSnapshotFile(lab, savePath) {
  try {
    fs.mkdirSync(path.dirname(savePath), { recursive: true });
    fs.writeFileSync(savePath, JSON.stringify(lab.createSnapshot(), null, 2));
    return true;
  } catch {
    return false;
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { lab } = createHeadlessLab({ width: 360, height: 480 });

  let restored = false;
  if (opts.seed && Number.isInteger(opts.seed)) {
    lab.resetWorld(true, opts.seed);
  } else if (fs.existsSync(opts.savePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(opts.savePath, 'utf8'));
      restored = lab.restoreSnapshot(data);
    } catch {
      restored = false;
    }
  }
  if (!restored && !opts.seed) lab.resetWorld(true);

  if (opts.once) {
    lab.steps(opts.ticks);
    saveSnapshotFile(lab, opts.savePath);
    console.log(renderAsciiBox(lab.createSnapshot(), opts.savePath, false, 1));
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
      if (key.ctrl && key.name === 'c') {
        saveSnapshotFile(lab, opts.savePath);
        process.stdout.write('\x1b[?25h\n');
        process.exit(0);
      }
      if (key.name === 'q') {
        saveSnapshotFile(lab, opts.savePath);
        process.stdout.write('\x1b[?25h\n');
        process.exit(0);
      }
      if (key.name === 'space') paused = !paused;
      if (key.name === 'n') lab.perturb();
      if (key.name === 's') saveSnapshotFile(lab, opts.savePath);
      if (['1', '2', '4', '8'].includes(key.sequence)) speed = Number(key.sequence);
    });
  }

  process.stdout.write('\x1b[?25l\x1b[2J');
  const interval = setInterval(() => {
    if (!paused) {
      lab.steps(speed);
      tickCounter += speed;
      if (tickCounter >= 120) {
        saveSnapshotFile(lab, opts.savePath);
        tickCounter = 0;
      }
    }
    const output = renderAsciiBox(lab.createSnapshot(), opts.savePath, paused, speed);
    process.stdout.write(`\x1b[H${output}\n`);
  }, Math.round(1000 / 12));

  process.on('SIGINT', () => {
    clearInterval(interval);
    saveSnapshotFile(lab, opts.savePath);
    process.stdout.write('\x1b[?25h\n');
    process.exit(0);
  });
}

main();
