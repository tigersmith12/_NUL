#!/usr/bin/env node
/**
 * NUL Branch, PR & Padded Version Manager / Validator
 * Zero-dependency utility used locally and in GitHub Actions.
 *
 * Scheme summary:
 *   Version line branch : v<M>.<MM>                        (e.g. v0.01, v0.02)
 *   Working branch      : <type>/v<M>.<MM>.xxx-<slug>      (e.g. feat/v0.01.xxx-artifact-cap)
 *   Release branch      : release/v<M>.<MM>[.xxx|.<PPP>]   (e.g. release/v0.01.xxx)
 *   Trunk branches      : main, Initial-reference
 *   Arena branches      : arena/<session-id>-<slug>        (fixed per Arena session)
 *   PR title            : [v<M>.<MM>.<PPP>] <type>: <desc> (resolves .xxx -> .001, .002, ...)
 *                         (also accepts <type>/v<M>.<MM>.<PPP>-<slug> or v<M>.<MM>.<PPP>-<type>-<slug>)
 *   SemVer mapping      : v0.01.001 <-> package.json "0.1.1" (keeps npm & electron-builder valid)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const WORK_TYPES = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'chore', 'exp'];
export const PR_TYPES = [...WORK_TYPES, 'release'];
export const TRUNK_BRANCHES = new Set(['main', 'Initial-reference']);

const SEMVER_STRICT_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const DISPLAY_VERSION_RE = /^v?(\d+)\.(\d{2,})\.(\d{3,})$/;

const LINE_BRANCH_RE = /^v(\d+)(?:\.(\d{2,}))?$/;
const WORK_BRANCH_RE = new RegExp(
  `^(${WORK_TYPES.join('|')})\\/v(\\d+)\\.(\\d{2,})\\.(xxx|\\d{3,})-([a-z0-9]+(?:-[a-z0-9]+)*)$`
);
const ALT_WORK_BRANCH_RE = new RegExp(
  `^v(\\d+)\\.(\\d{2,})\\.(xxx|\\d{3,})-(${WORK_TYPES.join('|')})-([a-z0-9]+(?:-[a-z0-9]+)*)$`
);
const RELEASE_BRANCH_RE = /^release\/v(\d+)\.(\d{2,})(?:\.(xxx|\d{3,}))?(?:-([a-z0-9]+(?:-[a-z0-9]+)*))?$/;
const ARENA_BRANCH_RE = /^arena\/[a-z0-9][a-z0-9._-]*$/i;

const PR_BRACKET_RE = new RegExp(
  `^\\[v(\\d+)\\.(\\d{2,})\\.(\\d{3,})\\]\\s+(${PR_TYPES.join('|')}):\\s+(\\S.*)$`
);
const PR_SLASH_RE = new RegExp(
  `^(${PR_TYPES.join('|')})\\/v(\\d+)\\.(\\d{2,})\\.(\\d{3,})(?:-([a-z0-9]+(?:-[a-z0-9]+)*))?$`
);
const PR_VERSION_FRONT_RE = new RegExp(
  `^v(\\d+)\\.(\\d{2,})\\.(\\d{3,})-(${PR_TYPES.join('|')})-([a-z0-9]+(?:-[a-z0-9]+)*)$`
);
const TAG_RE = /^v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function formatDisplayVersion(major, minor, patch) {
  const m = Number(major);
  const mm = String(Number(minor)).padStart(2, '0');
  const ppp = String(Number(patch)).padStart(3, '0');
  return `${m}.${mm}.${ppp}`;
}

export function formatLineVersion(major, minor) {
  return `v${Number(major)}.${String(Number(minor)).padStart(2, '0')}`;
}

export function parseAnyVersion(input) {
  const raw = String(input || '').trim();
  const displayMatch = raw.match(DISPLAY_VERSION_RE);
  if (displayMatch) {
    const major = Number(displayMatch[1]);
    const minor = Number(displayMatch[2]);
    const patch = Number(displayMatch[3]);
    return {
      major,
      minor,
      patch,
      semver: `${major}.${minor}.${patch}`,
      display: formatDisplayVersion(major, minor, patch),
      line: formatLineVersion(major, minor)
    };
  }
  const semverMatch = raw.replace(/^v/, '').match(SEMVER_STRICT_RE);
  if (semverMatch) {
    const major = Number(semverMatch[1]);
    const minor = Number(semverMatch[2]);
    const patch = Number(semverMatch[3]);
    return {
      major,
      minor,
      patch,
      semver: `${major}.${minor}.${patch}`,
      display: formatDisplayVersion(major, minor, patch),
      line: formatLineVersion(major, minor)
    };
  }
  return null;
}

export function readRepoVersionInfo(rootDir = ROOT) {
  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const parsed = parseAnyVersion(pkg.version);
  return { rawPkgVersion: String(pkg.version || '').trim(), parsed };
}

export function validateVersionSync(errors, rootDir = ROOT) {
  const { rawPkgVersion, parsed } = readRepoVersionInfo(rootDir);
  if (!parsed || rawPkgVersion !== parsed.semver) {
    errors.push(
      `package.json version "${rawPkgVersion}" must be valid SemVer without leading zeros (e.g. "0.1.1" for v0.01.001).`
    );
    return null;
  }
  if (parsed.patch < 1) {
    errors.push(
      `package.json version "${rawPkgVersion}" has patch 0; PR numbering starts at .001 (e.g. "0.1.1" -> v0.01.001).`
    );
  }

  const lockPath = path.join(rootDir, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (lock.version !== parsed.semver || lock.packages?.['']?.version !== parsed.semver) {
      errors.push(
        `package-lock.json version ("${lock.version}") does not match package.json ("${parsed.semver}"). Run \`npm run version:set -- v${parsed.display}\`.`
      );
    }
  }

  const enginePath = path.join(rootDir, 'src', 'engine.js');
  const htmlPath = path.join(rootDir, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const versionSource = fs.existsSync(enginePath) ? fs.readFileSync(enginePath, 'utf8') : html;
  const versionSourceLabel = fs.existsSync(enginePath) ? 'src/engine.js' : 'index.html';

  const constMatch = versionSource.match(/const\s+APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!constMatch) {
    errors.push(`${versionSourceLabel} is missing \`const APP_VERSION = "..."\`.`);
  } else if (constMatch[1] !== parsed.display) {
    errors.push(
      `Version mismatch: package.json "${parsed.semver}" expects APP_VERSION="${parsed.display}" in ${versionSourceLabel}, found "${constMatch[1]}".`
    );
  }

  for (const id of ['brand-version', 'controls-version', 'footer-version']) {
    const elMatch = html.match(new RegExp(`id=["']${id}["'][^>]*>([^<]+)<`));
    if (!elMatch) {
      errors.push(`index.html is missing version display element #${id}.`);
    } else if (elMatch[1].trim() !== `v${parsed.display}`) {
      errors.push(
        `index.html #${id} shows "${elMatch[1].trim()}", expected "v${parsed.display}".`
      );
    }
  }

  return parsed;
}

export function classifyBranch(branchName) {
  if (!branchName) return { valid: false, kind: 'empty', reason: 'Branch name is empty.' };
  if (branchName === 'HEAD') return { valid: true, kind: 'detached' };
  if (TRUNK_BRANCHES.has(branchName)) return { valid: true, kind: 'trunk', branch: branchName };

  const lineMatch = branchName.match(LINE_BRANCH_RE);
  if (lineMatch) {
    const major = Number(lineMatch[1]);
    const minor = lineMatch[2] !== undefined ? Number(lineMatch[2]) : null;
    return {
      valid: true,
      kind: 'version-line',
      branch: branchName,
      major,
      minor,
      line: minor !== null ? formatLineVersion(major, minor) : `v${major}`
    };
  }

  const workMatch = branchName.match(WORK_BRANCH_RE);
  if (workMatch) {
    const [, type, maj, min, slot, slug] = workMatch;
    const major = Number(maj);
    const minor = Number(min);
    return {
      valid: true,
      kind: 'work',
      branch: branchName,
      type,
      major,
      minor,
      slot,
      line: formatLineVersion(major, minor),
      slug
    };
  }

  const altWorkMatch = branchName.match(ALT_WORK_BRANCH_RE);
  if (altWorkMatch) {
    const [, maj, min, slot, type, slug] = altWorkMatch;
    const major = Number(maj);
    const minor = Number(min);
    return {
      valid: true,
      kind: 'work',
      branch: branchName,
      type,
      major,
      minor,
      slot,
      line: formatLineVersion(major, minor),
      slug
    };
  }

  const releaseMatch = branchName.match(RELEASE_BRANCH_RE);
  if (releaseMatch) {
    const [, maj, min, slot, slug] = releaseMatch;
    const major = Number(maj);
    const minor = Number(min);
    return {
      valid: true,
      kind: 'release',
      branch: branchName,
      type: 'release',
      major,
      minor,
      slot: slot || 'xxx',
      line: formatLineVersion(major, minor),
      slug: slug || null
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
      `  • <type>/v<M>.<MM>.xxx-<short-name>   (types: ${WORK_TYPES.join(', ')})`,
      '    e.g. feat/v0.01.xxx-artifact-cap, fix/v0.01.xxx-tray-restore, exp/v0.02.xxx-native-shell',
      '  • v<M>.<MM>                           (version-line branch, e.g. v0.01, v0.02)',
      '  • release/v<M>.<MM>[.xxx]             (release prep branch, e.g. release/v0.01.xxx)',
      '  • main or Initial-reference           (trunk/reference branches)',
      '  • arena/<session-id>-<slug>           (fixed Arena session branches)'
    ].join('\n')
  };
}

export function validatePrTitle(title, branchInfo, repoVersion = null) {
  const trimmed = String(title || '').trim();

  if (/^(?:\[?v\d+\.\d+\.xxx\b|[a-z]+\/v\d+\.\d+\.xxx\b)/i.test(trimmed)) {
    return {
      valid: false,
      reason: `PR title "${trimmed}" still uses placeholder ".xxx" in its version prefix. Replace ".xxx" with the 3-digit PR number (e.g. v0.01.001).`
    };
  }

  let parsedPr = null;
  const bracketMatch = trimmed.match(PR_BRACKET_RE);
  if (bracketMatch) {
    const [, maj, min, pat, type, summary] = bracketMatch;
    parsedPr = { major: Number(maj), minor: Number(min), patch: Number(pat), type, summary };
  } else {
    const slashMatch = trimmed.match(PR_SLASH_RE);
    if (slashMatch) {
      const [, type, maj, min, pat, slug] = slashMatch;
      parsedPr = { major: Number(maj), minor: Number(min), patch: Number(pat), type, summary: slug || type };
    } else {
      const frontMatch = trimmed.match(PR_VERSION_FRONT_RE);
      if (frontMatch) {
        const [, maj, min, pat, type, slug] = frontMatch;
        parsedPr = { major: Number(maj), minor: Number(min), patch: Number(pat), type, summary: slug };
      }
    }
  }

  if (!parsedPr || parsedPr.patch < 1) {
    const exampleVer = repoVersion ? `v${repoVersion.display}` : 'v0.01.001';
    return {
      valid: false,
      reason: [
        `PR title "${trimmed}" does not match the NUL PR naming scheme.`,
        'In a PR, ".xxx" resolves to the sequential 3-digit PR number (.001, .002, ...):',
        `  • [${exampleVer}] <type>: <short summary>      (recommended)`,
        `  • <type>/${exampleVer}-<short-name>`,
        `  • ${exampleVer}-<type>-<short-name>`,
        `Allowed <type> values: ${PR_TYPES.join(', ')}`
      ].join('\n')
    };
  }

  const display = formatDisplayVersion(parsedPr.major, parsedPr.minor, parsedPr.patch);
  const line = formatLineVersion(parsedPr.major, parsedPr.minor);

  if (repoVersion && display !== repoVersion.display) {
    return {
      valid: false,
      reason: `PR title version "v${display}" does not match repo version "v${repoVersion.display}" (package.json "${repoVersion.semver}"). Run \`npm run version:set -- v${display}\` to align them.`
    };
  }

  if (branchInfo && (branchInfo.kind === 'work' || branchInfo.kind === 'release')) {
    if (branchInfo.type !== parsedPr.type) {
      return {
        valid: false,
        reason: `PR type "${parsedPr.type}" does not match branch type "${branchInfo.type}" (${branchInfo.branch}).`
      };
    }
    if (branchInfo.line !== line) {
      return {
        valid: false,
        reason: `PR version line "${line}" (v${display}) does not match branch version line "${branchInfo.line}" (${branchInfo.branch}).`
      };
    }
    if (branchInfo.slot && branchInfo.slot !== 'xxx' && Number(branchInfo.slot) !== parsedPr.patch) {
      return {
        valid: false,
        reason: `PR number ".${String(parsedPr.patch).padStart(3, '0')}" does not match concrete branch slot ".${branchInfo.slot}" (${branchInfo.branch}).`
      };
    }
  }

  return {
    valid: true,
    ...parsedPr,
    display,
    line
  };
}

export function validateTag(tagName, repoVersion = null) {
  const match = String(tagName || '').trim().match(TAG_RE);
  if (!match) {
    const example = repoVersion ? `v${repoVersion.display}` : 'v0.01.001';
    return {
      valid: false,
      reason: `Tag "${tagName}" is not a valid release tag (expected ${example} or SemVer v0.1.1).`
    };
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const display = formatDisplayVersion(major, minor, patch);
  const semver = `${major}.${minor}.${patch}`;

  if (repoVersion && semver !== repoVersion.semver) {
    return {
      valid: false,
      reason: `Tag "${tagName}" (maps to ${semver} / v${display}) does not match package.json "${repoVersion.semver}" (v${repoVersion.display}).`
    };
  }
  return { valid: true, display, semver, prerelease: match[4] || null };
}

export function writeRepoVersion(targetVersion, rootDir = ROOT) {
  const parsed = parseAnyVersion(targetVersion);
  if (!parsed || parsed.patch < 1) {
    throw new Error(`Invalid version "${targetVersion}". Expected e.g. v0.01.001 (or 0.1.1) with PR number >= 001.`);
  }

  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = parsed.semver;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  const lockPath = path.join(rootDir, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    lock.version = parsed.semver;
    if (lock.packages?.['']) lock.packages[''].version = parsed.semver;
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  }

  const enginePath = path.join(rootDir, 'src', 'engine.js');
  if (fs.existsSync(enginePath)) {
    let engineCode = fs.readFileSync(enginePath, 'utf8');
    engineCode = engineCode.replace(
      /const\s+APP_VERSION\s*=\s*['"][^'"]+['"]/,
      `const APP_VERSION = '${parsed.display}'`
    );
    fs.writeFileSync(enginePath, engineCode);
  }

  const htmlPath = path.join(rootDir, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace(
    /const\s+APP_VERSION\s*=\s*['"][^'"]+['"]/,
    `const APP_VERSION = '${parsed.display}'`
  );
  for (const id of ['brand-version', 'controls-version', 'footer-version']) {
    html = html.replace(
      new RegExp(`(id=["']${id}["'][^>]*>)[^<]+(<)`),
      `$1v${parsed.display}$2`
    );
  }
  html = html.replace(
    /(id=["']companion-version-title["'][^>]*title=["']NUL\s+)v[^·'"]+(\s*·)/,
    `$1v${parsed.display}$2`
  );
  fs.writeFileSync(htmlPath, html);

  return parsed;
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
  const { parsed: current } = readRepoVersionInfo();
  let target = current || parseAnyVersion('0.1.1');
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--version' && args[i + 1]) {
      const candidate = parseAnyVersion(args[++i]);
      if (!candidate) {
        console.error(`Invalid --version value. Use e.g. v0.01.002 or 0.1.2.`);
        process.exit(1);
      }
      target = candidate;
    } else {
      positional.push(args[i]);
    }
  }

  const [rawType, ...rest] = positional;
  const type = (rawType || '').toLowerCase();
  const description = rest.join(' ').trim();

  if (!PR_TYPES.includes(type) || (type !== 'release' && !description)) {
    console.error('Usage: npm run branch:suggest -- <type> <short description> [--version v0.01.002]');
    console.error(`Types: ${PR_TYPES.join(', ')}`);
    console.error('Example: npm run branch:suggest -- feat artifact-memory-cap');
    process.exit(1);
  }

  const slug = slugify(description);
  const line = target.line; // e.g. v0.01
  const branch = type === 'release'
    ? (slug ? `release/${line}.xxx-${slug}` : `release/${line}.xxx`)
    : `${type}/${line}.xxx-${slug}`;
  const humanSummary = description ? description.replace(/-/g, ' ') : `prepare ${line} release`;
  const prTitle = `[v${target.display}] ${type}: ${humanSummary}`;

  console.log(`Version line   : ${line}`);
  console.log(`Working branch : ${branch}`);
  console.log(`PR title       : ${prTitle}`);
  console.log(`Create branch  : git checkout -b ${branch}`);
}

function parseCliArgs(argv) {
  const opts = {
    suggest: false,
    suggestArgs: [],
    setVersion: null,
    nextVersion: false,
    branch: null,
    prTitle: null,
    tag: null
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--suggest') {
      opts.suggest = true;
      opts.suggestArgs = argv.slice(i + 1);
      break;
    } else if (arg === '--set-version' && argv[i + 1] !== undefined) {
      opts.setVersion = argv[++i];
    } else if (arg === '--next-version') {
      opts.nextVersion = true;
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

  if (opts.setVersion || opts.nextVersion) {
    const { parsed: current } = readRepoVersionInfo();
    const targetInput = opts.nextVersion
      ? `${current.major}.${current.minor}.${current.patch + 1}`
      : opts.setVersion;
    const updated = writeRepoVersion(targetInput);
    console.log(`✓ Updated version to v${updated.display} (package.json SemVer: ${updated.semver}, line: ${updated.line}.xxx)`);
    return;
  }

  loadGitHubContext(opts);

  const errors = [];
  const notes = [];
  const repoVersion = validateVersionSync(errors);

  if (repoVersion && errors.length === 0) {
    notes.push(
      `Version sync OK: v${repoVersion.display} (SemVer ${repoVersion.semver}, branch placeholder ${repoVersion.line}.xxx).`
    );
  }

  let branchInfo = null;
  if (!opts.tag) {
    const branch = opts.branch ?? detectCurrentGitBranch();
    if (branch) {
      branchInfo = classifyBranch(branch);
      if (!branchInfo.valid) {
        errors.push(branchInfo.reason);
      } else if (branchInfo.kind === 'arena-session') {
        const verLabel = repoVersion ? `v${repoVersion.display}` : 'v0.01.001';
        notes.push(
          `Branch OK: "${branch}" is a fixed Arena session branch.`,
          `  -> Resolve .xxx in the PR title as "[${verLabel}] <type>: <summary>".`
        );
      } else if (branchInfo.kind === 'trunk') {
        notes.push(`Branch OK: "${branch}" is a trunk/reference branch.`);
      } else if (branchInfo.kind === 'version-line') {
        notes.push(`Branch OK: "${branch}" is a version-line branch (${branchInfo.line}).`);
      } else if (branchInfo.kind === 'detached') {
        notes.push('Branch check skipped (detached HEAD).');
      } else {
        notes.push(
          `Branch OK: "${branch}" (${branchInfo.kind}, line=${branchInfo.line}, slot=${branchInfo.slot}).`
        );
      }
    }
  }

  if (opts.prTitle !== null) {
    const prCheck = validatePrTitle(opts.prTitle, branchInfo, repoVersion);
    if (!prCheck.valid) {
      errors.push(prCheck.reason);
    } else {
      notes.push(`PR title OK: "${opts.prTitle}" -> v${prCheck.display} (${prCheck.type}).`);
    }
  }

  if (opts.tag !== null) {
    const tagCheck = validateTag(opts.tag, repoVersion);
    if (!tagCheck.valid) {
      errors.push(tagCheck.reason);
    } else {
      notes.push(`Tag OK: "${opts.tag}" -> v${tagCheck.display} (SemVer ${tagCheck.semver}).`);
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
