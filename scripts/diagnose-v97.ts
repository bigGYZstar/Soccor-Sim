import { mkState, doKickOff, update } from '../client/src/game/engine';
import { P } from '../client/src/game/constants';
import { vdist, vlen } from '../client/src/game/math';

const DT = 1 / 60;
const MATCH_STEPS = Math.ceil(P.matchDuration * 60); // Full match at 60fps

console.log(`Running full match diagnostic (${P.matchDuration}s)...`);
console.log("--------------------------------------------------\n");

const st = mkState();
doKickOff(st);

// Frame-level tracking
let totalFrames = 0;
let carryFrames = 0;
let dribbleFrames = 0;
let idleFrames = 0;
let moveFrames = 0;
let freeBallFrames = 0;
let passInFlightFrames = 0;

// Carry duration tracking
let currentCarryStart = -1;
let currentCarryPlayer = -1;
const carryDurations: number[] = [];

// Pass event tracking
let lastPassCount = 0;
let passEvents: { time: number; from: number; to: number }[] = [];

for (let step = 0; step < MATCH_STEPS; step++) {
  update(st, DT);
  totalFrames++;
  
  if (st.ball.owner !== null) {
    const owner = st.pl[st.ball.owner];
    
    if (owner.act === "carry") {
      carryFrames++;
      if (currentCarryPlayer !== st.ball.owner || currentCarryStart < 0) {
        // New carry started
        if (currentCarryStart >= 0) {
          carryDurations.push((step * DT) - currentCarryStart);
        }
        currentCarryStart = step * DT;
        currentCarryPlayer = st.ball.owner;
      }
    } else {
      if (currentCarryStart >= 0) {
        carryDurations.push((step * DT) - currentCarryStart);
        currentCarryStart = -1;
        currentCarryPlayer = -1;
      }
      
      if (owner.act === "dribble") dribbleFrames++;
      else if (owner.act === "idle") idleFrames++;
      else if (owner.act === "move") moveFrames++;
    }
  } else {
    if (currentCarryStart >= 0) {
      carryDurations.push((step * DT) - currentCarryStart);
      currentCarryStart = -1;
      currentCarryPlayer = -1;
    }
    
    if (st.ball.free) {
      freeBallFrames++;
      if (vlen(st.ball.vel) > 2.0) passInFlightFrames++;
    }
  }
  
  // Track pass events
  const totalPasses = st.stats.passAttempts.blue + st.stats.passAttempts.red;
  if (totalPasses > lastPassCount) {
    passEvents.push({ time: st.time, from: -1, to: -1 });
    lastPassCount = totalPasses;
  }
}

// Close any open carry
if (currentCarryStart >= 0) {
  carryDurations.push((MATCH_STEPS * DT) - currentCarryStart);
}

console.log("==================================================");
console.log("📊 v9.7.0 CARRY/PASS DIAGNOSTIC RESULTS");
console.log("==================================================\n");

console.log(`Final Score: BLUE ${st.sL} - ${st.sR} RED`);
console.log(`Match Duration: ${st.time.toFixed(1)}s\n`);

console.log("--- Frame Distribution ---");
console.log(`Total frames: ${totalFrames}`);
console.log(`Carry frames: ${carryFrames} (${(carryFrames/totalFrames*100).toFixed(1)}%)`);
console.log(`Dribble frames: ${dribbleFrames} (${(dribbleFrames/totalFrames*100).toFixed(1)}%)`);
console.log(`Idle frames: ${idleFrames} (${(idleFrames/totalFrames*100).toFixed(1)}%)`);
console.log(`Move frames: ${moveFrames} (${(moveFrames/totalFrames*100).toFixed(1)}%)`);
console.log(`Free ball frames: ${freeBallFrames} (${(freeBallFrames/totalFrames*100).toFixed(1)}%)`);
console.log(`Pass in-flight frames: ${passInFlightFrames} (${(passInFlightFrames/totalFrames*100).toFixed(1)}%)\n`);

console.log("--- Carry Duration Stats ---");
if (carryDurations.length > 0) {
  const avg = carryDurations.reduce((a, b) => a + b, 0) / carryDurations.length;
  const max = Math.max(...carryDurations);
  const min = Math.min(...carryDurations);
  const median = carryDurations.sort((a, b) => a - b)[Math.floor(carryDurations.length / 2)];
  const over1s = carryDurations.filter(d => d > 1.0).length;
  const over2s = carryDurations.filter(d => d > 2.0).length;
  console.log(`Total carry events: ${carryDurations.length}`);
  console.log(`Average duration: ${avg.toFixed(3)}s`);
  console.log(`Median duration: ${median.toFixed(3)}s`);
  console.log(`Min: ${min.toFixed(3)}s, Max: ${max.toFixed(3)}s`);
  console.log(`Over 1.0s: ${over1s} (${(over1s/carryDurations.length*100).toFixed(1)}%)`);
  console.log(`Over 2.0s: ${over2s} (${(over2s/carryDurations.length*100).toFixed(1)}%)`);
} else {
  console.log("No carry events detected!");
}

console.log("\n--- Pass Statistics ---");
console.log(`Pass attempts: BLUE ${st.stats.passAttempts.blue}, RED ${st.stats.passAttempts.red}, Total: ${st.stats.passAttempts.blue + st.stats.passAttempts.red}`);
console.log(`Pass success: BLUE ${st.stats.passSuccess.blue}, RED ${st.stats.passSuccess.red}`);
console.log(`Long pass attempts: BLUE ${st.stats.longPassAttempts.blue}, RED ${st.stats.longPassAttempts.red}`);
console.log(`Dribble attempts: BLUE ${st.stats.dribbleAttempts.blue}, RED ${st.stats.dribbleAttempts.red}`);
console.log(`Shots: BLUE ${st.stats.shotsTotal.blue}, RED ${st.stats.shotsTotal.red}`);
console.log(`Interceptions: BLUE ${st.stats.interceptions.blue}, RED ${st.stats.interceptions.red}`);

const totalPassAttempts = st.stats.passAttempts.blue + st.stats.passAttempts.red;
const totalDribbleAttempts = st.stats.dribbleAttempts.blue + st.stats.dribbleAttempts.red;
const passRatio = totalPassAttempts / Math.max(1, totalPassAttempts + totalDribbleAttempts);
console.log(`\nPass/Dribble ratio: ${(passRatio * 100).toFixed(1)}% pass, ${((1 - passRatio) * 100).toFixed(1)}% dribble`);
console.log(`Pass events per minute: ${(totalPassAttempts / (st.time / 60)).toFixed(1)}`);

console.log("\n==================================================");
console.log("TARGET METRICS:");
console.log("  Carry rate: < 30% (was 63-88%)");
console.log("  Pass attempts: 60-100/match");
console.log("  Pass in-flight: > 15% of frames");
console.log("  Max carry duration: < 1.5s");
console.log("==================================================");
