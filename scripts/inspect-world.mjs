#!/usr/bin/env node
/**
 * NUL Deterministic World & Ontology Inspector CLI (`npm run world:inspect`)
 * Fast zero-dependency developer/agent tool to step worlds, inspect emergent concepts/beliefs/artifacts,
 * test cross-seed ontology transplants, and export JSON snapshots or ontologies.
 *
 * Examples:
 *   npm run world:inspect -- --seed 424242 --ticks 1500
 *   npm run world:inspect -- --seed 424242 --ticks 1200 --export-ontology /tmp/mind.json
 *   npm run world:inspect -- --seed 777777 --import-ontology /tmp/mind.json --ticks 600 --json
 */

import fs from 'node:fs';
import path from 'node:path';
import NULCore from '../src/engine.js';

function parseArgs(argv) {
  const opts = {
    seed: 424242,
    ticks: 1200,
    width: 800,
    height: 520,
    snapshotIn: null,
    snapshotOut: null,
    ontologyIn: null,
    ontologyOut: null,
    json: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed' && argv[i + 1]) opts.seed = Number.parseInt(argv[++i], 10);
    else if (a === '--ticks' && argv[i + 1]) opts.ticks = Math.max(0, Number.parseInt(argv[++i], 10));
    else if (a === '--snapshot' && argv[i + 1]) opts.snapshotIn = path.resolve(argv[++i]);
    else if (a === '--export-snapshot' && argv[i + 1]) opts.snapshotOut = path.resolve(argv[++i]);
    else if (a === '--import-ontology' && argv[i + 1]) opts.ontologyIn = path.resolve(argv[++i]);
    else if (a === '--export-ontology' && argv[i + 1]) opts.ontologyOut = path.resolve(argv[++i]);
    else if (a === '--json') opts.json = true;
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const engine = NULCore.createEngine({ width: opts.width, height: opts.height });

  if (opts.snapshotIn) {
    engine.restoreSnapshot(JSON.parse(fs.readFileSync(opts.snapshotIn, 'utf8')));
  } else {
    engine.resetWorld(true, opts.seed);
  }

  if (opts.ontologyIn) {
    engine.importOntology(JSON.parse(fs.readFileSync(opts.ontologyIn, 'utf8')));
  }

  if (opts.ticks > 0) engine.steps(opts.ticks);

  if (opts.snapshotOut) {
    fs.mkdirSync(path.dirname(opts.snapshotOut), { recursive: true });
    fs.writeFileSync(opts.snapshotOut, JSON.stringify(engine.createSnapshot(), null, 2));
  }
  if (opts.ontologyOut) {
    fs.mkdirSync(path.dirname(opts.ontologyOut), { recursive: true });
    fs.writeFileSync(opts.ontologyOut, JSON.stringify(engine.exportOntology(), null, 2));
  }

  const ont = engine.exportOntology();
  const state = engine.getState();

  if (opts.json) {
    console.log(JSON.stringify({ state, ontology: ont }, null, 2));
    return;
  }

  console.log(`NUL v${NULCore.APP_VERSION} (${NULCore.RULESET_VERSION}) — seed ${state.seed} @ T+${String(state.tick).padStart(5, '0')}`);
  console.log(`Agent     : ${ont.agent.selfSymbol || 'unnamed'} · energy ${Math.round(ont.agent.energy * 100)}% · coherence ${Math.round(engine.coherence() * 100)}%`);
  console.log(`Counts    : ${state.counts.concepts} concepts · ${state.counts.beliefs} beliefs · ${state.counts.artifacts}/${state.counts.totalArtifactsCreated} artifacts · ${state.counts.memories} memories`);
  console.log(`Operators : is="${ont.agent.generatedOperators.is}" seq="${ont.agent.generatedOperators.sequence}" join="${ont.agent.generatedOperators.join}" create="${ont.agent.generatedOperators.create}"`);
  if (ont.agent.concepts.length) {
    console.log('\nConcepts:');
    for (const c of ont.agent.concepts) {
      const sign = c.valence >= 0 ? '+' : '';
      const vec = c.prototype.map((v) => v.toFixed(2)).join(', ');
      console.log(`  #${String(c.id).padStart(2, '0')} ${c.name.padEnd(10)} valence=${(sign + c.valence.toFixed(2)).padStart(6)} seen=${String(c.seen).padStart(3)} contacts=${String(c.contacts).padStart(3)} proto=[${vec}]`);
    }
  }
  if (ont.agent.beliefs.length) {
    console.log('\nBeliefs:');
    for (const b of ont.agent.beliefs) {
      const from = engine.conceptById(b.fromId)?.name || b.fromId;
      const to = engine.conceptById(b.toId)?.name || b.toId;
      console.log(`  ${from} ${ont.agent.generatedOperators.sequence} ${to}  (count=${b.count}, confidence=${Math.round(b.confidence * 100)}%)`);
    }
  }
}

main();
