// Pass balance diagnostic - verify pass success rates haven't degraded
import { mkState, update, doKickOff } from '../client/src/game/engine';
import { P } from '../client/src/game/constants';

const st = mkState("4-4-2", "4-4-2");
doKickOff(st);
const DT = 1 / 60;
const TOTAL_FRAMES = 60 * 120; // Full 120-second match

// Track pass statistics
let passAttempts = 0;
let passToIntended = 0;
let passToTeammate = 0;
let passIntercepted = 0;
let selfPasses = 0;
let avgPassDist = 0;
let passDistCount = 0;

// Track possession
let blueFrames = 0;
let redFrames = 0;
let freeFrames = 0;

// Track goals
let blueGoals = 0;
let redGoals = 0;

const prevSL = st.sL;
const prevSR = st.sR;

for (let f = 0; f < TOTAL_FRAMES; f++) {
  const prevKickSeq = st.ball.kickSeq;
  const prevKickKind = st.ball.kickKind;
  const prevIntended = st.ball.intendedReceiverIdx;
  const prevKickTeam = st.ball.kickTeam;
  const prevKicker = st.ball.lastKickerIdx;
  
  update(st, DT);
  
  // Track possession
  if (st.ball.owner !== null) {
    if (st.pl[st.ball.owner].team === -1) blueFrames++;
    else redFrames++;
  } else {
    freeFrames++;
  }
  
  // Detect new kick
  if (st.ball.kickSeq !== prevKickSeq && st.ball.kickKind === "PASS") {
    passAttempts++;
  }
  
  // Detect pass completion (ball picked up after a PASS kick)
  if (st.ball.owner !== null && prevKickSeq > 0) {
    const receiver = st.pl[st.ball.owner];
    if (st.ball.kickKind === "PASS" && st.ball.kickActive) {
      // Pass was just received
      if (receiver.team === st.ball.kickTeam) {
        // Teammate received
        if (st.ball.owner === st.ball.lastKickerIdx) {
          selfPasses++;
        } else if (st.ball.intendedReceiverIdx !== null && st.ball.owner === st.ball.intendedReceiverIdx) {
          passToIntended++;
        } else {
          passToTeammate++;
        }
      } else {
        passIntercepted++;
      }
    }
  }
}

// Get stats from engine
const stats = st.stats;
const totalPassAttempts = stats.passAttempts.blue + stats.passAttempts.red;
const totalPassSuccess = stats.passSuccess.blue + stats.passSuccess.red;
const totalPassToIntended = stats.passToIntended.blue + stats.passToIntended.red;
const totalPossFrames = stats.possessionFrames.blue + stats.possessionFrames.red;

console.log("=== PASS BALANCE DIAGNOSTIC (v9.12.0) ===");
console.log(`Match duration: ${st.time.toFixed(1)}s`);
console.log(`Score: Blue ${st.sL} - ${st.sR} Red`);
console.log();
console.log("--- PASS STATISTICS ---");
console.log(`  Pass attempts: Blue=${stats.passAttempts.blue}, Red=${stats.passAttempts.red}, Total=${totalPassAttempts}`);
console.log(`  Pass success: Blue=${stats.passSuccess.blue}, Red=${stats.passSuccess.red}, Total=${totalPassSuccess}`);
console.log(`  Pass to intended: Blue=${stats.passToIntended.blue}, Red=${stats.passToIntended.red}, Total=${totalPassToIntended}`);
if (totalPassAttempts > 0) {
  console.log(`  Success rate: ${(totalPassSuccess / totalPassAttempts * 100).toFixed(1)}%`);
  console.log(`  Intended rate: ${(totalPassToIntended / totalPassAttempts * 100).toFixed(1)}%`);
}
console.log();
console.log("--- POSSESSION ---");
const totalFrames = blueFrames + redFrames + freeFrames;
console.log(`  Blue: ${(blueFrames / totalFrames * 100).toFixed(1)}%`);
console.log(`  Red: ${(redFrames / totalFrames * 100).toFixed(1)}%`);
console.log(`  Free: ${(freeFrames / totalFrames * 100).toFixed(1)}%`);
console.log();
console.log("--- SHOTS ---");
console.log(`  Blue: ${stats.shotsTotal.blue} total, ${stats.shotsOnTarget.blue} on target`);
console.log(`  Red: ${stats.shotsTotal.red} total, ${stats.shotsOnTarget.red} on target`);
console.log();
console.log("--- DRIBBLES ---");
console.log(`  Blue: ${stats.dribbleAttempts.blue} attempts, ${stats.dribbleSuccess.blue} success`);
console.log(`  Red: ${stats.dribbleAttempts.red} attempts, ${stats.dribbleSuccess.red} success`);
console.log();
console.log("--- LONG PASSES ---");
console.log(`  Blue: ${stats.longPassAttempts.blue}, Red: ${stats.longPassAttempts.red}`);
console.log();
console.log("--- POSSESSION PUSH ---");
console.log(`  Team: ${st.possessionPush.team}, Duration: ${st.possessionPush.duration.toFixed(1)}s, Level: ${st.possessionPush.pushLevel.toFixed(2)}`);
