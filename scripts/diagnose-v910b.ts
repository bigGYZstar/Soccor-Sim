// v9.10.0b: Detailed diagnostic for DEF participation and possession push
import { mkState, update } from "../client/src/game/engine.js";

const DT = 1 / 60;
const MATCH_SECONDS = 90;
const TOTAL_FRAMES = Math.ceil(MATCH_SECONDS / DT);

const st = mkState("4-4-2", "4-4-2");

// Track who has the ball each frame
let ownershipChanges = 0;
let prevOwner: number | null = null;
let consecutiveOwnership = 0;
let maxConsecutive = 0;
let ownershipStreaks: number[] = [];

// Track DEF positions
let defPositions: { x: number; y: number; role: string; num: number }[] = [];

// Track ball free time
let ballFreeFrames = 0;
let ballOwnedFrames = 0;

// Track possession push
let pushDurations: number[] = [];

for (let f = 0; f < TOTAL_FRAMES; f++) {
  update(st, DT);
  
  if (st.ball.owner !== null) {
    ballOwnedFrames++;
    if (st.ball.owner !== prevOwner) {
      ownershipChanges++;
      if (consecutiveOwnership > 0) {
        ownershipStreaks.push(consecutiveOwnership);
        maxConsecutive = Math.max(maxConsecutive, consecutiveOwnership);
      }
      consecutiveOwnership = 1;
    } else {
      consecutiveOwnership++;
    }
  } else {
    ballFreeFrames++;
    if (consecutiveOwnership > 0) {
      ownershipStreaks.push(consecutiveOwnership);
      maxConsecutive = Math.max(maxConsecutive, consecutiveOwnership);
      consecutiveOwnership = 0;
    }
  }
  prevOwner = st.ball.owner;
  
  // Sample DEF positions every 2 seconds
  if (f % 120 === 0) {
    for (const p of st.pl) {
      if (p.role === "DEF" && p.team === -1) {
        defPositions.push({ x: p.pos.x, y: p.pos.y, role: p.role, num: p.num });
      }
    }
  }
  
  // Track push duration
  if (f % 60 === 0) {
    pushDurations.push(st.possessionPush.duration);
  }
}

console.log("=== v9.10.0b: Detailed Possession & DEF Analysis ===\n");

console.log(`Ball owned frames: ${ballOwnedFrames}/${TOTAL_FRAMES} (${(ballOwnedFrames/TOTAL_FRAMES*100).toFixed(1)}%)`);
console.log(`Ball free frames: ${ballFreeFrames}/${TOTAL_FRAMES} (${(ballFreeFrames/TOTAL_FRAMES*100).toFixed(1)}%)`);
console.log(`Ownership changes: ${ownershipChanges}`);
console.log(`Max consecutive ownership (frames): ${maxConsecutive} (${(maxConsecutive/60).toFixed(2)}s)`);

const avgStreak = ownershipStreaks.length > 0 ? ownershipStreaks.reduce((a,b) => a+b, 0) / ownershipStreaks.length : 0;
console.log(`Average ownership streak: ${avgStreak.toFixed(1)} frames (${(avgStreak/60).toFixed(2)}s)`);

// Possession push analysis
const avgDuration = pushDurations.length > 0 ? pushDurations.reduce((a,b) => a+b, 0) / pushDurations.length : 0;
const maxDuration = Math.max(...pushDurations);
console.log(`\nPossession push duration: avg=${avgDuration.toFixed(2)}s, max=${maxDuration.toFixed(2)}s`);
console.log(`Push durations > 1s: ${pushDurations.filter(d => d > 1).length}/${pushDurations.length}`);
console.log(`Push durations > 2s: ${pushDurations.filter(d => d > 2).length}/${pushDurations.length}`);

// DEF position analysis (Blue team)
console.log(`\nBlue team DEF positions (sampled every 2s):`);
const avgDefX = defPositions.reduce((s, p) => s + p.x, 0) / defPositions.length;
const avgDefY = defPositions.reduce((s, p) => s + Math.abs(p.y), 0) / defPositions.length;
console.log(`Average DEF x: ${avgDefX.toFixed(1)} (negative = own half for blue)`);
console.log(`Average DEF |y|: ${avgDefY.toFixed(1)}`);

// Show some sample positions
console.log(`\nSample DEF positions (first 10):`);
for (let i = 0; i < Math.min(10, defPositions.length); i++) {
  const p = defPositions[i];
  console.log(`  #${p.num}: (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
}

// Check distance from DEF to MID
console.log(`\nDEF-to-MID distances at end of match:`);
const blueDefs = st.pl.filter(p => p.team === -1 && p.role === "DEF");
const blueMids = st.pl.filter(p => p.team === -1 && p.role === "MID");
for (const d of blueDefs) {
  for (const m of blueMids) {
    const dist = Math.sqrt((d.pos.x - m.pos.x) ** 2 + (d.pos.y - m.pos.y) ** 2);
    console.log(`  DEF#${d.num}(${d.pos.x.toFixed(1)},${d.pos.y.toFixed(1)}) → MID#${m.num}(${m.pos.x.toFixed(1)},${m.pos.y.toFixed(1)}): ${dist.toFixed(1)}m`);
  }
}

console.log(`\nScore: Blue ${st.sL} - ${st.sR} Red`);
