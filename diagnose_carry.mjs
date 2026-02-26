// Diagnostic: Track carry vs pass decision breakdown per frame
import { mkState, doKickOff, update } from './client/src/game/engine.ts';

const DT = 1/60;
const MATCH_DURATION = 120;
const NUM_MATCHES = 5;

// We'll monkey-patch decideHasBall to log decisions
// Instead, we'll track player actions per frame
let totalFrames = 0;
let actionCounts = { carry: 0, pass: 0, dribble: 0, shot: 0, idle: 0, other: 0 };
let carryDurations = []; // how many consecutive frames each carry lasts
let currentCarryFrames = {};
let passDistances = [];
let carryDistToEnemy = [];

for (let m = 0; m < NUM_MATCHES; m++) {
  const st = mkState("4-4-2", "4-4-2");
  doKickOff(st, -1);
  
  let frames = 0;
  const maxFrames = MATCH_DURATION / DT;
  let prevOwner = null;
  let prevActs = {};
  
  while (frames < maxFrames) {
    // Track actions BEFORE update
    const owner = st.ball.owner;
    if (owner !== null) {
      const me = st.pl[owner];
      const act = me.act || "unknown";
      
      // Count action
      if (act === "carry") actionCounts.carry++;
      else if (act === "pass" || act === "passTo") actionCounts.pass++;
      else if (act === "dribble") actionCounts.dribble++;
      else if (act === "shot") actionCounts.shot++;
      else if (act === "idle") actionCounts.idle++;
      else actionCounts.other++;
      
      // Track carry duration
      if (act === "carry") {
        if (!currentCarryFrames[owner]) currentCarryFrames[owner] = 0;
        currentCarryFrames[owner]++;
        
        // Track enemy distance during carry
        let closestEnemy = Infinity;
        for (const p of st.pl) {
          if (p.team === me.team) continue;
          const dx = p.pos.x - me.pos.x;
          const dy = p.pos.y - me.pos.y;
          const d = Math.sqrt(dx*dx + dy*dy);
          if (d < closestEnemy) closestEnemy = d;
        }
        carryDistToEnemy.push(closestEnemy);
      } else {
        if (currentCarryFrames[owner] && currentCarryFrames[owner] > 0) {
          carryDurations.push(currentCarryFrames[owner]);
          currentCarryFrames[owner] = 0;
        }
      }
      
      totalFrames++;
    }
    
    // Track pass distances (when ball becomes kickActive)
    if (st.ball.kickActive && !st.ball.isShot && st.ball.owner === null) {
      const speed = Math.sqrt(st.ball.vel.x**2 + st.ball.vel.y**2);
      if (speed > 5) { // Actual pass, not just a touch
        // We can't easily get pass distance here, but we can log kick speed
      }
    }
    
    update(st, DT);
    frames++;
  }
  
  console.log(`Match ${m+1}: BLU ${st.sL} - ${st.sR} RED`);
  console.log(`  passAttempts: B=${st.stats.passAttempts.blue} R=${st.stats.passAttempts.red}`);
  console.log(`  passSuccess: B=${st.stats.passSuccess.blue} R=${st.stats.passSuccess.red}`);
  console.log(`  dribbleAttempts: B=${st.stats.dribbleAttempts.blue} R=${st.stats.dribbleAttempts.red}`);
  console.log(`  shots: B=${st.stats.shotsTotal.blue} R=${st.stats.shotsTotal.red}`);
}

console.log(`\n=== Action Distribution (${totalFrames} frames with ball owner) ===`);
const total = Object.values(actionCounts).reduce((a, b) => a + b, 0);
for (const [act, count] of Object.entries(actionCounts)) {
  console.log(`  ${act}: ${count} (${(count/total*100).toFixed(1)}%)`);
}

console.log(`\n=== Carry Duration Stats ===`);
if (carryDurations.length > 0) {
  const sorted = [...carryDurations].sort((a, b) => a - b);
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const max = sorted[sorted.length - 1];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  console.log(`  Count: ${sorted.length} carry sequences`);
  console.log(`  Avg duration: ${(avg * DT).toFixed(2)}s (${avg.toFixed(0)} frames)`);
  console.log(`  Median: ${(median * DT).toFixed(2)}s`);
  console.log(`  P90: ${(p90 * DT).toFixed(2)}s`);
  console.log(`  Max: ${(max * DT).toFixed(2)}s`);
  
  // Distribution
  const buckets = [0, 0, 0, 0, 0]; // <0.5s, 0.5-1s, 1-2s, 2-5s, >5s
  for (const d of sorted) {
    const sec = d * DT;
    if (sec < 0.5) buckets[0]++;
    else if (sec < 1) buckets[1]++;
    else if (sec < 2) buckets[2]++;
    else if (sec < 5) buckets[3]++;
    else buckets[4]++;
  }
  console.log(`  <0.5s: ${buckets[0]} | 0.5-1s: ${buckets[1]} | 1-2s: ${buckets[2]} | 2-5s: ${buckets[3]} | >5s: ${buckets[4]}`);
}

console.log(`\n=== Enemy Distance During Carry ===`);
if (carryDistToEnemy.length > 0) {
  const sorted = [...carryDistToEnemy].sort((a, b) => a - b);
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  console.log(`  Avg enemy dist: ${avg.toFixed(1)}m`);
  console.log(`  Median: ${median.toFixed(1)}m`);
  
  // How often is enemy > 3m (carry lock threshold)
  const far = sorted.filter(d => d > 3.0).length;
  const mid = sorted.filter(d => d > 2.0 && d <= 3.0).length;
  const close = sorted.filter(d => d <= 2.0).length;
  console.log(`  Enemy > 3m: ${(far/sorted.length*100).toFixed(1)}% (carry lock continues)`);
  console.log(`  Enemy 2-3m: ${(mid/sorted.length*100).toFixed(1)}% (carry lock 2nd stage)`);
  console.log(`  Enemy < 2m: ${(close/sorted.length*100).toFixed(1)}% (falls through to decision)`);
}
