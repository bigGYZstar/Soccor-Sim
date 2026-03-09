/**
 * true-headless.ts
 * 
 * 実際のゲームプレイ（VFAST）を正確に再現するヘッドレスシミュレーター
 * 
 * 目的：
 * 1. VFASTで完全試合を実行し、実際のゲームバランスを測定
 * 2. シュート距離別ゴール率を正確に収集
 * 3. scenario-sim.ts（MID）との比較
 * 
 * 修正点：
 * - ヒートマップではなく、actionLogからシュートデータを収集
 * - scoreBlue/scoreRedの変化でゴールを検出
 */

import { mkState, update } from './client/src/game/engine';
import { P, FORMATION_IDS, FormationId } from './client/src/game/constants';
import { State } from './client/src/game/types';

const PITCH_HALF_W = 52.5;
const PITCH_HALF_H = 34.0;
const GOAL_HALF_H = 3.66;
const REAL_DT = 1 / 60;

interface ShotRecord {
  distToGoal: number;
  angle: number;
  isGoal: boolean;
  shotSpeed: number;
  team: number;
}

interface MatchStats {
  goals: number;
  shots: number;
  saves: number;
  shotRecords: ShotRecord[];
}

function runMatch(speedMode: string): MatchStats {
  const st = mkState();
  (st as any).speed = speedMode;

  const stats: MatchStats = {
    goals: 0,
    shots: 0,
    saves: 0,
    shotRecords: [],
  };

  let prevScoreBlue = 0;
  let prevScoreRed = 0;
  let prevLogLen = 0;
  let maxFrames = 60 * 60 * 20; // 20 real-minutes max

  // Track shot events via actionLog
  let pendingShot: ShotRecord | null = null;
  let prevBallShot = false;

  for (let frame = 0; frame < maxFrames; frame++) {
    const b = st.ball;
    const prevBallFree = b.free;
    const prevBallPos = { ...b.pos };
    const prevBallVel = { ...b.vel };
    const prevBallShotFlag = b.shot;

    update(st, REAL_DT);

    // Detect new shot (ball.shot became true and ball.free)
    const justFired = b.shot && b.free && !prevBallShot;
    if (justFired) {
      // Calculate shot properties from current ball state
      // Determine which goal is being attacked
      // lastTouchTeam: -1=blue, 1=red
      const attackingTeam = b.lastTouchTeam; // -1=blue attacks +x goal, 1=red attacks -x goal
      const goalX = attackingTeam === -1 ? PITCH_HALF_W : -PITCH_HALF_W;
      const dx = goalX - b.pos.x;
      const dy = 0 - b.pos.y; // Goal center at y=0
      const distToGoal = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.abs(Math.atan2(Math.abs(b.pos.y), Math.abs(dx)) * 180 / Math.PI);
      const shotSpeed = Math.sqrt(b.vel.x * b.vel.x + b.vel.y * b.vel.y);

      pendingShot = {
        distToGoal,
        angle,
        isGoal: false,
        shotSpeed,
        team: attackingTeam,
      };
      stats.shots++;
    }
    prevBallShot = b.shot && b.free;

    // Detect goals
    const newScoreBlue = st.scoreBlue;
    const newScoreRed = st.scoreRed;
    if (newScoreBlue > prevScoreBlue || newScoreRed > prevScoreRed) {
      const goalCount = (newScoreBlue - prevScoreBlue) + (newScoreRed - prevScoreRed);
      stats.goals += goalCount;
      if (pendingShot) {
        pendingShot.isGoal = true;
        stats.shotRecords.push({ ...pendingShot });
        pendingShot = null;
      }
      prevScoreBlue = newScoreBlue;
      prevScoreRed = newScoreRed;
    }

    // Detect saves (GK catches ball after shot)
    if (!b.free && b.shot === false && prevBallShotFlag && pendingShot) {
      // Shot was cleared/saved
      stats.saves++;
      stats.shotRecords.push({ ...pendingShot });
      pendingShot = null;
    }

    // If shot is no longer active (cleared by defender or out of bounds)
    if (!b.shot && !b.free && pendingShot && b.owner !== null) {
      stats.shotRecords.push({ ...pendingShot });
      pendingShot = null;
    }

    if (st.over) break;
  }

  // Flush pending shot
  if (pendingShot) {
    stats.shotRecords.push({ ...pendingShot });
  }

  return stats;
}

