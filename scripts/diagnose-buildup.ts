// v9.9.0 Buildup & Pass-and-Move Diagnostic
import { mkState, update } from "../client/src/game/engine";

const st = mkState("4-4-2", "4-4-2");
// Kick off
st.ball.owner = 10; // Red team player
st.ball.free = false;
st.ball.pos = { ...st.pl[10].pos };

const FPS = 60;
const MATCH_SECS = 120;
const TOTAL_FRAMES = FPS * MATCH_SECS;
const dt = 1 / FPS;

// Track pass chains (buildup sequences)
interface PassEvent {
  frame: number;
  time: number;
  kickerIdx: number;
  kickerRole: string;
  kickerNum: number;
  receiverIdx: number;
  receiverRole: string;
  receiverNum: number;
  team: number;
  dist: number;
  isBackpass: boolean;
  isForward: boolean;
  passAndMoveActive: boolean;
  wantsBallActive: boolean;
}

const passEvents: PassEvent[] = [];
let lastKickerIdx = -1;
let lastKickFrame = 0;
let lastKickTeam = 0;

// Track pass-and-move activations
let passAndMoveActivations = 0;
let wantsBallFrames = 0;

// Track buildup chains (consecutive passes by same team)
const buildupChains: { team: number; passes: PassEvent[] }[] = [];
let currentChain: PassEvent[] = [];
let currentChainTeam = 0;

for (let f = 0; f < TOTAL_FRAMES; f++) {
  // Track pass-and-move state
  for (const p of st.pl) {
    if (p.passAndMoveTimer > 0) passAndMoveActivations++;
    if (p.wantsBall) wantsBallFrames++;
  }
  
  // Detect kicks
  const prevOwner = st.ball.owner;
  const prevFree = st.ball.free;
  
  update(st, dt);
  
  // Detect when ball becomes free (kicked)
  if (!prevFree && st.ball.free && prevOwner !== null) {
    lastKickerIdx = prevOwner;
    lastKickFrame = f;
    lastKickTeam = st.pl[prevOwner].team;
  }
  
  // Detect when ball is picked up
  if (prevFree && !st.ball.free && st.ball.owner !== null) {
    const receiver = st.pl[st.ball.owner];
    const kicker = lastKickerIdx >= 0 ? st.pl[lastKickerIdx] : null;
    
    if (kicker && kicker.team === receiver.team && lastKickerIdx !== st.ball.owner) {
      const flightFrames = f - lastKickFrame;
      const dist = Math.sqrt(
        (receiver.pos.x - kicker.pos.x) ** 2 + (receiver.pos.y - kicker.pos.y) ** 2
      );
      
      const attackDir = -kicker.team;
      const gp = (receiver.pos.x - kicker.pos.x) * attackDir;
      
      const evt: PassEvent = {
        frame: f,
        time: f / FPS,
        kickerIdx: lastKickerIdx,
        kickerRole: kicker.role,
        kickerNum: kicker.num,
        receiverIdx: st.ball.owner,
        receiverRole: receiver.role,
        receiverNum: receiver.num,
        team: kicker.team,
        dist,
        isBackpass: gp < -1.0,
        isForward: gp > 1.0,
        passAndMoveActive: receiver.passAndMoveTimer > 0,
        wantsBallActive: receiver.wantsBall,
      };
      passEvents.push(evt);
      
      // Track buildup chains
      if (kicker.team === currentChainTeam && (f - lastKickFrame) < 180) {
        currentChain.push(evt);
      } else {
        if (currentChain.length >= 2) {
          buildupChains.push({ team: currentChainTeam, passes: [...currentChain] });
        }
        currentChain = [evt];
        currentChainTeam = kicker.team;
      }
    }
  }
}

// Finalize last chain
if (currentChain.length >= 2) {
  buildupChains.push({ team: currentChainTeam, passes: [...currentChain] });
}

console.log("=== v9.9.0 BUILDUP & PASS-AND-MOVE DIAGNOSTIC ===\n");

// Pass direction analysis
const forwardPasses = passEvents.filter(e => e.isForward);
const backPasses = passEvents.filter(e => e.isBackpass);
const lateralPasses = passEvents.filter(e => !e.isForward && !e.isBackpass);

