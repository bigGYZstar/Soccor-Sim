import { mkState, doKickOff, update } from "../client/src/game/engine";
import { P } from "../client/src/game/constants";

const PExt = { pitchHalfW: 52.5, pitchHalfH: 34.0 };

const FPS = 60;
const MATCH_SECONDS = 90;
const TOTAL_FRAMES = MATCH_SECONDS * FPS;

const DT = 1 / 60;

const st = mkState("4-4-2", "4-4-2");
doKickOff(st);

// Track ball position over time to see if it advances
const ballXHistory: number[] = [];
const passDirections: { team: number; from: number; to: number; gp: number; dist: number; action: string }[] = [];
const longPassAttempts: { from: string; to: string; dist: number; gp: number }[] = [];

let prevOwner: number | null = null;
let prevBallX = st.ball.pos.x;
let framesSinceLastPass = 0;

// Track max forward position reached by each team
let maxForwardBlue = -Infinity; // Blue attacks toward -x
let maxForwardRed = -Infinity;  // Red attacks toward +x

// Track action counts
const actionCounts: Record<string, number> = {};

for (let f = 0; f < TOTAL_FRAMES; f++) {
  const oldOwner = st.ball.owner;
  const oldBallPos = { ...st.ball.pos };
  
  update(st, DT);
  
  // Track ball x position every second
  if (f % FPS === 0) {
    ballXHistory.push(st.ball.pos.x);
  }
  
  // Track pass events (owner changed)
  if (st.ball.owner !== null && oldOwner !== null && st.ball.owner !== oldOwner) {
    const from = st.pl[oldOwner];
    const to = st.pl[st.ball.owner];
    if (from.team === to.team) {
      const gp = (to.pos.x - from.pos.x) * -from.team;
      const dist = Math.sqrt((to.pos.x - from.pos.x) ** 2 + (to.pos.y - from.pos.y) ** 2);
      passDirections.push({
        team: from.team,
        from: oldOwner,
        to: st.ball.owner,
        gp,
        dist,
        action: gp > 2 ? "forward" : gp < -2 ? "backward" : "lateral"
      });
    }
  }
  
  // Track max forward position
  if (st.ball.owner !== null) {
    const owner = st.pl[st.ball.owner];
    const ax = owner.pos.x * -owner.team; // Attacking x (positive = forward)
    if (owner.team === 1) { // Blue
      if (ax > maxForwardBlue) maxForwardBlue = ax;
    } else {
      if (ax > maxForwardRed) maxForwardRed = ax;
    }
  }
}

// Analyze pass directions
const blueForward = passDirections.filter(p => p.team === 1 && p.action === "forward").length;
const blueLateral = passDirections.filter(p => p.team === 1 && p.action === "lateral").length;
const blueBackward = passDirections.filter(p => p.team === 1 && p.action === "backward").length;
const redForward = passDirections.filter(p => p.team === -1 && p.action === "forward").length;
const redLateral = passDirections.filter(p => p.team === -1 && p.action === "lateral").length;
const redBackward = passDirections.filter(p => p.team === -1 && p.action === "backward").length;

const blueTotal = blueForward + blueLateral + blueBackward;
const redTotal = redForward + redLateral + redBackward;

console.log("=== BALL PROGRESSION DIAGNOSTIC ===");
console.log(`\n--- PASS DIRECTION ANALYSIS ---`);
console.log(`Blue: ${blueTotal} passes — Forward: ${blueForward} (${blueTotal ? Math.round(blueForward/blueTotal*100) : 0}%), Lateral: ${blueLateral} (${blueTotal ? Math.round(blueLateral/blueTotal*100) : 0}%), Backward: ${blueBackward} (${blueTotal ? Math.round(blueBackward/blueTotal*100) : 0}%)`);
console.log(`Red:  ${redTotal} passes — Forward: ${redForward} (${redTotal ? Math.round(redForward/redTotal*100) : 0}%), Lateral: ${redLateral} (${redTotal ? Math.round(redLateral/redTotal*100) : 0}%), Backward: ${redBackward} (${redTotal ? Math.round(redBackward/redTotal*100) : 0}%)`);

// Average forward progress per pass
const blueAvgGp = passDirections.filter(p => p.team === 1).reduce((s, p) => s + p.gp, 0) / (blueTotal || 1);
const redAvgGp = passDirections.filter(p => p.team === -1).reduce((s, p) => s + p.gp, 0) / (redTotal || 1);
console.log(`\nBlue avg forward progress/pass: ${blueAvgGp.toFixed(1)}m`);
console.log(`Red avg forward progress/pass: ${redAvgGp.toFixed(1)}m`);

// Average pass distance
const blueAvgDist = passDirections.filter(p => p.team === 1).reduce((s, p) => s + p.dist, 0) / (blueTotal || 1);
const redAvgDist = passDirections.filter(p => p.team === -1).reduce((s, p) => s + p.dist, 0) / (redTotal || 1);
console.log(`Blue avg pass distance: ${blueAvgDist.toFixed(1)}m`);
console.log(`Red avg pass distance: ${redAvgDist.toFixed(1)}m`);

console.log(`\n--- MAX FORWARD POSITION ---`);
console.log(`Blue max forward: ${maxForwardBlue.toFixed(1)}m (pitch half: ${PExt.pitchHalfW}m)`);
console.log(`Red max forward: ${maxForwardRed.toFixed(1)}m (pitch half: ${PExt.pitchHalfW}m)`);
console.log(`Phase B threshold: ${(2 * PExt.pitchHalfW / 3).toFixed(1)}m`);

// Ball position over time
console.log(`\n--- BALL X POSITION OVER TIME (every 10s) ---`);
for (let i = 0; i < ballXHistory.length; i += 10) {
  console.log(`  t=${i}s: ballX=${ballXHistory[i].toFixed(1)}`);
}

// Long pass analysis
const longPasses = passDirections.filter(p => p.dist > 18.0);
console.log(`\n--- LONG PASSES (>18m) ---`);
console.log(`Total: ${longPasses.length}`);
for (const lp of longPasses.slice(0, 10)) {
  const fromP = st.pl[lp.from];
  const toP = st.pl[lp.to];
  console.log(`  ${fromP.posLabel}(#${lp.from}) → ${toP.posLabel}(#${lp.to}): dist=${lp.dist.toFixed(1)}m, gp=${lp.gp.toFixed(1)}m`);
}

// Check which players received the most passes
const receiveCount: Record<number, number> = {};
for (const p of passDirections) {
  receiveCount[p.to] = (receiveCount[p.to] || 0) + 1;
}
console.log(`\n--- TOP PASS RECEIVERS ---`);
const sorted = Object.entries(receiveCount).sort((a, b) => b[1] - a[1]).slice(0, 8);
for (const [idx, count] of sorted) {
  const p = st.pl[Number(idx)];
  console.log(`  ${p.posLabel}(#${idx}): ${count} passes received`);
}

// Check which players passed the most
const passCount: Record<number, number> = {};
for (const p of passDirections) {
  passCount[p.from] = (passCount[p.from] || 0) + 1;
}
console.log(`\n--- TOP PASSERS ---`);
const sortedPassers = Object.entries(passCount).sort((a, b) => b[1] - a[1]).slice(0, 8);
for (const [idx, count] of sortedPassers) {
  const p = st.pl[Number(idx)];
  console.log(`  ${p.posLabel}(#${idx}): ${count} passes made`);
}
