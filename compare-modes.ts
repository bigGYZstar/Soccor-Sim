/**
 * compare-modes.ts
 * MIDとVFASTで5試合ずつ実行してゴール数を比較
 */
import { mkState, update } from './client/src/game/engine';

const REAL_DT = 1/60;
const GAMES = 5;

async function runGames(mode: string, n: number) {
  const goals: number[] = [];
  for (let g = 0; g < n; g++) {
    const st = mkState();
    (st as any).speed = mode;
    let frames = 0;
    while (!st.over && frames < 200000) {
      update(st, REAL_DT);
      frames++;
    }
    const total = st.scoreBlue + st.scoreRed;
    goals.push(total);
    process.stdout.write('.');
  }
  const avg = goals.reduce((a, b) => a + b, 0) / goals.length;
  console.log(`\n${mode}: ${goals.join(', ')} → 平均 ${avg.toFixed(1)} ゴール/試合`);
  return avg;
}

(async () => {
  console.log('=== MIDとVFASTのゴール数比較 ===');
  const midAvg = await runGames('MID', GAMES);
  const vfastAvg = await runGames('VFAST', GAMES);
  console.log(`\n比率 VFAST/MID = ${(vfastAvg / midAvg).toFixed(2)}x`);
})();
