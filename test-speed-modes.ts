/**
 * v12.0.0 Speed Mode Independence Test
 * 
 * Runs matches at different speed modes and compares statistics.
 * After the fix, ALL speed modes should produce statistically similar results.
 */

import { mkState, update } from './client/src/game/engine';
import { P, FormationId } from './client/src/game/constants';
import { State, SpeedMode, SPEED_MULTIPLIERS } from './client/src/game/types';

const MATCHES_PER_MODE = 20;
const formations: FormationId[] = ["4-4-2", "4-2-3-1", "3-4-3"];

interface ModeStats {
  mode: string;
  avgGoals: number;
  avgShots: number;
  avgShotsOnTarget: number;
  avgGkSaves: number;
  avgPassSuccess: number;
  avgFrames: number;
  wallTimeMs: number;
}

function runMatchWithMode(matchId: number, speedMode: SpeedMode): { goals: number; shots: number; shotsOnTarget: number; gkSaves: number; passSuccess: number; frames: number } {
  const blueF = formations[matchId % formations.length];
  const redF = formations[(matchId + 1) % formations.length];
  const st = mkState(blueF, redF);
  st.speed = speedMode;

  const SIM_DT = 1 / 60;  // 60fps simulation (same as browser)
  
  // v12.0.0: Speed mode controls how many update() calls per "frame"
  // In headless, we simulate the same way as the browser:
  // - BASE_SUB_STEPS = 2 (MID baseline)
  // - totalSubSteps = BASE_SUB_STEPS * (speedMul / MID_speedMul)
  // - dt per call = SIM_DT / BASE_SUB_STEPS
  const MID_SPEED_MUL = 0.40;
  const BASE_SUB_STEPS = 2;
  const currentSpeedMul = SPEED_MULTIPLIERS[speedMode] ?? MID_SPEED_MUL;
  const speedRatio = currentSpeedMul / MID_SPEED_MUL;
  const totalSubSteps = Math.max(1, Math.round(BASE_SUB_STEPS * speedRatio));
  const dtPerCall = SIM_DT / BASE_SUB_STEPS;

  let maxFrames = 60 * 60 * 30;  // Safety: 30 real-minutes max
  let frames = 0;
  while (!st.over && frames < maxFrames) {
    for (let s = 0; s < totalSubSteps; s++) {
      update(st, dtPerCall);
    }
    frames++;
  }

  const totalGoals = st.scoreBlue + st.scoreRed;
  const totalShots = st.stats.shotsTotal.blue + st.stats.shotsTotal.red;
  const totalShotsOnTarget = st.stats.shotsOnTarget.blue + st.stats.shotsOnTarget.red;
  const totalGkSaves = st.stats.gkSaves.blue + st.stats.gkSaves.red;
  const totalPassAttempts = st.stats.passAttempts.blue + st.stats.passAttempts.red;
  const totalPassSuccess = st.stats.passSuccess.blue + st.stats.passSuccess.red;
  const passSuccessRate = totalPassAttempts > 0 ? totalPassSuccess / totalPassAttempts : 0;

  return { goals: totalGoals, shots: totalShots, shotsOnTarget: totalShotsOnTarget, gkSaves: totalGkSaves, passSuccess: passSuccessRate, frames };
}

// Test modes
const testModes: SpeedMode[] = ["MID", "FAST", "VFAST"];

console.log(`\n=== v12.0.0 Speed Mode Independence Test ===`);
console.log(`Running ${MATCHES_PER_MODE} matches per mode...\n`);

const results: ModeStats[] = [];

