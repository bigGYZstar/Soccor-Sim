// Diagnostic: Test 45-min half match system
import { mkState, update } from "../client/src/game/engine";
import type { State } from "../client/src/game/types";

const st = mkState("4-4-2", "4-4-2");
const dt = 1/60;

console.log("=== Match System Diagnostic ===");
console.log(`Initial: half=${st.half}, matchClock=${st.matchClock}, matchPhase=${st.matchPhase}`);
console.log(`Initial: scoreBlue=${st.scoreBlue}, scoreRed=${st.scoreRed}, sL=${st.sL}, sR=${st.sR}`);
console.log(`Blue team[0]: team=${st.pl[0].team}, home=(${st.pl[0].home.x.toFixed(1)}, ${st.pl[0].home.y.toFixed(1)})`);
console.log(`Red team[11]: team=${st.pl[11].team}, home=(${st.pl[11].home.x.toFixed(1)}, ${st.pl[11].home.y.toFixed(1)})`);

// Run until halftime
let halftimeReached = false;
let fulltimeReached = false;
let maxIter = 0;

for (let i = 0; i < 1000000 && !halftimeReached; i++) {
  update(st, dt);
  maxIter = i;
  if (st.halftimeShow) {
    halftimeReached = true;
    console.log(`\n=== HALFTIME at iter=${i}, time=${st.time.toFixed(1)}s, matchClock=${st.matchClock.toFixed(1)} ===`);
    console.log(`Score: scoreBlue=${st.scoreBlue}, scoreRed=${st.scoreRed}, sL=${st.sL}, sR=${st.sR}`);
    console.log(`Blue team[0]: team=${st.pl[0].team}, home=(${st.pl[0].home.x.toFixed(1)}, ${st.pl[0].home.y.toFixed(1)})`);
    console.log(`Red team[11]: team=${st.pl[11].team}, home=(${st.pl[11].home.x.toFixed(1)}, ${st.pl[11].home.y.toFixed(1)})`);
    break;
  }
}

if (!halftimeReached) {
  console.log(`\nHalftime NOT reached after ${maxIter} iterations, time=${st.time.toFixed(1)}s, matchClock=${st.matchClock.toFixed(1)}`);
  console.log(`half=${st.half}, halftimeDone=${st.halftimeDone}, over=${st.over}`);
}

// Continue through halftime
for (let i = 0; i < 10000; i++) {
  update(st, dt);
  if (!st.halftimeShow && st.half === 2) {
    console.log(`\n=== SECOND HALF STARTED at iter after HT, time=${st.time.toFixed(1)}s, matchClock=${st.matchClock.toFixed(1)} ===`);
    console.log(`Score: scoreBlue=${st.scoreBlue}, scoreRed=${st.scoreRed}, sL=${st.sL}, sR=${st.sR}`);
    console.log(`Blue team[0]: team=${st.pl[0].team}, home=(${st.pl[0].home.x.toFixed(1)}, ${st.pl[0].home.y.toFixed(1)})`);
    console.log(`Red team[11]: team=${st.pl[11].team}, home=(${st.pl[11].home.x.toFixed(1)}, ${st.pl[11].home.y.toFixed(1)})`);
    console.log(`matchPhase=${st.matchPhase}, kickoffReady=${st.kickoffReady}`);
    break;
  }
}

// Run until fulltime
for (let i = 0; i < 1000000 && !fulltimeReached; i++) {
  update(st, dt);
  if (st.over) {
    fulltimeReached = true;
    console.log(`\n=== FULL TIME at time=${st.time.toFixed(1)}s, matchClock=${st.matchClock.toFixed(1)} ===`);
    console.log(`Final Score: scoreBlue=${st.scoreBlue}, scoreRed=${st.scoreRed}`);
    console.log(`sL=${st.sL}, sR=${st.sR}`);
    break;
  }
}

if (!fulltimeReached) {
  console.log(`\nFulltime NOT reached, time=${st.time.toFixed(1)}s, matchClock=${st.matchClock.toFixed(1)}, over=${st.over}`);
}
