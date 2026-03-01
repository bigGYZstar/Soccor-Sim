// Final post-fix analysis - 3 matches per mode
import { mkState, update } from '/tmp/game_bundle3.mjs';

function runSimulation(speedMode, dtPerFrame = 1/60) {
  const state = mkState();
  state.speed = speedMode;
  const maxFrames = 2000000;
  let frames = 0;
  
  while (!state.over && frames < maxFrames) {
    update(state, dtPerFrame);
    frames++;
  }
  
  const log = state.fullLog || [];
  const actions = {};
  for (const entry of log) {
    actions[entry.action] = (actions[entry.action] || 0) + 1;
  }
  
  return {
    matchTime: state.time,
    goals: state.scoreBlue + state.scoreRed,
    passes: (actions['pass'] || 0) + (actions['longPass'] || 0),
    passReceive: actions['passReceive'] || 0,
    shots: actions['shot'] || 0,
    saves: actions['save'] || 0,
    intercepts: actions['intercept'] || 0,
    logCount: log.length,
  };
}

const N = 3;
const modes = [
  { name: 'REAL', mode: 'REAL' },
  { name: 'NORMAL', mode: 'MID' },
  { name: 'V.FAST', mode: 'VFAST' },
];

const aggregated = {};
for (const { name, mode } of modes) {
  process.stdout.write(`Running ${N}x ${name}...`);
  const start = Date.now();
  const totals = { matchTime: 0, goals: 0, passes: 0, passReceive: 0, shots: 0, saves: 0, intercepts: 0 };
  for (let i = 0; i < N; i++) {
    const r = runSimulation(mode);
    for (const k of Object.keys(totals)) totals[k] += r[k];
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const avg = {};
  for (const k of Object.keys(totals)) avg[k] = totals[k] / N;
  aggregated[name] = avg;
  const saveRate = avg.shots > 0 ? (avg.saves / avg.shots * 100).toFixed(1) : 'N/A';
  console.log(` done in ${elapsed}s | goals:${avg.goals.toFixed(1)} | shots:${avg.shots.toFixed(1)} | saves:${avg.saves.toFixed(1)} | saveRate:${saveRate}%`);
}

console.log(`\n========== FINAL ${N}-MATCH AVERAGE COMPARISON ==========`);
const modeNames = modes.map(m => m.name);
const header = 'Metric                    | REAL       | NORMAL     | V.FAST';
console.log(header);
console.log('-'.repeat(header.length));

const metrics = [
  ['Goals (avg)', r => r.goals.toFixed(1)],
  ['Passes (avg)', r => r.passes.toFixed(0)],
  ['Shots (avg)', r => r.shots.toFixed(1)],
  ['Saves (avg)', r => r.saves.toFixed(1)],
  ['GK save rate %', r => r.shots > 0 ? (r.saves / r.shots * 100).toFixed(1) + '%' : 'N/A'],
  ['Intercepts (avg)', r => r.intercepts.toFixed(1)],
];
for (const [label, fn] of metrics) {
  const vals = modeNames.map(m => fn(aggregated[m]).toString().padEnd(11)).join('| ');
  console.log(`${label.padEnd(26)}| ${vals}`);
}

console.log('\n========== PER MATCH-MINUTE RATES ==========');
console.log('Metric/min                | REAL       | NORMAL     | V.FAST     | N/R ratio  | VF/R ratio');
console.log('-'.repeat(95));
const perMinMetrics = [
  ['Passes/min', r => r.passes / (r.matchTime / 60)],
  ['Shots/min', r => r.shots / (r.matchTime / 60)],
  ['Goals/min', r => r.goals / (r.matchTime / 60)],
  ['Intercepts/min', r => r.intercepts / (r.matchTime / 60)],
];
for (const [label, fn] of perMinMetrics) {
  const vals = modeNames.map(m => fn(aggregated[m]));
  const ratioNR = vals[0] > 0 ? (vals[1] / vals[0]).toFixed(2) : 'N/A';
  const ratioVFR = vals[0] > 0 ? (vals[2] / vals[0]).toFixed(2) : 'N/A';
  console.log(
    `${label.padEnd(26)}| ${vals[0].toFixed(2).padEnd(11)}| ${vals[1].toFixed(2).padEnd(11)}| ${vals[2].toFixed(2).padEnd(11)}| ${ratioNR.toString().padEnd(11)}| ${ratioVFR}`
  );
}
console.log('\nIdeal: all ratios ≈ 1.0 (speed-invariant)');
console.log('BEFORE FIX: Goals/min NORMAL/REAL = 4.36, GK save rate NORMAL = 36.7%');
