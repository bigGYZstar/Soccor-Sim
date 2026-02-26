// Diagnostic: Track FWD target position vs actual position, and what's blocking them
import { mkState, doKickOff, update } from '../client/src/game/engine';
import { FORMATIONS, FormationId } from '../client/src/game/constants';
const DT = 1/60;
const FRAMES = 60 * 30; // 30 seconds
const st = mkState("4-4-2", "4-4-2");
doKickOff(st);

// Track FWD stats per frame
let fwdSamples = 0;
let sumTgtX = [0, 0]; // For 2 FWDs
let sumPosX = [0, 0];
let sumDiff = [0, 0]; // target - pos (positive = target is more forward)
let maxTgtX = [-999, -999];
let maxPosX = [-999, -999];
let ballOwnerFrames = { blue: 0, red: 0, none: 0 };
let fwdIndices: number[] = [];

for (let f = 0; f < FRAMES; f++) {
  update(st, DT);
  
  if (f % 10 === 0) {
    // Find blue FWDs
    if (fwdIndices.length === 0) {
      fwdIndices = st.pl.filter(p => p.team === -1 && p.role === "FWD").map(p => p.idx);
    }
    
    fwdSamples++;
    
    // Ball owner
    if (st.ball.owner !== null) {
      if (st.pl[st.ball.owner].team === -1) ballOwnerFrames.blue++;
      else ballOwnerFrames.red++;
    } else {
      ballOwnerFrames.none++;
    }
    
    fwdIndices.forEach((idx, i) => {
      const p = st.pl[idx];
      sumTgtX[i] += p.tgt.x;
      sumPosX[i] += p.pos.x;
      sumDiff[i] += (p.tgt.x - p.pos.x) * 1; // Blue attacks right, so positive tgt.x = forward
      maxTgtX[i] = Math.max(maxTgtX[i], p.tgt.x);
      maxPosX[i] = Math.max(maxPosX[i], p.pos.x);
    });
    
    // Print every 5 seconds
    if (f % 300 === 0 && f > 0) {
      const t = f / 60;
      console.log(`\n--- t=${t.toFixed(0)}s ---`);
      console.log(`Ball owner: Blue=${ballOwnerFrames.blue}, Red=${ballOwnerFrames.red}, None=${ballOwnerFrames.none}`);
      console.log(`Ball pos: (${st.ball.pos.x.toFixed(1)}, ${st.ball.pos.y.toFixed(1)})`);
      console.log(`Push: team=${st.possessionPush.team}, level=${st.possessionPush.pushLevel.toFixed(2)}, dur=${st.possessionPush.duration.toFixed(1)}s`);
      
      fwdIndices.forEach((idx, i) => {
        const p = st.pl[idx];
        console.log(`  ${p.posLabel} #${p.num}: pos=(${p.pos.x.toFixed(1)}, ${p.pos.y.toFixed(1)}) tgt=(${p.tgt.x.toFixed(1)}, ${p.tgt.y.toFixed(1)}) act=${p.act} wantsBall=${p.wantsBall}`);
        console.log(`    avgTgtX=${(sumTgtX[i]/fwdSamples).toFixed(1)} avgPosX=${(sumPosX[i]/fwdSamples).toFixed(1)} maxTgtX=${maxTgtX[i].toFixed(1)} maxPosX=${maxPosX[i].toFixed(1)}`);
      });
      
      // Also show carrier
      if (st.ball.owner !== null) {
        const c = st.pl[st.ball.owner];
        console.log(`  Carrier: ${c.posLabel} #${c.num} (${c.role}) pos=(${c.pos.x.toFixed(1)}, ${c.pos.y.toFixed(1)})`);
      }
    }
  }
}

console.log(`\n=== FINAL SUMMARY ===`);
console.log(`Ball ownership: Blue=${(ballOwnerFrames.blue/fwdSamples*100).toFixed(0)}%, Red=${(ballOwnerFrames.red/fwdSamples*100).toFixed(0)}%, None=${(ballOwnerFrames.none/fwdSamples*100).toFixed(0)}%`);
fwdIndices.forEach((idx, i) => {
  const p = st.pl[idx];
  console.log(`${p.posLabel}: avgTgtX=${(sumTgtX[i]/fwdSamples).toFixed(1)}, avgPosX=${(sumPosX[i]/fwdSamples).toFixed(1)}, maxTgtX=${maxTgtX[i].toFixed(1)}, maxPosX=${maxPosX[i].toFixed(1)}`);
});
