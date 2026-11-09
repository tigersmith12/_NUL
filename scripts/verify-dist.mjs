#!/usr/bin/env node
/**
 * Verifies built desktop artifacts in `dist/` for the target OS (`win`, `mac`, `linux`).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const target = (process.argv[2] || '').toLowerCase();

const EXPECTED_EXTS = {
  win: ['.exe'],
  mac: ['.dmg', '.zip'],
  linux: ['.appimage']
};

if (!EXPECTED_EXTS[target]) {
  console.error(`Usage: node scripts/verify-dist.mjs <win|mac|linux>`);
  process.exit(1);
}

if (!fs.existsSync(DIST)) {
  console.error('✗ dist/ directory missing.');
  process.exit(1);
}

const entries = fs.readdirSync(DIST);
for (const ext of EXPECTED_EXTS[target]) {
  const matching = entries.filter(name => name.toLowerCase().endsWith(ext));
  if (matching.length === 0) {
    console.error(`✗ Expected at least one *${ext} package in dist/ for target "${target}", found none.`);
    process.exit(1);
  }
  for (const file of matching) {
    const size = fs.statSync(path.join(DIST, file)).size;
    if (size < 1024 * 1024) {
      console.error(`✗ Package "${file}" is unexpectedly small (${size} bytes).`);
      process.exit(1);
    }
    console.log(`✓ Verified ${file} (${(size / (1024 * 1024)).toFixed(1)} MB)`);
  }
}

const sumsPath = path.join(DIST, 'SHA256SUMS.txt');
if (!fs.existsSync(sumsPath)) {
  console.error('✗ dist/SHA256SUMS.txt missing.');
  process.exit(1);
}
console.log('✓ Verified dist/SHA256SUMS.txt');
