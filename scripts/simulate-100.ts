import { mkState, doKickOff, update } from '../client/src/game/engine';
import { P } from '../client/src/game/constants';

const MATCHES = 100;
const DT = 1 / 60; // 60FPS相当のタイムステップ
const STEPS_PER_MATCH = Math.ceil(P.matchDuration / DT);

console.log(`Starting ${MATCHES} matches simulation...`);
console.log(`Match Duration: ${P.matchDuration} seconds (${STEPS_PER_MATCH} steps per match)`);
console.log("--------------------------------------------------");

// 100試合分のトータルデータを蓄積するオブジェクト
const totalStats = {
  scoreBlue: 0,
  scoreRed: 0,
  possessionFramesBlue: 0,
  possessionFramesRed: 0,
  possessionFramesNone: 0,
  draws: 0,
  winsBlue: 0,
  winsRed: 0,
};

const startTime = Date.now();

for (let i = 1; i <= MATCHES; i++) {
  const st = mkState();
  doKickOff(st);

  for (let step = 0; step < STEPS_PER_MATCH; step++) {
    update(st, DT);

    // ポゼッションの集計（ボール保持者のチームを確認）
    if (st.ball.owner !== null && st.ball.owner !== undefined) {
      // owner is player index (0-10 = Blue, 11-21 = Red)
      if (st.ball.owner <= 10) {
        totalStats.possessionFramesBlue++;
      } else {
        totalStats.possessionFramesRed++;
      }
    } else {
      totalStats.possessionFramesNone++;
    }
  }

  // 試合結果の集計
  totalStats.scoreBlue += st.sL;
  totalStats.scoreRed += st.sR;
  if (st.sL > st.sR) totalStats.winsBlue++;
  else if (st.sR > st.sL) totalStats.winsRed++;
  else totalStats.draws++;

  // 進捗表示 (10試合ごと)
  if (i % 10 === 0) {
    process.stdout.write(`[${i}/${MATCHES}] `);
  }
}

const elapsedMs = Date.now() - startTime;
console.log(`\n\nSimulation finished in ${(elapsedMs / 1000).toFixed(2)} seconds.`);
console.log("==================================================");
console.log("📊 SIMULATION RESULTS (100 matches)");
console.log("==================================================");

const totalPossessionFrames = totalStats.possessionFramesBlue + totalStats.possessionFramesRed;
const possBlue = totalPossessionFrames > 0 
  ? ((totalStats.possessionFramesBlue / totalPossessionFrames) * 100).toFixed(1)
  : "0.0";
const possRed = totalPossessionFrames > 0
  ? ((totalStats.possessionFramesRed / totalPossessionFrames) * 100).toFixed(1)
  : "0.0";

console.log(`🏆 Win Rate    : BLUE ${totalStats.winsBlue}% | RED ${totalStats.winsRed}% | DRAW ${totalStats.draws}%`);
console.log(`⚽ Goals       : BLUE ${(totalStats.scoreBlue / MATCHES).toFixed(2)} | RED ${(totalStats.scoreRed / MATCHES).toFixed(2)}`);
console.log(`⏱️  Possession  : BLUE ${possBlue}% | RED ${possRed}%`);
console.log(`📊 Total Goals : ${totalStats.scoreBlue + totalStats.scoreRed} (${((totalStats.scoreBlue + totalStats.scoreRed) / MATCHES).toFixed(2)} per match)`);
console.log("==================================================");

// Additional diagnostics
console.log(`\n🔍 Diagnostics:`);
console.log(`   Possession frames: Blue ${totalStats.possessionFramesBlue}, Red ${totalStats.possessionFramesRed}, None ${totalStats.possessionFramesNone}`);
console.log(`   Total frames: ${MATCHES * STEPS_PER_MATCH}`);
console.log(`   Possession coverage: ${((totalPossessionFrames / (MATCHES * STEPS_PER_MATCH)) * 100).toFixed(1)}%`);