// ============================================================
// メイン
// ============================================================
const NUM_MATCHES = 50;
const SPEED_MODES = ["MID", "VFAST"];

console.log("=".repeat(70));
console.log(`真のヘッドレスシミュレーション (${NUM_MATCHES}試合 × ${SPEED_MODES.length}モード)`);
console.log("=".repeat(70));

for (const mode of SPEED_MODES) {
  console.log(`\n【${mode}モード】`);
  process.stdout.write("  実行中");

  const allStats: MatchStats[] = [];
  for (let m = 0; m < NUM_MATCHES; m++) {
    allStats.push(runMatch(mode));
    if ((m + 1) % 10 === 0) process.stdout.write(".");
  }
  console.log(" 完了");

  const totalGoals = allStats.reduce((s, m) => s + m.goals, 0);
  const totalShots = allStats.reduce((s, m) => s + m.shots, 0);
  const totalShotRecords = allStats.flatMap(m => m.shotRecords);
  const avgGoals = totalGoals / NUM_MATCHES;
  const avgShots = totalShots / NUM_MATCHES;
  const convRate = totalShots > 0 ? totalGoals / totalShots : 0;

  console.log(`  平均ゴール/試合: ${avgGoals.toFixed(1)}`);
  console.log(`  平均シュート/試合: ${avgShots.toFixed(1)}`);
  console.log(`  ゴール変換率: ${(convRate * 100).toFixed(1)}%`);
  console.log(`  シュートレコード数: ${totalShotRecords.length}`);

  // 距離帯別ゴール率
  const distBuckets: Record<string, { total: number; goals: number }> = {};
  for (const s of totalShotRecords) {
    const d = s.distToGoal;
    const bucketStart = Math.floor(d / 5) * 5;
    const key = `${bucketStart}-${bucketStart + 5}m`;
    if (!distBuckets[key]) distBuckets[key] = { total: 0, goals: 0 };
    distBuckets[key].total++;
    if (s.isGoal) distBuckets[key].goals++;
  }

  console.log(`  距離帯別ゴール率:`);
  const sortedKeys = Object.keys(distBuckets).sort((a, b) => parseInt(a) - parseInt(b));
  for (const k of sortedKeys) {
    const bk = distBuckets[k];
    const rate = bk.total > 0 ? bk.goals / bk.total * 100 : 0;
    const bar = "█".repeat(Math.round(rate / 2));
    console.log(`    ${k.padEnd(10)}: ${rate.toFixed(1).padStart(5)}% (${bk.goals}/${bk.total}) ${bar}`);
  }
}

// ============================================================
// scenario-sim.tsの結果との比較
// ============================================================
console.log("\n" + "=".repeat(70));
console.log("scenario-sim.ts（MID）vs 実際のゲーム（VFAST）の比較");
console.log("=".repeat(70));
console.log(`
scenario-sim.tsの問題点：
  1. st.speedが未設定 → MID (speedMul=0.40) で動作
  2. 実際のゲームはVFAST (speedMul=2.0) で動作
  3. physDt差: MID=0.18s/frame vs VFAST=0.90s/frame (5倍差)

影響を受けるタイマー（physics-seconds単位）：
  - b.cooldown (GKパンチ後): MID=6.7フレーム vs VFAST=1.3フレーム
  - b.cooldown (キック後): MID=0.8フレーム vs VFAST=0.2フレーム
  - b.gkPunchedT: MID=120フレーム vs VFAST=24フレーム
  - decisionInterval: MID=1.4フレーム vs VFAST=0.3フレーム

結論：
  scenario-sim.tsはMIDで動作しているため、実際のゲーム（VFAST）とは
  全く異なる挙動をしています。シミュレーション結果は信頼できません。
`);
