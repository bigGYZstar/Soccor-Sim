// Debug progressive pass tracking
import { mkState, update, doKickOff } from '../client/src/game/engine';

const st = mkState('4-4-2', '4-4-2');
doKickOff(st, -1);
let totalPasses = 0;
let totalProgPasses = 0;

for (let i = 0; i < 5000; i++) {
  update(st);
}

for (const ps of st.stats.playerStats) {
  totalPasses += ps.passes;
  totalProgPasses += ps.progPasses;
}

console.log(`Total passes: ${totalPasses}`);
console.log(`Total prog passes: ${totalProgPasses}`);
console.log(`Sample player stats:`, st.stats.playerStats.slice(0, 3).map(ps => ({
  idx: ps.playerIdx,
  passes: ps.passes,
  progPasses: ps.progPasses,
  longPasses: ps.longPasses,
})));
