// 5-match diagnostic for statistical reliability
import { mkState, update, doKickOff } from '../client/src/game/engine';
import { P } from '../client/src/game/constants';

const DT = 1 / 60;
const TOTAL_FRAMES = 60 * 120; // Full 120-second match
const NUM_MATCHES = 5;

let totalPassAttempts = 0;
let totalPassSuccess = 0;
let totalPassToIntended = 0;
let totalShots = 0;
let totalShotsOnTarget = 0;
let totalDribbleAttempts = 0;
let totalDribbleSuccess = 0;
let totalGoals = 0;
let totalLongPass = 0;
let totalPossBlue = 0;
let totalPossRed = 0;
let totalPossFree = 0;
let totalThrowIns = 0;
let totalCorners = 0;

for (let m = 0; m < NUM_MATCHES; m++) {
  const st = mkState("4-4-2", "4-4-2");
  doKickOff(st);
  
  let blueFrames = 0, redFrames = 0, freeFrames = 0;
  
  for (let f = 0; f < TOTAL_FRAMES; f++) {
    update(st, DT);
    
    if (st.ball.owner !== null) {
      if (st.pl[st.ball.owner].team === -1) blueFrames++;
      else redFrames++;
    } else {
      freeFrames++;
    }
  }
  
  const s = st.stats;
  const pa = s.passAttempts.blue + s.passAttempts.red;
  const ps = s.passSuccess.blue + s.passSuccess.red;
  const pi = s.passToIntended.blue + s.passToIntended.red;
  const sh = s.shotsTotal.blue + s.shotsTotal.red;
  const sot = s.shotsOnTarget.blue + s.shotsOnTarget.red;
  const da = s.dribbleAttempts.blue + s.dribbleAttempts.red;
  const ds = s.dribbleSuccess.blue + s.dribbleSuccess.red;
  const goals = st.sL + st.sR;
  const lp = s.longPassAttempts.blue + s.longPassAttempts.red;
  const total = blueFrames + redFrames + freeFrames;
  
  console.log(`Match ${m+1}: Score=${st.sL}-${st.sR} Pass=${pa}(${ps}ok,${pi}intended) Shot=${sh}(${sot}OT) Drib=${da}(${ds}ok) LP=${lp} TI=${s.throwIns} Cor=${s.corners} Poss=B${(blueFrames/total*100).toFixed(0)}%/R${(redFrames/total*100).toFixed(0)}%/F${(freeFrames/total*100).toFixed(0)}%`);
  
  totalPassAttempts += pa;
  totalPassSuccess += ps;
  totalPassToIntended += pi;
  totalShots += sh;
  totalShotsOnTarget += sot;
  totalDribbleAttempts += da;
  totalDribbleSuccess += ds;
  totalGoals += goals;
  totalLongPass += lp;
  totalPossBlue += blueFrames / total;
  totalPossRed += redFrames / total;
  totalPossFree += freeFrames / total;
  totalThrowIns += s.throwIns;
  totalCorners += s.corners;
}

console.log();
console.log("=== 5-MATCH AVERAGES ===");
console.log(`  Pass attempts/match: ${(totalPassAttempts / NUM_MATCHES).toFixed(1)}`);
console.log(`  Pass success rate: ${(totalPassSuccess / totalPassAttempts * 100).toFixed(1)}%`);
console.log(`  Pass to intended rate: ${(totalPassToIntended / totalPassAttempts * 100).toFixed(1)}%`);
console.log(`  Shots/match: ${(totalShots / NUM_MATCHES).toFixed(1)} (${(totalShotsOnTarget / NUM_MATCHES).toFixed(1)} on target)`);
console.log(`  Dribbles/match: ${(totalDribbleAttempts / NUM_MATCHES).toFixed(1)} (${(totalDribbleSuccess / NUM_MATCHES).toFixed(1)} success)`);
console.log(`  Long passes/match: ${(totalLongPass / NUM_MATCHES).toFixed(1)}`);
console.log(`  Goals/match: ${(totalGoals / NUM_MATCHES).toFixed(1)}`);
console.log(`  Throw-ins/match: ${(totalThrowIns / NUM_MATCHES).toFixed(1)}`);
console.log(`  Corners/match: ${(totalCorners / NUM_MATCHES).toFixed(1)}`);
console.log(`  Avg possession: Blue=${(totalPossBlue / NUM_MATCHES * 100).toFixed(1)}% Red=${(totalPossRed / NUM_MATCHES * 100).toFixed(1)}% Free=${(totalPossFree / NUM_MATCHES * 100).toFixed(1)}%`);
