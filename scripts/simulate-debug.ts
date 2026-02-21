import { mkState, doKickOff, update } from '../client/src/game/engine';
import { P } from '../client/src/game/constants';

const DT = 1 / 60;
const STEPS_PER_MATCH = Math.ceil(P.matchDuration / DT);

console.log(`Running 1 debug match...`);
console.log(`Match Duration: ${P.matchDuration} seconds (${STEPS_PER_MATCH} steps)`);
console.log("--------------------------------------------------\n");

const st = mkState();
doKickOff(st);

let lastOwner: number | null = null;
let ownershipChanges = 0;
let blueFrames = 0;
let redFrames = 0;
let noneFrames = 0;

for (let step = 0; step < STEPS_PER_MATCH; step++) {
  update(st, DT);

  // Track ownership changes
  if (st.ball.owner !== lastOwner) {
    ownershipChanges++;
    const ownerTeam = st.ball.owner !== null 
      ? (st.ball.owner <= 10 ? "BLUE" : "RED")
      : "NONE";
    const ownerName = st.ball.owner !== null
      ? `Player ${st.ball.owner} (${st.pl[st.ball.owner].role})`
      : "Free ball";
    
    if (ownershipChanges <= 20) {  // Only print first 20 changes
      console.log(`[${st.time.toFixed(2)}s] Ownership: ${ownerTeam} - ${ownerName}`);
    }
    lastOwner = st.ball.owner;
  }

  // Count possession frames
  if (st.ball.owner !== null) {
    if (st.ball.owner <= 10) blueFrames++;
    else redFrames++;
  } else {
    noneFrames++;
  }

  // Print goals
  if (st.sL + st.sR > 0 && step > 0) {
    const prevScore = Math.floor((st.sL + st.sR - 1));
    if (Math.floor(st.sL + st.sR) > prevScore) {
      console.log(`\n⚽ GOAL! Score: BLUE ${st.sL} - ${st.sR} RED\n`);
    }
  }
}

console.log("\n==================================================");
console.log("📊 DEBUG RESULTS");
console.log("==================================================");
console.log(`Final Score: BLUE ${st.sL} - ${st.sR} RED`);
console.log(`Ownership Changes: ${ownershipChanges}`);
console.log(`Possession Frames: Blue ${blueFrames}, Red ${redFrames}, None ${noneFrames}`);
console.log(`Possession %: Blue ${((blueFrames / (blueFrames + redFrames)) * 100).toFixed(1)}%, Red ${((redFrames / (blueFrames + redFrames)) * 100).toFixed(1)}%`);
console.log("==================================================");
