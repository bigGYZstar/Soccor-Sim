// Multi-match speed mode analysis (3 matches per mode for statistical stability)
import { mkState, update } from '/tmp/game_bundle2.mjs';

function runSimulation(speedMode, dtPerFrame = 1/60) {
  const state = mkState();
  state.speed = speedMode;
  const maxFrames = 2000000;
  let frames = 0;
  let passAttempts = 0, passSuccess = 0;
  let shots = 0, shotsOnTarget = 0;
  let dribbleAttempts = 0, dribbleSuccess = 0;
  let interceptCount = 0;
  let lastLogCount = 0;

  while (!state.over && frames < maxFrames) {
    update(state, dtPerFrame);
    frames++;
    if (state.actionLog && state.actionLog.length > lastLogCount) {
      const newLogs = state.actionLog.slice(lastLogCount);
      lastLogCount = state.actionLog.length;
      for (const log of newLogs) {
        if (log.action === 'pass') { passAttempts++; if (log.success) passSuccess++; }
        else if (log.action === 'shot') { shots++; if (log.success) shotsOnTarget++; }
        else if (log.action === 'dribble') { dribbleAttempts++; if (log.success) dribbleSuccess++; }
        else if (log.action === 'intercept') interceptCount++;
      }
    }
  }
  return {
    matchTime: state.time,
    goals: state.scoreBlue + state.scoreRed,
    passAttempts, passSuccess, shots, shotsOnTarget,
    dribbleAttempts, dribbleSuccess, interceptCount,
  };
}

const N = 5; // matches per mode
const modes = [
  { name: 'REAL', mode: 'REAL' },
  { name: 'NORMAL', mode: 'MID' },
  { name: 'V.FAST', mode: 'VFAST' },
];

const aggregated = {};
for (const { name, mode } of modes) {
  process.stdout.write(`Running ${N}x ${name}...`);
  const start = Date.now();
  const totals = { matchTime: 0, goals: 0, passAttempts: 0, passSuccess: 0, shots: 0, shotsOnTarget: 0, dribbleAttempts: 0, dribbleSuccess: 0, interceptCount: 0 };
  for (let i = 0; i < N; i++) {
    const r = runSimulation(mode);
    for (const k of Object.keys(totals)) totals[k] += r[k];
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const avg = {};
  for (const k of Object.keys(totals)) avg[k] = totals[k] / N;
  aggregated[name] = avg;
  console.log(` done in ${elapsed}s | avg goals: ${avg.goals.toFixed(1)} | avg matchTime: ${avg.matchTime.toFixed(1)}s`);
}

console.log(`\n========== ${N}-MATCH AVERAGE COMPARISON ==========`);
const modeNames = modes.map(m => m.name);
const header = 'Metric                    | REAL       | NORMAL     | V.FAST';
console.log(header);
console.log('-'.repeat(header.length));

const metrics = [
  ['Goals (avg)', r => r.goals.toFixed(1)],
  ['Pass attempts (avg)', r => r.passAttempts.toFixed(0)],
  ['Pass success % (avg)', r => r.passAttempts > 0 ? (r.passSuccess / r.passAttempts * 100).toFixed(1) + '%' : 'N/A'],
  ['Shots (avg)', r => r.shots.toFixed(1)],
  ['Shot accuracy % (avg)', r => r.shots > 0 ? (r.shotsOnTarget / r.shots * 100).toFixed(1) + '%' : 'N/A'],
  ['Intercepts (avg)', r => r.interceptCount.toFixed(1)],
];
for (const [label, fn] of metrics) {
  const vals = modeNames.map(m => fn(aggregated[m]).toString().padEnd(11)).join('| ');
  console.log(`${label.padEnd(26)}| ${vals}`);
}

console.log('\n========== PER MATCH-MINUTE RATES (avg) ==========');
console.log('Metric/min                | REAL       | NORMAL     | V.FAST     | N/R ratio  | VF/R ratio');
console.log('-'.repeat(95));
const perMinMetrics = [
  ['Passes/min', r => r.passAttempts / (r.matchTime / 60)],
  ['Shots/min', r => r.shots / (r.matchTime / 60)],
  ['Goals/min', r => r.goals / (r.matchTime / 60)],
  ['Intercepts/min', r => r.interceptCount / (r.matchTime / 60)],
];
for (const [label, fn] of perMinMetrics) {
  const vals = modeNames.map(m => fn(aggregated[m]));
  const ratioNR = vals[0] > 0 ? (vals[1] / vals[0]).toFixed(2) : 'N/A';
  const ratioVFR = vals[0] > 0 ? (vals[2] / vals[0]).toFixed(2) : 'N/A';
  console.log(
    `${label.padEnd(26)}| ${vals[0].toFixed(2).padEnd(11)}| ${vals[1].toFixed(2).padEnd(11)}| ${vals[2].toFixed(2).padEnd(11)}| ${ratioNR.toString().padEnd(11)}| ${ratioVFR}`
  );
}
console.log('\nIdeal: all ratios ≈ 1.0 (speed-invariant simulation)');
