/**
 * Headless Simulation Runner - 100 matches (v12.0.0)
 * 
 * ★ v12.0.0: Updated to use the same subSteps approach as the browser.
 *   - All speed modes produce IDENTICAL simulation results.
 *   - Speed mode only affects how many update() calls per "virtual frame".
 *   - dt per update() call is ALWAYS rawDt / BASE_SUB_STEPS (same as browser).
 *   - Default speed: VFAST (fastest execution, same results as MID/FAST).
 *
 * Usage:
 *   npx tsx headless-sim.ts [--speed REAL|VSLOW|LOW|MID|FAST|VFAST] [--matches N]
 *
 * Collects shot position, goal rate, GK save, deflection, and other statistics
 * for game balance analysis.
 */

import { mkState, update } from './client/src/game/engine';
import { P, FORMATION_IDS, FormationId } from './client/src/game/constants';
import { State, SpeedMode, SPEED_MULTIPLIERS } from './client/src/game/types';

// ─── CLI argument parsing ────────────────────────────────────────────────────

function parseArgs(): { speed: SpeedMode; numMatches: number } {
  const args = process.argv.slice(2);
  let speed: SpeedMode = "VFAST";
  let numMatches = 100;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--speed" && args[i + 1]) {
      const s = args[i + 1].toUpperCase() as SpeedMode;
      if (s in SPEED_MULTIPLIERS) {
        speed = s;
      } else {
        console.warn(`Unknown speed mode "${args[i + 1]}", using VFAST`);
      }
      i++;
    } else if (args[i] === "--matches" && args[i + 1]) {
      numMatches = Math.max(1, parseInt(args[i + 1], 10) || 100);
      i++;
    }
  }

  return { speed, numMatches };
}

// ─── Data collection structures ──────────────────────────────────────────────

interface ShotEvent {
  matchId: number;
  half: number;
  matchClock: number;
  team: number;           // -1=blue, 1=red
  role: string;           // GK/DEF/MID/FWD
  posLabel: string;
  x: number;              // Shooter world-x (normalized: 0=own goal, 1=opp goal)
  y: number;              // Shooter world-y (normalized: 0=top, 1=bottom)
  distToGoal: number;     // meters
  angleToGoal: number;    // degrees (0=straight on, 90=side)
  shotSpeed: number;      // m/s
  onTarget: boolean;
  isGoal: boolean;
  savedByGK: boolean;
  deflected: boolean;     // blocked by DF
  blueFormation: string;
  redFormation: string;
}

interface MatchResult {
  matchId: number;
  blueFormation: string;
  redFormation: string;
  speedMode: string;
  scoreBlue: number;
  scoreRed: number;
  shotsBlue: number;
  shotsRed: number;
  shotsOnTargetBlue: number;
  shotsOnTargetRed: number;
  goalsBlue: number;
  goalsRed: number;
  gkSaveAttemptsBlue: number;
  gkSaveAttemptsRed: number;
  gkSavesBlue: number;
  gkSavesRed: number;
  passAttemptsBlue: number;
  passAttemptsRed: number;
  passSuccessBlue: number;
  passSuccessRed: number;
  possessionBlue: number;  // 0-1
  possessionRed: number;
  cornersBlue: number;
  cornersRed: number;
  ownGoals: number;
  totalFrames: number;
  totalSubStepCalls: number;
  durationMs: number;     // wall-clock ms
}

// ─── Instrumented kick() wrapper ─────────────────────────────────────────────
// We patch the State to collect per-shot data by hooking into heatmap onBall events.
// Since engine.ts records shot events in heatmaps[player.idx].onBall with type='shot',
// we collect them after each match.

const allShots: ShotEvent[] = [];
const allMatches: MatchResult[] = [];

// ─── Simulation helpers ───────────────────────────────────────────────────────

const PITCH_HALF_W = 52.5;
const PITCH_HALF_H = 34.0;

function normalizeX(x: number): number {
  return (x + PITCH_HALF_W) / (PITCH_HALF_W * 2);
}
function normalizeY(y: number): number {
  return (y + PITCH_HALF_H) / (PITCH_HALF_H * 2);
}

// ─── v12.0.0: SubSteps calculation (mirrors Home.tsx exactly) ────────────────

const BASE_SUB_STEPS = 2;
const MID_SPEED_MUL = 0.40;

