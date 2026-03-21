/**
 * Detailed headless simulation - 5 matches in VFAST mode
 * Outputs detailed shot/goal statistics for comparison with actual gameplay
 */

import { mkState, update } from './client/src/game/engine';

const NUM_MATCHES = 5;

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
  
  const stats = st.stats as any;
  const totalGoals = st.scoreBlue + st.scoreRed;
  const shotsTotal = (stats?.shotsTotal?.blue ?? 0) + (stats?.shotsTotal?.red ?? 0);
  const shotsOnTarget = (stats?.shotsOnTarget?.blue ?? 0) + (stats?.shotsOnTarget?.red ?? 0);
  const gkSaveAttempts = (stats?.gkSaveAttempts?.blue ?? 0) + (stats?.gkSaveAttempts?.red ?? 0);
  const gkSaves = (stats?.gkSaves?.blue ?? 0) + (stats?.gkSaves?.red ?? 0);
  
  console.log(`=== Match ${i+1}: BLU ${st.scoreBlue} - RED ${st.scoreRed} (${frames} frames) ===`);
  console.log(`  Shots total: BLU ${stats?.shotsTotal?.blue ?? 0}, RED ${stats?.shotsTotal?.red ?? 0} = ${shotsTotal}`);
  console.log(`  Shots on target: BLU ${stats?.shotsOnTarget?.blue ?? 0}, RED ${stats?.shotsOnTarget?.red ?? 0} = ${shotsOnTarget}`);
  console.log(`  GK save attempts: BLU ${stats?.gkSaveAttempts?.blue ?? 0}, RED ${stats?.gkSaveAttempts?.red ?? 0} = ${gkSaveAttempts}`);
  console.log(`  GK saves: BLU ${stats?.gkSaves?.blue ?? 0}, RED ${stats?.gkSaves?.red ?? 0} = ${gkSaves}`);
  console.log(`  Goals: ${totalGoals}`);
  console.log(`  Goal rate (goals/shots): ${shotsTotal > 0 ? (totalGoals/shotsTotal).toFixed(3) : 'N/A'}`);
  console.log(`  On-target rate: ${shotsTotal > 0 ? (shotsOnTarget/shotsTotal*100).toFixed(1) : 'N/A'}%`);
  console.log(`  GK save rate: ${gkSaveAttempts > 0 ? (gkSaves/gkSaveAttempts*100).toFixed(1) : 'N/A'}%`);
  
  // Per-player stats
  const playerStats = stats?.playerStats ?? [];
  const topScorers = playerStats
    .filter((p: any) => p.goals > 0)
    .sort((a: any, b: any) => b.goals - a.goals)
    .slice(0, 5);
  
  if (topScorers.length > 0) {
    console.log(`  Top scorers:`);
    for (const p of topScorers) {
      const player = st.pl[p.playerIdx];
      console.log(`    #${player?.num ?? p.playerIdx} ${player?.posLabel ?? ''} (${player?.isBlue ? 'BLU' : 'RED'}): ${p.goals}G ${p.assists}A, ${p.shots}shots, ${p.shotsOnTarget}onTarget`);
    }
  }
  
  // Heatmap shot count
  let heatmapShotCount = 0;
  for (const hm of st.heatmaps) {
    for (const ev of hm.onBall) {
      if (ev.type === 'shot') heatmapShotCount++;
    }
  }
  console.log(`  Heatmap shot events: ${heatmapShotCount}`);
  console.log(`  GoalReplays count: ${st.goalReplays?.length ?? 0}`);
  console.log();
}
