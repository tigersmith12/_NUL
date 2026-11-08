import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeadlessLab } from '../scripts/headless-harness.mjs';

test('SUBSTRATE/0.2 emergent mode starts ontology-free and coins symbols only after causal trace pressure', () => {
  const env = createHeadlessLab({ width: 800, height: 520 });
  env.lab.resetWorld(true, 424242);

  // Immediately after birth and during early motor episodes, symbol table is empty (pre-symbolic phase)
  assert.equal(env.lab.getState().ontologyMode, 'emergent');
  assert.equal(env.lab.getState().counts.concepts, 0);
  env.lab.steps(32);
  assert.equal(env.lab.getState().counts.concepts, 0, 'must remain ontology-free before trace pressure threshold');
  assert.ok(env.lab.getState().counts.causalTraces >= 3, 'sub-symbolic causal delta traces should accumulate immediately');

  // After extended experience, pressure-driven compression coins concepts, macros, beliefs, and sculpted structures
  env.lab.steps(1468);
  const state = env.lab.getState();
  assert.ok(state.counts.concepts > 0, 'concepts should emerge once causal trace clusters stabilize');
  assert.ok(state.counts.macros > 0, 'repeatable motor gestures should crystallize into macro-operators');
  assert.ok(state.counts.loci > 0, 'agent should autonomously segment coherent loci from the 4D medium');
  assert.ok(state.counts.artifacts > 0, 'agent should sculpt persistent slow-channel structures on the canvas');
});

test('SUBSTRATE/0.2 ontologyMode="none" defines contours, operators, and canvas structures with zero ontology forever', () => {
  const env = createHeadlessLab({ width: 800, height: 520 });
  env.lab.resetWorld(true, 424242, { ontologyMode: 'none' });
  env.lab.steps(1500);

  const state = env.lab.getState();
  const snap = env.lab.createSnapshot();

  assert.equal(state.ontologyMode, 'none');
  assert.equal(state.counts.concepts, 0, 'strictly ontology-free mode must never create concepts');
  assert.equal(state.counts.beliefs, 0, 'strictly ontology-free mode must never create linguistic beliefs');
  assert.equal(snap.agent.selfName, null, 'strictly ontology-free mode must not coin a lexical self-symbol');

  // Yet causal agency, segmentation, motor macro crystallization, and world sculpting all thrive!
  assert.ok(state.counts.macros > 0, 'ontology-free agent must still crystallize reusable motor operators');
  assert.ok(state.counts.loci > 0, 'ontology-free agent must still segment loci contours on the canvas');
  assert.ok(state.counts.artifacts > 0, 'ontology-free agent must still sculpt persistent canvas structures');
  assert.ok(state.counts.causalTraces > 0, 'ontology-free agent must maintain continuous causal delta traces');
  assert.equal(env.getElement('identity-name').textContent, 'ontology-free');
});

test('4-stage causal cycle exposes PurposeSeed, Critic gate, predictedDelta, actualDelta, and Evaluation', () => {
  const env = createHeadlessLab({ width: 800, height: 520 });
  env.lab.resetWorld(true, 314159);
  env.lab.steps(160);

  const snap = env.lab.createSnapshot();
  const cycle = snap.agent.lastCycle;
  assert.ok(cycle, 'lastCycle diagnostics should be recorded after 8-tick motor episodes');
  assert.ok(['stabilize', 'probe', 'sculpt', 'explore'].includes(cycle.drive));
  assert.equal(cycle.predictedDelta.length, 4);
  assert.equal(cycle.actualDelta.length, 4);
  assert.equal(typeof cycle.criticNote, 'string');
  for (const k of ['accuracy', 'completion', 'efficiency', 'overall']) {
    assert.ok(Number.isFinite(cycle.evaluation[k]) && cycle.evaluation[k] >= 0 && cycle.evaluation[k] <= 1);
  }
});

test('Combined, Agent, and Medium canvas lenses render cleanly without perturbing PRNG or medium state', () => {
  const env = createHeadlessLab({ width: 800, height: 520 });
  env.lab.resetWorld(true, 777888);
  env.lab.steps(300);

  const rngBefore = env.lab.getState().rngState;
  const fieldSampleBefore = env.lab.sampleFieldAt(400, 260);
  assert.equal(fieldSampleBefore.channels.length, 4);

  for (const lens of ['combined', 'agent', 'medium']) {
    assert.equal(env.lab.setCanvasLens(lens), lens);
    assert.doesNotThrow(() => env.renderFrame(performance.now() + 16));
  }

  assert.equal(env.lab.getState().rngState, rngBefore, 'switching lenses or sampling field must never alter PRNG');
  assert.deepEqual(env.lab.sampleFieldAt(400, 260).channels, fieldSampleBefore.channels);
});
