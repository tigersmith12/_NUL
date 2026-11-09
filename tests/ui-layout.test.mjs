import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
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

test('index.html is 100% standalone (zero external CSS/JS links) and synced byte-for-byte with src/* and Electron packaging', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8').trim();
  const engine = fs.readFileSync(path.join(ROOT, 'src', 'engine.js'), 'utf8').trim();
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8').trim();
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

  // Zero external href/src dependencies in HTML markup so a downloaded standalone index.html never renders unstyled fallback
  const markupOnly = html
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (tag) => {
      const openTag = tag.slice(0, tag.indexOf('>') + 1);
      return /\bsrc=/.test(openTag) ? openTag : '';
    });
  const externalRefs = [...markupOnly.matchAll(/<(?:link|script)\b[^>]*\b(?:href|src)=["']([^"']+)["'][^>]*>/gi)];
  assert.equal(externalRefs.length, 0, 'index.html must not rely on external <link href> or <script src> files');

  const inlineStyle = html.match(/<style\s+id=["']nul-inline-styles["']>([\s\S]*?)<\/style>/);
  const inlineEngine = html.match(/<script\s+id=["']nul-inline-engine["']>([\s\S]*?)<\/script>/);
  const inlineApp = html.match(/<script\s+id=["']nul-inline-app["']>([\s\S]*?)<\/script>/);

  assert.ok(inlineStyle, 'index.html must contain <style id="nul-inline-styles">');
  assert.ok(inlineEngine, 'index.html must contain <script id="nul-inline-engine">');
  assert.ok(inlineApp, 'index.html must contain <script id="nul-inline-app">');

  assert.equal(inlineStyle[1].trim(), css, 'index.html inline CSS must match src/styles.css');
  assert.equal(inlineEngine[1].trim(), engine, 'index.html inline engine must match src/engine.js');
  assert.equal(inlineApp[1].trim(), app, 'index.html inline app must match src/app.js');

  assert.equal(pkg.build.files.includes('index.html'), true);
  assert.equal(pkg.build.files.includes('desktop/**/*'), true);
  assert.equal(pkg.build.nsis.include, 'desktop/installer.nsh');
  assert.equal(fs.existsSync(path.join(ROOT, 'desktop', 'installer.nsh')), true);
});

test('standalone index.html inline scripts execute cleanly in isolation without any src/ directory', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const inlineEngine = html.match(/<script\s+id=["']nul-inline-engine["']>([\s\S]*?)<\/script>/)[1];
  const win = { crypto: crypto.webcrypto };
  win.window = win;
  win.globalThis = win;
  const ctx = vm.createContext(win);
  new vm.Script(inlineEngine, { filename: 'index.html#engine' }).runInContext(ctx);
  assert.ok(win.NULCore && typeof win.NULCore.createEngine === 'function');
  const engine = win.NULCore.createEngine({ width: 800, height: 520 });
  engine.resetWorld(true, 424242);
  engine.steps(60);
  assert.equal(engine.getState().tick, 60);
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
