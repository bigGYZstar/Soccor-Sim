/**
 * v9.7.1 Pass Pair Diagnostic
 * Tracks every pass event: who kicked, who received, distance, time in flight
 * Detects "self-passes" where the kicker picks the ball back up
 */
import { mkState, doKickOff, update } from '../client/src/game/engine';
import { P } from '../client/src/game/constants';
import { vdist, vlen } from '../client/src/game/math';
import { State, Ball } from '../client/src/game/types';

const DT = 1 / 60;
const MATCH_STEPS = Math.ceil(P.matchDuration * 60);

interface PassEvent {
  time: number;
  kickerIdx: number;
  kickerTeam: number;
  kickerRole: string;
  intendedIdx: number | null;
  receiverIdx: number | null;
  receiverTeam: number | null;
  receiverRole: string | null;
  distance: number;
  flightTime: number;
  isSelfPass: boolean;  // Kicker picked it back up
  isIntercepted: boolean;  // Enemy picked it up
  isToIntended: boolean;  // Reached intended target
  isToOtherTeammate: boolean;  // Reached different teammate
  kickKind: string;
}

console.log(`Running pass pair diagnostic (${P.matchDuration}s match)...`);
console.log("--------------------------------------------------\n");

const st = mkState();
doKickOff(st);

const passEvents: PassEvent[] = [];

// Track active kicks
let activeKick: {
  kickerIdx: number;
  kickerTeam: number;
  kickerRole: string;
  intendedIdx: number | null;
  kickTime: number;
  kickPos: { x: number; y: number };
  kickKind: string;
} | null = null;

let prevKickSeq = 0;
let prevOwner: number | null = null;

for (let step = 0; step < MATCH_STEPS; step++) {
  // Snapshot before update
  const prevBallOwner = st.ball.owner;
  const prevKickSeqLocal = st.ball.kickSeq;
  
  update(st, DT);
  
  // Detect new kick
  if (st.ball.kickSeq !== prevKickSeqLocal && st.ball.kickKind !== "SHOT") {
    const kickerIdx = st.ball.lastKickerIdx;
    if (kickerIdx >= 0 && kickerIdx < st.pl.length) {
      const kicker = st.pl[kickerIdx];
      activeKick = {
        kickerIdx,
        kickerTeam: kicker.team,
        kickerRole: kicker.role,
        intendedIdx: st.ball.intendedReceiverIdx,
        kickTime: st.time,
        kickPos: { ...kicker.pos },
        kickKind: st.ball.kickKind || "PASS",
      };
    }
  }
  
  // Detect ball pickup (ownership change from free to owned)
  if (activeKick && st.ball.owner !== null && prevBallOwner === null) {
    const receiver = st.pl[st.ball.owner];
    const flightTime = st.time - activeKick.kickTime;
    const distance = vdist(activeKick.kickPos, receiver.pos);
    
    const isSelfPass = st.ball.owner === activeKick.kickerIdx;
    const isIntercepted = receiver.team !== activeKick.kickerTeam;
    const isToIntended = st.ball.owner === activeKick.intendedIdx;
    const isToOtherTeammate = !isSelfPass && !isIntercepted && !isToIntended;
    
    passEvents.push({
      time: st.time,
      kickerIdx: activeKick.kickerIdx,
      kickerTeam: activeKick.kickerTeam,
      kickerRole: activeKick.kickerRole,
      intendedIdx: activeKick.intendedIdx,
      receiverIdx: st.ball.owner,
      receiverTeam: receiver.team,
      receiverRole: receiver.role,
      distance,
      flightTime,
      isSelfPass,
      isIntercepted,
      isToIntended,
      isToOtherTeammate,
      kickKind: activeKick.kickKind,
    });
    
    activeKick = null;
  }
  
  // Timeout: if kick has been active for > 3s, it's lost
  if (activeKick && (st.time - activeKick.kickTime) > 3.0) {
    passEvents.push({
      time: st.time,
      kickerIdx: activeKick.kickerIdx,
      kickerTeam: activeKick.kickerTeam,
      kickerRole: activeKick.kickerRole,
      intendedIdx: activeKick.intendedIdx,
      receiverIdx: null,
      receiverTeam: null,
      receiverRole: null,
      distance: 0,
      flightTime: 3.0,
      isSelfPass: false,
      isIntercepted: false,
      isToIntended: false,
      isToOtherTeammate: false,
      kickKind: activeKick.kickKind,
    });
    activeKick = null;
  }
}

// Analysis
console.log("==================================================");
console.log("📊 PASS PAIR DIAGNOSTIC RESULTS");
console.log("==================================================\n");

console.log(`Final Score: BLUE ${st.sL} - ${st.sR} RED`);
console.log(`Total pass events tracked: ${passEvents.length}\n`);

