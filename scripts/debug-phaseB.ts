import { mkState, update, doKickOff } from '../client/src/game/engine';
import type { FormationId } from '../client/src/game/constants';

const DT = 1 / 60;
const MAX_FRAMES = 60 * 60 * 5; // 5 minutes only

const st = mkState('4-4-2' as FormationId, '4-4-2' as FormationId);
doKickOff(st);

let frames = 0;
let maxAx = -Infinity;
let minAx = Infinity;
let maxBallX = -Infinity;
let minBallX = Infinity;

while (!st.over && frames < MAX_FRAMES) {
  update(st, DT);
  frames++;
  
  // Track ball position
  if (st.ball.pos.x > maxBallX) maxBallX = st.ball.pos.x;
  if (st.ball.pos.x < minBallX) minBallX = st.ball.pos.x;
  
  // Track player ax values for ball carrier
  if (st.ball.owner !== null) {
    const p = st.pl[st.ball.owner];
    const ax = p.pos.x * (-p.team);
    if (ax > maxAx) maxAx = ax;
    if (ax < minAx) minAx = ax;
  }
}

process.stderr.write(`Frames: ${frames}\n`);
process.stderr.write(`Ball X range: ${minBallX.toFixed(2)} to ${maxBallX.toFixed(2)}\n`);
process.stderr.write(`Carrier ax range: ${minAx.toFixed(2)} to ${maxAx.toFixed(2)}\n`);
process.stderr.write(`pitchHalfW: 52.5 (expected)\n`);
process.stderr.write(`Phase B threshold (2/3 of 52.5): ${(2/3 * 52.5).toFixed(2)}\n`);
process.stderr.write(`Shots: ${JSON.stringify(st.stats.shotsTotal)}\n`);
process.stderr.write(`Passes: ${JSON.stringify(st.stats.passAttempts)}\n`);