for (const mode of testModes) {
  const t0 = Date.now();
  let totalGoals = 0, totalShots = 0, totalShotsOnTarget = 0, totalGkSaves = 0, totalPassSuccess = 0, totalFrames = 0;

  for (let i = 0; i < MATCHES_PER_MODE; i++) {
    const r = runMatchWithMode(i, mode);
    totalGoals += r.goals;
    totalShots += r.shots;
    totalShotsOnTarget += r.shotsOnTarget;
    totalGkSaves += r.gkSaves;
    totalPassSuccess += r.passSuccess;
    totalFrames += r.frames;
    
    if ((i + 1) % 5 === 0) {
      process.stdout.write(`  ${mode}: ${i + 1}/${MATCHES_PER_MODE}\r`);
    }
  }

  const wallTimeMs = Date.now() - t0;
  const stat: ModeStats = {
    mode,
    avgGoals: totalGoals / MATCHES_PER_MODE,
    avgShots: totalShots / MATCHES_PER_MODE,
    avgShotsOnTarget: totalShotsOnTarget / MATCHES_PER_MODE,
    avgGkSaves: totalGkSaves / MATCHES_PER_MODE,
    avgPassSuccess: totalPassSuccess / MATCHES_PER_MODE,
    avgFrames: totalFrames / MATCHES_PER_MODE,
    wallTimeMs,
  };
  results.push(stat);
  console.log(`  ${mode}: done (${(wallTimeMs/1000).toFixed(1)}s)                    `);
}

// Print comparison table
console.log(`\n${'='.repeat(90)}`);
console.log(`RESULTS (${MATCHES_PER_MODE} matches per mode)`);
console.log(`${'='.repeat(90)}`);
console.log(`${'Mode'.padEnd(8)} | ${'Goals/m'.padEnd(8)} | ${'Shots/m'.padEnd(8)} | ${'OnTgt/m'.padEnd(8)} | ${'GKSave/m'.padEnd(8)} | ${'Pass%'.padEnd(8)} | ${'Frames'.padEnd(8)} | ${'WallTime'.padEnd(8)}`);
console.log(`${'-'.repeat(90)}`);

for (const r of results) {
  console.log(
    `${r.mode.padEnd(8)} | ${r.avgGoals.toFixed(1).padEnd(8)} | ${r.avgShots.toFixed(1).padEnd(8)} | ${r.avgShotsOnTarget.toFixed(1).padEnd(8)} | ${r.avgGkSaves.toFixed(1).padEnd(8)} | ${(r.avgPassSuccess * 100).toFixed(1).padEnd(8)} | ${r.avgFrames.toFixed(0).padEnd(8)} | ${(r.wallTimeMs/1000).toFixed(1).padEnd(8)}`
  );
}

// Check if results are similar (within 30% of MID baseline)
const midResult = results.find(r => r.mode === "MID")!;
console.log(`\n${'='.repeat(90)}`);
console.log(`DEVIATION FROM MID BASELINE`);
console.log(`${'='.repeat(90)}`);

let allPass = true;
for (const r of results) {
  if (r.mode === "MID") continue;
  const goalsDev = Math.abs(r.avgGoals - midResult.avgGoals) / midResult.avgGoals * 100;
  const shotsDev = Math.abs(r.avgShots - midResult.avgShots) / midResult.avgShots * 100;
  const onTgtDev = Math.abs(r.avgShotsOnTarget - midResult.avgShotsOnTarget) / midResult.avgShotsOnTarget * 100;
  
  const goalsOk = goalsDev < 30;
  const shotsOk = shotsDev < 30;
  const onTgtOk = onTgtDev < 30;
  
  console.log(`${r.mode}: Goals ${goalsDev.toFixed(1)}% ${goalsOk ? '✓' : '✗'} | Shots ${shotsDev.toFixed(1)}% ${shotsOk ? '✓' : '✗'} | OnTarget ${onTgtDev.toFixed(1)}% ${onTgtOk ? '✓' : '✗'}`);
  
  if (!goalsOk || !shotsOk || !onTgtOk) allPass = false;
}

console.log(`\n${allPass ? '✅ ALL MODES WITHIN 30% OF MID BASELINE - PASS' : '❌ SOME MODES DEVIATE >30% FROM MID BASELINE - FAIL'}`);
