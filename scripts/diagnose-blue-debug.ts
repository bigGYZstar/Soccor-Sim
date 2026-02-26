// Debug Blue team inactivity
import { mkState, update } from '../client/src/game/engine';
import { vdist, vlen } from '../client/src/game/math';
import { P } from '../client/src/game/constants';

const st = mkState("4-4-2", "4-4-2");
const DT = 1 / 60;

// Run 5 seconds and log every 0.5s
for (let f = 0; f < 60 * 5; f++) {
  update(st, DT);
  
  if (f % 30 === 0) {
    const t = (f / 60).toFixed(2);
    const owner = st.ball.owner !== null ? `#${st.pl[st.ball.owner].num}(${st.pl[st.ball.owner].team === -1 ? 'B' : 'R'})` : 'none';
    const ballFree = st.ball.free ? 'FREE' : 'HELD';
    const ballPos = `(${st.ball.pos.x.toFixed(1)},${st.ball.pos.y.toFixed(1)})`;
    const ballVel = vlen(st.ball.vel).toFixed(1);
    
    console.log(`t=${t}s: ball=${ballFree} owner=${owner} pos=${ballPos} vel=${ballVel}`);
    
    // Log Blue team (team=-1, indices 0-10) positions
    const bluePlayers = st.pl.filter(p => p.team === -1);
    for (const p of bluePlayers) {
      const distToBall = vdist(p.pos, st.ball.pos).toFixed(1);
      const vel = vlen(p.vel).toFixed(1);
      console.log(`  Blue #${p.num}(${p.posLabel}): pos=(${p.pos.x.toFixed(1)},${p.pos.y.toFixed(1)}) tgt=(${p.tgt.x.toFixed(1)},${p.tgt.y.toFixed(1)}) act=${p.act} vel=${vel} distBall=${distToBall}`);
    }
  }
}
