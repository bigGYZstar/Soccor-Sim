// Frame-by-frame flow diagnostic
import { mkState, update, doKickOff } from '../client/src/game/engine';
import { vdist, vlen } from '../client/src/game/math';
import { P } from '../client/src/game/constants';

const st = mkState("4-4-2", "4-4-2");
doKickOff(st);
const DT = 1 / 60;

// Track state transitions
let prevOwner = st.ball.owner;
let prevFree = st.ball.free;
let prevKickSeq = st.ball.kickSeq;
let possessionChanges = 0;
let kickCount = 0;
let freeToOwnedCount = 0;
let ownedToFreeCount = 0;
let maxFreeStreak = 0;
let currentFreeStreak = 0;
let pausedFrames = 0;

// Track average pass distance
let passDists: number[] = [];

for (let f = 0; f < 60 * 30; f++) { // 30 seconds
  update(st, DT);
  
  if (st.paused) {
    pausedFrames++;
    continue;
  }
  
  const owner = st.ball.owner;
  const free = st.ball.free;
  
  // Track free ball streaks
  if (free && owner === null) {
    currentFreeStreak++;
    if (currentFreeStreak > maxFreeStreak) maxFreeStreak = currentFreeStreak;
  } else {
    currentFreeStreak = 0;
  }
  
  // Track state transitions
  if (prevOwner !== null && owner === null) {
    ownedToFreeCount++;
  }
  if (prevOwner === null && owner !== null) {
    freeToOwnedCount++;
  }
  if (prevOwner !== null && owner !== null && prevOwner !== owner) {
    possessionChanges++;
  }
  
  // Track kicks
  if (st.ball.kickSeq !== prevKickSeq) {
    kickCount++;
    // Log kick details
    if (kickCount <= 30) {
      const kicker = st.ball.lastKickerIdx >= 0 ? st.pl[st.ball.lastKickerIdx] : null;
      const intended = st.ball.intendedReceiverIdx !== null ? st.pl[st.ball.intendedReceiverIdx] : null;
      const kickerLabel = kicker ? `#${kicker.num}(${kicker.team === -1 ? 'B' : 'R'})` : '?';
      const intendedLabel = intended ? `#${intended.num}(${intended.team === -1 ? 'B' : 'R'})` : '?';
      const dist = kicker && intended ? vdist(kicker.pos, intended.pos).toFixed(1) : '?';
      const ballSpeed = vlen(st.ball.vel).toFixed(1);
      console.log(`  Kick ${kickCount} t=${(f/60).toFixed(2)}s: ${st.ball.kickKind} ${kickerLabel}→${intendedLabel} dist=${dist}m speed=${ballSpeed}m/s`);
      if (kicker && intended) {
        passDists.push(vdist(kicker.pos, intended.pos));
      }
    }
  }
  
  prevOwner = owner;
  prevFree = free;
  prevKickSeq = st.ball.kickSeq;
}

console.log();
console.log("=== FLOW DIAGNOSTIC (30s) ===");
console.log(`  Kicks: ${kickCount}`);
console.log(`  Owned→Free: ${ownedToFreeCount}`);
console.log(`  Free→Owned: ${freeToOwnedCount}`);
console.log(`  Possession changes: ${possessionChanges}`);
console.log(`  Max free streak: ${maxFreeStreak} frames (${(maxFreeStreak/60).toFixed(2)}s)`);
console.log(`  Paused frames: ${pausedFrames}`);
if (passDists.length > 0) {
  const avgDist = passDists.reduce((a, b) => a + b, 0) / passDists.length;
  const maxDist = Math.max(...passDists);
  const minDist = Math.min(...passDists);
  console.log(`  Pass distances: avg=${avgDist.toFixed(1)}m min=${minDist.toFixed(1)}m max=${maxDist.toFixed(1)}m`);
}
