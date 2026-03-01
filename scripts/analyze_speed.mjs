// Speed mode analysis script - runs simulation in REAL, NORMAL, VFAST modes
// and compares stats to detect speed-scaling issues
// Uses esbuild to transpile TypeScript on the fly

import { execSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Build the game engine to a temp JS file
console.log('Building game engine...');
try {
  execSync(
    `cd ${projectRoot} && node_modules/.bin/esbuild client/src/game/engine.ts client/src/game/types.ts client/src/game/constants.ts client/src/game/math.ts client/src/game/actionLog.ts --bundle --format=esm --outfile=/tmp/game_bundle.mjs --platform=node 2>&1`,
    { stdio: 'inherit' }
  );
} catch (e) {
  console.error('Build failed:', e.message);
  process.exit(1);
}

console.log('Build complete. Running simulation...');

// Dynamic import of the built bundle
const { update, initState } = await import('/tmp/game_bundle.mjs');

// Run a full match simulation and collect stats
function runSimulation(speedMode, frameRateHz = 60) {
  const state = initState();
  state.speed = speedMode;
  
  const frameInterval = 1 / frameRateHz; // seconds per frame (wall clock)
  const maxFrames = frameRateHz * 60 * 10; // max 10 minutes wall clock
  
  let frames = 0;
  let passAttempts = 0, passSuccess = 0;
  let shots = 0, shotsOnTarget = 0;
  let dribbleAttempts = 0, dribbleSuccess = 0;
  let positionSamples = {}; // role -> {x:[], y:[]}
  let prevStats = { ...state.stats };
  
  // Position tracking
  for (const p of state.pl) {
    const key = `${p.team}_${p.role}_${p.slot}`;
    positionSamples[key] = { x: [], y: [], role: p.role, team: p.team };
  }
  
  while (!state.over && frames < maxFrames) {
    update(state, frameInterval);
    frames++;
    
    // Sample positions every 60 frames (1 second wall clock)
    if (frames % 60 === 0) {
      for (const p of state.pl) {
        const key = `${p.team}_${p.role}_${p.slot}`;
        if (positionSamples[key]) {
          positionSamples[key].x.push(p.pos.x);
          positionSamples[key].y.push(p.pos.y);
        }
      }
    }
    
    // Collect stats from action log
    const newLogs = state.actionLog.filter(l => l.time > (prevStats._lastTime || 0));
    for (const log of newLogs) {
      if (log.action === 'pass') {
        passAttempts++;
        if (log.success) passSuccess++;
      } else if (log.action === 'shot') {
        shots++;
        if (log.success) shotsOnTarget++;
      } else if (log.action === 'dribble') {
        dribbleAttempts++;
        if (log.success) dribbleSuccess++;
      }
    }
    if (newLogs.length > 0) {
      prevStats._lastTime = newLogs[newLogs.length - 1].time;
    }
  }
  
  // Calculate position statistics per role
  const posStats = {};
  for (const [key, data] of Object.entries(positionSamples)) {
    if (data.x.length === 0) continue;
    const meanX = data.x.reduce((a, b) => a + b, 0) / data.x.length;
    const meanY = data.y.reduce((a, b) => a + b, 0) / data.y.length;
    const varX = data.x.reduce((a, b) => a + (b - meanX) ** 2, 0) / data.x.length;
    const varY = data.y.reduce((a, b) => a + (b - meanY) ** 2, 0) / data.y.length;
    posStats[key] = { role: data.role, team: data.team, meanX, meanY, varX, varY };
  }
  
  return {
    speedMode,
    frames,
    wallClockSeconds: frames / frameRateHz,
    matchTime: state.time,
    score: `${state.scoreBlue}-${state.scoreRed}`,
    passAttempts,
    passSuccessRate: passAttempts > 0 ? (passSuccess / passAttempts * 100).toFixed(1) : 'N/A',
    shots,
    shotsOnTarget,
    shotAccuracy: shots > 0 ? (shotsOnTarget / shots * 100).toFixed(1) : 'N/A',
    dribbleAttempts,
    dribbleSuccessRate: dribbleAttempts > 0 ? (dribbleSuccess / dribbleAttempts * 100).toFixed(1) : 'N/A',
    goals: state.scoreBlue + state.scoreRed,
    posStats,
    finalStats: state.stats,
  };
}

const modes = ['REAL', 'MID', 'VFAST'];
const results = {};

for (const mode of modes) {
  console.log(`\nRunning ${mode} simulation...`);
  const start = Date.now();
  results[mode] = runSimulation(mode);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`  Done in ${elapsed}s. Match time: ${results[mode].matchTime.toFixed(1)}s, Frames: ${results[mode].frames}`);
}

// Print comparison table
console.log('\n========== SPEED MODE COMPARISON ==========');
console.log('Metric                    | REAL      | NORMAL    | V.FAST');
console.log('--------------------------|-----------|-----------|----------');

const metrics = [
  ['Wall clock (s)', r => r.wallClockSeconds.toFixed(0)],
  ['Match sim time (s)', r => r.matchTime.toFixed(1)],
  ['Score', r => r.score],
  ['Goals', r => r.goals],
  ['Pass attempts', r => r.passAttempts],
  ['Pass success %', r => r.passSuccessRate],
  ['Shots', r => r.shots],
  ['Shots on target', r => r.shotsOnTarget],
  ['Shot accuracy %', r => r.shotAccuracy],
  ['Dribble attempts', r => r.dribbleAttempts],
  ['Dribble success %', r => r.dribbleSuccessRate],
];

for (const [label, fn] of metrics) {
  const row = modes.map(m => fn(results[m]).toString().padEnd(10)).join('| ');
  console.log(`${label.padEnd(26)}| ${row}`);
}

// Position analysis per role
console.log('\n========== POSITION ANALYSIS (mean X per role) ==========');
console.log('Role (team)               | REAL meanX | NORMAL meanX | VFAST meanX | REAL varX | VFAST varX');
console.log('--------------------------|------------|--------------|-------------|-----------|----------');

// Aggregate by role
const roles = ['GK', 'DEF', 'MID', 'FWD'];
for (const role of roles) {
  for (const team of [-1, 1]) {
    const teamLabel = team === -1 ? 'BLU' : 'RED';
    const vals = modes.map(m => {
      const entries = Object.values(results[m].posStats).filter(p => p.role === role && p.team === team);
      if (entries.length === 0) return { meanX: 'N/A', varX: 'N/A' };
      const avgMeanX = (entries.reduce((a, b) => a + b.meanX, 0) / entries.length).toFixed(1);
      const avgVarX = (entries.reduce((a, b) => a + b.varX, 0) / entries.length).toFixed(1);
      return { meanX: avgMeanX, varX: avgVarX };
    });
    const label = `${role}(${teamLabel})`;
    console.log(`${label.padEnd(26)}| ${vals[0].meanX.toString().padEnd(11)}| ${vals[1].meanX.toString().padEnd(13)}| ${vals[2].meanX.toString().padEnd(12)}| ${vals[0].varX.toString().padEnd(10)}| ${vals[2].varX}`);
  }
}

// Save results to JSON
writeFileSync('/tmp/speed_analysis.json', JSON.stringify(results, null, 2));
console.log('\nFull results saved to /tmp/speed_analysis.json');
