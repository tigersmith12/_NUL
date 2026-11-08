#!/usr/bin/env node
/**
 * NUL Zero-Dependency Sandbox & Local Preview Server
 * Binds to 0.0.0.0, accepts all preview hosts/origins, permits iframe embedding,
 * and serves standalone `index.html` + `assets/` with minimal RAM (~40-50 MB RSS).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number.parseInt(process.env.PORT || '3000', 10);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon'
};

const ALLOWED_STATIC = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/favicon.ico', 'assets/icon.png'],
  ['/assets/icon.png', 'assets/icon.png']
]);

function readLinuxPssKb() {
  try {
    const rollup = fs.readFileSync('/proc/self/smaps_rollup', 'utf8');
    const match = rollup.match(/^Pss:\s+(\d+)\s+kB/m);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

const server = http.createServer((req, res) => {
  // Permissive preview headers so proxied hosts & iframes never break
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Cache-Control', 'no-cache');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
    return;
  }

  const reqUrl = new URL(req.url || '/', 'http://localhost');
  const pathname = reqUrl.pathname;

  if (pathname === '/healthz') {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const mem = process.memoryUsage();
    const pssKb = readLinuxPssKb();
    const payload = JSON.stringify({
      status: 'ok',
      name: pkg.name,
      semver: pkg.version,
      memory: {
        rssMb: +(mem.rss / (1024 * 1024)).toFixed(2),
        pssMb: pssKb !== null ? +(pssKb / 1024).toFixed(2) : null,
        heapUsedMb: +(mem.heapUsed / (1024 * 1024)).toFixed(2)
      }
    });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    if (req.method === 'HEAD') res.end();
    else res.end(payload);
    return;
  }

  // Also support companion mode quick-link via `/?mode=companion` cleanly serving index.html
  const relFile = ALLOWED_STATIC.get(pathname);
  if (!relFile) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  const fullPath = path.join(ROOT, relFile);
  try {
    const stat = fs.statSync(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': stat.size
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(fullPath).pipe(res);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, HOST, () => {
  const mem = process.memoryUsage();
  console.log(`NUL sandbox server listening on http://${HOST}:${PORT} (RSS ${(mem.rss / 1048576).toFixed(1)} MB)`);
});
