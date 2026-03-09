/**
 * compare-modes2.ts
 * MIDとVFASTの5試合ずつのゴール数を比較
 */
import { mkState, update } from './client/src/game/engine';

const REAL_DT = 1/60;
const MODES = ["MID", "VFAST"] as const;
const NUM_GAMES = 5;

for (const mode of MODES) {
  const goals: number[] = [];
  const frames: number[] = [];
  
  for (let g = 0; g < NUM_GAMES; g++) {
    const st = mkState();
    (st as any).speed = mode;
    let f = 0;
    while (!st.over && f < 50000) {
      update(st, REAL_DT);
      f++;
    }
    const total = st.scoreBlue + st.scoreRed;
    goals.push(total);
    frames.push(f);
  }
  
  const avgGoals = goals.reduce((a, b) => a + b, 0) / goals.length;
  const avgFrames = frames.reduce((a, b) => a + b, 0) / frames.length;
  console.log(`${mode}: 平均${avgGoals.toFixed(1)}ゴール/試合 (${goals.join(', ')}) 平均${avgFrames.toFixed(0)}フレーム`);
}
