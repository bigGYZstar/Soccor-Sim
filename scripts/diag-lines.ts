import { mkState, doKickOff, update } from '../client/src/game/engine';
import { FORMATIONS, FormationId } from '../client/src/game/constants';
const DT = 1/60;
const FRAMES = 60 * 60;
const st = mkState("4-4-2", "4-4-2");
doKickOff(st);

let samples = 0;
let sumOppDefLineBlue = 0;
let sumOppMidLineBlue = 0;
let sumPushBlue = 0;
let sumPushDuration = 0;

for (let f = 0; f < FRAMES; f++) {
  update(st, DT);
  if (f % 60 === 0) {
    samples++;
    const redDefs = st.pl.filter(p => p.team === 1 && p.role === "DEF");
    const redMids = st.pl.filter(p => p.team === 1 && p.role === "MID");
    if (redDefs.length > 0) {
      sumOppDefLineBlue += redDefs.reduce((s, p) => s + p.pos.x, 0) / redDefs.length;
    }
    if (redMids.length > 0) {
      sumOppMidLineBlue += redMids.reduce((s, p) => s + p.pos.x, 0) / redMids.length;
    }
    if (st.possessionPush.team === -1) {
      sumPushBlue += st.possessionPush.pushLevel;
      sumPushDuration += st.possessionPush.duration;
    }
  }
}

console.log(`Opponent (Red) DEF line avg x: ${(sumOppDefLineBlue/samples).toFixed(1)}`);
console.log(`Opponent (Red) MID line avg x: ${(sumOppMidLineBlue/samples).toFixed(1)}`);
console.log(`Blue push level avg: ${(sumPushBlue/samples).toFixed(2)}`);
console.log(`Blue push duration avg: ${(sumPushDuration/samples).toFixed(2)}s`);
console.log(`Pocket (between opp MID and DEF): ${((sumOppMidLineBlue/samples + sumOppDefLineBlue/samples)/2).toFixed(1)}`);
