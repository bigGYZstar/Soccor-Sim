// Speed mode analysis - uses mkState + update from engine bundle
import { mkState, update } from '/tmp/game_bundle.mjs';

// Run a full match simulation and collect stats
function runSimulation(speedMode, frameRateHz = 60) {
  const state = mkState();
  state.speed = speedMode;
  
  const frameInterval = 1 / frameRateHz;
  const maxFrames = frameRateHz * 60 * 15; // max 15 min wall clock
  
  let frames = 0;
  let passAttempts = 0, passSuccess = 0;
  let shots = 0, shotsOnTarget = 0;
  let dribbleAttempts = 0, dribbleSuccess = 0;
  let interceptCount = 0;
  let lastLogCount = 0;
  
  // Position tracking (sample every 60 frames)
  const posSamples = {}; // "team_slot" -> {x:[], y:[], role}
  for (const p of state.pl) {
    const key = `${p.team}_${p.slot}`;
    posSamples[key] = { x: [], y: [], role: p.role, team: p.team };
  }
  
  while (!state.over && frames < maxFrames) {
    update(state, frameInterval);
    frames++;
    
    // Sample positions every 60 frames
    if (frames % 60 === 0) {
      for (const p of state.pl) {
        const key = `${p.team}_${p.slot}`;
        if (posSamples[key]) {
          posSamples[key].x.push(p.pos.x);
          posSamples[key].y.push(p.pos.y);
        }
      }
    }
    
    // Collect new log entries
    if (state.actionLog && state.actionLog.length > lastLogCount) {
      const newLogs = state.actionLog.slice(lastLogCount);
      lastLogCount = state.actionLog.length;
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
        } else if (log.action === 'intercept') {
          interceptCount++;
        }
      }
    }
  }
  
  // Calculate position statistics per role
  const posStats = {};
  for (const [key, data] of Object.entries(posSamples)) {
    if (data.x.length === 0) continue;
    const n = data.x.length;
    const meanX = data.x.reduce((a, b) => a + b, 0) / n;
    const meanY = data.y.reduce((a, b) => a + b, 0) / n;
    const varX = data.x.reduce((a, b) => a + (b - meanX) ** 2, 0) / n;
    const varY = data.y.reduce((a, b) => a + (b - meanY) ** 2, 0) / n;
    posStats[key] = { role: data.role, team: data.team, meanX, meanY, varX, varY };
  }
  
  return {
    speedMode,
    frames,
    wallClockSeconds: frames / frameRateHz,
    matchTime: state.time.toFixed(2),
    score: `${state.scoreBlue}-${state.scoreRed}`,
    goals: state.scoreBlue + state.scoreRed,
    passAttempts,
    passSuccessRate: passAttempts > 0 ? (passSuccess / passAttempts * 100).toFixed(1) + '%' : 'N/A',
    shots,
    shotsOnTarget,
    shotAccuracy: shots > 0 ? (shotsOnTarget / shots * 100).toFixed(1) + '%' : 'N/A',
    dribbleAttempts,
    dribbleSuccessRate: dribbleAttempts > 0 ? (dribbleSuccess / dribbleAttempts * 100).toFixed(1) + '%' : 'N/A',
    interceptCount,
    posStats,
    statsRaw: state.stats,
  };
}

const modes = ['REAL', 'MID', 'VFAST'];
const results = {};

for (const mode of modes) {
  process.stdout.write(`Running ${mode}...`);
  const start = Date.now();
  results[mode] = runSimulation(mode);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(` done in ${elapsed}s (match: ${results[mode].matchTime}s sim)`);
}

// Print comparison
console.log('\n========== SPEED MODE COMPARISON ==========');
const metrics = [
  ['Wall clock (s)', r => r.wallClockSeconds.toFixed(0)],
  ['Match sim time (s)', r => r.matchTime],
  ['Score', r => r.score],
  ['Goals', r => r.goals],
  ['Pass attempts', r => r.passAttempts],
  ['Pass success %', r => r.passSuccessRate],
  ['Shots total', r => r.shots],
  ['Shots on target', r => r.shotsOnTarget],
  ['Shot accuracy %', r => r.shotAccuracy],
  ['Dribble attempts', r => r.dribbleAttempts],
  ['Dribble success %', r => r.dribbleSuccessRate],
  ['Intercepts', r => r.interceptCount],
];

const header = 'Metric                    | REAL       | NORMAL     | V.FAST';
console.log(header);
console.log('-'.repeat(header.length));
for (const [label, fn] of metrics) {
  const vals = modes.map(m => fn(results[m]).toString().padEnd(11)).join('| ');
  console.log(`${label.padEnd(26)}| ${vals}`);
}

// Position analysis
console.log('\n========== POSITION ANALYSIS (avg mean X by role) ==========');
console.log('Role(team)                | REAL meanX | NORM meanX | VFAST meanX | REAL varX  | VFAST varX');
console.log('-'.repeat(90));

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
    console.log(
      `${label.padEnd(26)}| ${vals[0].meanX.toString().padEnd(11)}| ${vals[1].meanX.toString().padEnd(11)}| ${vals[2].meanX.toString().padEnd(12)}| ${vals[0].varX.toString().padEnd(11)}| ${vals[2].varX}`
    );
  }
}

// Normalize by match time to get per-minute rates
console.log('\n========== PER MATCH-MINUTE RATES ==========');
console.log('Metric/min                | REAL       | NORMAL     | V.FAST     | Ratio N/R  | Ratio VF/R');
console.log('-'.repeat(95));

const perMinMetrics = [
  ['Passes/min', r => (r.passAttempts / (r.matchTime / 60)).toFixed(1)],
  ['Shots/min', r => (r.shots / (r.matchTime / 60)).toFixed(2)],
  ['Dribbles/min', r => (r.dribbleAttempts / (r.matchTime / 60)).toFixed(2)],
  ['Goals/min', r => (r.goals / (r.matchTime / 60)).toFixed(3)],
];

for (const [label, fn] of perMinMetrics) {
  const vals = modes.map(m => parseFloat(fn(results[m])));
  const ratioNR = vals[0] > 0 ? (vals[1] / vals[0]).toFixed(2) : 'N/A';
  const ratioVFR = vals[0] > 0 ? (vals[2] / vals[0]).toFixed(2) : 'N/A';
  console.log(
    `${label.padEnd(26)}| ${vals[0].toString().padEnd(11)}| ${vals[1].toString().padEnd(11)}| ${vals[2].toString().padEnd(11)}| ${ratioNR.toString().padEnd(11)}| ${ratioVFR}`
  );
}

console.log('\nIdeal ratios: NORMAL/REAL ≈ 1.0, VFAST/REAL ≈ 1.0 (speed-invariant simulation)');
