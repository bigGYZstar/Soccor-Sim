// Diagnostic: Test attacking progression - do FWD/wide players push forward?
// Does the team advance? Do MF/DEF pass forward?
import { mkState, doKickOff, update } from '../client/src/game/engine';
import { FORMATIONS, FormationId } from '../client/src/game/constants';

const DT = 1/60;
const FRAMES = 60 * 120; // 2 minutes of play

const formId: FormationId = "4-4-2";
const st = mkState(formId, formId);
doKickOff(st);

// Track per-player stats
interface PStats {
  posLabel: string;
  role: string;
  team: number;
  homeX: number;
  homeY: number;
  samples: number;
  // Position tracking
  avgX: number;
  sumX: number;
  maxForwardX: number; // Most forward position (in attack direction)
  // How often in opponent half
  inOppHalf: number;
  // How often in attacking third
  inAttackThird: number;
  // Average distance from own goal (higher = more forward)
  sumDistFromOwnGoal: number;
}

const stats: Record<number, PStats> = {};
for (const p of st.pl) {
  stats[p.idx] = {
    posLabel: p.posLabel, role: p.role, team: p.team,
    homeX: p.home.x, homeY: p.home.y,
    samples: 0, avgX: 0, sumX: 0, maxForwardX: -999,
    inOppHalf: 0, inAttackThird: 0, sumDistFromOwnGoal: 0,
  };
}

// Track pass directions
let passForward = { blue: 0, red: 0 };
let passBackward = { blue: 0, red: 0 };
let passLateral = { blue: 0, red: 0 };
let totalPasses = { blue: 0, red: 0 };

// Track ball position
let ballInOppHalfBlue = 0;
let ballInOppHalfRed = 0;
let ballSamples = 0;

// Track team average forward position
let teamAvgForwardBlue = 0;
let teamAvgForwardRed = 0;
let teamSamples = 0;

// Track last ball owner for pass detection
let lastOwner = -1;
let lastOwnerPos = { x: 0, y: 0 };

