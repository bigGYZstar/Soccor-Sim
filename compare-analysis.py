"""
ヘッドレス vs 実際のゲームの詳細比較分析
"""

print("=" * 70)
print("ヘッドレス vs 実際のゲーム 比較分析")
print("=" * 70)

# ===== ヘッドレス結果 (20試合) =====
headless_matches = [
    (3,3,8110,10,9),
    (3,1,7928,10,10),
    (3,2,8019,6,14),
    (0,6,8110,0,10),
    (4,1,8019,8,4),
    (3,2,8019,12,4),
    (3,2,8019,9,6),
    (2,3,8019,6,12),
    (1,1,7746,12,5),
    (4,1,8019,13,3),
    (1,1,7746,8,5),
    (3,7,8474,6,17),
    (3,2,8019,7,7),
    (3,5,8292,9,11),
    (5,2,8201,9,9),
    (0,2,7746,4,7),
    (4,2,8110,11,9),
    (0,4,7928,2,9),
    (2,1,7837,12,2),
    (3,2,8019,5,7),
]

# ===== 実際のゲーム結果 (1試合観察) =====
# BLU 9 - RED 9 (DRAW)
# Shots: BLU 25, RED 27
# 試合時間: 90分 (VFAST)
actual_game = {
    'blue': 9,
    'red': 9,
    'total_goals': 18,
    'shots_blue': 25,
    'shots_red': 27,
    'total_shots': 52,
}

print("\n【ヘッドレス 20試合統計 (VFAST, SIM_DT=1/60)】")
hl_goals = [b+r for b,r,f,sb,sr in headless_matches]
hl_frames = [f for b,r,f,sb,sr in headless_matches]
hl_shots = [sb+sr for b,r,f,sb,sr in headless_matches]

avg_goals = sum(hl_goals) / len(hl_goals)
avg_frames = sum(hl_frames) / len(hl_frames)
avg_shots = sum(hl_shots) / len(hl_shots)

print(f"  平均ゴール数/試合: {avg_goals:.2f}")
print(f"  平均フレーム数/試合: {avg_frames:.0f}")
print(f"  平均シュート数/試合: {avg_shots:.1f}")
print(f"  ゴール率/フレーム: {avg_goals/avg_frames:.6f}")
print(f"  ゴール率/シュート: {avg_goals/avg_shots:.3f}")
print(f"  スコア分布: {sorted(hl_goals)}")

print("\n【実際のゲーム 1試合 (VFAST, ブラウザ)】")
print(f"  ゴール数: {actual_game['total_goals']}")
print(f"  シュート数: {actual_game['total_shots']}")
print(f"  ゴール率/シュート: {actual_game['total_goals']/actual_game['total_shots']:.3f}")

print("\n【比較】")
print(f"  ゴール数: ヘッドレス {avg_goals:.1f} vs 実際 {actual_game['total_goals']} → {actual_game['total_goals']/avg_goals:.1f}倍")
print(f"  シュート数: ヘッドレス {avg_shots:.1f} vs 実際 {actual_game['total_shots']} → {actual_game['total_shots']/avg_shots:.1f}倍")
print(f"  ゴール率/シュート: ヘッドレス {avg_goals/avg_shots:.3f} vs 実際 {actual_game['total_goals']/actual_game['total_shots']:.3f}")

print()
print("=" * 70)
print("【重要な発見】")
print("=" * 70)
print()
print("1. シュート数の乖離:")
print(f"   ヘッドレス: {avg_shots:.1f}本/試合")
print(f"   実際のゲーム: {actual_game['total_shots']}本/試合")
print(f"   → 実際のゲームのシュート数は {actual_game['total_shots']/avg_shots:.1f}倍多い")
print()
print("2. ゴール率/シュートの乖離:")
print(f"   ヘッドレス: {avg_goals/avg_shots:.3f} ({avg_goals/avg_shots*100:.1f}%)")
print(f"   実際のゲーム: {actual_game['total_goals']/actual_game['total_shots']:.3f} ({actual_game['total_goals']/actual_game['total_shots']*100:.1f}%)")
print(f"   → 実際のゲームのゴール率は {(actual_game['total_goals']/actual_game['total_shots'])/(avg_goals/avg_shots):.1f}倍高い")
print()
print("3. 総ゴール数の乖離:")
print(f"   ヘッドレス: {avg_goals:.1f}ゴール/試合")
print(f"   実際のゲーム: {actual_game['total_goals']}ゴール/試合")
print(f"   → 実際のゲームは {actual_game['total_goals']/avg_goals:.1f}倍多い")
print()
print("=" * 70)
print("【仮説】")
print("=" * 70)
print()
print("仮説A: シュート数が多い → shotRange/shotDecision の違い")
print("  → ヘッドレスでは遠距離シュートが少ない?")
print("  → 実際のゲームではUI/描画の影響でAI判断が変わる?")
print()
print("仮説B: ゴール率が高い → GKセーブ率の違い")
print("  → ヘッドレス: ゴール率/シュート = 31.3%")
print("  → 実際: ゴール率/シュート = 34.6%")
print("  → 差は小さい (3.3%ポイント)")
print()
print("仮説C: シュート数の差が主因")
print("  ヘッドレス: 15.9本 × 31.3% = 5.0ゴール ✓")
print(f"  実際: {actual_game['total_shots']}本 × 34.6% = {actual_game['total_shots']*0.346:.1f}ゴール ≈ {actual_game['total_goals']}ゴール ✓")
print()
print("→ 主因は【シュート数の差】")
print(f"  実際のゲームでシュート数が {actual_game['total_shots']/avg_shots:.1f}倍多い")
print()
print("【次の調査ポイント】")
print("  1. なぜ実際のゲームでシュート数が多いのか?")
print("     - stats.shotsTotal のカウント方法が違う?")
print("     - ヘッドレスでshotsTotal が正しくカウントされていない?")
print("     - 実際のゲームでは遠距離シュートが多い?")
print("  2. 実際のゲームでのシュート統計の内訳を確認する")
print("     - 枠内シュート: 21/21 (両チーム同数)")
print("     - 枠外シュート: 4/6")
print("     - 枠内シュート率: 84%/78%")
print()
print("  ヘッドレスのシュート統計:")
hl_shots_blue = [sb for b,r,f,sb,sr in headless_matches]
hl_shots_red = [sr for b,r,f,sb,sr in headless_matches]
print(f"  平均シュート数: BLU {sum(hl_shots_blue)/len(hl_shots_blue):.1f}, RED {sum(hl_shots_red)/len(hl_shots_red):.1f}")
print()
print("  実際のゲームのシュート統計:")
print(f"  シュート数: BLU {actual_game['shots_blue']}, RED {actual_game['shots_red']}")
print(f"  枠内シュート: BLU 21, RED 21")
print(f"  枠内シュート率: BLU {21/actual_game['shots_blue']*100:.0f}%, RED {21/actual_game['shots_red']*100:.0f}%")
