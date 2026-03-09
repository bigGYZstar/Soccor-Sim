/**
 * calc-goal-rate.ts
 * ゴール率のシミュレーション計算
 * 
 * パラメータを変えてゴール率を計算する
 */

// パラメータ
const GOAL_HALF_H = 3.66; // ゴール半幅
const SHOT_ACCURACY = 0.58; // 基本射撃精度
const GK_SAVE_BASE = 0.20; // GKの基本セーブ確率
const GK_SAVE_ANGLE_BONUS = 0.15; // 角度ボーナス（正面からのシュートで最大）
const GK_SAVE_RADIUS = 0.9; // GKのセーブ半径（m）

// 距離ごとのpSAとゴール率を計算
function calcGoalRate(
  distToGoal: number,
  pSAMultiplier: number,
  gkSaveRadiusMultiplier: number,
  gkSaveBase: number,
  gkAngleBonus: number,
  trials: number = 100000
): {
  goalRate: number;
  saveRate: number;
  missRate: number;
  canSaveRate: number;
} {
  const pSA = (1 - SHOT_ACCURACY) * 2.5 * pSAMultiplier;
  const effectiveSaveRadius = GK_SAVE_RADIUS * gkSaveRadiusMultiplier;
  
  let goals = 0;
  let saves = 0;
  let misses = 0;
  let canSaves = 0;
  
  for (let i = 0; i < trials; i++) {
    // シュートの誤差（Y軸のみ）
    const yErr = (Math.random() * 2 - 1) * pSA;
    const targetY = yErr; // GCはy=0
    
    // 枠外チェック
    if (Math.abs(targetY) > GOAL_HALF_H) {
      misses++;
      continue;
    }
    
    // GKのY位置（y=0に固定）
    const gkY = 0;
    
    // GKとシュートの距離
    const distGKToShot = Math.abs(targetY - gkY);
    
    // canSave判定
    const canSave = distGKToShot < effectiveSaveRadius;
    if (canSave) canSaves++;
    
    if (canSave) {
      // セーブ確率
      const saveChance = gkSaveBase + gkAngleBonus * 0.8; // 正面からのシュートで0.8倍
      if (Math.random() < saveChance) {
        saves++;
      } else {
        goals++;
      }
    } else {
      goals++;
    }
  }
  
  return {
    goalRate: goals / trials,
    saveRate: saves / trials,
    missRate: misses / trials,
    canSaveRate: canSaves / trials,
  };
}

// 異なるパラメータでテスト
console.log("=== ゴール率シミュレーション ===\n");

// テスト1: 現在のパラメータ（pSA距離スケールなし、gkSaveRadius=0.9m）
console.log("【テスト1: 現在のパラメータ（pSA=1.05m固定、gkSaveRadius=0.9m）】");
for (const dist of [12, 16.5, 22, 27]) {
  const r = calcGoalRate(dist, 1.0, 1.0, 0.30, 0.15);
  console.log(`  ${dist}m: ゴール=${(r.goalRate*100).toFixed(1)}%, セーブ=${(r.saveRate*100).toFixed(1)}%, 枠外=${(r.missRate*100).toFixed(1)}%, canSave率=${(r.canSaveRate*100).toFixed(1)}%`);
}

// テスト2: pSA距離スケール（distScale = dist/12）
console.log("\n【テスト2: pSA距離スケール（dist/12）、gkSaveRadius=0.9m、gkSaveBase=0.20】");
for (const dist of [12, 16.5, 22, 27]) {
  const distScale = dist / 12.0;
  const r = calcGoalRate(dist, distScale, 1.0, 0.20, 0.15);
  const pSA = (1 - SHOT_ACCURACY) * 2.5 * distScale;
  console.log(`  ${dist}m: pSA=±${pSA.toFixed(2)}m, ゴール=${(r.goalRate*100).toFixed(1)}%, セーブ=${(r.saveRate*100).toFixed(1)}%, 枠外=${(r.missRate*100).toFixed(1)}%`);
}

// テスト3: pSA距離スケール（distScale = (dist/12)^2）
console.log("\n【テスト3: pSA距離スケール（(dist/12)^2）、gkSaveRadius=0.9m、gkSaveBase=0.20】");
for (const dist of [12, 16.5, 22, 27]) {
  const distScale = Math.pow(dist / 12.0, 2);
  const r = calcGoalRate(dist, distScale, 1.0, 0.20, 0.15);
  const pSA = (1 - SHOT_ACCURACY) * 2.5 * distScale;
  console.log(`  ${dist}m: pSA=±${pSA.toFixed(2)}m, ゴール=${(r.goalRate*100).toFixed(1)}%, セーブ=${(r.saveRate*100).toFixed(1)}%, 枠外=${(r.missRate*100).toFixed(1)}%`);
}

// テスト4: pSA距離スケール + gkSaveRadius距離スケール
console.log("\n【テスト4: pSA=(dist/12)^1.5 * 1.05m、gkSaveRadius=0.9*(dist/12)^0.5m、gkSaveBase=0.20】");
for (const dist of [12, 16.5, 22, 27]) {
  const pSAScale = Math.pow(dist / 12.0, 1.5);
  const gkRadScale = Math.pow(dist / 12.0, 0.5);
  const r = calcGoalRate(dist, pSAScale, gkRadScale, 0.20, 0.15);
  const pSA = (1 - SHOT_ACCURACY) * 2.5 * pSAScale;
  const gkRad = GK_SAVE_RADIUS * gkRadScale;
  console.log(`  ${dist}m: pSA=±${pSA.toFixed(2)}m, gkRad=${gkRad.toFixed(2)}m, ゴール=${(r.goalRate*100).toFixed(1)}%, セーブ=${(r.saveRate*100).toFixed(1)}%, 枠外=${(r.missRate*100).toFixed(1)}%`);
}

