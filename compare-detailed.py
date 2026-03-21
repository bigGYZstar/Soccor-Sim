"""
ヘッドレス vs 実際のゲーム 詳細比較分析
"""

print("=" * 70)
print("ヘッドレス vs 実際のゲーム 詳細比較分析")
print("=" * 70)

# ===== ヘッドレス 5試合詳細 =====
headless = [
    # (blue, red, frames, shots_total, shots_on_target, gk_save_attempts, gk_saves, goals, heatmap_shots)
    (4, 2, 8110, 19, 16, 11, 10, 6, 25),
    (0, 0, 7564, 2,  2,  2,  2,  0, 2),
    (2, 3, 8019, 12, 10, 9,  7,  5, 17),
    (0, 4, 7928, 15, 14, 12, 10, 4, 19),
    (2, 1, 7837, 10, 8,  9,  7,  3, 13),
]

# ===== 実際のゲーム 1試合 =====
actual = {
    'blue': 9, 'red': 9,
    'shots_total': 52,  # 25+27
    'shots_on_target': 42,  # 21+21
    'gk_save_attempts': None,  # 不明
    'gk_saves': None,  # 不明
    'goals': 18,
}

print("\n【ヘッドレス 5試合統計】")
print(f"{'試合':<6} {'ゴール':<8} {'シュート':<10} {'枠内':<8} {'GKセーブ試':<12} {'GKセーブ':<10} {'ゴール率':<10} {'枠内率':<10} {'GKセーブ率'}")
print("-" * 90)
for i, (b, r, f, st, sot, gksa, gks, g, hs) in enumerate(headless):
    goal_rate = g/st if st > 0 else 0
    on_target_rate = sot/st*100 if st > 0 else 0
    gk_save_rate = gks/gksa*100 if gksa > 0 else 0
    print(f"  {i+1:<4} {g:<8} {st:<10} {sot:<8} {gksa:<12} {gks:<10} {goal_rate:.3f}     {on_target_rate:.1f}%      {gk_save_rate:.1f}%")

hl_goals = [g for b,r,f,st,sot,gksa,gks,g,hs in headless]
hl_shots = [st for b,r,f,st,sot,gksa,gks,g,hs in headless]
hl_sot = [sot for b,r,f,st,sot,gksa,gks,g,hs in headless]
hl_gksa = [gksa for b,r,f,st,sot,gksa,gks,g,hs in headless]
hl_gks = [gks for b,r,f,st,sot,gksa,gks,g,hs in headless]
hl_hs = [hs for b,r,f,st,sot,gksa,gks,g,hs in headless]

avg_goals = sum(hl_goals)/len(hl_goals)
avg_shots = sum(hl_shots)/len(hl_shots)
avg_sot = sum(hl_sot)/len(hl_sot)
avg_gksa = sum(hl_gksa)/len(hl_gksa)
avg_gks = sum(hl_gks)/len(hl_gks)
avg_hs = sum(hl_hs)/len(hl_hs)

print("-" * 90)
print(f"  平均  {avg_goals:<8.1f} {avg_shots:<10.1f} {avg_sot:<8.1f} {avg_gksa:<12.1f} {avg_gks:<10.1f} {avg_goals/avg_shots:.3f}     {avg_sot/avg_shots*100:.1f}%      {avg_gks/avg_gksa*100:.1f}%")
print(f"  ヒートマップシュートイベント平均: {avg_hs:.1f}")

print("\n【実際のゲーム 1試合】")
g = actual['goals']
st = actual['shots_total']
sot = actual['shots_on_target']
print(f"  ゴール: {g}")
print(f"  シュート: {st}")
print(f"  枠内シュート: {sot}")
print(f"  ゴール率: {g/st:.3f}")
print(f"  枠内率: {sot/st*100:.1f}%")

