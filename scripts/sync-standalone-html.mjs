#!/usr/bin/env node
/**
 * Syncs `src/styles.css`, `src/engine.js`, and `src/app.js` inline into `index.html`
 * so `index.html` works 100% standalone when downloaded as a single file
 * (e.g. `file:///.../Downloads/index.html`) with zero external CSS/JS lookups,
 * while keeping modular `src/*` files as the editable/testable source of truth.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function syncStandaloneHtml(rootDir = DEFAULT_ROOT) {
  const htmlPath = path.join(rootDir, 'index.html');
  const cssPath = path.join(rootDir, 'src', 'styles.css');
  const enginePath = path.join(rootDir, 'src', 'engine.js');
  const appPath = path.join(rootDir, 'src', 'app.js');

  let html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8').trim();
  const engine = fs.readFileSync(enginePath, 'utf8').trim();
  const app = fs.readFileSync(appPath, 'utf8').trim();

  const styleBlock = `<style id="nul-inline-styles">\n${css}\n  </style>`;
  if (/<style\s+id=["']nul-inline-styles["']>[\s\S]*?<\/style>/.test(html)) {
    html = html.replace(/<style\s+id=["']nul-inline-styles["']>[\s\S]*?<\/style>/, () => styleBlock);
  } else if (/<link[^>]+href=["'](?:\.\/)?src\/styles\.css["'][^>]*\/?>/.test(html)) {
    html = html.replace(/<link[^>]+href=["'](?:\.\/)?src\/styles\.css["'][^>]*\/?>/, () => styleBlock);
  } else {
    throw new Error('Could not locate <style id="nul-inline-styles"> or src/styles.css link in index.html');
  }

  const scriptBlock = `<script id="nul-inline-engine">\n${engine}\n  </script>\n  <script id="nul-inline-app">\n${app}\n  </script>`;
  if (/<script\s+id=["']nul-inline-engine["']>[\s\S]*?<\/script>\s*<script\s+id=["']nul-inline-app["']>[\s\S]*?<\/script>/.test(html)) {
    html = html.replace(
      /<script\s+id=["']nul-inline-engine["']>[\s\S]*?<\/script>\s*<script\s+id=["']nul-inline-app["']>[\s\S]*?<\/script>/,
      () => scriptBlock
    );
  } else if (/<script[^>]+src=["'](?:\.\/)?src\/engine\.js["'][^>]*><\/script>\s*<script[^>]+src=["'](?:\.\/)?src\/app\.js["'][^>]*><\/script>/.test(html)) {
    html = html.replace(
      /<script[^>]+src=["'](?:\.\/)?src\/engine\.js["'][^>]*><\/script>\s*<script[^>]+src=["'](?:\.\/)?src\/app\.js["'][^>]*><\/script>/,
      () => scriptBlock
    );
  } else {
    throw new Error('Could not locate inline engine/app scripts or src/engine.js + src/app.js tags in index.html');
  }

  fs.writeFileSync(htmlPath, html);
}

if (import.meta.url === `file://${process.argv[1]}` || path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  syncStandaloneHtml();
  console.log('✓ Synced standalone inline CSS & JS into index.html');
}
