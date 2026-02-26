// v9.15.0 comprehensive diagnostic
import { mkState, update, doKickOff } from '../client/src/game/engine';

const DT = 1 / 60;
const MATCH_FRAMES = 60 * 60 * 3; // 3 minutes
const NUM_MATCHES = 3;

interface MatchResult {
  trapFailures: number;
  trapSuccesses: number;
  lobBounces: number;
  longPasses: number;
  shortPasses: number;
  forwardPasses: number;
  backwardPasses: number;
  maxForwardBlue: number;
  maxForwardRed: number;
  widePlayerPassesReceived: number;
  widePlayerForwardRuns: number;
}

const results: MatchResult[] = [];

for (let m = 0; m < NUM_MATCHES; m++) {
  const st = mkState("4-4-2", "4-4-2", 1);
  doKickOff(st);
  
  const result: MatchResult = {
    trapFailures: 0,
    trapSuccesses: 0,
    lobBounces: 0,
    longPasses: 0,
    shortPasses: 0,
    forwardPasses: 0,
    backwardPasses: 0,
    maxForwardBlue: 0,
    maxForwardRed: 0,
    widePlayerPassesReceived: 0,
    widePlayerForwardRuns: 0,
  };
  
  let prevOwner: number | null = null;
  let prevBallFree = true;
  let prevBallZ = 0;
  
  for (let f = 0; f < MATCH_FRAMES; f++) {
    const prevPos = { ...st.ball.pos };
    const prevVel = st.ball.vel ? { ...st.ball.vel } : { x: 0, y: 0 };
    
    update(st, DT);
    
    // Track trap events: ball was free and now has owner
    if (prevBallFree && !st.ball.free && st.ball.owner !== null) {
      result.trapSuccesses++;
    }
    
    // Track lob bounces: ball z was > 0.3 and now is 0
    if (prevBallZ > 0.3 && st.ball.z <= 0.01) {
      result.lobBounces++;
    }
    
    // Track max forward positions
    for (const p of st.pl) {
      const ax = p.pos.x * (-p.team);
      if (p.team === -1 && ax > result.maxForwardBlue) result.maxForwardBlue = ax;
      if (p.team === 1 && ax > result.maxForwardRed) result.maxForwardRed = ax;
    }
    
    // Track wide player forward runs (wantsBall while ahead of carrier)
    if (st.ball.owner !== null) {
      const carrier = st.pl[st.ball.owner];
      for (const p of st.pl) {
        if (p.team !== carrier.team) continue;
        if (p.idx === carrier.idx) continue;
        const isWide = Math.abs(p.home.y) > 15.0;
        if (isWide && p.wantsBall) {
          const pAx = p.pos.x * (-p.team);
          const cAx = carrier.pos.x * (-carrier.team);
          if (pAx > cAx + 3.0) {
            result.widePlayerForwardRuns++;
          }
        }
      }
    }
    
    prevOwner = st.ball.owner;
    prevBallFree = st.ball.free;
    prevBallZ = st.ball.z;
  }
  
  // Get stats from match
  result.longPasses = st.stats.longPassAttempts.blue + st.stats.longPassAttempts.red;
  result.shortPasses = st.stats.passAttempts.blue + st.stats.passAttempts.red;
  
  // Count trap failures from action log (approximate - log entries get trimmed)
  // Use the stats instead
  const totalPassSuccess = st.stats.passSuccess.blue + st.stats.passSuccess.red 
    + st.stats.longPassSuccess.blue + st.stats.longPassSuccess.red;
  const totalPassAttempts = st.stats.passAttempts.blue + st.stats.passAttempts.red
    + st.stats.longPassAttempts.blue + st.stats.longPassAttempts.red;
  
  results.push(result);
  
  console.log(`\n=== Match ${m + 1} ===`);
  console.log(`Short passes: ${st.stats.passAttempts.blue + st.stats.passAttempts.red}`);
  console.log(`Long passes: ${st.stats.longPassAttempts.blue + st.stats.longPassAttempts.red}`);
  console.log(`Pass success: ${totalPassSuccess}/${totalPassAttempts} (${totalPassAttempts > 0 ? (totalPassSuccess/totalPassAttempts*100).toFixed(1) : 0}%)`);
  console.log(`Lob bounces detected: ${result.lobBounces}`);
  console.log(`Trap successes (free→owned): ${result.trapSuccesses}`);
  console.log(`Max forward Blue: ${result.maxForwardBlue.toFixed(1)}m`);
  console.log(`Max forward Red: ${result.maxForwardRed.toFixed(1)}m`);
  console.log(`Wide player forward runs (frames): ${result.widePlayerForwardRuns}`);
  console.log(`Shots: ${st.stats.shotsTotal.blue + st.stats.shotsTotal.red}`);
  console.log(`Interceptions: ${st.stats.interceptions.blue + st.stats.interceptions.red}`);
  
  // Check action log for foot info and position labels
  console.log(`\nLast action log entries:`);
  for (const entry of st.actionLog.slice(-5)) {
    console.log(`  [${entry.playerRole}] ${entry.detail}`);
  }
}

// Summary
console.log(`\n=== SUMMARY (${NUM_MATCHES} matches) ===`);
const avgLong = results.reduce((s, r) => s + r.longPasses, 0) / NUM_MATCHES;
const avgShort = results.reduce((s, r) => s + r.shortPasses, 0) / NUM_MATCHES;
const avgBounces = results.reduce((s, r) => s + r.lobBounces, 0) / NUM_MATCHES;
const avgTraps = results.reduce((s, r) => s + r.trapSuccesses, 0) / NUM_MATCHES;
const avgFwdBlue = results.reduce((s, r) => s + r.maxForwardBlue, 0) / NUM_MATCHES;
const avgFwdRed = results.reduce((s, r) => s + r.maxForwardRed, 0) / NUM_MATCHES;
const avgWideRuns = results.reduce((s, r) => s + r.widePlayerForwardRuns, 0) / NUM_MATCHES;

console.log(`Avg short passes/match: ${avgShort.toFixed(1)}`);
console.log(`Avg long passes/match: ${avgLong.toFixed(1)}`);
console.log(`Avg lob bounces/match: ${avgBounces.toFixed(1)}`);
console.log(`Avg trap successes/match: ${avgTraps.toFixed(1)}`);
console.log(`Avg max forward Blue: ${avgFwdBlue.toFixed(1)}m`);
console.log(`Avg max forward Red: ${avgFwdRed.toFixed(1)}m`);
console.log(`Avg wide player forward run frames: ${avgWideRuns.toFixed(0)}`);
