import { mkState, update, doKickOff } from '../client/src/game/engine';
import type { FormationId } from '../client/src/game/constants';
import { P } from '../client/src/game/constants';

const DT = 1 / 60;
const MAX_FRAMES = 60 * 60 * 10; // 10 minutes

const st = mkState('4-4-2' as FormationId, '4-4-2' as FormationId);
doKickOff(st);

let frames = 0;
let maxCarrierAx = -Infinity;
let maxCarrierDistToGoal = Infinity;
let minCarrierDistToGoal = Infinity;
let phaseBFrames = 0;
let shotRangeFrames = 0;

while (!st.over && frames < MAX_FRAMES) {
  update(st, DT);
  frames++;
  
  if (st.ball.owner !== null) {
    const p = st.pl[st.ball.owner];
    const ax = p.pos.x * (-p.team);
    const gc = { x: -p.team * P.pitchHalfW, y: 0 };
    const dx = p.pos.x - gc.x;
    const dy = p.pos.y - gc.y;
    const distToGoal = Math.sqrt(dx*dx + dy*dy);
    
    if (ax > maxCarrierAx) maxCarrierAx = ax;
    if (distToGoal < minCarrierDistToGoal) minCarrierDistToGoal = distToGoal;
    if (distToGoal > maxCarrierDistToGoal) maxCarrierDistToGoal = distToGoal;
    
    if (ax >= P.pitchHalfW * 0.4) phaseBFrames++;
    if (distToGoal < 38.0) shotRangeFrames++;
  }
}

process.stderr.write(`=== DEBUG RESULTS ===\n`);
process.stderr.write(`Total frames: ${frames}\n`);
process.stderr.write(`Max carrier ax: ${maxCarrierAx.toFixed(2)} (Phase B threshold: ${(P.pitchHalfW * 0.4).toFixed(2)})\n`);
process.stderr.write(`Min carrier dist to goal: ${minCarrierDistToGoal.toFixed(2)} (shotRange: 38.0)\n`);
process.stderr.write(`Phase B frames (carrier in attacking half): ${phaseBFrames}\n`);
process.stderr.write(`Shot range frames (dist < 38m): ${shotRangeFrames}\n`);
process.stderr.write(`Shots: ${JSON.stringify(st.stats.shotsTotal)}\n`);
process.stderr.write(`Score: ${st.scoreBlue}-${st.scoreRed}\n`);