// テスト5: 目標ゴール率に合わせたパラメータ探索
console.log("\n【テスト5: 目標ゴール率（12m:77%, 16.5m:45%, 22m:18%, 27m:10%）に合わせたパラメータ探索】");

// 目標ゴール率
const targets = { 12: 0.77, 16.5: 0.45, 22: 0.18, 27: 0.10 };

// パラメータ探索
const bestParams: { [dist: number]: { pSAScale: number; gkRadScale: number; gkSaveBase: number; goalRate: number } } = {};

for (const [distStr, targetRate] of Object.entries(targets)) {
  const dist = parseFloat(distStr);
  let bestError = Infinity;
  let bestP = { pSAScale: 1.0, gkRadScale: 1.0, gkSaveBase: 0.20, goalRate: 0 };
  
  for (let pSAScale = 0.5; pSAScale <= 5.0; pSAScale += 0.1) {
    for (let gkRadScale = 0.5; gkRadScale <= 3.0; gkRadScale += 0.1) {
      for (let gkSaveBase = 0.10; gkSaveBase <= 0.50; gkSaveBase += 0.05) {
        const r = calcGoalRate(dist, pSAScale, gkRadScale, gkSaveBase, 0.10, 10000);
        const error = Math.abs(r.goalRate - targetRate);
        if (error < bestError) {
          bestError = error;
          bestP = { pSAScale, gkRadScale, gkSaveBase, goalRate: r.goalRate };
        }
      }
    }
  }
  
  bestParams[dist] = bestP;
  const pSA = (1 - SHOT_ACCURACY) * 2.5 * bestP.pSAScale;
  const gkRad = GK_SAVE_RADIUS * bestP.gkRadScale;
  console.log(`  ${dist}m: 目標=${(targetRate*100).toFixed(0)}%, 実際=${(bestP.goalRate*100).toFixed(1)}%, pSAScale=${bestP.pSAScale.toFixed(1)}, pSA=±${pSA.toFixed(2)}m, gkRadScale=${bestP.gkRadScale.toFixed(1)}, gkRad=${gkRad.toFixed(2)}m, gkSaveBase=${bestP.gkSaveBase.toFixed(2)}`);
}

// テスト6: 統一パラメータで全距離をテスト
console.log("\n【テスト6: 統一パラメータ（pSAScale=(dist/12)^2.5、gkSaveRadius=1.5m、gkSaveBase=0.15）】");
for (const dist of [12, 16.5, 22, 27]) {
  const pSAScale = Math.pow(dist / 12.0, 2.5);
  const r = calcGoalRate(dist, pSAScale, 1.5/0.9, 0.15, 0.10, 100000);
  const pSA = (1 - SHOT_ACCURACY) * 2.5 * pSAScale;
  console.log(`  ${dist}m: pSA=±${pSA.toFixed(2)}m, ゴール=${(r.goalRate*100).toFixed(1)}%, セーブ=${(r.saveRate*100).toFixed(1)}%, 枠外=${(r.missRate*100).toFixed(1)}%`);
}

// テスト7: 統一パラメータ（pSAScale=(dist/12)^3、gkSaveRadius=1.2m、gkSaveBase=0.15）
console.log("\n【テスト7: 統一パラメータ（pSAScale=(dist/12)^3、gkSaveRadius=1.2m、gkSaveBase=0.15）】");
for (const dist of [12, 16.5, 22, 27]) {
  const pSAScale = Math.pow(dist / 12.0, 3.0);
  const r = calcGoalRate(dist, pSAScale, 1.2/0.9, 0.15, 0.10, 100000);
  const pSA = (1 - SHOT_ACCURACY) * 2.5 * pSAScale;
  console.log(`  ${dist}m: pSA=±${pSA.toFixed(2)}m, ゴール=${(r.goalRate*100).toFixed(1)}%, セーブ=${(r.saveRate*100).toFixed(1)}%, 枠外=${(r.missRate*100).toFixed(1)}%`);
}

// テスト8: 統一パラメータ（pSAScale=(dist/12)^2、gkSaveRadius=1.2m、gkSaveBase=0.15）
console.log("\n【テスト8: 統一パラメータ（pSAScale=(dist/12)^2、gkSaveRadius=1.2m、gkSaveBase=0.15）】");
for (const dist of [12, 16.5, 22, 27]) {
  const pSAScale = Math.pow(dist / 12.0, 2.0);
  const r = calcGoalRate(dist, pSAScale, 1.2/0.9, 0.15, 0.10, 100000);
  const pSA = (1 - SHOT_ACCURACY) * 2.5 * pSAScale;
  console.log(`  ${dist}m: pSA=±${pSA.toFixed(2)}m, ゴール=${(r.goalRate*100).toFixed(1)}%, セーブ=${(r.saveRate*100).toFixed(1)}%, 枠外=${(r.missRate*100).toFixed(1)}%`);
}
