/**
 * Speed mode comparison - 5 matches per speed mode
 * Tests if speed mode affects shot count
 */

import { mkState, update } from './client/src/game/engine';
import type { SpeedMode } from './client/src/game/types';

const NUM_MATCHES = 5;
const SPEED_MODES: SpeedMode[] = ["MID", "FAST", "VFAST"];

for (const speed of SPEED_MODES) {
  console.log(`\n=== Speed: ${speed} ===`);
  
  let totalGoals = 0;
  let totalShots = 0;
  let totalShotsOnTarget = 0;
  
  for (let i = 0; i < NUM_MATCHES; i++) {
    const st = mkState("4-4-2", "4-4-2");
    st.speed = speed;
    
    const SIM_DT = 1/60;
    let frames = 0;
    const maxFrames = 60 * 60 * 30;
    
    while (!st.over && frames < maxFrames) {
      update(st, SIM_DT);
      frames++;
    }
    
    const stats = st.stats as any;
    const goals = st.scoreBlue + st.scoreRed;
    const shots = (stats?.shotsTotal?.blue ?? 0) + (stats?.shotsTotal?.red ?? 0);
    const shotsOnTarget = (stats?.shotsOnTarget?.blue ?? 0) + (stats?.shotsOnTarget?.red ?? 0);
    
    totalGoals += goals;
    totalShots += shots;
    totalShotsOnTarget += shotsOnTarget;
    
    console.log(`  Match ${i+1}: ${st.scoreBlue}-${st.scoreRed} | shots: ${shots} | on-target: ${shotsOnTarget} | frames: ${frames}`);
  }
  
  console.log(`  Average: goals=${(totalGoals/NUM_MATCHES).toFixed(1)}, shots=${(totalShots/NUM_MATCHES).toFixed(1)}, onTarget=${(totalShotsOnTarget/NUM_MATCHES).toFixed(1)}`);
}

// Also test with subSteps simulation (mimicking actual game VFAST)
console.log(`\n=== VFAST with subSteps=8 (mimicking actual game) ===`);
{
  let totalGoals = 0;
  let totalShots = 0;
  
  for (let i = 0; i < NUM_MATCHES; i++) {
    const st = mkState("4-4-2", "4-4-2");
    st.speed = "VFAST";
    
    const RAW_DT = 1/60;
    const SUB_STEPS = 8;
    const dt = RAW_DT / SUB_STEPS;
    
    let frames = 0;
    const maxFrames = 60 * 60 * 30;
    
    while (!st.over && frames < maxFrames) {
      for (let s = 0; s < SUB_STEPS; s++) {
        update(st, dt);
        if (st.over) break;
      }
      frames++;
    }
    
    const stats = st.stats as any;
    const goals = st.scoreBlue + st.scoreRed;
    const shots = (stats?.shotsTotal?.blue ?? 0) + (stats?.shotsTotal?.red ?? 0);
    
    totalGoals += goals;
    totalShots += shots;
    
    console.log(`  Match ${i+1}: ${st.scoreBlue}-${st.scoreRed} | shots: ${shots} | frames: ${frames}`);
  }
  
  console.log(`  Average: goals=${(totalGoals/NUM_MATCHES).toFixed(1)}, shots=${(totalShots/NUM_MATCHES).toFixed(1)}`);
}
