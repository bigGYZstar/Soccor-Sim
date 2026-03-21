/**
 * Quick headless simulation - 20 matches in VFAST mode
 * Outputs goal statistics for comparison with actual gameplay
 */

import { mkState, update } from './client/src/game/engine';

const NUM_MATCHES = 20;
const results: Array<{
  match: number;
  blue: number;
  red: number;
  total: number;
  frames: number;
  shotsBlue: number;
  shotsRed: number;
}> = [];

console.log(`Running ${NUM_MATCHES} matches in VFAST mode (headless)...`);
console.log(`Using SIM_DT = 1/60 (same as headless-sim.ts)`);
console.log();

for (let i = 0; i < NUM_MATCHES; i++) {
  const st = mkState("4-4-2", "4-4-2");
  st.speed = "VFAST";
  
  const SIM_DT = 1/60;
  let frames = 0;
  const maxFrames = 60 * 60 * 20;
  
  while (!st.over && frames < maxFrames) {
    update(st, SIM_DT);
    frames++;
  }
  
  const totalGoals = st.scoreBlue + st.scoreRed;
  const shotsBlue = (st.stats as any)?.shotsTotal?.blue ?? 0;
  const shotsRed = (st.stats as any)?.shotsTotal?.red ?? 0;
  
  results.push({
    match: i + 1,
    blue: st.scoreBlue,
    red: st.scoreRed,
    total: totalGoals,
    frames,
    shotsBlue,
    shotsRed,
  });
  
  console.log(`Match ${i+1}: BLU ${st.scoreBlue} - RED ${st.scoreRed} (${frames} frames, shots: ${shotsBlue}/${shotsRed})`);
}

const avgGoals = results.reduce((s, r) => s + r.total, 0) / NUM_MATCHES;
const avgFrames = results.reduce((s, r) => s + r.frames, 0) / NUM_MATCHES;
const avgShotsBlue = results.reduce((s, r) => s + r.shotsBlue, 0) / NUM_MATCHES;
const avgShotsRed = results.reduce((s, r) => s + r.shotsRed, 0) / NUM_MATCHES;

console.log();
console.log("=== SUMMARY ===");
console.log(`Average goals/match: ${avgGoals.toFixed(2)}`);
console.log(`Average frames/match: ${avgFrames.toFixed(0)}`);
console.log(`Goal rate per frame: ${(avgGoals / avgFrames).toFixed(6)}`);
console.log(`Average shots/match: BLU ${avgShotsBlue.toFixed(1)}, RED ${avgShotsRed.toFixed(1)}`);
console.log(`Average total shots: ${(avgShotsBlue + avgShotsRed).toFixed(1)}`);
console.log(`Goal rate per shot: ${(avgGoals / (avgShotsBlue + avgShotsRed)).toFixed(3)}`);
