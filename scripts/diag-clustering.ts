// Diagnostic: Measure player clustering, width usage, and spacing
import { mkState, doKickOff, update } from '../client/src/game/engine';
const DT = 1/60;
const FRAMES = 60 * 120; // 2 minutes
const RUNS = 3;

interface RunStats {
  avgTeammateDistBlue: number;
  avgTeammateDistRed: number;
  avgWidthBlue: number; // Y-spread of outfield players
  avgWidthRed: number;
  avgDistToBallBlue: number;
  clusteredFramesPct: number; // % of frames where 3+ players within 5m of each other
  playerWidthUsage: { label: string; avgY: number; avgAbsY: number; homeY: number }[];
}

const allResults: RunStats[] = [];

for (let run = 0; run < RUNS; run++) {
  const st = mkState("4-4-2", "4-4-2");
  doKickOff(st);
  
  let samples = 0;
  let sumTeamDistBlue = 0, sumTeamDistRed = 0;
  let sumWidthBlue = 0, sumWidthRed = 0;
  let sumDistToBallBlue = 0;
  let clusteredFrames = 0;
  
  // Per-player tracking (Blue team only)
  const playerYSum: Map<number, { label: string; sumY: number; sumAbsY: number; homeY: number; count: number }> = new Map();
  
  for (let f = 0; f < FRAMES; f++) {
    update(st, DT);
    
    if (f % 10 === 0) {
      samples++;
      
      const blueOutfield = st.pl.filter(p => p.team === -1 && !p.isGK);
      const redOutfield = st.pl.filter(p => p.team === 1 && !p.isGK);
      
      // Average teammate distance (Blue)
      let sumDist = 0, distCount = 0;
      for (let i = 0; i < blueOutfield.length; i++) {
        for (let j = i + 1; j < blueOutfield.length; j++) {
          const d = Math.sqrt(
            (blueOutfield[i].pos.x - blueOutfield[j].pos.x) ** 2 +
            (blueOutfield[i].pos.y - blueOutfield[j].pos.y) ** 2
          );
          sumDist += d;
          distCount++;
        }
      }
      sumTeamDistBlue += sumDist / distCount;
      
      // Same for Red
      sumDist = 0; distCount = 0;
      for (let i = 0; i < redOutfield.length; i++) {
        for (let j = i + 1; j < redOutfield.length; j++) {
          const d = Math.sqrt(
            (redOutfield[i].pos.x - redOutfield[j].pos.x) ** 2 +
            (redOutfield[i].pos.y - redOutfield[j].pos.y) ** 2
          );
          sumDist += d;
          distCount++;
        }
      }
      sumTeamDistRed += sumDist / distCount;
      
      // Width (Y-spread)
      const blueYs = blueOutfield.map(p => p.pos.y);
      const redYs = redOutfield.map(p => p.pos.y);
      sumWidthBlue += Math.max(...blueYs) - Math.min(...blueYs);
      sumWidthRed += Math.max(...redYs) - Math.min(...redYs);
      
      // Distance to ball (Blue)
      for (const p of blueOutfield) {
        sumDistToBallBlue += Math.sqrt(
          (p.pos.x - st.ball.pos.x) ** 2 + (p.pos.y - st.ball.pos.y) ** 2
        );
      }
      
      // Clustering check: 3+ Blue players within 5m of each other
      let clusterCount = 0;
      for (const p of blueOutfield) {
        let nearbyCount = 0;
        for (const q of blueOutfield) {
          if (p.idx === q.idx) continue;
          const d = Math.sqrt((p.pos.x - q.pos.x) ** 2 + (p.pos.y - q.pos.y) ** 2);
          if (d < 5.0) nearbyCount++;
        }
        if (nearbyCount >= 2) clusterCount++; // This player has 2+ teammates within 5m
      }
      if (clusterCount >= 3) clusteredFrames++;
      
      // Per-player Y tracking
      for (const p of blueOutfield) {
        if (!playerYSum.has(p.idx)) {
          playerYSum.set(p.idx, { label: p.posLabel, sumY: 0, sumAbsY: 0, homeY: p.home.y, count: 0 });
        }
        const entry = playerYSum.get(p.idx)!;
        entry.sumY += p.pos.y;
        entry.sumAbsY += Math.abs(p.pos.y);
        entry.count++;
      }
    }
  }
  
  const playerWidthUsage = Array.from(playerYSum.values()).map(e => ({
    label: e.label,
    avgY: e.sumY / e.count,
    avgAbsY: e.sumAbsY / e.count,
    homeY: e.homeY
  }));
  
  allResults.push({
    avgTeammateDistBlue: sumTeamDistBlue / samples,
    avgTeammateDistRed: sumTeamDistRed / samples,
    avgWidthBlue: sumWidthBlue / samples,
    avgWidthRed: sumWidthRed / samples,
    avgDistToBallBlue: sumDistToBallBlue / (samples * 9), // 9 outfield players
    clusteredFramesPct: clusteredFrames / samples * 100,
    playerWidthUsage
  });
  
  console.log(`Run ${run+1}:`);
  console.log(`  Avg teammate dist: Blue=${(sumTeamDistBlue/samples).toFixed(1)}m, Red=${(sumTeamDistRed/samples).toFixed(1)}m`);
  console.log(`  Y-spread: Blue=${(sumWidthBlue/samples).toFixed(1)}m, Red=${(sumWidthRed/samples).toFixed(1)}m`);
  console.log(`  Avg dist to ball (Blue): ${(sumDistToBallBlue/(samples*9)).toFixed(1)}m`);
  console.log(`  Clustered frames: ${(clusteredFrames/samples*100).toFixed(0)}%`);
}

// Average
const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
console.log(`\n=== AVERAGE OVER ${RUNS} RUNS ===`);
console.log(`Avg teammate distance: Blue=${avg(allResults.map(r => r.avgTeammateDistBlue)).toFixed(1)}m, Red=${avg(allResults.map(r => r.avgTeammateDistRed)).toFixed(1)}m`);
console.log(`Y-spread: Blue=${avg(allResults.map(r => r.avgWidthBlue)).toFixed(1)}m, Red=${avg(allResults.map(r => r.avgWidthRed)).toFixed(1)}m`);
console.log(`Avg dist to ball (Blue): ${avg(allResults.map(r => r.avgDistToBallBlue)).toFixed(1)}m`);
console.log(`Clustered frames: ${avg(allResults.map(r => r.clusteredFramesPct)).toFixed(0)}%`);

console.log(`\n--- Per-Player Width Usage (Blue, avg of runs) ---`);
// Aggregate per-player across runs
const playerMap = new Map<string, { sumY: number; sumAbsY: number; homeY: number; count: number }>();
for (const r of allResults) {
  for (const p of r.playerWidthUsage) {
    if (!playerMap.has(p.label)) playerMap.set(p.label, { sumY: 0, sumAbsY: 0, homeY: p.homeY, count: 0 });
    const e = playerMap.get(p.label)!;
    e.sumY += p.avgY;
    e.sumAbsY += p.avgAbsY;
    e.count++;
  }
}
for (const [label, e] of playerMap) {
  const avgY = e.sumY / e.count;
  const avgAbsY = e.sumAbsY / e.count;
  const widthPct = (avgAbsY / 34.0 * 100); // 34m is half-pitch width
  console.log(`  ${label.padEnd(5)} homeY=${e.homeY.toString().padStart(4)} | avgY=${avgY.toFixed(1).padStart(6)} | avgAbsY=${avgAbsY.toFixed(1).padStart(5)} | widthUse=${widthPct.toFixed(0)}%`);
}
