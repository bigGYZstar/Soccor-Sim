import { mkState, update } from './client/src/game/engine';

const REAL_DT = 1/60;

function runMatches(speed: string, n: number) {
  const goals: number[] = [];
  const frames: number[] = [];
  for (let i = 0; i < n; i++) {
    const st = mkState();
    (st as any).speed = speed;
    let f = 0;
    while (!st.over && f < 60000) {
      update(st, REAL_DT);
      f++;
    }
    const g = st.scoreBlue + st.scoreRed;
    goals.push(g);
    frames.push(f);
  }
  const avg = goals.reduce((a,b)=>a+b,0)/n;
  const avgF = frames.reduce((a,b)=>a+b,0)/n;
  const goalPerFrame = avg / avgF;
  console.log(`${speed}: 平均${avg.toFixed(1)}ゴール/試合 (${goals.join(', ')}) 平均${Math.round(avgF)}フレーム ゴール率/フレーム=${goalPerFrame.toFixed(6)}`);
}

console.log('=== MIDとVFASTのゴール数比較（各5試合）===');
runMatches('MID', 5);
runMatches('VFAST', 5);
