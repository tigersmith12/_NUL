#!/usr/bin/env node
/**
 * Generates SHA256SUMS.txt for built desktop distribution artifacts in `dist/`.
 * Cross-platform (Windows, macOS, Linux) with zero external dependencies.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const ARTIFACT_EXTS = new Set(['.exe', '.dmg', '.zip', '.appimage', '.html']);

if (!fs.existsSync(DIST)) {
  console.error('✗ dist/ directory does not exist.');
  process.exit(1);
}

const files = fs.readdirSync(DIST)
  .filter(name => ARTIFACT_EXTS.has(path.extname(name).toLowerCase()))
  .sort();

if (files.length === 0) {
  console.error('✗ No distributable binaries (.exe, .dmg, .zip, .AppImage) found in dist/.');
  process.exit(1);
}

const lines = [];
for (const file of files) {
  const fullPath = path.join(DIST, file);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
  lines.push(`${hash}  ${file}`);
}

const outPath = path.join(DIST, 'SHA256SUMS.txt');
fs.writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`✓ Wrote ${lines.length} checksum(s) to dist/SHA256SUMS.txt:`);
for (const line of lines) console.log(`  ${line}`);
