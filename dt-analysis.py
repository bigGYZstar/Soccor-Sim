"""
ヘッドレス vs 実際のゲームのdt計算詳細比較
"""

# ===== 定数 =====
PHYS_SCALE = 10.8
HALF_DURATION = 120  # simulation seconds per half
SPEED_MULTIPLIERS = {
    "REAL": 240/5400,
    "VSLOW": 0.10,
    "LOW": 0.15,
    "MID": 0.40,
    "FAST": 1.0,
    "VFAST": 2.0,
}

print("=" * 70)
print("ヘッドレス vs 実際のゲームのdt計算比較")
print("=" * 70)

# ===== ヘッドレス =====
print("\n【ヘッドレス (headless-sim.ts)】")
print("  update(st, SIM_DT) where SIM_DT = 1/60")
print("  ループ: while (!st.over) { update(st, 1/60); frames++; }")
print()

for mode in ["MID", "FAST", "VFAST"]:
    speedMul = SPEED_MULTIPLIERS[mode]
    physDt_headless = 1/60  # SIM_DT
    phys_dt = physDt_headless * PHYS_SCALE
    sim_dt = physDt_headless * speedMul
    
    # 1試合の総フレーム数
    total_sim_time = HALF_DURATION * 2  # 240 sim-seconds
    frames_per_match = total_sim_time / sim_dt
    
    print(f"  {mode} (speedMul={speedMul}):")
    print(f"    physDt = {physDt_headless:.5f}s")
    print(f"    physics dt = physDt * PHYS_SCALE = {phys_dt:.4f} phys-s/frame")
    print(f"    simDt = physDt * speedMul = {sim_dt:.5f} match-s/frame")
    print(f"    1試合のフレーム数 = {total_sim_time} / {sim_dt:.5f} = {frames_per_match:.0f} frames")
    print()

# ===== 実際のゲーム =====
print("\n【実際のゲーム (Home.tsx)】")
print("  rawDt = min(0.05, elapsed)  ≈ 1/60 at 60fps")
print("  subSteps: VFAST=8, FAST=4, MID=2, SLOW=1")
print("  dt = rawDt / subSteps")
print("  for _s in range(subSteps): update(st, dt)")
print()

SUBSTEPS = {"MID": 2, "FAST": 4, "VFAST": 8}
RAW_DT = 1/60  # 60fps

for mode in ["MID", "FAST", "VFAST"]:
    speedMul = SPEED_MULTIPLIERS[mode]
    substeps = SUBSTEPS[mode]
    dt_per_substep = RAW_DT / substeps
    physDt_per_substep = dt_per_substep
    phys_dt_per_substep = physDt_per_substep * PHYS_SCALE
    sim_dt_per_substep = physDt_per_substep * speedMul
    
    # Per frame (all substeps combined)
    phys_dt_per_frame = phys_dt_per_substep * substeps
    sim_dt_per_frame = sim_dt_per_substep * substeps
    
    # 1試合の総フレーム数
    total_sim_time = HALF_DURATION * 2
    frames_per_match = total_sim_time / sim_dt_per_frame
    
    print(f"  {mode} (speedMul={speedMul}, subSteps={substeps}):")
    print(f"    dt per substep = {RAW_DT:.5f} / {substeps} = {dt_per_substep:.5f}s")
    print(f"    physics dt per substep = {phys_dt_per_substep:.4f} phys-s")
    print(f"    simDt per substep = {sim_dt_per_substep:.5f} match-s")
    print(f"    [per frame] physics dt = {phys_dt_per_frame:.4f} phys-s")
    print(f"    [per frame] simDt = {sim_dt_per_frame:.5f} match-s")
    print(f"    1試合のフレーム数 = {total_sim_time} / {sim_dt_per_frame:.5f} = {frames_per_match:.0f} frames")
    print()

# ===== 比較 =====
print("\n【ヘッドレス vs 実際のゲーム の比較】")
print(f"{'モード':<8} {'HL phys_dt':<15} {'Game phys_dt':<15} {'差異':<10} {'HL simDt':<12} {'Game simDt':<12} {'差異':<10}")
print("-" * 85)

for mode in ["MID", "FAST", "VFAST"]:
    speedMul = SPEED_MULTIPLIERS[mode]
    substeps = SUBSTEPS[mode]
    
    # ヘッドレス
    hl_physDt = 1/60
    hl_phys_dt = hl_physDt * PHYS_SCALE
    hl_sim_dt = hl_physDt * speedMul
    
    # 実際のゲーム (per frame)
    game_dt_per_sub = (1/60) / substeps
    game_phys_dt = game_dt_per_sub * PHYS_SCALE * substeps
    game_sim_dt = game_dt_per_sub * speedMul * substeps
    
    phys_ratio = game_phys_dt / hl_phys_dt
    sim_ratio = game_sim_dt / hl_sim_dt
    
    print(f"{mode:<8} {hl_phys_dt:<15.4f} {game_phys_dt:<15.4f} {phys_ratio:<10.3f} {hl_sim_dt:<12.5f} {game_sim_dt:<12.5f} {sim_ratio:<10.3f}")

