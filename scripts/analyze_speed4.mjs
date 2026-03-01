// Speed mode analysis v2 - use high framerate for REAL mode to complete faster
import { mkState, update } from '/tmp/game_bundle.mjs';

// Run a full match simulation at given dt per frame
function runSimulation(speedMode, dtPerFrame) {
  const state = mkState();
  state.speed = speedMode;
  
  const maxFrames = 1000000; // safety limit
  let frames = 0;
  
  // Stats collection
  let passAttempts = 0, passSuccess = 0;
  let shots = 0, shotsOnTarget = 0, goals = 0;
  let dribbleAttempts = 0, dribbleSuccess = 0;
  let interceptCount = 0, tackleCount = 0;
  let lastLogCount = 0;
  
  // Position tracking (sample every 600 frames)
  const posSamples = {};
  for (const p of state.pl) {
    const key = `${p.team}_${p.slot}`;
    posSamples[key] = { x: [], y: [], role: p.role, team: p.team };
  }
  
  while (!state.over && frames < maxFrames) {
    update(state, dtPerFrame);
    frames++;
    
    // Sample positions every 600 frames
    if (frames % 600 === 0) {
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
        } else if (log.action === 'tackle') {
          tackleCount++;
        } else if (log.action === 'goal') {
          goals++;
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
  
  const matchMinutes = state.matchClock || (state.time / 240 * 90);
  
  return {
    speedMode,
    frames,
    dtPerFrame,
    matchTime: state.time,
    matchMinutes: matchMinutes.toFixed(1),
    score: `${state.scoreBlue}-${state.scoreRed}`,
    goals: state.scoreBlue + state.scoreRed,
    passAttempts,
    passSuccessRate: passAttempts > 0 ? (passSuccess / passAttempts * 100).toFixed(1) : '0',
    shots,
    shotsOnTarget,
    shotAccuracy: shots > 0 ? (shotsOnTarget / shots * 100).toFixed(1) : '0',
    dribbleAttempts,
    dribbleSuccessRate: dribbleAttempts > 0 ? (dribbleSuccess / dribbleAttempts * 100).toFixed(1) : '0',
    interceptCount,
    tackleCount,
    posStats,
  };
}

// Use same dt=1/60 for all modes so physics is identical
// The speedMul inside update() handles the scaling
const DT = 1/60;

const modes = [
  { name: 'REAL',  mode: 'REAL' },
  { name: 'NORMAL', mode: 'MID' },
  { name: 'V.FAST', mode: 'VFAST' },
];

const results = {};
for (const { name, mode } of modes) {
  process.stdout.write(`Running ${name} (${mode})...`);
  const start = Date.now();
  results[name] = runSimulation(mode, DT);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(` done in ${elapsed}s | frames:${results[name].frames} | match:${results[name].matchTime.toFixed(1)}s | score:${results[name].score}`);
}

// Print comparison
console.log('\n========== SPEED MODE COMPARISON (full 90-min match each) ==========');
const metrics = [
  ['Frames to complete', r => r.frames.toLocaleString()],
  ['Score', r => r.score],
  ['Goals', r => r.goals],
  ['Pass attempts', r => r.passAttempts],
  ['Pass success %', r => r.passSuccessRate + '%'],
  ['Shots total', r => r.shots],
  ['Shots on target', r => r.shotsOnTarget],
  ['Shot accuracy %', r => r.shotAccuracy + '%'],
  ['Dribble attempts', r => r.dribbleAttempts],
  ['Dribble success %', r => r.dribbleSuccessRate + '%'],
  ['Intercepts', r => r.interceptCount],
  ['Tackles', r => r.tackleCount],
];

const modeNames = modes.map(m => m.name);
const header = 'Metric                    | REAL       | NORMAL     | V.FAST';
console.log(header);
console.log('-'.repeat(header.length));
for (const [label, fn] of metrics) {
  const vals = modeNames.map(m => fn(results[m]).toString().padEnd(11)).join('| ');
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
    const vals = modeNames.map(m => {
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

// Per-match-minute rates
console.log('\n========== PER MATCH-MINUTE RATES (normalized) ==========');
console.log('Metric/min                | REAL       | NORMAL     | V.FAST     | N/R ratio  | VF/R ratio');
console.log('-'.repeat(95));

const perMinMetrics = [
  ['Passes/min', r => r.passAttempts / (r.matchTime / 60)],
  ['Shots/min', r => r.shots / (r.matchTime / 60)],
  ['Dribbles/min', r => r.dribbleAttempts / (r.matchTime / 60)],
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

console.log('\nIdeal: all ratios ≈ 1.0 means speed-invariant simulation');
console.log('Ratio > 1.5 or < 0.67 = significant speed-scaling bug');
