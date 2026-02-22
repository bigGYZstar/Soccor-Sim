import { mkState, doKickOff, update } from '../client/src/game/engine';

const st = mkState();
doKickOff(st, -1);

const DT = 1/60;
const STEPS = Math.ceil(60 / DT); // 60 seconds

console.log('Running 60-second match to check FW positions...');
console.log('Pitch thirds: DEF < -6.66, MID: -6.66 to 6.66, ATT > 6.66');
console.log('');

for (let step = 0; step < STEPS; step++) {
  update(st, DT);
  
  // Log FW positions every 5 seconds
  if (step % 300 === 0) {
    const blueFWs = st.pl.filter(p => p.team === -1 && p.role === 'FWD');
    const time = (step * DT).toFixed(1);
    console.log(`[t=${time}s] Blue FWs:`);
    for (const fw of blueFWs) {
      const zone = fw.pos.x < -6.66 ? 'DEF' : (fw.pos.x > 6.66 ? 'ATT' : 'MID');
      console.log(`  P${fw.idx}: (${fw.pos.x.toFixed(1)}, ${fw.pos.y.toFixed(1)}) - ${zone}`);
    }
  }
}

console.log(`\nFinal score: Blue ${st.sL} - ${st.sR} Red`);
