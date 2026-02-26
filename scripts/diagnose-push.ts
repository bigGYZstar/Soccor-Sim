import { mkState, doKickOff, update } from "../client/src/game/engine";
import { P } from "../client/src/game/constants";
import { vdist } from "../client/src/game/math";

const DT = 1 / 60;
const TOTAL_FRAMES = 60 * 90;
const PITCH_HALF_W = 52.5;

const st = mkState("4-4-2", "4-4-2");
doKickOff(st);

let maxPush = 0;
let pushSamples = 0;
let pushSum = 0;
let maxForward = -Infinity;
let maxForwardTeam = 0;

// Track what happens when a player carries deep
interface CarryEvent {
  frame: number;
  playerIdx: number;
  posLabel: string;
  team: number;
  ax: number; // attacking x
  pushLevel: number;
  closestDefDist: number;
}

const deepCarries: CarryEvent[] = [];

for (let f = 0; f < TOTAL_FRAMES; f++) {
  update(st, DT);
  
  const push = (st as any).possessionPush;
  if (push && push.pushLevel > 0) {
    pushSamples++;
    pushSum += push.pushLevel;
    if (push.pushLevel > maxPush) maxPush = push.pushLevel;
  }
  
  if (st.ball.owner !== null) {
    const owner = st.pl[st.ball.owner];
    const ax = owner.pos.x * -owner.team;
    
    if (ax > maxForward) {
      maxForward = ax;
      maxForwardTeam = owner.team;
    }
    
    // Track carry events when player is deep
    if (owner.act === "carry" && ax > 5.0) {
      // Find closest defender
      let closestDef = Infinity;
      for (const p of st.pl) {
        if (p.team === owner.team) continue;
        if (p.role === "DEF" || p.isGK) {
          closestDef = Math.min(closestDef, vdist(owner.pos, p.pos));
        }
      }
      
      deepCarries.push({
        frame: f,
        playerIdx: st.ball.owner,
        posLabel: owner.posLabel,
        team: owner.team,
        ax,
        pushLevel: push?.pushLevel || 0,
        closestDefDist: closestDef
      });
    }
  }
}

console.log("=== POSSESSION PUSH DIAGNOSTIC ===");
console.log(`Max push level: ${maxPush.toFixed(2)}`);
console.log(`Avg push level (when > 0): ${pushSamples > 0 ? (pushSum / pushSamples).toFixed(2) : "N/A"}`);
console.log(`Push samples: ${pushSamples} / ${TOTAL_FRAMES} (${(pushSamples/TOTAL_FRAMES*100).toFixed(1)}%)`);
console.log(`\nMax forward: ${maxForward.toFixed(1)}m (team=${maxForwardTeam === 1 ? "Blue" : "Red"})`);

console.log(`\n--- DEEP CARRY EVENTS (ax > 5m) ---`);
console.log(`Total: ${deepCarries.length}`);
// Group by ax ranges
const ranges = [
  { label: "5-10m", min: 5, max: 10 },
  { label: "10-15m", min: 10, max: 15 },
  { label: "15-20m", min: 15, max: 20 },
  { label: "20-25m", min: 20, max: 25 },
  { label: "25-30m", min: 25, max: 30 },
  { label: "30-35m", min: 30, max: 35 },
  { label: "35m+", min: 35, max: 100 },
];
for (const r of ranges) {
  const events = deepCarries.filter(e => e.ax >= r.min && e.ax < r.max);
  if (events.length > 0) {
    const avgDefDist = events.reduce((s, e) => s + e.closestDefDist, 0) / events.length;
    const avgPush = events.reduce((s, e) => s + e.pushLevel, 0) / events.length;
    console.log(`  ${r.label}: ${events.length} frames, avgDefDist=${avgDefDist.toFixed(1)}m, avgPush=${avgPush.toFixed(2)}`);
  }
}

// Show the deepest carry events
const deepest = [...deepCarries].sort((a, b) => b.ax - a.ax).slice(0, 5);
console.log(`\nDeepest carries:`);
for (const e of deepest) {
  console.log(`  f=${e.frame} ${e.posLabel}(#${e.playerIdx}) team=${e.team === 1 ? "B" : "R"} ax=${e.ax.toFixed(1)}m push=${e.pushLevel.toFixed(2)} defDist=${e.closestDefDist.toFixed(1)}m`);
}

// Show player positions at the deepest carry moment
if (deepest.length > 0) {
  const deepestFrame = deepest[0].frame;
  // Re-run to get positions at that frame
  const st2 = mkState("4-4-2", "4-4-2");
  doKickOff(st2);
  for (let f = 0; f < deepestFrame; f++) {
    update(st2, DT);
  }
  update(st2, DT);
  
  console.log(`\nPlayer positions at deepest carry (frame ${deepestFrame}):`);
  const attackTeam = deepest[0].team;
  console.log(`  Attacking team (${attackTeam === 1 ? "Blue" : "Red"}):`);
  for (const p of st2.pl.filter(pp => pp.team === attackTeam && !pp.isGK)) {
    const ax = p.pos.x * -p.team;
    console.log(`    ${p.posLabel}(#${p.idx}): ax=${ax.toFixed(1)}m act=${p.act} wantsBall=${p.wantsBall}`);
  }
  console.log(`  Defending team (${attackTeam === 1 ? "Red" : "Blue"}):`);
  for (const p of st2.pl.filter(pp => pp.team !== attackTeam && !pp.isGK)) {
    const ax = p.pos.x * -p.team; // This is their attacking x
    const defX = p.pos.x * attackTeam; // Negative = closer to attacker's goal
    console.log(`    ${p.posLabel}(#${p.idx}): pos=(${p.pos.x.toFixed(1)},${p.pos.y.toFixed(1)}) defLine=${(-defX).toFixed(1)}m`);
  }
}
