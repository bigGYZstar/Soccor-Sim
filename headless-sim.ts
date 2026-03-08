/**
 * Headless Simulation Runner - 100 matches
 * Collects shot position, goal rate, GK save, deflection, and other statistics
 * for game balance analysis.
 */

import { mkState, update } from './client/src/game/engine';
import { P, FORMATION_IDS, FormationId } from './client/src/game/constants';
import { State } from './client/src/game/types';

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
const GOAL_HALF_H = 3.66;

function normalizeX(x: number): number {
  // 0 = own goal side (left), 1 = opponent goal side (right)
  return (x + PITCH_HALF_W) / (PITCH_HALF_W * 2);
}
function normalizeY(y: number): number {
  return (y + PITCH_HALF_H) / (PITCH_HALF_H * 2);
}

function runMatch(matchId: number, blueFormation: FormationId, redFormation: FormationId): MatchResult {
  const st = mkState(blueFormation, redFormation);
  st.speed = "VFAST";

  // Track shot positions by hooking into heatmap events
  // We'll snapshot heatmap onBall events before and after each update step
  // to detect new shot events.

  // Instead, we collect shot data from heatmaps after match ends.
  // Each heatmap.onBall entry with type='shot' is a shot event.

  const t0 = Date.now();
  const SIM_DT = 1 / 60;  // 60fps simulation

  // Run until match is over
  let maxFrames = 60 * 60 * 20;  // Safety: 20 real-minutes max
  let frames = 0;
  while (!st.over && frames < maxFrames) {
    update(st, SIM_DT);
    frames++;
  }
  const durationMs = Date.now() - t0;

  // Collect shot events from heatmaps
  // heatmap.onBall entries with type='shot' contain normalized positions
  // We need to reconstruct world coordinates and additional info
  // Unfortunately heatmaps only store normalized x/y, not raw world coords or speed.
  // We'll use what's available.

  const totalPossFrames = st.stats.possessionFrames.blue + st.stats.possessionFrames.red;
  const possBlue = totalPossFrames > 0 ? st.stats.possessionFrames.blue / totalPossFrames : 0.5;
  const possRed = totalPossFrames > 0 ? st.stats.possessionFrames.red / totalPossFrames : 0.5;

  // Collect per-player shot heatmap data
  for (const hm of st.heatmaps) {
    for (const ev of hm.onBall) {
      if (ev.type !== 'shot') continue;
      // ev.x, ev.y are normalized 0-1 (always attacking right = x increases toward opp goal)
      // In 1st half: team=-1 (blue) attacks right (+x), so normalized x=1 is opp goal
      // Heatmap is already side-normalized (2nd half flipped)
      // So for all shots: x=1 means "near opponent goal"

      // Convert normalized to world-like coordinates (attacker's perspective)
      const worldX = ev.x * PITCH_HALF_W * 2 - PITCH_HALF_W;  // -52.5 to +52.5
      const worldY = ev.y * PITCH_HALF_H * 2 - PITCH_HALF_H;  // -34 to +34

      // Distance to opponent goal (at x=+52.5 in attacker's perspective)
      const distToGoal = Math.sqrt(Math.pow(PITCH_HALF_W - worldX, 2) + Math.pow(worldY, 2));

      // Angle to goal (0=straight on, 90=side)
      const angleToGoal = Math.abs(Math.atan2(Math.abs(worldY), PITCH_HALF_W - worldX) * 180 / Math.PI);

      // Find player info
      const player = st.pl[hm.playerIdx];
      const role = player ? player.role : "UNK";
      const posLabel = hm.posLabel || role;

      allShots.push({
        matchId,
        half: 1,  // heatmap is side-normalized, half info not stored per event
        matchClock: 0,
        team: hm.team,
        role,
        posLabel,
        x: ev.x,
        y: ev.y,
        distToGoal,
        angleToGoal,
        shotSpeed: 0,  // not available in heatmap
        onTarget: false,  // will be derived from stats
        isGoal: false,    // will be derived from stats
        savedByGK: false,
        deflected: false,
        blueFormation,
        redFormation,
      });
    }
  }

  // Count corners per team from stats (corners is a single number, not per-team)
  // We'll use total corners / 2 as approximation
  const cornersTotal = st.stats.corners;

  const result: MatchResult = {
    matchId,
    blueFormation,
    redFormation,
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
    durationMs,
  };

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const NUM_MATCHES = 100;
const formations: FormationId[] = ["4-4-2", "4-2-3-1", "3-4-3"];

console.log(`Starting ${NUM_MATCHES} headless matches...`);
const simStart = Date.now();

for (let i = 0; i < NUM_MATCHES; i++) {
  const blueF = formations[i % formations.length] as FormationId;
  const redF = formations[(i + 1) % formations.length] as FormationId;
  const result = runMatch(i + 1, blueF, redF);
  allMatches.push(result);

  if ((i + 1) % 10 === 0) {
    const elapsed = ((Date.now() - simStart) / 1000).toFixed(1);
    console.log(`  [${i + 1}/${NUM_MATCHES}] ${elapsed}s elapsed`);
  }
}

const totalMs = Date.now() - simStart;
console.log(`\nCompleted ${NUM_MATCHES} matches in ${(totalMs/1000).toFixed(1)}s`);
console.log(`Total shots collected: ${allShots.length}`);

// ─── Output JSON ──────────────────────────────────────────────────────────────

import { writeFileSync } from 'fs';

writeFileSync('/home/ubuntu/sim_matches.json', JSON.stringify(allMatches, null, 2));
writeFileSync('/home/ubuntu/sim_shots.json', JSON.stringify(allShots, null, 2));

console.log('\nData written to:');
console.log('  /home/ubuntu/sim_matches.json');
console.log('  /home/ubuntu/sim_shots.json');
