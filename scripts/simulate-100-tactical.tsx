import { mkState, doKickOff, update } from '../client/src/game/engine';
import { P } from '../client/src/game/constants';

const MATCHES = 100;
const DT = 1 / 60; // 60FPS
const STEPS_PER_MATCH = Math.ceil(120 / DT); // 120秒

console.log(`Starting ${MATCHES} matches simulation for Tactical Analysis...`);
console.log("--------------------------------------------------");

// --- 集計用データ構造 ---
const stats = {
  winsBlue: 0, winsRed: 0, draws: 0,
  goalsBlue: 0, goalsRed: 0,
  shotsBlue: 0, shotsRed: 0,
  
  // パス関連
  passesBlue: 0, passesRed: 0,
  forwardPassesBlue: 0, forwardPassesRed: 0,
  
  // アクション関連
  carryFramesBlue: 0, carryFramesRed: 0,
  
  // エリア別ポゼッション (フレーム数)
  possTotalBlue: 0, possTotalRed: 0,
  zoneDefBlue: 0, zoneMidBlue: 0, zoneAttBlue: 0,
  zoneDefRed: 0, zoneMidRed: 0, zoneAttRed: 0,
};

const startTime = Date.now();

for (let i = 1; i <= MATCHES; i++) {
  const st = mkState();
  // v8.1の形式に合わせてキックオフ (-1 = Blueから)
  doKickOff(st, -1); 

  let lastTrailStr = "";
  let lastOwner: number | null = null;

  for (let step = 0; step < STEPS_PER_MATCH; step++) {
    const prevOwner = lastOwner;
    lastOwner = st.ball.owner;
    
    update(st, DT);

    // --- 1. ポゼッションとエリアの集計 ---
    if (st.ball.owner !== null) {
      const owner = st.pl[st.ball.owner];
      const team = owner.team; // -1(Blue) or 1(Red)
      
      // 進行度合いの計算 (相手ゴール方向がプラスになるように正規化)
      // Blue(-1)は+X方向、Red(1)は-X方向が前
      const progressX = st.ball.pos.x * (-team); 
      const thirdDist = P.pitchHalfW / 3; // ピッチの1/3の長さ (20/3 = 6.66)

      if (team === -1) {
        stats.possTotalBlue++;
        if (progressX < -thirdDist) stats.zoneDefBlue++;       // 自陣深く (Defensive 3rd)
        else if (progressX > thirdDist) stats.zoneAttBlue++;    // 敵陣深く (Attacking 3rd)
        else stats.zoneMidBlue++;                               // 中盤 (Middle 3rd)
        
        if (owner.act === "carry") stats.carryFramesBlue++;
      } else {
        stats.possTotalRed++;
        if (progressX < -thirdDist) stats.zoneDefRed++;
        else if (progressX > thirdDist) stats.zoneAttRed++;
        else stats.zoneMidRed++;
        
        if (owner.act === "carry") stats.carryFramesRed++;
      }
    }

    // --- 2. パス・シュート方向の集計 ---
    if (st.trail) {
      // Trailを文字列化して重複カウントを防止
      const tStr = `${st.trail.start.x.toFixed(2)},${st.trail.start.y.toFixed(2)}->${st.trail.end.x.toFixed(2)},${st.trail.end.y.toFixed(2)}`;
      if (tStr !== lastTrailStr && prevOwner !== null) {
        lastTrailStr = tStr;
        const team = st.pl[prevOwner].team; // Use previous owner's team

        if (st.trail.shot) {
          if (team === -1) stats.shotsBlue++;
          else stats.shotsRed++;
        } else {
          if (team === -1) stats.passesBlue++;
          else stats.passesRed++;

          // 縦パス判定 (相手ゴール方向へ0.5ユニット以上前進したか)
          const isForward = (st.trail.end.x - st.trail.start.x) * (-team) > 0.5;
          if (isForward) {
            if (team === -1) stats.forwardPassesBlue++;
            else stats.forwardPassesRed++;
          }
        }
      }
    } else {
      lastTrailStr = "";
    }
  }

  // 試合結果の集計
  stats.goalsBlue += st.sL;  // Blue = Left
  stats.goalsRed += st.sR;   // Red = Right
  if (st.sL > st.sR) stats.winsBlue++;
  else if (st.sR > st.sL) stats.winsRed++;
  else stats.draws++;

  // 進捗バー (10試合ごと)
  if (i % 10 === 0) process.stdout.write(`[${i}/${MATCHES}] `);
}

const elapsedMs = Date.now() - startTime;
console.log(`\n\nSimulation finished in ${(elapsedMs / 1000).toFixed(2)} seconds.`);
console.log("==================================================");
console.log("📊 TACTICAL ANALYSIS REPORT (Average per match)");
console.log("==================================================");

// パーセンテージ計算ヘルパー
const pct = (part: number, total: number) => total > 0 ? ((part / total) * 100).toFixed(1) : "0.0";
const avg = (total: number) => (total / MATCHES).toFixed(2);

console.log(`🏆 Win Rate    : BLUE ${pct(stats.winsBlue, MATCHES)}% | RED ${pct(stats.winsRed, MATCHES)}% | DRAW ${pct(stats.draws, MATCHES)}%`);
console.log(`⚽ Goals       : BLUE ${avg(stats.goalsBlue)} | RED ${avg(stats.goalsRed)}`);
console.log(`👟 Shots       : BLUE ${avg(stats.shotsBlue)} | RED ${avg(stats.shotsRed)}`);
console.log("--------------------------------------------------");
console.log("📈 ATTACKING METRICS (The Bottleneck Detectors)");
console.log("--------------------------------------------------");

// BLUEの分析
console.log(`🟦 BLUE TEAM:`);
console.log(`   - Passes       : ${avg(stats.passesBlue)} per match`);
console.log(`   - Forward Pass : ${pct(stats.forwardPassesBlue, stats.passesBlue)}% (Verticality)`);
console.log(`   - Zone DEF     : ${pct(stats.zoneDefBlue, stats.possTotalBlue)}% (Stuck in own half?)`);
console.log(`   - Zone MID     : ${pct(stats.zoneMidBlue, stats.possTotalBlue)}%`);
console.log(`   - Zone ATT     : ${pct(stats.zoneAttBlue, stats.possTotalBlue)}% (Attacking Threat)`);

// REDの分析
console.log(`\n🟥 RED TEAM:`);
console.log(`   - Passes       : ${avg(stats.passesRed)} per match`);
console.log(`   - Forward Pass : ${pct(stats.forwardPassesRed, stats.passesRed)}% (Verticality)`);
console.log(`   - Zone DEF     : ${pct(stats.zoneDefRed, stats.possTotalRed)}% (Stuck in own half?)`);
console.log(`   - Zone MID     : ${pct(stats.zoneMidRed, stats.possTotalRed)}%`);
console.log(`   - Zone ATT     : ${pct(stats.zoneAttRed, stats.possTotalRed)}% (Attacking Threat)`);
console.log("==================================================");
console.log("\n💡 DIAGNOSIS GUIDE:");
console.log("   - Zone DEF > 50%: U-shaped passing disease (stuck in own half)");
console.log("   - Forward Pass < 30%: Too many sideways/backward passes");
console.log("   - Zone ATT < 10%: Not reaching shooting positions");
console.log("==================================================");
