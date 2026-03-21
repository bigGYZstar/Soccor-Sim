# dt差異分析

## ヘッドレス vs 実際のゲームのupdate()呼び出し比較

### ヘッドレス (headless-sim.ts)
```
const SIM_DT = 1 / 60;  // = 0.01667s
update(st, SIM_DT);     // 毎フレーム1回呼ぶ
```
→ update()に渡すdt = **0.01667**

### 実際のゲーム (Home.tsx, VFAST)
```
const rawDt = Math.min(0.05, elapsed);  // 実際の経過時間 (≈0.016s@60fps)
const subSteps = 8;  // VFASTは8サブステップ
const dt = rawDt / subSteps;  // = 0.016/8 = 0.002s
for (_s = 0; _s < 8; _s++) {
  update(st, dt);  // 毎フレーム8回呼ぶ
}
```
→ update()に渡すdt = **0.002** (8回呼ぶ)

### engine.ts内でのdt変換
```
const PHYS_SCALE = 10.8;
dt = physDt * PHYS_SCALE;  // 物理dt
const simDt = physDt * speedMul;  // 試合時計dt
```

## 計算比較

### ヘッドレス (VFAST, SIM_DT=1/60)
- physDt = 1/60 = 0.01667s
- 物理dt = 0.01667 * 10.8 = **0.18 physics-s/frame**
- simDt = 0.01667 * 2.0 = **0.0333 match-s/frame**
- 1試合 (P.halfDuration * 2 sim-s): halfDuration確認が必要

### 実際のゲーム (VFAST, rawDt≈0.016, 8 substeps)
- physDt = 0.016/8 = 0.002s (per substep)
- 物理dt = 0.002 * 10.8 = **0.0216 physics-s/substep**
- 8 substeps/frame → 0.0216 * 8 = **0.1728 physics-s/frame**
- simDt = 0.002 * 2.0 = **0.004 match-s/substep**
- 8 substeps/frame → 0.004 * 8 = **0.032 match-s/frame**

## 結論
- 物理dt: ヘッドレス 0.18 vs 実際 0.1728 → **約4%差** (ほぼ同じ)
- 試合時計進行: ヘッドレス 0.0333 vs 実際 0.032 → **約4%差** (ほぼ同じ)

→ dtの差は小さい。別の原因がある可能性が高い。