for (let f = 0; f < FRAMES; f++) {
  update(st, DT);
  
  // Detect passes (owner change)
  if (st.ball.owner !== null && st.ball.owner !== lastOwner && lastOwner !== -1) {
    const from = lastOwnerPos;
    const to = st.pl[st.ball.owner];
    const fromTeam = st.pl.find(p => p.idx === lastOwner);
    if (fromTeam && to.team === fromTeam.team) {
      const gp = (to.pos.x - from.x) * -fromTeam.team;
      const key = fromTeam.team === -1 ? "blue" : "red";
      totalPasses[key]++;
      if (gp > 2.0) passForward[key]++;
      else if (gp < -2.0) passBackward[key]++;
      else passLateral[key]++;
    }
  }
  if (st.ball.owner !== null) {
    lastOwner = st.ball.owner;
    lastOwnerPos = { ...st.pl[st.ball.owner].pos };
  }
  
  // Sample every 10 frames
  if (f % 10 === 0) {
    for (const p of st.pl) {
      const s = stats[p.idx];
      s.samples++;
      s.sumX += p.pos.x;
      
      // Forward position in attack direction
      const forwardX = p.pos.x * -p.team; // Higher = more forward
      s.maxForwardX = Math.max(s.maxForwardX, forwardX);
      
      // In opponent half?
      if (p.pos.x * p.team < 0) s.inOppHalf++;
      
      // In attacking third? (last 1/3 of pitch)
      if (forwardX > 52.5 * 2 / 3) s.inAttackThird++;
      
      // Distance from own goal
      const ownGoalX = p.team * 52.5;
      s.sumDistFromOwnGoal += Math.abs(p.pos.x - ownGoalX);
    }
    
    // Ball position
    ballSamples++;
    if (st.ball.pos.x < 0) ballInOppHalfBlue++; // Blue attacks right, so ball in left = Red's half... wait
    // Blue team = -1, attacks right (positive x)
    // Red team = +1, attacks left (negative x)
    // Ball in positive x = in Red's half = Blue attacking
    if (st.ball.pos.x > 0) ballInOppHalfBlue++;
    if (st.ball.pos.x < 0) ballInOppHalfRed++;
    
    // Team average forward position
    teamSamples++;
    let sumBlue = 0, countBlue = 0;
    let sumRed = 0, countRed = 0;
    for (const p of st.pl) {
      if (p.isGK) continue;
      if (p.team === -1) { sumBlue += p.pos.x * -p.team; countBlue++; }
      else { sumRed += p.pos.x * -p.team; countRed++; }
    }
    teamAvgForwardBlue += sumBlue / countBlue;
    teamAvgForwardRed += sumRed / countRed;
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log(`ATTACK PROGRESSION DIAGNOSTIC (${formId} vs ${formId})`);
console.log(`${"=".repeat(60)}`);

console.log(`\nScore: ${st.sL} - ${st.sR}`);
console.log(`\nBall Territory:`);
console.log(`  Blue attacking half: ${(ballInOppHalfBlue/ballSamples*100).toFixed(1)}%`);
console.log(`  Red attacking half: ${(ballInOppHalfRed/ballSamples*100).toFixed(1)}%`);

console.log(`\nTeam Average Forward Position (higher = more forward):`);
console.log(`  Blue: ${(teamAvgForwardBlue/teamSamples).toFixed(1)}m`);
console.log(`  Red: ${(teamAvgForwardRed/teamSamples).toFixed(1)}m`);

console.log(`\nPass Direction:`);
for (const key of ["blue", "red"] as const) {
  const total = totalPasses[key];
  if (total === 0) continue;
  console.log(`  ${key}: ${total} passes`);
  console.log(`    Forward: ${passForward[key]} (${(passForward[key]/total*100).toFixed(0)}%)`);
  console.log(`    Backward: ${passBackward[key]} (${(passBackward[key]/total*100).toFixed(0)}%)`);
  console.log(`    Lateral: ${passLateral[key]} (${(passLateral[key]/total*100).toFixed(0)}%)`);
}

console.log(`\nPlayer Forward Penetration:`);
console.log("-".repeat(60));
// Sort by role: FWD first, then MID, then DEF
const roleOrder = { "FWD": 0, "MID": 1, "DEF": 2, "GK": 3 };
const sorted = Object.values(stats)
  .filter(s => s.team === -1 && s.role !== "GK") // Blue team only
  .sort((a, b) => (roleOrder[a.role as keyof typeof roleOrder] || 3) - (roleOrder[b.role as keyof typeof roleOrder] || 3));

for (const s of sorted) {
  const avgX = s.sumX / s.samples;
  const avgForward = (avgX * 1); // Blue team=-1, attacks right, so positive x = forward
  const avgDistGoal = s.sumDistFromOwnGoal / s.samples;
  console.log(`  ${s.posLabel.padEnd(5)} (${s.role.padEnd(3)}) home=${s.homeX.toFixed(0).padStart(4)},${s.homeY.toFixed(0).padStart(4)}`
    + ` | avgX=${avgX.toFixed(1).padStart(6)} | maxFwd=${s.maxForwardX.toFixed(1).padStart(6)}`
    + ` | oppHalf=${(s.inOppHalf/s.samples*100).toFixed(0).padStart(3)}%`
    + ` | atkThird=${(s.inAttackThird/s.samples*100).toFixed(0).padStart(3)}%`
    + ` | avgDistGoal=${avgDistGoal.toFixed(1).padStart(5)}m`);
}

console.log(`\nMatch Stats:`);
console.log(`  Shots: Blue=${st.stats.phaseBShots?.blue || 0}, Red=${st.stats.phaseBShots?.red || 0}`);
console.log(`  Forced shots: Blue=${st.stats.forcedShotsFromBlocked?.blue || 0}, Red=${st.stats.forcedShotsFromBlocked?.red || 0}`);
