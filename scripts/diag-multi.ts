// Multi-run diagnostic: Average over 5 runs to reduce randomness
import { mkState, doKickOff, update } from '../client/src/game/engine';
import { FORMATIONS, FormationId } from '../client/src/game/constants';
const DT = 1/60;
const FRAMES = 60 * 90; // 90 seconds per run
const RUNS = 5;

interface RunResult {
  teamAvgForward: number;
  fwdAvgX: number;
  fwdMaxFwd: number;
  fwdOppHalf: number;
  midAvgX: number;
  midOppHalf: number;
  defAvgX: number;
  passForward: number;
  passBackward: number;
  passLateral: number;
  totalPasses: number;
  goals: number;
  shots: number;
}

const results: RunResult[] = [];

for (let run = 0; run < RUNS; run++) {
  const st = mkState("4-4-2", "4-4-2");
  doKickOff(st);
  
  let teamSamples = 0;
  let sumTeamForward = 0;
  let fwdSumX = 0, fwdSamples = 0, fwdMaxFwd = -999, fwdOppHalfCount = 0;
  let midSumX = 0, midSamples = 0, midOppHalfCount = 0;
  let defSumX = 0, defSamples = 0;
  let passF = 0, passB = 0, passL = 0, totalP = 0;
  let lastOwner = -1, lastOwnerPos = { x: 0, y: 0 };
  
  for (let f = 0; f < FRAMES; f++) {
    update(st, DT);
    
    // Pass tracking
    if (st.ball.owner !== null && st.ball.owner !== lastOwner && lastOwner !== -1) {
      const from = lastOwnerPos;
      const to = st.pl[st.ball.owner];
      const fromP = st.pl.find(p => p.idx === lastOwner);
      if (fromP && to.team === fromP.team && fromP.team === -1) {
        const gp = (to.pos.x - from.x) * 1; // Blue attacks right
        totalP++;
        if (gp > 2.0) passF++;
        else if (gp < -2.0) passB++;
        else passL++;
      }
    }
    if (st.ball.owner !== null) {
      lastOwner = st.ball.owner;
      lastOwnerPos = { ...st.pl[st.ball.owner].pos };
    }
    
    if (f % 10 === 0) {
      teamSamples++;
      let sumBlue = 0, countBlue = 0;
      for (const p of st.pl) {
        if (p.team !== -1 || p.isGK) continue;
        const forwardX = p.pos.x * 1; // Blue attacks right
        sumBlue += forwardX;
        countBlue++;
        
        if (p.role === "FWD") {
          fwdSumX += p.pos.x;
          fwdSamples++;
          fwdMaxFwd = Math.max(fwdMaxFwd, p.pos.x);
          if (p.pos.x > 0) fwdOppHalfCount++;
        } else if (p.role === "MID") {
          midSumX += p.pos.x;
          midSamples++;
          if (p.pos.x > 0) midOppHalfCount++;
        } else if (p.role === "DEF") {
          defSumX += p.pos.x;
          defSamples++;
        }
      }
      sumTeamForward += sumBlue / countBlue;
    }
  }
  
  results.push({
    teamAvgForward: sumTeamForward / teamSamples,
    fwdAvgX: fwdSumX / fwdSamples,
    fwdMaxFwd,
    fwdOppHalf: fwdOppHalfCount / fwdSamples * 100,
    midAvgX: midSumX / midSamples,
    midOppHalf: midOppHalfCount / midSamples * 100,
    defAvgX: defSumX / defSamples,
    passForward: passF,
    passBackward: passB,
    passLateral: passL,
    totalPasses: totalP,
    goals: st.sL,
    shots: 0,
  });
  
  console.log(`Run ${run+1}: team=${(sumTeamForward/teamSamples).toFixed(1)} fwd=${(fwdSumX/fwdSamples).toFixed(1)} mid=${(midSumX/midSamples).toFixed(1)} def=${(defSumX/defSamples).toFixed(1)} goals=${st.sL}-${st.sR} passes=${totalP}(F${passF}/B${passB}/L${passL})`);
}

// Average
const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
console.log(`\n=== AVERAGE OVER ${RUNS} RUNS ===`);
console.log(`Team avg forward: ${avg(results.map(r => r.teamAvgForward)).toFixed(1)}m`);
console.log(`FWD avgX: ${avg(results.map(r => r.fwdAvgX)).toFixed(1)}, maxFwd: ${avg(results.map(r => r.fwdMaxFwd)).toFixed(1)}, oppHalf: ${avg(results.map(r => r.fwdOppHalf)).toFixed(0)}%`);
console.log(`MID avgX: ${avg(results.map(r => r.midAvgX)).toFixed(1)}, oppHalf: ${avg(results.map(r => r.midOppHalf)).toFixed(0)}%`);
console.log(`DEF avgX: ${avg(results.map(r => r.defAvgX)).toFixed(1)}`);
console.log(`Goals (Blue): ${avg(results.map(r => r.goals)).toFixed(1)}`);
const totalPasses = results.reduce((s, r) => s + r.totalPasses, 0);
const totalF = results.reduce((s, r) => s + r.passForward, 0);
const totalB = results.reduce((s, r) => s + r.passBackward, 0);
const totalL = results.reduce((s, r) => s + r.passLateral, 0);
console.log(`Passes: ${totalPasses} total, Forward: ${(totalF/totalPasses*100).toFixed(0)}%, Backward: ${(totalB/totalPasses*100).toFixed(0)}%, Lateral: ${(totalL/totalPasses*100).toFixed(0)}%`);
