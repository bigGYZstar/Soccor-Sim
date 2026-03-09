/**
 * debug-scenario.ts
 * シナリオシミュレーターのデバッグ用スクリプト
 * 1試行のみ実行して詳細なフレームログを出力
 */

import { mkState, update, checkGoal } from './client/src/game/engine';
import { v } from './client/src/game/math';

const PITCH_HALF_W = 52.5;
const GOAL_HALF_H = 3.66;
const GOAL_DEPTH = 2.0;

const BLUE_FWD_IDX = 9;
const RED_GK_IDX = 11;

function main() {
  const st = mkState();
  st.matchPhase = "play";
  st.matchClock = 0;
  st.kickoffReady = false;

  // アクティブ選手セット
  const activeIdxs = new Set<number>();
  activeIdxs.add(BLUE_FWD_IDX);
  activeIdxs.add(RED_GK_IDX);
  st.scenarioActiveIdxs = activeIdxs;

  // 攻撃者の配置（12m）
  const attacker = st.pl[BLUE_FWD_IDX];
  attacker.pos = { x: PITCH_HALF_W - 12, y: 0 };
  attacker.home = { x: PITCH_HALF_W - 12, y: 0 };
  attacker.tgt = { x: PITCH_HALF_W - 12, y: 0 };
  attacker.face = v(1, 0);
  attacker.dt = 0;
  attacker.act = "idle";

  // ボールを攻撃者に持たせる
  st.ball.pos = { x: PITCH_HALF_W - 12, y: 0 };
  st.ball.vel = v(0, 0);
  st.ball.free = false;
  st.ball.owner = BLUE_FWD_IDX;
  st.ball.lastTouchTeam = -1;
  st.ball.shot = false;
  st.ball.cooldown = 0;
  st.ball.z = 0;
  st.ball.vz = 0;

  // GKの配置
  const gk = st.pl[RED_GK_IDX];
  gk.pos = { x: PITCH_HALF_W - 2.5, y: 0 };
  gk.home = { x: PITCH_HALF_W - 2.5, y: 0 };
  gk.tgt = { x: PITCH_HALF_W - 2.5, y: 0 };
  gk.face = v(-1, 0);
  gk.dt = 0;
  gk.act = "idle";

  const DT = 1 / 60;
  let shotFired = false;
  let prevBallShot = false;

  console.log("=== デバッグシナリオ: 12m 1対1 ===");
  console.log(`初期位置: FWD=(${attacker.pos.x.toFixed(1)}, ${attacker.pos.y.toFixed(1)}), GK=(${gk.pos.x.toFixed(1)}, ${gk.pos.y.toFixed(1)})`);
  console.log(`ゴール: x=${PITCH_HALF_W}~${PITCH_HALF_W + GOAL_DEPTH}, |y|<${GOAL_HALF_H}`);
  console.log("");

  for (let frame = 0; frame < 300; frame++) {
    update(st, DT);

    const b = st.ball;
    const timeSec = frame * DT;

    const justFired = b.shot && b.free && !prevBallShot;
    if (!shotFired && justFired) {
      shotFired = true;
      const kicker = st.pl[b.lastKickerIdx >= 0 ? b.lastKickerIdx : BLUE_FWD_IDX];
      const shotSpd = Math.sqrt(b.vel.x ** 2 + b.vel.y ** 2);
      console.log(`[Frame ${frame}] シュート発射!`);
      console.log(`  キッカー位置: (${kicker.pos.x.toFixed(2)}, ${kicker.pos.y.toFixed(2)})`);
      console.log(`  ボール位置: (${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)})`);
      console.log(`  ボール速度: (${b.vel.x.toFixed(2)}, ${b.vel.y.toFixed(2)}) = ${shotSpd.toFixed(1)} m/s`);
      console.log(`  GK位置: (${gk.pos.x.toFixed(2)}, ${gk.pos.y.toFixed(2)})`);
    }

    if (shotFired) {
      const ballSpd = Math.sqrt(b.vel.x ** 2 + b.vel.y ** 2);
      if (frame % 5 === 0 || b.pos.x > 50) {
        console.log(`[Frame ${frame}] ball=(${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)}) spd=${ballSpd.toFixed(1)} shot=${b.shot} free=${b.free} owner=${b.owner} GK=(${gk.pos.x.toFixed(2)}, ${gk.pos.y.toFixed(2)})`);
      }
    }

    prevBallShot = b.shot && b.free;

    // ゴール判定（engine.tsのcheckGoalと同じ条件）
    if (b.pos.x > PITCH_HALF_W + GOAL_DEPTH && Math.abs(b.pos.y) < GOAL_HALF_H) {
      console.log(`[Frame ${frame}] ゴール! ball=(${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)})`);
      break;
    }

    // スコア変化
    if (st.scoreRed > 0) {
      console.log(`[Frame ${frame}] スコア変化! scoreRed=${st.scoreRed}`);
      break;
    }

    // GKセーブ
    if (!b.free && b.owner === RED_GK_IDX && shotFired) {
      console.log(`[Frame ${frame}] GKセーブ! GK=(${gk.pos.x.toFixed(2)}, ${gk.pos.y.toFixed(2)}), ball=(${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)})`);
      break;
    }

    // アウト
    if (Math.abs(b.pos.x) > PITCH_HALF_W + 3 || Math.abs(b.pos.y) > 34 + 0.5) {
      if (shotFired) {
        console.log(`[Frame ${frame}] 枠外! ball=(${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)})`);
        break;
      }
    }

    // setPieceRestart
    if (st.setPieceRestart && shotFired) {
      console.log(`[Frame ${frame}] セットプレー再開: ${JSON.stringify(st.setPieceRestart)}`);
      break;
    }

    if (frame >= 299) {
      console.log(`[Frame ${frame}] タイムアウト. ball=(${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)}) owner=${b.owner}`);
    }
  }
}

main();
