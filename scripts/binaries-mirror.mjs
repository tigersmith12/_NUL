#!/usr/bin/env node
/**
 * Local GitHub Releases API mirror for Electron and electron-builder toolset binaries.
 *
 * Why this exists:
 *   `github.com/<org>/<repo>/releases/download/<tag>/<file>` can intermittently return
 *   HTTP 504 Gateway Time-out on GitHub's web router on repositories with thousands of tags,
 *   whereas the GitHub REST API (`api.github.com/repos/<org>/<repo>/releases/tags/<tag>` ->
 *   `/releases/assets/<id>` with `Accept: application/octet-stream`) resolves signed CDN
 *   redirect URLs (`release-assets.githubusercontent.com`) in ~150 ms.
 *
 * Routes:
 *   GET /healthz                            -> 200 JSON health check
 *   GET /shutdown                           -> 200 clean shutdown
 *   GET /electron/<tag>/<filename>          -> 302 CDN for electron/electron@<tag>
 *   GET /<tag>/<filename>                   -> 302 CDN for electron-userland/electron-builder-binaries@<tag>
 */

import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_REPO = process.env.BINARIES_MIRROR_REPO || 'electron-userland/electron-builder-binaries';
const ELECTRON_REPO = 'electron/electron';
const PORT = Number(process.env.BINARIES_MIRROR_PORT || 18765);
const HOST = '127.0.0.1';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

const releaseCache = new Map();
const CURL_BIN = process.platform === 'win32' ? 'curl.exe' : 'curl';

function authArgs(accept) {
  const args = [
    '-H', `Accept: ${accept}`,
    '-H', 'User-Agent: nul-binaries-mirror/0.1.2',
    '-H', 'X-GitHub-Api-Version: 2022-11-28',
  ];
  if (TOKEN) args.push('-H', `Authorization: Bearer ${TOKEN}`);
  return args;
}

async function getReleaseByTag(repo, tag) {
  const cacheKey = `${repo}@${tag}`;
  if (releaseCache.has(cacheKey)) return releaseCache.get(cacheKey);
  const apiUrl = `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`;
  const { stdout } = await execFileAsync(
    CURL_BIN,
    ['-fsSL', '--retry', '3', '--retry-delay', '1', ...authArgs('application/vnd.github+json'), apiUrl],
    { maxBuffer: 16 * 1024 * 1024 }
  );
  const data = JSON.parse(stdout);
  releaseCache.set(cacheKey, data);
  return data;
}

async function resolveSignedAssetUrl(repo, tag, filename) {
  const release = await getReleaseByTag(repo, tag);
  const asset = (release.assets || []).find((a) => a.name === filename);
  if (!asset) {
    throw new Error(`Asset "${filename}" not found in ${repo}@${tag}`);
  }
  const { stdout } = await execFileAsync(
    CURL_BIN,
    ['-sI', '--retry', '3', '--retry-delay', '1', ...authArgs('application/octet-stream'), asset.url],
    { maxBuffer: 4 * 1024 * 1024 }
  );
  const locMatch = stdout.match(/^location:\s*(\S+)/im);
  if (!locMatch) {
    throw new Error(`Expected 302 Location header from ${asset.url}`);
  }
  return locMatch[1].trim();
}

const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url || '/', `http://${HOST}:${PORT}`);
    if (urlObj.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, repo: DEFAULT_REPO }));
      return;
    }

    if (urlObj.pathname === '/shutdown') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('shutting down\n');
      setImmediate(() => process.exit(0));
      return;
    }

    const parts = urlObj.pathname.split('/').filter(Boolean);
    if (parts.length < 2) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Expected /<releaseTag>/<filename> or /electron/<tag>/<filename>\n');
      return;
    }

    let repo = DEFAULT_REPO;
    if (parts[0] === 'electron' && parts.length >= 3) {
      parts.shift();
      repo = ELECTRON_REPO;
    }

    const filename = decodeURIComponent(parts.pop());
    const tag = decodeURIComponent(parts.join('/'));
    const signedUrl = await resolveSignedAssetUrl(repo, tag, filename);

    console.log(`[binaries-mirror] ${repo}@${tag}/${filename} -> 302 CDN`);
    res.writeHead(302, { Location: signedUrl, 'Cache-Control': 'no-store' });
    res.end();
  } catch (err) {
    console.error(`[binaries-mirror] ERROR ${req.url}: ${err.message}`);
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end(`${err.message}\n`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[binaries-mirror] listening on http://${HOST}:${PORT}/`);
});
