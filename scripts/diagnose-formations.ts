// Diagnostic: Test wide player movement across all 3 formations
import { mkState, doKickOff, update } from '../client/src/game/engine';
import { FORMATIONS, FormationId } from '../client/src/game/constants';

const DT = 1/60;
const FRAMES = 60 * 60; // 60 seconds

const formations: FormationId[] = ["4-4-2", "4-2-3-1", "3-4-3"];

for (const formId of formations) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`FORMATION: ${formId}`);
  console.log(`${"=".repeat(60)}`);
  
  const def = FORMATIONS[formId];
  const st = mkState(formId, formId);
  doKickOff(st);
  
  // Track per-player stats
  const playerStats: Record<number, {
    posLabel: string;
    role: string;
    team: number;
    homeX: number;
    homeY: number;
    sumDistHome: number;
    maxDistHome: number;
    wantsBallFrames: number;
    forwardRunFrames: number;
    samples: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }> = {};
  
  // Initialize
  for (const p of st.pl) {
    playerStats[p.idx] = {
      posLabel: p.posLabel,
      role: p.role,
      team: p.team,
      homeX: p.home.x,
      homeY: p.home.y,
      sumDistHome: 0,
      maxDistHome: 0,
      wantsBallFrames: 0,
      forwardRunFrames: 0,
      samples: 0,
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
    };
  }
  
  for (let f = 0; f < FRAMES; f++) {
    update(st, DT);
    
    // Sample every 10 frames
    if (f % 10 === 0) {
      for (const p of st.pl) {
        const s = playerStats[p.idx];
        const dx = p.pos.x - p.home.x;
        const dy = p.pos.y - p.home.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        s.sumDistHome += dist;
        s.maxDistHome = Math.max(s.maxDistHome, dist);
        if (p.wantsBall) s.wantsBallFrames++;
        if (p.passAndMoveTimer > 0) s.forwardRunFrames++;
        s.samples++;
        s.minX = Math.min(s.minX, p.pos.x);
        s.maxX = Math.max(s.maxX, p.pos.x);
        s.minY = Math.min(s.minY, p.pos.y);
        s.maxY = Math.max(s.maxY, p.pos.y);
      }
    }
  }
  
  // Identify wide players for this formation
  const wideLabels: Record<FormationId, string[]> = {
    "4-4-2": ["LM", "RM"],
    "4-2-3-1": ["LAM", "RAM"],
    "3-4-3": ["LW", "RW"],
  };
  
  const targetLabels = wideLabels[formId];
  
  console.log(`\nWide Players (${targetLabels.join(", ")}):`);
  console.log("-".repeat(60));
  
  for (const p of st.pl) {
    const s = playerStats[p.idx];
    if (!targetLabels.includes(s.posLabel)) continue;
    
    const avgDist = s.sumDistHome / s.samples;
    const xRange = s.maxX - s.minX;
    const yRange = s.maxY - s.minY;
    
    console.log(`  ${s.posLabel} #${p.num} (team=${s.team}, role=${s.role})`);
    console.log(`    home: (${s.homeX.toFixed(1)}, ${s.homeY.toFixed(1)})`);
    console.log(`    avgDistHome: ${avgDist.toFixed(1)}m, maxDistHome: ${s.maxDistHome.toFixed(1)}m`);
    console.log(`    wantsBall: ${s.wantsBallFrames}/${s.samples} (${(s.wantsBallFrames/s.samples*100).toFixed(0)}%)`);
    console.log(`    forwardRun: ${s.forwardRunFrames}/${s.samples}`);
    console.log(`    x range: ${xRange.toFixed(1)}m (${s.minX.toFixed(1)} to ${s.maxX.toFixed(1)})`);
    console.log(`    y range: ${yRange.toFixed(1)}m (${s.minY.toFixed(1)} to ${s.maxY.toFixed(1)})`);
  }
  
  // Also show FWDs for 3-4-3
  if (formId === "3-4-3") {
    console.log(`\nAll FWD players (for reference):`);
    console.log("-".repeat(60));
    for (const p of st.pl) {
      const s = playerStats[p.idx];
      if (s.role !== "FWD") continue;
      const avgDist = s.sumDistHome / s.samples;
      console.log(`  ${s.posLabel} #${p.num} (team=${s.team})`);
      console.log(`    home: (${s.homeX.toFixed(1)}, ${s.homeY.toFixed(1)})`);
      console.log(`    avgDistHome: ${avgDist.toFixed(1)}m, maxDistHome: ${s.maxDistHome.toFixed(1)}m`);
      console.log(`    wantsBall: ${s.wantsBallFrames}/${s.samples} (${(s.wantsBallFrames/s.samples*100).toFixed(0)}%)`);
    }
  }
  
  // Also show WBs for 3-4-3
  if (formId === "3-4-3") {
    console.log(`\nWing-backs (LWB, RWB):`);
    console.log("-".repeat(60));
    for (const p of st.pl) {
      const s = playerStats[p.idx];
      if (!["LWB", "RWB"].includes(s.posLabel)) continue;
      const avgDist = s.sumDistHome / s.samples;
      console.log(`  ${s.posLabel} #${p.num} (team=${s.team}, role=${s.role})`);
      console.log(`    home: (${s.homeX.toFixed(1)}, ${s.homeY.toFixed(1)})`);
      console.log(`    avgDistHome: ${avgDist.toFixed(1)}m, maxDistHome: ${s.maxDistHome.toFixed(1)}m`);
      console.log(`    wantsBall: ${s.wantsBallFrames}/${s.samples} (${(s.wantsBallFrames/s.samples*100).toFixed(0)}%)`);
    }
  }
}
