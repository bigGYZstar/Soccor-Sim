/**
 * debug-scenario2.ts
 * kick()関数の内部をデバッグするためのスクリプト
 */

import { mkState, update, footAccuracyModifier } from './client/src/game/engine';
import { v, vdist, vnorm, vsub } from './client/src/game/math';

const PITCH_HALF_W = 52.5;
const BLUE_FWD_IDX = 9;
const RED_GK_IDX = 11;

function main() {
  const st = mkState();
  st.matchPhase = "play";
  st.matchClock = 0;
  st.kickoffReady = false;

  const activeIdxs = new Set<number>();
  activeIdxs.add(BLUE_FWD_IDX);
  activeIdxs.add(RED_GK_IDX);
  st.scenarioActiveIdxs = activeIdxs;

  const attacker = st.pl[BLUE_FWD_IDX];
  attacker.pos = { x: PITCH_HALF_W - 12, y: 0 };
  attacker.home = { x: PITCH_HALF_W - 12, y: 0 };
  attacker.tgt = { x: PITCH_HALF_W - 12, y: 0 };
  attacker.face = v(1, 0);
  attacker.dt = 0;
  attacker.act = "idle";

  st.ball.pos = { x: PITCH_HALF_W - 12, y: 0 };
  st.ball.vel = v(0, 0);
  st.ball.free = false;
  st.ball.owner = BLUE_FWD_IDX;
  st.ball.lastTouchTeam = -1;
  st.ball.shot = false;
  st.ball.cooldown = 0;
  st.ball.z = 0;
  st.ball.vz = 0;

  const gk = st.pl[RED_GK_IDX];
  gk.pos = { x: PITCH_HALF_W - 2.5, y: 0 };
  gk.home = { x: PITCH_HALF_W - 2.5, y: 0 };
  gk.tgt = { x: PITCH_HALF_W - 2.5, y: 0 };
  gk.face = v(-1, 0);
  gk.dt = 0;
  gk.act = "idle";

  // 初期状態の足の位置を確認
  console.log("=== 初期状態 ===");
  console.log(`FWD pos: (${attacker.pos.x.toFixed(2)}, ${attacker.pos.y.toFixed(2)})`);
  console.log(`FWD face: (${attacker.face.x.toFixed(2)}, ${attacker.face.y.toFixed(2)})`);
  console.log(`FWD leftFoot: (${attacker.leftFoot.pos.x.toFixed(2)}, ${attacker.leftFoot.pos.y.toFixed(2)})`);
  console.log(`FWD rightFoot: (${attacker.rightFoot.pos.x.toFixed(2)}, ${attacker.rightFoot.pos.y.toFixed(2)})`);
  console.log(`ball pos: (${st.ball.pos.x.toFixed(2)}, ${st.ball.pos.y.toFixed(2)})`);
  console.log(`FWD team: ${attacker.team}`);
  console.log(`gc = v(-team*52.5, 0) = v(${-attacker.team * PITCH_HALF_W}, 0)`);
  console.log("");

  // footAccuracyModifierを計算
  const footModL = footAccuracyModifier(attacker, "L", st.ball.pos);
  const footModR = footAccuracyModifier(attacker, "R", st.ball.pos);
  console.log(`footMod L: ${footModL.toFixed(3)}`);
  console.log(`footMod R: ${footModR.toFixed(3)}`);
  const distL = vdist(attacker.leftFoot.pos, st.ball.pos);
  const distR = vdist(attacker.rightFoot.pos, st.ball.pos);
  console.log(`dist L foot to ball: ${distL.toFixed(3)}`);
  console.log(`dist R foot to ball: ${distR.toFixed(3)}`);
  console.log("");

  // 1フレーム実行
  const DT = 1 / 60;
  update(st, DT);

  const b = st.ball;
  console.log("=== 1フレーム後 ===");
  console.log(`ball pos: (${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)})`);
  console.log(`ball vel: (${b.vel.x.toFixed(2)}, ${b.vel.y.toFixed(2)})`);
  console.log(`ball shot: ${b.shot}, free: ${b.free}`);
  console.log(`ball owner: ${b.owner}`);
  if (b.shot) {
    const spd = Math.sqrt(b.vel.x ** 2 + b.vel.y ** 2);
    const dir = vnorm(b.vel);
    console.log(`shot speed: ${spd.toFixed(1)} m/s`);
    console.log(`shot dir: (${dir.x.toFixed(3)}, ${dir.y.toFixed(3)})`);
    console.log(`FWD pos after: (${attacker.pos.x.toFixed(2)}, ${attacker.pos.y.toFixed(2)})`);
    console.log(`FWD leftFoot after: (${attacker.leftFoot.pos.x.toFixed(2)}, ${attacker.leftFoot.pos.y.toFixed(2)})`);
    console.log(`FWD rightFoot after: (${attacker.rightFoot.pos.x.toFixed(2)}, ${attacker.rightFoot.pos.y.toFixed(2)})`);
    
    // ターゲット方向を逆算
    const gc = v(-attacker.team * PITCH_HALF_W, 0);
    console.log(`gc: (${gc.x.toFixed(2)}, ${gc.y.toFixed(2)})`);
    const expectedDir = vnorm(vsub(gc, attacker.pos));
    console.log(`expected dir (to goal): (${expectedDir.x.toFixed(3)}, ${expectedDir.y.toFixed(3)})`);
  }
}

main();
