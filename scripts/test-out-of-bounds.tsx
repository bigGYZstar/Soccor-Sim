import { mkState, doKickOff, update } from '../client/src/game/engine';
import { P } from '../client/src/game/constants';

console.log("Testing out-of-bounds detection...\n");

const st = mkState();
doKickOff(st, -1);

// Force ball to go out of bounds
st.ball.pos = { x: 0, y: 7.0 }; // Beyond pitchHalfH (6.8)
st.ball.vel = { x: 0, y: 1.0 };
st.ball.free = true;
st.ball.lastTouchTeam = -1;

console.log(`Initial ball position: (${st.ball.pos.x.toFixed(2)}, ${st.ball.pos.y.toFixed(2)})`);
console.log(`pitchHalfH: ${P.pitchHalfH}`);
console.log(`Should trigger throw-in when |y| > ${P.pitchHalfH + 0.02}\n`);

for (let i = 0; i < 10; i++) {
  update(st, 1/60);
  console.log(`Step ${i+1}: pos=(${st.ball.pos.x.toFixed(2)}, ${st.ball.pos.y.toFixed(2)}), paused=${st.paused}, setPieceRestart=${st.setPieceRestart?.kind || 'null'}`);
  
  if (st.paused) {
    console.log(`\n✅ Out-of-bounds detected! setPieceRestart:`, st.setPieceRestart);
    console.log(`Stats:`, st.stats);
    break;
  }
}

if (!st.paused) {
  console.log(`\n❌ Out-of-bounds NOT detected after 10 steps`);
  console.log(`Final ball position: (${st.ball.pos.x.toFixed(2)}, ${st.ball.pos.y.toFixed(2)})`);
  console.log(`Stats:`, st.stats);
}
