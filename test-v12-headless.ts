/**
 * v12.0.0 Headless verification test
 * Runs 20 matches per speed mode and compares statistics.
 * All modes should produce statistically similar results.
 */

import { mkState, update } from './client/src/game/engine';
import { FormationId } from './client/src/game/constants';
import { SpeedMode, SPEED_MULTIPLIERS } from './client/src/game/types';

const BASE_SUB_STEPS = 2;
const MID_SPEED_MUL = 0.40;
const RAW_DT = 1 / 60;

function getSubSteps(speed: SpeedMode) {
  const mul = SPEED_MULTIPLIERS[speed] ?? MID_SPEED_MUL;
  const ratio = mul / MID_SPEED_MUL;
  const totalSubSteps = Math.max(1, Math.round(BASE_SUB_STEPS * ratio));
  const dtPerCall = RAW_DT / BASE_SUB_STEPS;
  return { totalSubSteps, dtPerCall };
}

interface Stats {
  goals: number;
  shots: number;
  onTarget: number;
  gkSaves: number;
  passRate: number;
  frames: number;
  calls: number;
  ms: number;
}

function runMatch(speed: SpeedMode): Stats {
  const formations: FormationId[] = ["4-4-2", "4-2-3-1", "3-4-3"];
  const blueF = formations[Math.floor(Math.random() * 3)];
  const redF = formations[Math.floor(Math.random() * 3)];
  const st = mkState(blueF, redF);
  st.speed = speed;

  const { totalSubSteps, dtPerCall } = getSubSteps(speed);
  const t0 = Date.now();
  let frames = 0;
  let calls = 0;

  while (!st.over && frames < 60 * 60 * 20) {
    for (let s = 0; s < totalSubSteps; s++) {
      update(st, dtPerCall);
      calls++;
    }
    frames++;
  }

  const s = st.stats;
  const totalPass = s.passAttempts.blue + s.passAttempts.red;
  const successPass = s.passSuccess.blue + s.passSuccess.red;

  return {
    goals: st.scoreBlue + st.scoreRed,
    shots: s.shotsTotal.blue + s.shotsTotal.red,
    onTarget: s.shotsOnTarget.blue + s.shotsOnTarget.red,
    gkSaves: s.gkSaves.blue + s.gkSaves.red,
    passRate: totalPass > 0 ? successPass / totalPass : 0,
    frames,
    calls,
    ms: Date.now() - t0,
  };
}

// ─── Run tests ───────────────────────────────────────────────────────────────

const MODES: SpeedMode[] = ["MID", "FAST", "VFAST"];
const N = 20;

console.log(`\n=== v12.0.0 Headless Verification (${N} matches per mode) ===\n`);

const results: Record<string, Stats[]> = {};

for (const mode of MODES) {
  results[mode] = [];
  const { totalSubSteps, dtPerCall } = getSubSteps(mode);
  console.log(`Running ${mode} (subSteps=${totalSubSteps}, dt=${dtPerCall.toFixed(6)})...`);

  for (let i = 0; i < N; i++) {
    results[mode].push(runMatch(mode));
    if ((i + 1) % 10 === 0) process.stdout.write(`  ${i + 1}/${N}\n`);
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────

function avg(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

console.log(`\n${'Mode'.padEnd(8)} | ${'Goals'.padEnd(8)} | ${'Shots'.padEnd(8)} | ${'OnTgt'.padEnd(8)} | ${'GKSave'.padEnd(8)} | ${'Pass%'.padEnd(8)} | ${'Frames'.padEnd(8)} | ${'Calls'.padEnd(8)} | ${'ms'.padEnd(8)}`);
console.log('-'.repeat(90));

const midGoals = avg(results["MID"].map(r => r.goals));

for (const mode of MODES) {
  const r = results[mode];
  const g = avg(r.map(x => x.goals));
  const s = avg(r.map(x => x.shots));
  const ot = avg(r.map(x => x.onTarget));
  const gk = avg(r.map(x => x.gkSaves));
  const pr = avg(r.map(x => x.passRate));
  const fr = avg(r.map(x => x.frames));
  const cl = avg(r.map(x => x.calls));
  const ms = avg(r.map(x => x.ms));

  const deviation = midGoals > 0 ? Math.abs(g - midGoals) / midGoals * 100 : 0;
  const status = deviation < 30 ? "✓ PASS" : "✗ FAIL";

  console.log(
    `${mode.padEnd(8)} | ${g.toFixed(1).padEnd(8)} | ${s.toFixed(1).padEnd(8)} | ${ot.toFixed(1).padEnd(8)} | ${gk.toFixed(1).padEnd(8)} | ${(pr * 100).toFixed(1).padEnd(7)}% | ${fr.toFixed(0).padEnd(8)} | ${cl.toFixed(0).padEnd(8)} | ${ms.toFixed(0).padEnd(8)}`
  );
  console.log(`         Deviation from MID: ${deviation.toFixed(1)}% ${status}`);
}

console.log(`\nDone.`);
