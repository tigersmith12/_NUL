import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHeadlessLab } from '../scripts/headless-harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('sticky Lab top bar, sticky modal header, sticky Mind panel, and dvh iframe rules exist in styles.css', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');

  // Topbar must be sticky at top: 0 in Lab mode so minimize/close/mode buttons stay reachable while scrolling
  const topbarBlock = css.match(/\.topbar\s*\{([\s\S]*?)\}/);
  assert.ok(topbarBlock, '.topbar rule should exist in src/styles.css');
  assert.match(topbarBlock[1], /position:\s*sticky/);
  assert.match(topbarBlock[1], /top:\s*0/);
  assert.match(topbarBlock[1], /z-index:\s*\d+/);

  // Dialog headers must be sticky so close button stays reachable in short iframes
  const methodHeadBlock = css.match(/\.method-head\s*\{([\s\S]*?)\}/);
  assert.ok(methodHeadBlock, '.method-head rule should exist in src/styles.css');
  assert.match(methodHeadBlock[1], /position:\s*sticky/);
  assert.match(methodHeadBlock[1], /top:\s*0/);

  // Mind panel is sticky on desktop widths and resets cleanly on single-column mobile/narrow widths
  const mindPanelBlock = css.match(/\.mind-panel\s*\{([\s\S]*?)\}/);
  assert.ok(mindPanelBlock, '.mind-panel rule should exist in src/styles.css');
  assert.match(mindPanelBlock[1], /position:\s*sticky/);

  // Companion & iframe dynamic viewport height support
  assert.match(css, /100dvh/);
  assert.doesNotMatch(css, /#companion-button\s*\{\s*display:\s*none/, 'Companion toggle should remain reachable on narrow iframes');
});

test('all assets linked in index.html exist on disk, in Electron build.files, and in sandbox-server.mjs', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const serverCode = fs.readFileSync(path.join(ROOT, 'scripts', 'sandbox-server.mjs'), 'utf8');

  const refs = [];
  for (const m of html.matchAll(/(?:href|src)=["']([^"'#?]+)["']/g)) {
    refs.push(m[1]);
  }
  assert.ok(refs.length >= 3, 'index.html should reference modular CSS/JS assets');

  for (const rel of refs) {
    assert.equal(fs.existsSync(path.join(ROOT, rel)), true, `Missing referenced file: ${rel}`);
    assert.equal(serverCode.includes(`'/${rel}'`), true, `sandbox-server.mjs should whitelist /${rel}`);
    if (rel.startsWith('src/')) {
      assert.equal(pkg.build.files.includes('src/**/*'), true, 'package.json build.files must include src/**/*');
    }
  }
});

test('?mode=companion query parameter boots browser/iframe into companion layout and toggles back to lab', () => {
  const env = createHeadlessLab({ width: 360, height: 480, locationSearch: '?mode=companion' });
  assert.equal(env.lab.getDesktopMode(), 'companion');
  assert.equal(env.document.body.classList.contains('companion-mode'), true);

  env.lab.requestMode('lab');
  assert.equal(env.lab.getDesktopMode(), 'lab');
  assert.equal(env.document.body.classList.contains('companion-mode'), false);
});

test('world:inspect CLI executes deterministically and outputs structured JSON state & ontology', () => {
  const stdout = execFileSync(
    process.execPath,
    [path.join(ROOT, 'scripts', 'inspect-world.mjs'), '--seed', '424242', '--ticks', '300', '--json'],
    { cwd: ROOT, encoding: 'utf8' }
  );
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.state.seed, 424242);
  assert.equal(parsed.state.tick, 300);
  assert.equal(parsed.ontology.format, 'nul-ontology');
});
