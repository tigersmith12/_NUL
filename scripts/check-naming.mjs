#!/usr/bin/env node
/**
 * NUL Branch, PR Title & Version Naming Validator
 * Zero-dependency check used locally (`npm run check:naming`) and in GitHub Actions.
 *
 * Conventions:
 *   Working branch : <type>/v<X.Y.Z>-<short-name>   (e.g. feat/v0.2.0-artifact-cap)
 *   Release branch : release/v<X.Y.Z>[-<suffix>]    (e.g. release/v0.2.0)
 *   Trunk branches : main, Initial-reference
 *   Tool branches  : arena/<id>-<slug>              (session-locked; paired with PR title)
 *   PR title       : [v<X.Y.Z>] <type>: <summary>   (e.g. [v0.2.0] build: add branch naming scheme)
 *   Release tag    : v<X.Y.Z>[-<prerelease>]        (e.g. v0.2.0)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const WORK_TYPES = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'chore', 'exp'];
const PR_TYPES = [...WORK_TYPES, 'release'];
const TRUNK_BRANCHES = new Set(['main', 'Initial-reference']);

const SEMVER_RE = /^(\d+\.\d+\.\d+)(?:-([0-9A-Za-z.-]+))?$/;
const WORK_BRANCH_RE = new RegExp(`^(${WORK_TYPES.join('|')})\\/v(\\d+\\.\\d+\\.\\d+)-([a-z0-9]+(?:-[a-z0-9]+)*)$`);
const RELEASE_BRANCH_RE = /^release\/v(\d+\.\d+\.\d+)(?:-([a-z0-9]+(?:-[a-z0-9]+)*))?$/;
const ARENA_BRANCH_RE = /^arena\/[a-z0-9][a-z0-9._-]*$/i;
const PR_TITLE_RE = new RegExp(`^\\[v(\\d+\\.\\d+\\.\\d+(?:-[a-z0-9.]+)?)\\]\\s+(${PR_TYPES.join('|')}):\\s+(\\S.*)$`);
const TAG_RE = /^v(\d+\.\d+\.\d+)(?:-([0-9A-Za-z.-]+))?$/;

function readRepoVersion() {
  const pkgPath = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return String(pkg.version || '').trim();
}

function validateVersionSync(errors) {
  const pkgVersion = readRepoVersion();
  if (!SEMVER_RE.test(pkgVersion)) {
    errors.push(`package.json version "${pkgVersion}" is not valid SemVer (expected X.Y.Z).`);
    return pkgVersion;
  }

  const htmlPath = path.join(ROOT, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const constMatch = html.match(/const\s+APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!constMatch) {
    errors.push('index.html is missing `const APP_VERSION = "..."`.');
  } else if (constMatch[1] !== pkgVersion) {
    errors.push(`Version mismatch: package.json has "${pkgVersion}" but index.html APP_VERSION has "${constMatch[1]}".`);
  }

  for (const id of ['brand-version', 'controls-version', 'footer-version']) {
    const elMatch = html.match(new RegExp(`id=["']${id}["'][^>]*>([^<]+)<`));
    if (!elMatch) {
      errors.push(`index.html is missing version display element #${id}.`);
    } else if (elMatch[1].trim() !== `v${pkgVersion}`) {
      errors.push(`index.html #${id} shows "${elMatch[1].trim()}", expected "v${pkgVersion}".`);
    }
  }

  return pkgVersion;
}

export function classifyBranch(branchName) {
  if (!branchName) return { valid: false, kind: 'empty', reason: 'Branch name is empty.' };
  if (branchName === 'HEAD') return { valid: true, kind: 'detached' };
  if (TRUNK_BRANCHES.has(branchName)) return { valid: true, kind: 'trunk', branch: branchName };

  const workMatch = branchName.match(WORK_BRANCH_RE);
  if (workMatch) {
    return {
      valid: true,
      kind: 'work',
      branch: branchName,
      type: workMatch[1],
      version: workMatch[2],
      slug: workMatch[3]
    };
  }

  const releaseMatch = branchName.match(RELEASE_BRANCH_RE);
  if (releaseMatch) {
    return {
      valid: true,
      kind: 'release',
      branch: branchName,
      type: 'release',
      version: releaseMatch[1],
      slug: releaseMatch[2] || null
    };
  }

  if (ARENA_BRANCH_RE.test(branchName)) {
    return {
      valid: true,
      kind: 'arena-session',
      branch: branchName
    };
  }

  return {
    valid: false,
    kind: 'invalid',
    branch: branchName,
    reason: [
      `Branch "${branchName}" does not match the NUL naming scheme.`,
      'Expected one of:',
      `  • <type>/v<X.Y.Z>-<short-name>   (types: ${WORK_TYPES.join(', ')})`,
      '    e.g. feat/v0.2.0-artifact-cap, fix/v0.2.1-tray-restore, perf/v0.3.0-memory-budget',
      '  • release/v<X.Y.Z>[-<suffix>]    e.g. release/v0.2.0',
      '  • main or Initial-reference      (protected/trunk branches)',
      '  • arena/<session-id>-<slug>      (automated Arena session branches)'
    ].join('\n')
  };
}

export function validatePrTitle(title, branchInfo) {
  const trimmed = String(title || '').trim();
  const match = trimmed.match(PR_TITLE_RE);
  if (!match) {
    return {
      valid: false,
      reason: [
        `PR title "${trimmed}" does not match the NUL PR naming scheme.`,
        'Expected format:',
        `  [v<X.Y.Z>] <type>: <short summary>   (types: ${PR_TYPES.join(', ')})`,
        'Examples:',
        '  [v0.2.0] build: add readable branch and version naming scheme',
        '  [v0.2.1] fix: preserve companion pin state across restarts',
        '  [v0.3.0] exp: evaluate single-process native shell'
      ].join('\n')
    };
  }

  const [, prVersion, prType, summary] = match;
  if (branchInfo && (branchInfo.kind === 'work' || branchInfo.kind === 'release')) {
    if (branchInfo.type !== prType) {
      return {
        valid: false,
        reason: `PR title type "${prType}" does not match branch prefix "${branchInfo.type}/" (${branchInfo.branch}).`
      };
    }
    const basePrVersion = prVersion.split('-')[0];
    if (branchInfo.version !== basePrVersion) {
      return {
        valid: false,
        reason: `PR title version "v${prVersion}" does not match branch version "v${branchInfo.version}" (${branchInfo.branch}).`
      };
    }
  }

  return { valid: true, version: prVersion, type: prType, summary };
}

export function validateTag(tagName, pkgVersion) {
  const match = String(tagName || '').trim().match(TAG_RE);
  if (!match) {
    return {
      valid: false,
      reason: `Tag "${tagName}" does not match v<X.Y.Z> (e.g. v${pkgVersion || '0.2.0'}).`
    };
  }
  if (pkgVersion && match[1] !== pkgVersion.split('-')[0]) {
    return {
      valid: false,
      reason: `Tag "${tagName}" (core version ${match[1]}) does not match package.json version "${pkgVersion}".`
    };
  }
  return { valid: true, version: match[1], prerelease: match[2] || null };
}

function detectCurrentGitBranch() {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return '';
  }
}

function slugify(words) {
  return words
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function runSuggest(args) {
  const pkgVersion = readRepoVersion();
  let version = pkgVersion;
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--version' && args[i + 1]) {
      version = args[++i].replace(/^v/, '');
    } else {
      positional.push(args[i]);
    }
  }

  const [rawType, ...rest] = positional;
  const type = (rawType || '').toLowerCase();
  const description = rest.join(' ').trim();

  if (!PR_TYPES.includes(type) || (type !== 'release' && !description)) {
    console.error(`Usage: npm run branch:suggest -- <type> <short description> [--version X.Y.Z]`);
    console.error(`Types: ${PR_TYPES.join(', ')}`);
    console.error(`Example: npm run branch:suggest -- feat artifact-memory-cap`);
    process.exit(1);
  }

  if (!SEMVER_RE.test(version)) {
    console.error(`Invalid version "${version}". Expected X.Y.Z (e.g. ${pkgVersion}).`);
    process.exit(1);
  }

  const slug = slugify(description);
  const branch = type === 'release'
    ? (slug ? `release/v${version}-${slug}` : `release/v${version}`)
    : `${type}/v${version}-${slug}`;
  const humanSummary = description ? description.replace(/-/g, ' ') : `prepare v${version} release`;
  const prTitle = `[v${version}] ${type}: ${humanSummary}`;

  console.log(`Branch   : ${branch}`);
  console.log(`PR title : ${prTitle}`);
  console.log(`Create   : git checkout -b ${branch}`);
}

function parseCliArgs(argv) {
  const opts = { suggest: false, suggestArgs: [], branch: null, prTitle: null, tag: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--suggest') {
      opts.suggest = true;
      opts.suggestArgs = argv.slice(i + 1);
      break;
    } else if (arg === '--branch' && argv[i + 1] !== undefined) {
      opts.branch = argv[++i];
    } else if (arg === '--pr-title' && argv[i + 1] !== undefined) {
      opts.prTitle = argv[++i];
    } else if (arg === '--tag' && argv[i + 1] !== undefined) {
      opts.tag = argv[++i];
    }
  }
  return opts;
}

function loadGitHubContext(opts) {
  const eventName = process.env.GITHUB_EVENT_NAME;
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (eventName === 'pull_request' && eventPath && fs.existsSync(eventPath)) {
    const payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    if (!opts.branch && payload.pull_request?.head?.ref) {
      opts.branch = payload.pull_request.head.ref;
    }
    if (!opts.prTitle && payload.pull_request?.title) {
      opts.prTitle = payload.pull_request.title;
    }
  } else if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME && !opts.tag) {
    opts.tag = process.env.GITHUB_REF_NAME;
  } else if (process.env.GITHUB_REF_TYPE === 'branch' && process.env.GITHUB_REF_NAME && !opts.branch) {
    opts.branch = process.env.GITHUB_REF_NAME;
  }
}

function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  if (opts.suggest) {
    runSuggest(opts.suggestArgs);
    return;
  }

  loadGitHubContext(opts);

  const errors = [];
  const notes = [];
  const pkgVersion = validateVersionSync(errors);

  if (errors.length === 0) {
    notes.push(`Version sync OK: v${pkgVersion} matches across package.json and index.html.`);
  }

  let branchInfo = null;
  if (!opts.tag) {
    const branch = opts.branch ?? detectCurrentGitBranch();
    if (branch) {
      branchInfo = classifyBranch(branch);
      if (!branchInfo.valid) {
        errors.push(branchInfo.reason);
      } else if (branchInfo.kind === 'arena-session') {
        notes.push(
          `Branch OK: "${branch}" is a fixed Arena session branch.`,
          `  -> Use PR title format "[v${pkgVersion}] <type>: <summary>" when opening a pull request.`
        );
      } else if (branchInfo.kind === 'trunk') {
        notes.push(`Branch OK: "${branch}" is a trunk/reference branch.`);
      } else if (branchInfo.kind === 'detached') {
        notes.push('Branch check skipped (detached HEAD).');
      } else {
        notes.push(`Branch OK: "${branch}" (${branchInfo.kind}, type=${branchInfo.type}, version=v${branchInfo.version}).`);
      }
    }
  }

  if (opts.prTitle !== null) {
    const prCheck = validatePrTitle(opts.prTitle, branchInfo);
    if (!prCheck.valid) {
      errors.push(prCheck.reason);
    } else {
      notes.push(`PR title OK: "${opts.prTitle}" (version=v${prCheck.version}, type=${prCheck.type}).`);
    }
  }

  if (opts.tag !== null) {
    const tagCheck = validateTag(opts.tag, pkgVersion);
    if (!tagCheck.valid) {
      errors.push(tagCheck.reason);
    } else {
      notes.push(`Tag OK: "${opts.tag}" matches package.json v${pkgVersion}.`);
    }
  }

  for (const line of notes) console.log(`✓ ${line}`);
  if (errors.length > 0) {
    console.error('\n✗ Naming / version check failed:\n');
    for (const err of errors) console.error(`${err}\n`);
    process.exit(1);
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
