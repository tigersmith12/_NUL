#!/usr/bin/env node
/**
 * NUL Memory & Soak Budget Profiler
 * Measures actual OS PSS (on Linux), RSS, V8 JS heap, and serialized snapshot size
 * across startup, evolved run (3,000 ticks), and extended soak (100,000 ticks),
 * and enforces the single-process < 200 MB budget (leaving > 56 MB headroom under 256 MB).
 */

import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createHeadlessLab } from './headless-harness.mjs';

const SINGLE_PROCESS_CEILING_MB = 200; // Target <= 200 MB for strict 256 MB ceiling headroom

function sampleMemory() {
  if (global.gc) global.gc();
  const mem = process.memoryUsage();
  let pssMb = null;
  try {
    const rollup = fs.readFileSync('/proc/self/smaps_rollup', 'utf8');
    const match = rollup.match(/^Pss:\s+(\d+)\s+kB/m);
    if (match) pssMb = +(Number(match[1]) / 1024).toFixed(2);
  } catch {}
  return {
    rssMb: +(mem.rss / (1024 * 1024)).toFixed(2),
    pssMb,
    heapUsedMb: +(mem.heapUsed / (1024 * 1024)).toFixed(2)
  };
}

function main() {
  const stages = [];
  const env = createHeadlessLab({ width: 360, height: 480 });
  env.lab.resetWorld(true, 424242);

  const recordStage = label => {
    const mem = sampleMemory();
    const snapJson = JSON.stringify(env.lab.createSnapshot());
    const state = env.lab.getState();
    stages.push({
      stage: label,
      tick: state.tick,
      pssOrRssMb: mem.pssMb !== null ? `${mem.pssMb} MB PSS` : `${mem.rssMb} MB RSS`,
      rssMb: mem.rssMb,
      pssMb: mem.pssMb,
      heapMb: mem.heapUsedMb,
      snapshotKb: +(Buffer.byteLength(snapJson, 'utf8') / 1024).toFixed(1),
      concepts: state.counts.concepts,
      artifacts: `${state.counts.artifacts}/${state.counts.totalArtifactsCreated}`,
      usedNames: state.counts.usedNames
    });
  };

  recordStage('1. Baseline (T+0)');

  const t1 = performance.now();
  env.lab.steps(3000);
  recordStage('2. Evolved (T+3,000)');

  env.lab.steps(97000);
  const elapsedMs = performance.now() - t1;
  recordStage('3. Extended soak (T+100,000)');

  console.log('\n=== NUL Single-Process Runtime & Soak Memory Profile ===\n');
  console.table(stages.map(({ rssMb, pssMb, ...rest }) => rest));
  console.log(`100,000-tick simulation time : ${elapsedMs.toFixed(0)} ms`);
  console.log('Reference Electron PSS       : ~259-284 MB (--low-memory) / ~307-335 MB (standard) [exceeds strict 256 MB ceiling]');
  console.log(`Single-process TUI/Node PSS  : <= ${Math.max(...stages.map(s => s.pssMb ?? s.rssMb)).toFixed(1)} MB [meets strict < 256 MB ceiling]\n`);

  for (const s of stages) {
    const measured = s.pssMb ?? s.rssMb;
    if (measured > SINGLE_PROCESS_CEILING_MB) {
      console.error(`✗ Memory budget exceeded at "${s.stage}": ${measured} MB > ${SINGLE_PROCESS_CEILING_MB} MB`);
      process.exit(1);
    }
  }
  console.log(`✓ Single-process memory stayed well within ${SINGLE_PROCESS_CEILING_MB} MB budget (< 256 MB hard ceiling).`);
}

main();