const selfPasses = passEvents.filter(e => e.isSelfPass);
const intercepted = passEvents.filter(e => e.isIntercepted);
const toIntended = passEvents.filter(e => e.isToIntended);
const toOtherTeammate = passEvents.filter(e => e.isToOtherTeammate);
const lost = passEvents.filter(e => e.receiverIdx === null);

console.log("--- Pass Outcome Distribution ---");
console.log(`Self-passes (kicker picks up again): ${selfPasses.length} (${(selfPasses.length/passEvents.length*100).toFixed(1)}%)`);
console.log(`To intended receiver: ${toIntended.length} (${(toIntended.length/passEvents.length*100).toFixed(1)}%)`);
console.log(`To other teammate: ${toOtherTeammate.length} (${(toOtherTeammate.length/passEvents.length*100).toFixed(1)}%)`);
console.log(`Intercepted by enemy: ${intercepted.length} (${(intercepted.length/passEvents.length*100).toFixed(1)}%)`);
console.log(`Lost (timeout): ${lost.length} (${(lost.length/passEvents.length*100).toFixed(1)}%)\n`);

console.log("--- Self-Pass Details ---");
if (selfPasses.length > 0) {
  const avgFlightSelf = selfPasses.reduce((a, b) => a + b.flightTime, 0) / selfPasses.length;
  const avgDistSelf = selfPasses.reduce((a, b) => a + b.distance, 0) / selfPasses.length;
  console.log(`Average flight time: ${avgFlightSelf.toFixed(3)}s`);
  console.log(`Average distance: ${avgDistSelf.toFixed(2)}m`);
  console.log(`\nFirst 10 self-passes:`);
  selfPasses.slice(0, 10).forEach((e, i) => {
    console.log(`  ${i+1}. t=${e.time.toFixed(1)}s, Player ${e.kickerIdx} (${e.kickerRole}), intended=${e.intendedIdx}, flight=${e.flightTime.toFixed(3)}s, dist=${e.distance.toFixed(2)}m, kind=${e.kickKind}`);
  });
}

console.log("\n--- Genuine Passes (to intended) Details ---");
if (toIntended.length > 0) {
  const avgFlightGenuine = toIntended.reduce((a, b) => a + b.flightTime, 0) / toIntended.length;
  const avgDistGenuine = toIntended.reduce((a, b) => a + b.distance, 0) / toIntended.length;
  console.log(`Average flight time: ${avgFlightGenuine.toFixed(3)}s`);
  console.log(`Average distance: ${avgDistGenuine.toFixed(2)}m`);
  console.log(`\nFirst 10 genuine passes:`);
  toIntended.slice(0, 10).forEach((e, i) => {
    console.log(`  ${i+1}. t=${e.time.toFixed(1)}s, Player ${e.kickerIdx}(${e.kickerRole}) → Player ${e.receiverIdx}(${e.receiverRole}), dist=${e.distance.toFixed(2)}m, flight=${e.flightTime.toFixed(3)}s`);
  });
}

console.log("\n--- By Kick Kind ---");
const kinds = ["PASS", "LONG"];
for (const kind of kinds) {
  const subset = passEvents.filter(e => e.kickKind === kind);
  const selfCount = subset.filter(e => e.isSelfPass).length;
  const genuineCount = subset.filter(e => e.isToIntended || e.isToOtherTeammate).length;
  const interceptCount = subset.filter(e => e.isIntercepted).length;
  console.log(`${kind}: total=${subset.length}, self=${selfCount} (${(selfCount/Math.max(1,subset.length)*100).toFixed(1)}%), genuine=${genuineCount} (${(genuineCount/Math.max(1,subset.length)*100).toFixed(1)}%), intercepted=${interceptCount}`);
}

// Ownership change tracking
console.log("\n--- Ownership Changes ---");
console.log(`Engine stats - Pass attempts: BLUE ${st.stats.passAttempts.blue}, RED ${st.stats.passAttempts.red}`);
console.log(`Engine stats - Pass success: BLUE ${st.stats.passSuccess.blue}, RED ${st.stats.passSuccess.red}`);
console.log(`Engine stats - Pass to intended: BLUE ${st.stats.passToIntended.blue}, RED ${st.stats.passToIntended.red}`);
console.log(`Engine stats - Pass recovered: BLUE ${st.stats.passRecovered.blue}, RED ${st.stats.passRecovered.red}`);

console.log("\n==================================================");
console.log("DIAGNOSIS: If self-pass rate > 20%, the kicker is");
console.log("re-intercepting the ball before it reaches the target.");
console.log("Fix: Increase cooldown, increase pass speed, or");
console.log("exclude kicker from interception for longer.");
console.log("==================================================");