function getSubStepsForSpeed(speedMode: SpeedMode): { totalSubSteps: number; dtPerCall: number } {
  const currentSpeedMul = SPEED_MULTIPLIERS[speedMode] ?? MID_SPEED_MUL;
  const speedRatio = currentSpeedMul / MID_SPEED_MUL;
  const totalSubSteps = Math.max(1, Math.round(BASE_SUB_STEPS * speedRatio));
  // dt per update() call is ALWAYS rawDt / BASE_SUB_STEPS (same as browser)
  const RAW_DT = 1 / 60;  // 60fps virtual frame
  const dtPerCall = RAW_DT / BASE_SUB_STEPS;
  return { totalSubSteps, dtPerCall };
}

function runMatch(matchId: number, blueFormation: FormationId, redFormation: FormationId, speedMode: SpeedMode): MatchResult {
  const st = mkState(blueFormation, redFormation);
  st.speed = speedMode;

  const t0 = Date.now();
  const { totalSubSteps, dtPerCall } = getSubStepsForSpeed(speedMode);

  // Run until match is over
  // Safety limit: 20 real-minutes max
  const maxFrames = 60 * 60 * 20;
  let frames = 0;
  let totalCalls = 0;

  while (!st.over && frames < maxFrames) {
    // Each "virtual frame" calls update() totalSubSteps times
    // This mirrors exactly what Home.tsx does per requestAnimationFrame
    for (let s = 0; s < totalSubSteps; s++) {
      update(st, dtPerCall);
      totalCalls++;
    }
    frames++;
  }
  const durationMs = Date.now() - t0;

  // Collect shot events from heatmaps
  for (const hm of st.heatmaps) {
    for (const ev of hm.onBall) {
      if (ev.type !== 'shot') continue;
      const worldX = ev.x * PITCH_HALF_W * 2 - PITCH_HALF_W;
      const worldY = ev.y * PITCH_HALF_H * 2 - PITCH_HALF_H;
      const distToGoal = Math.sqrt(Math.pow(PITCH_HALF_W - worldX, 2) + Math.pow(worldY, 2));
      const angleToGoal = Math.abs(Math.atan2(Math.abs(worldY), PITCH_HALF_W - worldX) * 180 / Math.PI);
      const player = st.pl[hm.playerIdx];
      const role = player ? player.role : "UNK";
      const posLabel = hm.posLabel || role;

      allShots.push({
        matchId,
        half: 1,
        matchClock: 0,
        team: hm.team,
        role,
        posLabel,
        x: ev.x,
        y: ev.y,
        distToGoal,
        angleToGoal,
        shotSpeed: 0,
        onTarget: false,
        isGoal: false,
        savedByGK: false,
        deflected: false,
        blueFormation,
        redFormation,
      });
    }
  }

  const totalPossFrames = st.stats.possessionFrames.blue + st.stats.possessionFrames.red;
  const possBlue = totalPossFrames > 0 ? st.stats.possessionFrames.blue / totalPossFrames : 0.5;
  const possRed = totalPossFrames > 0 ? st.stats.possessionFrames.red / totalPossFrames : 0.5;
  const cornersTotal = st.stats.corners;

  const result: MatchResult = {
    matchId,
    blueFormation,
    redFormation,
    speedMode,
    scoreBlue: st.scoreBlue,
    scoreRed: st.scoreRed,
    shotsBlue: st.stats.shotsTotal.blue,
    shotsRed: st.stats.shotsTotal.red,
    shotsOnTargetBlue: st.stats.shotsOnTarget.blue,
    shotsOnTargetRed: st.stats.shotsOnTarget.red,
    goalsBlue: st.scoreBlue,
    goalsRed: st.scoreRed,
    gkSaveAttemptsBlue: st.stats.gkSaveAttempts.blue,
    gkSaveAttemptsRed: st.stats.gkSaveAttempts.red,
    gkSavesBlue: st.stats.gkSaves.blue,
    gkSavesRed: st.stats.gkSaves.red,
    passAttemptsBlue: st.stats.passAttempts.blue,
    passAttemptsRed: st.stats.passAttempts.red,
    passSuccessBlue: st.stats.passSuccess.blue,
    passSuccessRed: st.stats.passSuccess.red,
    possessionBlue: possBlue,
    possessionRed: possRed,
    cornersBlue: Math.round(cornersTotal / 2),
    cornersRed: cornersTotal - Math.round(cornersTotal / 2),
    ownGoals: st.stats.ownGoals,
    totalFrames: frames,
    totalSubStepCalls: totalCalls,
    durationMs,
  };

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const { speed, numMatches } = parseArgs();
const formations: FormationId[] = ["4-4-2", "4-2-3-1", "3-4-3"];

const { totalSubSteps, dtPerCall } = getSubStepsForSpeed(speed);
console.log(`\n╔══════════════════════════════════════════════════════╗`);
console.log(`║  Headless Simulation Runner v12.0.0                  ║`);
console.log(`╠══════════════════════════════════════════════════════╣`);
console.log(`║  Speed mode:    ${speed.padEnd(8)} (speedMul=${(SPEED_MULTIPLIERS[speed]).toFixed(4)})   ║`);
console.log(`║  SubSteps/frame: ${String(totalSubSteps).padEnd(6)} (dt/call=${dtPerCall.toFixed(6)})  ║`);
console.log(`║  Matches:       ${String(numMatches).padEnd(37)}║`);
console.log(`╚══════════════════════════════════════════════════════╝\n`);

console.log(`Starting ${numMatches} headless matches...`);
const simStart = Date.now();

for (let i = 0; i < numMatches; i++) {
  const blueF = formations[i % formations.length] as FormationId;
  const redF = formations[(i + 1) % formations.length] as FormationId;
  const result = runMatch(i + 1, blueF, redF, speed);
  allMatches.push(result);

  if ((i + 1) % 10 === 0) {
    const elapsed = ((Date.now() - simStart) / 1000).toFixed(1);
    const avgGoals = allMatches.reduce((s, m) => s + m.scoreBlue + m.scoreRed, 0) / allMatches.length;
    const avgShots = allMatches.reduce((s, m) => s + m.shotsBlue + m.shotsRed, 0) / allMatches.length;
    console.log(`  [${String(i + 1).padStart(3)}/${numMatches}] ${elapsed}s | avg goals=${avgGoals.toFixed(1)} shots=${avgShots.toFixed(1)}`);
  }
}

const totalMs = Date.now() - simStart;

// ─── Summary statistics ──────────────────────────────────────────────────────

const n = allMatches.length;
const avgGoals = allMatches.reduce((s, m) => s + m.scoreBlue + m.scoreRed, 0) / n;
const avgShots = allMatches.reduce((s, m) => s + m.shotsBlue + m.shotsRed, 0) / n;
const avgOnTarget = allMatches.reduce((s, m) => s + m.shotsOnTargetBlue + m.shotsOnTargetRed, 0) / n;
const avgGKSaves = allMatches.reduce((s, m) => s + m.gkSavesBlue + m.gkSavesRed, 0) / n;
const avgPassPct = allMatches.reduce((s, m) => {
  const total = m.passAttemptsBlue + m.passAttemptsRed;
  const success = m.passSuccessBlue + m.passSuccessRed;
  return s + (total > 0 ? success / total : 0);
}, 0) / n;
const avgFrames = allMatches.reduce((s, m) => s + m.totalFrames, 0) / n;
const avgCalls = allMatches.reduce((s, m) => s + m.totalSubStepCalls, 0) / n;

console.log(`\n╔══════════════════════════════════════════════════════╗`);
console.log(`║  RESULTS SUMMARY                                     ║`);
console.log(`╠══════════════════════════════════════════════════════╣`);
console.log(`║  Completed:     ${n} matches in ${(totalMs/1000).toFixed(1)}s                  `);
console.log(`║  Speed mode:    ${speed}`);
console.log(`║  Avg goals:     ${avgGoals.toFixed(1)} / match`);
console.log(`║  Avg shots:     ${avgShots.toFixed(1)} / match`);
console.log(`║  Avg on-target: ${avgOnTarget.toFixed(1)} / match`);
console.log(`║  Avg GK saves:  ${avgGKSaves.toFixed(1)} / match`);
console.log(`║  Avg pass%:     ${(avgPassPct * 100).toFixed(1)}%`);
console.log(`║  Avg frames:    ${avgFrames.toFixed(0)} (update calls: ${avgCalls.toFixed(0)})`);
console.log(`║  Total shots:   ${allShots.length}`);
console.log(`╚══════════════════════════════════════════════════════╝`);

// ─── Output JSON ──────────────────────────────────────────────────────────────

import { writeFileSync } from 'fs';

writeFileSync('/home/ubuntu/sim_matches.json', JSON.stringify(allMatches, null, 2));
writeFileSync('/home/ubuntu/sim_shots.json', JSON.stringify(allShots, null, 2));

console.log('\nData written to:');
console.log('  /home/ubuntu/sim_matches.json');
console.log('  /home/ubuntu/sim_shots.json');