console.log(`Total genuine passes: ${passEvents.length}`);
console.log(`  Forward: ${forwardPasses.length} (${(forwardPasses.length / passEvents.length * 100).toFixed(1)}%)`);
console.log(`  Lateral: ${lateralPasses.length} (${(lateralPasses.length / passEvents.length * 100).toFixed(1)}%)`);
console.log(`  Backpass: ${backPasses.length} (${(backPasses.length / passEvents.length * 100).toFixed(1)}%)`);

// Role-to-role pass matrix
console.log("\n--- ROLE-TO-ROLE PASS MATRIX ---");
const roles = ["DEF", "MID", "FWD"];
const matrix: Record<string, Record<string, number>> = {};
for (const from of roles) {
  matrix[from] = {};
  for (const to of roles) matrix[from][to] = 0;
}
// Include GK
matrix["GK"] = {}; for (const to of roles) matrix["GK"][to] = 0; matrix["GK"]["GK"] = 0;
for (const r of roles) matrix[r]["GK"] = 0;

for (const e of passEvents) {
  const fromRole = e.kickerIdx === 0 || e.kickerIdx === 11 ? "GK" : e.kickerRole;
  const toRole = e.receiverIdx === 0 || e.receiverIdx === 11 ? "GK" : e.receiverRole;
  if (!matrix[fromRole]) matrix[fromRole] = {};
  if (!matrix[fromRole][toRole]) matrix[fromRole][toRole] = 0;
  matrix[fromRole][toRole]++;
}

const allRoles = ["GK", "DEF", "MID", "FWD"];
console.log("       " + allRoles.map(r => r.padStart(5)).join(""));
for (const from of allRoles) {
  const row = allRoles.map(to => String(matrix[from]?.[to] || 0).padStart(5));
  console.log(`${from.padEnd(5)}  ${row.join("")}`);
}

// Pass-and-move effectiveness
const pamPasses = passEvents.filter(e => e.passAndMoveActive);
const wbPasses = passEvents.filter(e => e.wantsBallActive);
console.log(`\n--- PASS-AND-MOVE ---`);
console.log(`Pass-and-move activations (total frames): ${passAndMoveActivations}`);
console.log(`WantsBall frames: ${wantsBallFrames}`);
console.log(`Passes received during pass-and-move: ${pamPasses.length}`);
console.log(`Passes received by wantsBall players: ${wbPasses.length}`);

// Buildup chains analysis
console.log(`\n--- BUILDUP CHAINS (2+ consecutive passes) ---`);
console.log(`Total chains: ${buildupChains.length}`);
const chainLengths = buildupChains.map(c => c.passes.length);
if (chainLengths.length > 0) {
  console.log(`Average chain length: ${(chainLengths.reduce((a, b) => a + b, 0) / chainLengths.length).toFixed(1)} passes`);
  console.log(`Max chain length: ${Math.max(...chainLengths)} passes`);
  console.log(`Chains with 3+ passes: ${chainLengths.filter(l => l >= 3).length}`);
  console.log(`Chains with 5+ passes: ${chainLengths.filter(l => l >= 5).length}`);
}

// Show top 3 longest chains
const topChains = buildupChains.sort((a, b) => b.passes.length - a.passes.length).slice(0, 3);
for (let i = 0; i < topChains.length; i++) {
  const chain = topChains[i];
  const teamName = chain.team === -1 ? "BLUE" : "RED";
  console.log(`\n  Chain #${i + 1} (${teamName}, ${chain.passes.length} passes):`);
  for (const p of chain.passes) {
    const dir = p.isForward ? "→FWD" : p.isBackpass ? "←BACK" : "↔LAT";
    const pam = p.passAndMoveActive ? " [P&M]" : "";
    const wb = p.wantsBallActive ? " [WB]" : "";
    console.log(`    ${p.time.toFixed(1)}s: #${p.kickerNum}(${p.kickerRole}) → #${p.receiverNum}(${p.receiverRole}) ${dir} ${p.dist.toFixed(1)}m${pam}${wb}`);
  }
}

// Backpass analysis
console.log(`\n--- BACKPASS ANALYSIS ---`);
const backpassByRole: Record<string, number> = {};
for (const e of backPasses) {
  const key = `${e.kickerRole}→${e.receiverRole}`;
  backpassByRole[key] = (backpassByRole[key] || 0) + 1;
}
const sortedBP = Object.entries(backpassByRole).sort((a, b) => b[1] - a[1]);
for (const [key, count] of sortedBP) {
  console.log(`  ${key}: ${count}`);
}