print("\n【比較】")
print(f"  ゴール数: ヘッドレス {avg_goals:.1f} vs 実際 {g} → {g/avg_goals:.1f}倍")
print(f"  シュート数: ヘッドレス {avg_shots:.1f} vs 実際 {st} → {st/avg_shots:.1f}倍")
print(f"  枠内シュート数: ヘッドレス {avg_sot:.1f} vs 実際 {sot} → {sot/avg_sot:.1f}倍")
print(f"  ゴール率/シュート: ヘッドレス {avg_goals/avg_shots:.3f} vs 実際 {g/st:.3f}")
print(f"  枠内シュート率: ヘッドレス {avg_sot/avg_shots*100:.1f}% vs 実際 {sot/st*100:.1f}%")
print(f"  GKセーブ率: ヘッドレス {avg_gks/avg_gksa*100:.1f}% vs 実際 不明")

print()
print("=" * 70)
print("【根本原因分析】")
print("=" * 70)
print()
print("主因: シュート数の差 (3.3倍)")
print(f"  ヘッドレス: {avg_shots:.1f}本/試合")
print(f"  実際のゲーム: {st}本/試合")
print()
print("ゴール率/シュートは近似:")
print(f"  ヘッドレス: {avg_goals/avg_shots:.3f} ({avg_goals/avg_shots*100:.1f}%)")
print(f"  実際のゲーム: {g/st:.3f} ({g/st*100:.1f}%)")
print()
print("枠内シュート率も近似:")
print(f"  ヘッドレス: {avg_sot/avg_shots*100:.1f}%")
print(f"  実際のゲーム: {sot/st*100:.1f}%")
print()
print("→ GKのセーブ率・ゴール率は両者ほぼ同じ")
print("→ 問題は「シュート数が3.3倍多い」こと")
print()
print("=" * 70)
print("【シュート数乖離の仮説】")
print("=" * 70)
print()
print("仮説1: ヘッドレスでシュートが少なすぎる")
print("  - ヘッドレス: 15.9本/試合 (5試合平均)")
print("  - 実際のゲーム: 52本/試合")
print("  - 現実のサッカー: 10-15本/試合")
print("  → ヘッドレスは現実に近く、実際のゲームが多すぎる")
print()
print("仮説2: 実際のゲームでシュートカウントが重複している")
print("  - 枠内シュート: 21+21 = 42本")
print("  - 総シュート: 25+27 = 52本")
print("  - 枠外シュート: 4+6 = 10本")
print("  → 枠内シュート率84%/78%はヘッドレスと同じ")
print("  → カウント重複の可能性は低い")
print()
print("仮説3: ゴールリプレイ中もシュートカウントが進む")
print("  - ゴールリプレイ中は試合が一時停止するが...")
print("  - リプレイ中にシュートがカウントされる可能性?")
print()
print("仮説4: subStepsによる物理的差異")
print("  - ヘッドレス: 1フレーム = 1 update(dt=1/60)")
print("  - 実際VFAST: 1フレーム = 8 update(dt=1/480)")
print("  - 物理dtは同じだが、ボール判定の細かさが違う")
print("  - 実際のゲームでは1フレームに8回シュート判定が走る?")
print("  - → シュートの連続カウントが起きている可能性!")
print()
print("仮説5: ゴールリプレイ中のシュートカウント")
print("  - 実際のゲームではゴールリプレイが表示される")
print("  - リプレイ中はreplayRef.currentがセットされる")
print("  - リプレイ中はupdate()が呼ばれない（Home.tsx line 1652）")
print("  - → リプレイ中のカウントは問題ない")
print()
print("【最有力仮説】")
print("  実際のゲームでは1フレームに8回update()が呼ばれる")
print("  各update()でシュート判定が独立して走る可能性")
print("  → 1回のシュートが8回カウントされる可能性?")
print("  → しかし、kick()内でカウントされるので1回のkick()で1回のみ")
print()
print("  別の可能性: ゴール後のkickOff時にシュートが発生している?")
print("  → doKickOff()の後にシュートが連続して起きる?")
print()
print("【要確認】")
print("  1. 実際のゲームで複数試合を観察してシュート数の分布を確認")
print("  2. ヘッドレスでも同じ試合を複数回実行してシュート数の分布を確認")
print("  3. 実際のゲームのシュート数が常に多いかを確認")
