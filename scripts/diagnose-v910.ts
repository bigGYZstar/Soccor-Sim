// v9.10.0 Diagnostic: MF-centric passing, progressive line push, secondary movement
import { mkState, update } from "../client/src/game/engine.js";

const DT = 1 / 60;
const MATCH_SECONDS = 90;
const TOTAL_FRAMES = Math.ceil(MATCH_SECONDS / DT);

const st = mkState("4-4-2", "4-4-2");

// Track pass pairs by role
const passMatrix: Record<string, Record<string, number>> = {};
const roles = ["GK", "DEF", "MID", "FWD"];
for (const from of roles) for (const to of roles) {
  if (!passMatrix[from]) passMatrix[from] = {};
  passMatrix[from][to] = 0;
}

let mfPassesSent = 0;
let mfPassesReceived = 0;
let fwdToDefDirect = 0;
let totalCompletedPasses = 0;

// Track possession push
let pushSamples: number[] = [];
let maxPush = 0;

// Track pass chains
let currentChain: string[] = [];
let longestChain = 0;
let chains: number[] = [];

// Track kicks in flight
let lastKickSeq = 0;
let lastKickerIdx = -1;
let lastKickerRole = "";

for (let f = 0; f < TOTAL_FRAMES; f++) {
  update(st, DT);
  
  // Track possession push every second
  if (f % 60 === 0) {
    pushSamples.push(st.possessionPush.pushLevel);
    maxPush = Math.max(maxPush, st.possessionPush.pushLevel);
  }
  
  // Detect new kick
  if (st.ball.kickSeq !== lastKickSeq) {
    lastKickSeq = st.ball.kickSeq;
    lastKickerIdx = st.ball.lastKickerIdx;
    if (lastKickerIdx >= 0 && lastKickerIdx < st.pl.length) {
      lastKickerRole = st.pl[lastKickerIdx].role;
      if (lastKickerRole === "MID" && st.ball.kickKind === "PASS") mfPassesSent++;
    }
  }
  
  // Detect pass completion: ball was free (kicked), now someone owns it
  if (st.ball.owner !== null && st.ball.kickActive === false && lastKickerIdx >= 0) {
    const receiver = st.pl[st.ball.owner];
    const kicker = st.pl[lastKickerIdx];
    
    if (kicker && receiver && kicker.team === receiver.team && kicker.idx !== receiver.idx) {
      // Genuine teammate pass completion
      const fromRole = kicker.role;
      const toRole = receiver.role;
      
      if (passMatrix[fromRole]?.[toRole] !== undefined) {
        passMatrix[fromRole][toRole]++;
        totalCompletedPasses++;
        
        if (toRole === "MID") mfPassesReceived++;
        if (fromRole === "FWD" && toRole === "DEF") fwdToDefDirect++;
        
        // Track chain
        const label = `#${kicker.num}(${fromRole})→#${receiver.num}(${toRole})`;
        currentChain.push(label);
      }
      
      lastKickerIdx = -1; // Reset to avoid double counting
    } else if (kicker && receiver && (kicker.team !== receiver.team || kicker.idx === receiver.idx)) {
      // Chain broken (interception or self-pass)
      if (currentChain.length > 1) {
        chains.push(currentChain.length);
        longestChain = Math.max(longestChain, currentChain.length);
      }
      currentChain = [];
      lastKickerIdx = -1;
    }
  }
}

// Final chain
if (currentChain.length > 1) {
  chains.push(currentChain.length);
  longestChain = Math.max(longestChain, currentChain.length);
}

console.log("=== v9.10.0 Diagnostic: MF-Centric Passing ===\n");

console.log("Pass Matrix (completed passes, sender → receiver):");
console.log("       GK    DEF   MID   FWD");
for (const from of roles) {
  const row = roles.map(to => String(passMatrix[from][to]).padStart(5));
  console.log(`${from.padEnd(5)} ${row.join("  ")}`);
}

console.log(`\nTotal completed passes: ${totalCompletedPasses}`);
if (totalCompletedPasses > 0) {
  console.log(`MF passes received: ${mfPassesReceived} (${(mfPassesReceived / totalCompletedPasses * 100).toFixed(1)}%)`);
  console.log(`MF passes sent: ${mfPassesSent}`);
  
  const mfSent = passMatrix["MID"]["GK"] + passMatrix["MID"]["DEF"] + passMatrix["MID"]["MID"] + passMatrix["MID"]["FWD"];
  const mfTotal = mfPassesReceived + mfSent;
  console.log(`MF involvement (sent+received): ${mfTotal} (${(mfTotal / totalCompletedPasses * 100).toFixed(1)}%)`);
  console.log(`FWD→DEF direct: ${fwdToDefDirect} (${(fwdToDefDirect / totalCompletedPasses * 100).toFixed(1)}%)`);
}

console.log(`\nPass chains: ${chains.length} chains, longest: ${longestChain}`);
const avgChain = chains.length > 0 ? chains.reduce((a, b) => a + b, 0) / chains.length : 0;
console.log(`Average chain length: ${avgChain.toFixed(1)}`);

console.log(`\nPossession push:`);
const avgPush = pushSamples.length > 0 ? pushSamples.reduce((a, b) => a + b, 0) / pushSamples.length : 0;
console.log(`Average push level: ${avgPush.toFixed(3)}`);
console.log(`Max push level: ${maxPush.toFixed(3)}`);
const pushAbove50 = pushSamples.filter(p => p > 0.5).length;
console.log(`Frames with push > 0.5: ${pushAbove50}/${pushSamples.length} (${(pushAbove50 / pushSamples.length * 100).toFixed(1)}%)`);

console.log(`\nScore: Blue ${st.sL} - ${st.sR} Red`);
