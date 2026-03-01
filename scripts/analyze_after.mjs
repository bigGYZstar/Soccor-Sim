// Post-fix speed mode analysis - compare REAL/NORMAL/VFAST balance
import { mkState, update } from '/tmp/game_bundle2.mjs';

function runSimulation(speedMode, dtPerFrame = 1/60) {
  const state = mkState();
  state.speed = speedMode;
  const maxFrames = 1000000;
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
    speedMode, frames,
    matchTime: state.time,
    score: `${state.scoreBlue}-${state.scoreRed}`,
    goals: state.scoreBlue + state.scoreRed,
    passAttempts,
    passSuccessRate: passAttempts > 0 ? (passSuccess / passAttempts * 100).toFixed(1) : '0',
    shots, shotsOnTarget,
    shotAccuracy: shots > 0 ? (shotsOnTarget / shots * 100).toFixed(1) : '0',
    dribbleAttempts,
    dribbleSuccessRate: dribbleAttempts > 0 ? (dribbleSuccess / dribbleAttempts * 100).toFixed(1) : '0',
    interceptCount,
  };
}

const modes = [
  { name: 'REAL', mode: 'REAL' },
  { name: 'NORMAL', mode: 'MID' },
  { name: 'V.FAST', mode: 'VFAST' },
];
const results = {};
for (const { name, mode } of modes) {
  process.stdout.write(`Running ${name}...`);
  const start = Date.now();
  results[name] = runSimulation(mode);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(` done in ${elapsed}s | score:${results[name].score} | goals:${results[name].goals}`);
}

console.log('\n========== POST-FIX COMPARISON ==========');
const modeNames = modes.map(m => m.name);
const metrics = [
  ['Score', r => r.score],
  ['Goals', r => r.goals],
  ['Pass attempts', r => r.passAttempts],
  ['Pass success %', r => r.passSuccessRate + '%'],
  ['Shots', r => r.shots],
  ['Shot accuracy %', r => r.shotAccuracy + '%'],
  ['Intercepts', r => r.interceptCount],
];
const header = 'Metric                    | REAL       | NORMAL     | V.FAST';
console.log(header);
console.log('-'.repeat(header.length));
for (const [label, fn] of metrics) {
  const vals = modeNames.map(m => fn(results[m]).toString().padEnd(11)).join('| ');
  console.log(`${label.padEnd(26)}| ${vals}`);
}

console.log('\n========== PER MATCH-MINUTE RATES ==========');
console.log('Metric/min                | REAL       | NORMAL     | V.FAST     | N/R ratio  | VF/R ratio');
console.log('-'.repeat(95));
const perMinMetrics = [
  ['Passes/min', r => r.passAttempts / (r.matchTime / 60)],
  ['Shots/min', r => r.shots / (r.matchTime / 60)],
  ['Goals/min', r => r.goals / (r.matchTime / 60)],
  ['Intercepts/min', r => r.interceptCount / (r.matchTime / 60)],
];
for (const [label, fn] of perMinMetrics) {
  const vals = modeNames.map(m => fn(results[m]));
  const ratioNR = vals[0] > 0 ? (vals[1] / vals[0]).toFixed(2) : 'N/A';
  const ratioVFR = vals[0] > 0 ? (vals[2] / vals[0]).toFixed(2) : 'N/A';
  console.log(
    `${label.padEnd(26)}| ${vals[0].toFixed(2).padEnd(11)}| ${vals[1].toFixed(2).padEnd(11)}| ${vals[2].toFixed(2).padEnd(11)}| ${ratioNR.toString().padEnd(11)}| ${ratioVFR}`
  );
}
console.log('\nIdeal: all ratios ≈ 1.0 (speed-invariant)');
console.log('BEFORE FIX: Goals/min ratio NORMAL/REAL was 4.36 (huge imbalance)');
