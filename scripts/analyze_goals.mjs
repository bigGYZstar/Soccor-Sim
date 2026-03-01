// Detailed goal cause analysis - compare REAL vs NORMAL
import { mkState, update } from '/tmp/game_bundle2.mjs';

function runSimulation(speedMode, dtPerFrame = 1/60) {
  const state = mkState();
  state.speed = speedMode;
  const maxFrames = 2000000;
  let frames = 0;
  
  // Track all events via fullLog
  while (!state.over && frames < maxFrames) {
    update(state, dtPerFrame);
    frames++;
  }
  
  // Analyze fullLog
  const log = state.fullLog || [];
  const actions = {};
  for (const entry of log) {
    actions[entry.action] = (actions[entry.action] || 0) + 1;
  }
  
  return {
    speedMode,
    matchTime: state.time,
    goals: state.scoreBlue + state.scoreRed,
    logCount: log.length,
    actions,
    // Sample last 20 log entries
    lastLogs: log.slice(-20).map(e => `[${e.action}] ${e.text || ''}`),
  };
}

console.log('Analyzing REAL mode (1 match)...');
const real = runSimulation('REAL');
console.log('Analyzing NORMAL mode (1 match)...');
const normal = runSimulation('MID');

console.log('\n========== DETAILED LOG ANALYSIS ==========');
console.log(`REAL: goals=${real.goals}, matchTime=${real.matchTime.toFixed(1)}s, logEntries=${real.logCount}`);
console.log(`NORMAL: goals=${normal.goals}, matchTime=${normal.matchTime.toFixed(1)}s, logEntries=${normal.logCount}`);

console.log('\n--- Action counts (REAL) ---');
for (const [k, v] of Object.entries(real.actions).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}

console.log('\n--- Action counts (NORMAL) ---');
for (const [k, v] of Object.entries(normal.actions).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}

console.log('\n--- Last 20 log entries (REAL) ---');
for (const e of real.lastLogs) console.log(' ', e);

console.log('\n--- Last 20 log entries (NORMAL) ---');
for (const e of normal.lastLogs) console.log(' ', e);
