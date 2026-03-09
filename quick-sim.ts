/**
 * quick-sim.ts - 素早い試合シミュレーション比較
 */
import { mkState, update } from './client/src/game/engine';

const REAL_DT = 1/60;

function runMatch(speedMode: string) {
  const st = mkState();
  (st as any).speed = speedMode;
  let frames = 0;
  const maxFrames = 60 * 60 * 20;
  while (!st.over && frames < maxFrames) {
    update(st, REAL_DT);
    frames++;
  }
  return {
    goals: st.scoreBlue + st.scoreRed,
    goalsBlue: st.scoreBlue,
    goalsRed: st.scoreRed,
    frames,
    over: st.over,
  };
}

const NUM_MATCHES = 20;
console.log(`=== ${NUM_MATCHES}試合 × MID/VFAST ===\n`);

for (const mode of ["MID", "VFAST"]) {
  let totalGoals = 0;
  let totalFrames = 0;
  let completedMatches = 0;
  const goalDist: number[] = [];

  for (let i = 0; i < NUM_MATCHES; i++) {
    const r = runMatch(mode);
    totalGoals += r.goals;
    totalFrames += r.frames;
    goalDist.push(r.goals);
    if (r.over) completedMatches++;
    process.stdout.write(r.over ? "." : "T");
  }
  console.log(`\n${mode}モード:`);
  console.log(`  完了試合: ${completedMatches}/${NUM_MATCHES}`);
  console.log(`  平均ゴール/試合: ${(totalGoals/NUM_MATCHES).toFixed(1)}`);
  console.log(`  平均フレーム/試合: ${(totalFrames/NUM_MATCHES).toFixed(0)}`);
  console.log(`  ゴール分布: ${goalDist.join(', ')}`);
  console.log();
}