print()
print("→ 物理dt・試合時計dtともにほぼ同一（差異 < 1%）")
print()
print("=" * 70)
print("【重要な発見: sp.timerの問題】")
print("=" * 70)
print()
print("engine.ts line 4413: sp.timer += dt;")
print("  dtはphysics dt (physDt * PHYS_SCALE = 0.18)")
print()
print("WALK_DUR = 0.60, SETUP_DUR = 0.20, WINDUP_DUR = 0.35, KICK_DUR = 0.05")
print()
print("ヘッドレス (VFAST, physDt=1/60):")
hl_physDt = 1/60
hl_dt = hl_physDt * PHYS_SCALE
print(f"  dt = {hl_physDt:.5f} * {PHYS_SCALE} = {hl_dt:.4f} phys-s/frame")
print(f"  WALK_DUR(0.60) = {0.60/hl_dt:.1f} frames")
print(f"  SETUP_DUR(0.20) = {0.20/hl_dt:.1f} frames")
print(f"  WINDUP_DUR(0.35) = {0.35/hl_dt:.1f} frames")
print(f"  KICK_DUR(0.05) = {0.05/hl_dt:.1f} frames")
print()

print("実際のゲーム (VFAST, subSteps=8, rawDt=1/60):")
game_dt_per_sub = (1/60) / 8
game_phys_dt_per_sub = game_dt_per_sub * PHYS_SCALE
print(f"  dt per substep = {game_dt_per_sub:.5f} * {PHYS_SCALE} = {game_phys_dt_per_sub:.4f} phys-s/substep")
print(f"  WALK_DUR(0.60) = {0.60/game_phys_dt_per_sub:.1f} substeps = {0.60/game_phys_dt_per_sub/8:.1f} frames")
print(f"  SETUP_DUR(0.20) = {0.20/game_phys_dt_per_sub:.1f} substeps = {0.20/game_phys_dt_per_sub/8:.1f} frames")
print(f"  WINDUP_DUR(0.35) = {0.35/game_phys_dt_per_sub:.1f} substeps = {0.35/game_phys_dt_per_sub/8:.1f} frames")
print(f"  KICK_DUR(0.05) = {0.05/game_phys_dt_per_sub:.1f} substeps = {0.05/game_phys_dt_per_sub/8:.1f} frames")
print()
print("→ セットピースのタイマーはほぼ同じ（substepで8分割されるが合計は同じ）")
print()
print("=" * 70)
print("【重要な発見: p.dt (AI判断タイマー) の問題】")
print("=" * 70)
print()
print("engine.ts line 4825: p.dt = PExt.decisionInterval;  // Fixed physics-time interval (0.25s)")
print("engine.ts line 4820: p.dt -= dt;  // dtはphysics dt")
print()
print("decisionInterval = 0.25 (physics-seconds)")
print()
print("ヘッドレス (VFAST):")
hl_dt = (1/60) * PHYS_SCALE
print(f"  dt = {hl_dt:.4f} phys-s/frame")
print(f"  AI判断間隔 = 0.25 / {hl_dt:.4f} = {0.25/hl_dt:.1f} frames")
print()
print("実際のゲーム (VFAST, subSteps=8):")
game_dt_sub = (1/60) / 8 * PHYS_SCALE
print(f"  dt per substep = {game_dt_sub:.4f} phys-s/substep")
print(f"  AI判断間隔 = 0.25 / {game_dt_sub:.4f} = {0.25/game_dt_sub:.1f} substeps = {0.25/game_dt_sub/8:.1f} frames")
print()
print("→ AI判断頻度もほぼ同じ")
print()
print("=" * 70)
print("【重要な発見: replayWallTimeAccum の問題】")
print("=" * 70)
print()
print("engine.ts line 4773: rawElapsed = dt / speedMulForReplay")
print("  dt = physDt * PHYS_SCALE (physics dt, NOT original dt)")
print("  speedMulForReplay = SPEED_MULTIPLIERS[st.speed]")
print()
print("ヘッドレス (VFAST):")
hl_physDt = 1/60
hl_dt_phys = hl_physDt * PHYS_SCALE
speedMul_vfast = 2.0
raw_elapsed_hl = hl_dt_phys / speedMul_vfast
print(f"  dt (physics) = {hl_dt_phys:.4f}")
print(f"  rawElapsed = {hl_dt_phys:.4f} / {speedMul_vfast} = {raw_elapsed_hl:.4f}s")
print(f"  → 1フレームで {raw_elapsed_hl:.4f}s 分のリプレイが蓄積される")
print()
print("実際のゲーム (VFAST, subSteps=8):")
game_dt_sub_phys = (1/60) / 8 * PHYS_SCALE
raw_elapsed_game = game_dt_sub_phys / speedMul_vfast
print(f"  dt per substep (physics) = {game_dt_sub_phys:.4f}")
print(f"  rawElapsed per substep = {game_dt_sub_phys:.4f} / {speedMul_vfast} = {raw_elapsed_game:.4f}s")
print(f"  8 substeps → {raw_elapsed_game * 8:.4f}s/frame")
print()
print("→ リプレイ蓄積はほぼ同じ")
