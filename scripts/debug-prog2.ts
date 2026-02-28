import { mkState, doKickOff, update } from '../client/src/game/engine';
import { FORMATIONS } from '../client/src/game/constants';

const DT = 1/60;
const TOTAL_FRAMES = 5000;

const st = mkState('4-4-2', '4-4-2');
doKickOff(st);

let totalPasses = 0;
let totalProgPasses = 0;

for (let f = 0; f < TOTAL_FRAMES; f++) {
  update(st, DT);
}

for (const ps of st.stats.playerStats) {
  totalPasses += ps.passes;
  totalProgPasses += ps.progPasses;
}

console.log('Total passes:', totalPasses);
console.log('Total prog passes:', totalProgPasses);
console.log('Per player:');
for (let i = 0; i < Math.min(5, st.stats.playerStats.length); i++) {
  const ps = st.stats.playerStats[i];
  console.log(`  idx=${i}: passes=${ps.passes}, progPasses=${ps.progPasses}`);
}
