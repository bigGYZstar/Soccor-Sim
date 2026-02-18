# 11v11 サッカー自動試合シミュレーション — 統合仕様書

> 本文書は、ブラウザ上で動作する11対11サッカー自動試合シミュレーションの**技術仕様**、**全チューナブルパラメータ**、および**完全なソースコード**を1つのファイルに統合したものである。

---

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [技術スタックとファイル構成](#2-技術スタックとファイル構成)
3. [座標系とピッチ寸法](#3-座標系とピッチ寸法)
4. [データモデル](#4-データモデル)
5. [フォーメーションとスロットシステム](#5-フォーメーションとスロットシステム)
6. [全チューナブルパラメータ一覧](#6-全チューナブルパラメータ一覧)
7. [AI意思決定システム](#7-ai意思決定システム)
8. [ボール物理と状態遷移](#8-ボール物理と状態遷移)
9. [オフサイド判定](#9-オフサイド判定)
10. [アウトオブプレーとリスタート](#10-アウトオブプレーとリスタート)
11. [GKセーブ機構](#11-gkセーブ機構)
12. [ファウルとフリーキック](#12-ファウルとフリーキック)
13. [攻撃参加レベルシステム](#13-攻撃参加レベルシステム)
14. [ロングパスとクロス](#14-ロングパスとクロス)
15. [試合フロー](#15-試合フロー)
16. [更新ループ](#16-更新ループ)
17. [描画仕様](#17-描画仕様)
18. [UIコントロール](#18-uiコントロール)
19. [Reactコンポーネント構造](#19-reactコンポーネント構造)
20. [レスポンシブ対応](#20-レスポンシブ対応)
21. [既知の制約と拡張可能性](#21-既知の制約と拡張可能性)
22. [付録A: 全関数一覧](#付録a-全関数一覧)
23. [付録B: パラメータ調整ガイド](#付録b-パラメータ調整ガイド)
24. [付録C: 完全ソースコード](#付録c-完全ソースコード)

---

## 1. プロジェクト概要

### 1.1 目的

本プロジェクトは、ブラウザ上で動作する**非インタラクティブ（自動再生）の11対11サッカー試合モックアップ**を提供することを目的とする。ユーザーの操作を一切必要とせず、キックオフからフルタイムまで自律的にシミュレーションが進行し、試合終了後は自動的に再スタートする。ESPN/DAZN風のスポーツ中継を模したビジュアルデザインを採用し、iPhone等のモバイル端末でも快適に閲覧できるレスポンシブ設計となっている。

### 1.2 主要機能一覧

| 機能カテゴリ | 実装内容 |
|-------------|---------|
| 基本シミュレーション | 11v11、4-4-2フォーメーション、GK/DEF/MID/FWD役割別AI |
| ボール保持表現 | 保持者リング（チームカラー半透明円）、ボール追従 |
| パス | 短距離パス（白点線トレイル）、ロングパス（黄色弧線トレイル） |
| シュート | 高速ボール移動（オレンジ太線トレイル）、精度誤差 |
| ドリブル | ボール保持移動、敵回避、壁回避、ジンク |
| クロス | ウインガー専用、アタッキングサードでのサイド攻撃 |
| オフサイド | パス時の自動判定、フラッシュ表示、守備側フリーキック |
| アウトオブプレー | スローイン（投げ入れアニメーション）、コーナーキック（ヘディング競り合い）、ゴールキック |
| GKセーブ | シュート検知、角度ベースのセーブ確率、キャッチ/パリー |
| ファウル/フリーキック | タックル時のファウル判定、壁構成、直接フリーキックシュート |
| 攻撃参加レベル | 両チーム個別1-10段階調整、リアルタイムUI |
| スピード切替 | LOW/MID/FASTの3段階 |
| 試合管理 | 120秒試合、ゴール後リセット、自動リスタート |
| HUD | ブロードキャスト風スコアバー、タイマー |

---

## 2. 技術スタックとファイル構成

### 2.1 技術スタック

| 項目 | 技術 |
|------|------|
| フレームワーク | React 19 + TypeScript |
| ビルドツール | Vite 7 |
| 描画エンジン | HTML5 Canvas 2D Context |
| スタイリング | Tailwind CSS 4（Canvas外のリセットのみ） |
| フォント | Roboto Condensed（HUD見出し）、Roboto Mono（タイマー） |
| ループ制御 | `requestAnimationFrame` による可変フレームレート |

全シミュレーションロジック、AI、描画処理は単一ファイル `client/src/pages/Home.tsx`（約1,885行）に集約されており、外部ライブラリへの依存は存在しない。

### 2.2 ファイル構成

```
futsal-sim/
├── client/
│   ├── index.html              ← エントリHTML（Google Fonts読み込み）
│   └── src/
│       ├── main.tsx             ← Reactマウントポイント
│       ├── App.tsx              ← ルーティング・テーマ設定（dark theme）
│       ├── index.css            ← グローバルCSS（body margin/padding リセット）
│       └── pages/
│           └── Home.tsx         ← ★ 全シミュレーションコード（本仕様の対象）
├── server/
│   └── index.ts                ← 静的ファイル配信（本番用）
├── specification.md            ← 旧仕様書
└── full-specification.md       ← 本統合仕様書
```

---

## 3. 座標系とピッチ寸法

### 3.1 座標系の定義

シミュレーションはワールド座標系（浮動小数点）で計算され、描画時にCanvas画素座標へ変換される。ワールド座標系の原点 `(0, 0)` はピッチの中心に位置し、X軸は水平方向（右が正）、Y軸は垂直方向（上が正）である。

> **注意**: Canvas描画時にはY軸が反転する（画面上方向がCanvas座標では小さい値）。変換関数 `w2s` がこの反転を処理する。

### 3.2 ピッチ寸法

FIFA規格の105m × 68mピッチを、1ユニット ≈ 5mのスケールで縮小している。

| パラメータ | 値 | 実寸換算 | 説明 |
|-----------|-----|---------|------|
| `pitchHalfW` | 10.5 | 52.5m | ピッチ半幅（中心から左右端まで） |
| `pitchHalfH` | 6.8 | 34.0m | ピッチ半高（中心から上下端まで） |
| `goalHalfH` | 1.22 | 3.66m | ゴール半高（中心からポストまで） |
| `goalDepth` | 0.4 | 2.0m | ゴールネットの奥行き |
| `penAreaW` | 2.75 | 16.5m | ペナルティエリアの幅（ゴールラインから） |
| `penAreaH` | 3.35 | 20.15m | ペナルティエリアの半高 |
| `goalAreaW` | 0.92 | 5.5m | ゴールエリアの幅 |
| `goalAreaH` | 1.55 | 9.15m | ゴールエリアの半高 |
| `centreCircleR` | 1.53 | 9.15m | センターサークル半径 |
| `penSpotDist` | 1.83 | 11.0m | ペナルティスポット距離（ゴールラインから） |
| `cornerArcR` | 0.17 | 1.0m | コーナーアーク半径 |

ピッチ全体の有効範囲は `x ∈ [-10.5, 10.5]`、`y ∈ [-6.8, 6.8]` であり、すべてのプレイヤーとボールはこの範囲内にクランプされる。

### 3.3 チーム方向

| チーム | `team` 値 | 攻撃方向 | ゴール位置（X座標） |
|--------|----------|---------|-------------------|
| BLUE（左チーム） | -1 | 右方向（+X） | 守備: x = -10.5、攻撃目標: x = +10.5 |
| RED（右チーム） | +1 | 左方向（-X） | 守備: x = +10.5、攻撃目標: x = -10.5 |

---

## 4. データモデル

### 4.1 ベクトル型 `V`

すべての位置・速度・方向は2次元ベクトル `V = { x: number, y: number }` で表現される。

| 関数 | シグネチャ | 説明 |
|------|----------|------|
| `v` | `(x, y) → V` | ベクトル生成 |
| `vadd` | `(a, b) → V` | 加算 |
| `vsub` | `(a, b) → V` | 減算 |
| `vscl` | `(a, s) → V` | スカラー倍 |
| `vlen` | `(a) → number` | 長さ |
| `vnorm` | `(a) → V` | 正規化（ゼロベクトルの場合は `(1, 0)` を返す） |
| `vdist` | `(a, b) → number` | 2点間距離 |
| `vdot` | `(a, b) → number` | 内積 |
| `vlerp` | `(a, b, t) → V` | 線形補間 |
| `vang` | `(a, b) → number` | 2ベクトル間の角度（度数法） |
| `vmove` | `(from, to, d) → V` | `from` から `to` へ最大距離 `d` だけ移動 |
| `vperp` | `(a) → V` | 垂直ベクトル（`(-y, x)`） |
| `clamp` | `(v, lo, hi) → number` | 値の範囲制限 |
| `clamp01` | `(v) → number` | 0〜1の範囲制限 |
| `rng` | `(a, b) → number` | `[a, b)` の一様乱数 |
| `pitchClamp` | `(p) → V` | ピッチ範囲内にクランプ |

### 4.2 Player インターフェース

各プレイヤーは以下のプロパティを持つ。配列 `State.pl` のインデックス 0〜10 が BLUE チーム、11〜21 が RED チームに対応する。

| プロパティ | 型 | 説明 |
|-----------|---|------|
| `pos` | `V` | 現在位置（ワールド座標） |
| `team` | `number` | 所属チーム（-1: BLUE、+1: RED） |
| `num` | `number` | 背番号（1〜11） |
| `home` | `V` | フォーメーション上のホームポジション |
| `face` | `V` | 現在の向き（正規化ベクトル） |
| `act` | `"idle" \| "dribble" \| "move"` | 現在のアクション状態 |
| `tgt` | `V` | 移動目標位置 |
| `dt` | `number` | 次の意思決定までの残り時間（秒） |
| `isGK` | `boolean` | ゴールキーパーフラグ |
| `slot` | `number` | フォーメーション内のスロット番号（0〜10） |
| `role` | `Role` | 役割（`"GK"`, `"DEF"`, `"MID"`, `"FWD"`） |
| `jumpY` | `number` | ジャンプ高さ（ヘディング競り合い時のアニメーション用） |

### 4.3 Ball インターフェース

| プロパティ | 型 | 説明 |
|-----------|---|------|
| `pos` | `V` | 現在位置 |
| `vel` | `V` | 速度ベクトル（フリーボール時のみ有効） |
| `owner` | `number \| null` | 保持者のプレイヤーインデックス |
| `free` | `boolean` | フリーボール状態 |
| `shot` | `boolean` | シュートフラグ |
| `dead` | `number` | ボールが低速で停止している累積時間（秒） |
| `cooldown` | `number` | インターセプト禁止時間（秒） |
| `lastTouchTeam` | `number` | 最後にボールに触れたチーム（-1 or +1） |
| `lob` | `number` | ロブ（空中）の高さ（0.0〜1.0、0=地上） |

### 4.4 State インターフェース

| プロパティ | 型 | 説明 |
|-----------|---|------|
| `pl` | `Player[]` | 全22人のプレイヤー配列 |
| `ball` | `Ball` | ボール状態 |
| `sL` | `number` | BLUE チームの得点 |
| `sR` | `number` | RED チームの得点 |
| `time` | `number` | 経過時間（秒） |
| `over` | `boolean` | 試合終了フラグ |
| `paused` | `boolean` | 一時停止フラグ |
| `pauseT` | `number` | 一時停止の残り時間（秒） |
| `koSide` | `number` | 次のキックオフを行うチーム |
| `trail` | `Trail \| null` | パス/シュートの軌跡描画情報 |
| `flash` | `number` | 画面フラッシュの残り時間（秒） |
| `flashTxt` | `string` | フラッシュ時の表示テキスト |
| `restartT` | `number` | 試合終了後の自動リスタートまでの残り時間 |
| `speed` | `SpeedMode` | 現在のスピードモード（`"LOW"`, `"MID"`, `"FAST"`） |
| `setPiece` | `SetPieceAnim \| null` | セットピースアニメーション状態 |
| `atkLevelBlue` | `number` | BLUEチームの攻撃参加レベル（1〜10） |
| `atkLevelRed` | `number` | REDチームの攻撃参加レベル（1〜10） |

### 4.5 Trail インターフェース

| プロパティ | 型 | 説明 |
|-----------|---|------|
| `start` | `V` | 軌跡の始点 |
| `end` | `V` | 軌跡の終点 |
| `shot` | `boolean` | シュートの軌跡か否か |
| `longPass` | `boolean` | ロングパスの軌跡か否か |
| `t` | `number` | 残り表示時間（秒） |

### 4.6 SetPieceAnim インターフェース

セットピース（スローイン、コーナーキック、フリーキック）のアニメーション状態を管理する。

| プロパティ | 型 | 説明 |
|-----------|---|------|
| `type` | `SetPieceType` | `"throw-in"`, `"corner"`, `"free-kick"`, `null` |
| `timer` | `number` | 現在のフェーズの残り時間 |
| `duration` | `number` | 現在のフェーズの総時間 |
| `throwerIdx` | `number` | キッカー/スローワーのプレイヤーインデックス |
| `ballTarget` | `V` | ボールの目標位置 |
| `phase` | `string` | 現在のフェーズ（`"windup"`, `"release"`, `"heading"`, `"wall-forming"`, `"fk-run"`） |
| `headingTimer` | `number` | ヘディング競り合いの残り時間 |
| `headingPlayers` | `number[]` | ヘディング競り合いに参加するプレイヤー |
| `headingWinner` | `number` | ヘディング勝者のインデックス |
| `wallPlayers` | `number[]` | 壁を構成するプレイヤーのインデックス |
| `fkIsShot` | `boolean` | フリーキックがシュートかどうか |
| `fkTeam` | `number` | フリーキックを蹴るチーム |

---

## 5. フォーメーションとスロットシステム

### 5.1 4-4-2 フォーメーション

両チームとも **4-4-2** フォーメーションを採用している。以下の表は BLUE チーム（`team = -1`、左側配置）のホームポジションを示す。RED チームはこれをX軸・Y軸ともに反転（`x = -x, y = -y`）した位置に配置される。

| スロット | 背番号 | ポジション名 | 役割 | ホームポジション (x, y) |
|---------|--------|------------|------|----------------------|
| 0 | 1 | GK（ゴールキーパー） | GK | (-9.8, 0) |
| 1 | 2 | LB（左サイドバック） | DEF | (-7.5, -4.5) |
| 2 | 3 | CB（左センターバック） | DEF | (-7.5, -1.5) |
| 3 | 4 | CB（右センターバック） | DEF | (-7.5, 1.5) |
| 4 | 5 | RB（右サイドバック） | DEF | (-7.5, 4.5) |
| 5 | 6 | LM（左ミッドフィルダー） | MID | (-4.5, -5.0) |
| 6 | 7 | CM（左センターMF） | MID | (-4.5, -1.5) |
| 7 | 8 | CM（右センターMF） | MID | (-4.5, 1.5) |
| 8 | 9 | RM（右ミッドフィルダー） | MID | (-4.5, 5.0) |
| 9 | 10 | ST（左ストライカー） | FWD | (-1.5, -1.8) |
| 10 | 11 | ST（右ストライカー） | FWD | (-1.5, 1.8) |

### 5.2 スロットから役割への変換

```
slot 0       → "GK"
slot 1〜4    → "DEF"
slot 5〜8    → "MID"
slot 9〜10   → "FWD"
```

ウインガーの特定: `slot === 5`（LM）および `slot === 8`（RM）はワイドMFとして、アタッキングサードで特別なドリブル・クロス行動を取る。

---

## 6. 全チューナブルパラメータ一覧

すべてのパラメータはソースコード冒頭の定数オブジェクト `P` に集約されている。

### 6.1 試合制御パラメータ

| パラメータ | デフォルト値 | 単位 | 説明 |
|-----------|------------|------|------|
| `matchDuration` | 120 | 秒 | 試合の総時間 |
| `goalResetDelay` | 2.0 | 秒 | ゴール後、キックオフまでの待機時間 |

### 6.2 ピッチ寸法パラメータ

| パラメータ | デフォルト値 | 単位 | 説明 |
|-----------|------------|------|------|
| `pitchHalfW` | 10.5 | units | ピッチ半幅 |
| `pitchHalfH` | 6.8 | units | ピッチ半高 |
| `goalHalfH` | 1.22 | units | ゴール半高 |
| `goalDepth` | 0.4 | units | ゴールネット奥行き |
| `penAreaW` | 2.75 | units | ペナルティエリア幅 |
| `penAreaH` | 3.35 | units | ペナルティエリア半高 |
| `goalAreaW` | 0.92 | units | ゴールエリア幅 |
| `goalAreaH` | 1.55 | units | ゴールエリア半高 |
| `centreCircleR` | 1.53 | units | センターサークル半径 |
| `penSpotDist` | 1.83 | units | ペナルティスポット距離 |
| `cornerArcR` | 0.17 | units | コーナーアーク半径 |

### 6.3 プレイヤー動作パラメータ

| パラメータ | デフォルト値 | 単位 | 説明 |
|-----------|------------|------|------|
| `moveSpeed` | 4.8 | units/s | ボール非保持時の移動速度 |
| `dribbleSpeed` | 3.8 | units/s | ドリブル時の移動速度 |
| `passSpeed` | 12 | units/s | パスのボール速度 |
| `shotSpeed` | 18 | units/s | シュートのボール速度 |
| `longPassSpeed` | 10 | units/s | ロングパスのボール速度 |
| `passAccuracy` | 0.88 | 0〜1 | 短距離パス精度 |
| `shotAccuracy` | 0.60 | 0〜1 | シュート精度 |
| `longPassAccuracy` | 0.65 | 0〜1 | ロングパス精度 |
| `dribbleControl` | 0.90 | 0〜1 | ドリブル成功率 |
| `interceptRadius` | 0.75 | units | フリーボールのインターセプト判定半径 |
| `decisionInterval` | 0.20 | 秒 | AI意思決定の実行間隔 |
| `shotRange` | 5.5 | units | シュート可能な最大距離 |
| `shotAngle` | 55 | 度 | シュート可能な最大角度 |

### 6.4 ボール物理パラメータ

| パラメータ | デフォルト値 | 単位 | 説明 |
|-----------|------------|------|------|
| `looseBallDrag` | 3.5 | units/s² | フリーボールの減速率 |
| `deadBallTime` | 0.7 | 秒 | ボール停止後の自動回収時間 |

### 6.5 描画パラメータ

| パラメータ | デフォルト値 | 単位 | 説明 |
|-----------|------------|------|------|
| `trailDuration` | 0.35 | 秒 | パス/シュート軌跡の表示時間 |
| `playerRadius` | 0.30 | units | プレイヤー円の半径 |
| `ballRadius` | 0.13 | units | ボール円の半径 |

### 6.6 オフサイドパラメータ

| パラメータ | デフォルト値 | 単位 | 説明 |
|-----------|------------|------|------|
| `offsideEnabled` | true | — | オフサイド判定の有効/無効 |
| `offsideMargin` | 0.25 | units | オフサイド判定のマージン |
| `offsidePause` | 1.2 | 秒 | オフサイド後の一時停止時間 |
| `restartNoIntercept` | 0.5 | 秒 | リスタート後のインターセプト禁止時間 |

### 6.7 アウトオブプレーパラメータ

| パラメータ | デフォルト値 | 単位 | 説明 |
|-----------|------------|------|------|
| `outEnabled` | true | — | アウトオブプレー判定の有効/無効 |
| `outMargin` | 0.02 | units | ピッチ外判定のマージン |
| `restartPause` | 1.0 | 秒 | リスタート前の一時停止時間 |
| `throwInInset` | 0.35 | units | スローイン位置のタッチラインからのインセット |
| `cornerInset` | 0.25 | units | コーナーキック位置のインセット |
| `goalKickX` | 9.78 | units | ゴールキック位置のX座標（`pitchHalfW - goalAreaW + 0.2`） |

### 6.8 GKセーブパラメータ

| パラメータ | デフォルト値 | 単位 | 説明 |
|-----------|------------|------|------|
| `gkSaveEnabled` | true | — | GKセーブの有効/無効 |
| `gkSaveRadius` | 0.9 | units | GKのセーブ判定半径 |
| `gkSaveBase` | 0.55 | 0〜1 | 基本セーブ確率 |
| `gkSaveAngleBonus` | 0.20 | 0〜1 | 角度ボーナス（正面ほど高い） |
| `gkParryChance` | 0.25 | 0〜1 | セーブ時にパリー（弾く）する確率 |
| `gkHoldCooldown` | 0.6 | 秒 | GKキャッチ後のクールダウン |

### 6.9 スピード切替パラメータ

| パラメータ | デフォルト値 | 説明 |
|-----------|------------|------|
| `speedMult.LOW` | 0.75 | 低速モードの時間倍率 |
| `speedMult.MID` | 1.0 | 通常モードの時間倍率 |
| `speedMult.FAST` | 1.35 | 高速モードの時間倍率 |

### 6.10 ロングパスパラメータ

| パラメータ | デフォルト値 | 単位 | 説明 |
|-----------|------------|------|------|
| `longPassMinDist` | 8 | units | ロングパスの最小距離 |
| `longPassMaxDist` | 22 | units | ロングパスの最大距離 |

### 6.11 スローイン/コーナーキックアニメーションパラメータ

| パラメータ | デフォルト値 | 単位 | 説明 |
|-----------|------------|------|------|
| `throwInMaxDist` | 12 | units | スローインの最大飛距離（ピッチ横幅の約半分） |
| `throwInAnimDur` | 0.5 | 秒 | スローインのウインドアップアニメーション時間 |
| `cornerAnimDur` | 0.4 | 秒 | コーナーキックのウインドアップアニメーション時間 |
| `headingContestRadius` | 2.5 | units | ヘディング競り合いの参加判定半径 |
| `headingContestDur` | 0.35 | 秒 | ヘディング競り合いのアニメーション時間 |

### 6.12 ファウル/フリーキックパラメータ

| パラメータ | デフォルト値 | 単位 | 説明 |
|-----------|------------|------|------|
| `foulChanceOnTackle` | 0.18 | 0〜1 | タックル時のファウル発生確率 |
| `foulChanceOnDribble` | 0.10 | 0〜1 | ドリブラーへのインターセプト時のファウル確率 |
| `foulPause` | 1.5 | 秒 | ファウル後の一時停止時間 |
| `freeKickNoIntercept` | 0.8 | 秒 | フリーキック後のインターセプト禁止時間 |
| `wallDistance` | 1.83 | units | 壁の配置距離（ボールから） |
| `wallPlayerCount` | 3 | 人 | 壁を構成する基本人数 |
| `directFKShotRange` | 7.0 | units | 直接シュート可能なフリーキック距離 |
| `directFKShotChance` | 0.65 | 0〜1 | シュート距離内でシュートを選択する確率 |

---

## 7. AI意思決定システム

### 7.1 概要

各プレイヤーは `decisionInterval`（0.20秒）ごとに意思決定を行う。ボール保持者と非保持者で異なるロジックが適用される。

```
毎フレーム:
  player.dt -= deltaTime
  if player.dt <= 0:
    player.dt = decisionInterval
    if ボール保持者:
      decideHasBall(state, playerIndex)
    else:
      decideNoBall(state, playerIndex)
```

### 7.2 ボール保持時の意思決定 (`decideHasBall`)

#### 7.2.1 GK・自陣深い位置の特別処理

ゴールキーパー、または自陣の守備的3分の1（`team * pos.x > pitchHalfW * 0.33`）にいるプレイヤーは、まずロングパスを45%の確率で試み、次に通常パス（リラックスモード）を試み、それでも不可の場合はセーフティクリアランスを行う。

#### 7.2.2 ウインガーのアタッキングサード行動

スロット5（LM）またはスロット8（RM）のプレイヤーがアタッキングサードにいる場合、以下の特別ロジックが適用される。

- バイライン付近かつワイドポジション → 70%の確率でクロス
- ワイドだがバイライン前 → サイドライン沿いにドリブル
- シュート距離内 → シュート（通常より広い角度・距離で判定）
- それ以外 → 40%の確率でクロス

#### 7.2.3 通常の3段階優先ロジック

**優先度1: シュート (SHOT)** — ゴールまでの距離が `shotRange`（5.5）以内、かつ向きとゴール方向の角度差が `shotAngle`（55度）以内の場合。`shotAccuracy` に基づく誤差が加わる。

**優先度2: パス (PASS)** — `bestPass` 関数で最適なパス先を探索。30%の確率でロングパスも検討する。パス先評価スコア:

```
score = openness * 2 + goalProgress * 0.5 - distance * 0.12
if laneBlocked: score -= 4（通常モード）/ score -= 1.5（relaxedモード）
if offside: score -= 10
```

**優先度3: ドリブル (DRIBBLE)** — `dribbleControl`（0.90）の確率で成功。ゴール方向（重み0.55）、敵回避（重み0.3）、壁回避、ジンクを合成した方向へ移動。

### 7.3 パス精度のコンテキスト対応

パス精度は以下の3つのボーナスで動的に調整される。

| 条件 | エラー減少率 |
|------|------------|
| 最寄り敵が5.0m以上 | 75%減 |
| 最寄り敵が3.0m以上 | 55%減 |
| 最寄り敵が2.0m以上 | 30%減 |
| パス距離が4.0m未満 | 50%減 |
| パス距離が7.0m未満 | 30%減 |
| 自陣でのパス | 40%減 |

### 7.4 ボール非保持時の意思決定 (`decideNoBall`)

#### 7.4.1 GKの行動

ゴールライン付近に位置し、ボールのY座標に追従。フリーボールが2.5ユニット以内なら飛び出す。

#### 7.4.2 ルーズボール追跡

各チームから最も近い2人のフィールドプレイヤーがボールを追跡。

#### 7.4.3 味方がボール保持時（攻撃ラン）

攻撃参加レベル `atkFactor`（0.0〜1.0）に応じてポジショニングが変化する。

| 役割 | 攻撃時の行動 |
|------|------------|
| DEF | 保持者の後方に位置。攻撃レベルに応じて前進量が増加。 |
| MID（ワイド） | 攻撃時はサイドに張り、バイラインに向かって走る。 |
| MID（セントラル） | 保持者と相手ゴールの中間地点に位置。攻撃レベルに応じて前進。 |
| FWD | 相手ゴール方向に前線ラン。攻撃レベルが高いほど深い位置を取る。 |

#### 7.4.4 相手がボール保持時（守備）

攻撃レベルが高いほど守備の後退量が減少する（`defRetreat = 1.0 - af * 0.3`）。

---

## 8. ボール物理と状態遷移

### 8.1 ボールの3つの状態

```
[保持中] ←→ [フリー（飛行中）] ←→ [デッド（停止）]
   ↑              ↓                      ↓
   └──── インターセプト ────┘     └── 自動回収 ──→ [保持中]
```

**保持中**: ボールは保持者の前方0.22ユニットに追従。

**フリー**: `vel` に従って移動し、`looseBallDrag`（3.5 units/s²）で減速。ロブボールは `lob` 値が時間とともに減少（`lob -= dt * 2`）。

**デッド**: 速度0.5 units/s以下が `deadBallTime`（0.7秒）以上継続で最寄りプレイヤーに自動回収。

### 8.2 インターセプト

| 種類 | 条件 | 判定半径 |
|------|------|---------|
| フリーボールの拾得 | ボールがフリー状態、`lob < 0.3` | 0.75 units |
| ドリブラーからの奪取 | ボール保持中、敵チーム | 0.4875 units（`interceptRadius * 0.65`） |

奪取時に `foulChanceOnTackle`（18%）または `foulChanceOnDribble`（10%）の確率でファウルが発生する。

### 8.3 所有権変更とクールダウン

所有権変更時に0.35秒のクールダウンが発生し、インターセプトが無効化される。

---

## 9. オフサイド判定

### 9.1 判定条件

`isOffside` 関数は以下の条件をすべて満たす場合にオフサイドと判定する。

1. `offsideEnabled` が `true`
2. レシーバーが相手陣内にいる（`team * pos.x < 0`）
3. レシーバーがボール位置より前方にいる
4. レシーバーが相手の最終ラインより `offsideMargin`（0.25）以上前方にいる

### 9.2 オフサイド発生時の処理

1. 「OFFSIDE」フラッシュ表示
2. 守備側チームの最寄りフィールドプレイヤーにボールを渡す
3. `offsidePause`（1.2秒）の一時停止

---

## 10. アウトオブプレーとリスタート

### 10.1 スローイン

**発生条件**: ボールがタッチライン（上下端）を越えた場合。

**判定**: 最後にボールに触れたチーム（`lastTouchTeam`）の反対側がスローイン権を取得。

**ターゲット選定**: 最大飛距離 `throwInMaxDist`（12ユニット、ピッチ横幅の約半分）以内で、オープンネス評価が最も高いチームメイトを選択。

**アニメーション**: スローワーが腕を上げるウインドアップモーション（`throwInAnimDur` = 0.5秒）の後、ボールをロブで投げ入れる。

### 10.2 コーナーキック

**発生条件**: ボールがゴールライン（左右端）を越え、最後にタッチしたのが守備側チームの場合。

**配置**: 正しいサイド（ボールが出た側）のコーナーから、攻撃側FWD/MIDがペナルティエリア内に、守備側DEF/MIDがペナルティエリア内に移動。

**アニメーション**: ウインドアップ → ロブボール（弧を描く黄色トレイル） → ヘディング競り合い（参加者全員がジャンプ、距離+乱数で勝者決定）。勝者がシュート距離内ならヘディングシュート、それ以外はボール保持。

### 10.3 ゴールキック

**発生条件**: ボールがゴールライン（左右端）を越え、最後にタッチしたのが攻撃側チームの場合。

**処理**: 守備側GKがゴールエリア付近からリスタート。

---

## 11. GKセーブ機構

### 11.1 判定条件

1. `gkSaveEnabled` が `true`
2. ボールが `shot` フラグ付き
3. シュートがGKの守るゴール方向に向かっている
4. GKとボールの距離が `gkSaveRadius`（0.9）以内

### 11.2 セーブ確率

```
saveP = gkSaveBase + gkSaveAngleBonus * clamp01(1 - shotAngleToGK / 90)
```

正面からのシュートほどセーブ確率が高い（最大 `0.55 + 0.20 = 0.75`）。

### 11.3 セーブ結果

| 結果 | 確率 | 処理 |
|------|------|------|
| キャッチ | 75% | GKがボールを保持、`gkHoldCooldown`（0.6秒）のクールダウン |
| パリー | 25% | ボールをゴールから離れる方向に弾く（速度5〜8 units/s） |

---

## 12. ファウルとフリーキック

### 12.1 ファウル発生

タックル（インターセプト）時にランダムでファウルが発生する。

| 状況 | ファウル確率 |
|------|------------|
| ドリブラーへのタックル | 10%（`foulChanceOnDribble`） |
| 通常のタックル | 18%（`foulChanceOnTackle`） |

### 12.2 フリーキックの種類

ファウル位置から相手ゴールまでの距離が `directFKShotRange`（7.0）以内の場合、`directFKShotChance`（65%）の確率で直接フリーキックシュートを選択。それ以外はパスで再開。

### 12.3 壁の構成

直接フリーキックシュート時、守備側は `wallPlayerCount`（3人、近距離では4人）の壁を自動構成する。壁はボールとゴールを結ぶ線上の `wallDistance`（1.83ユニット）の位置に、垂直方向に0.55ユニット間隔で並ぶ。壁の周囲には黄色の点線リングが描画される。

### 12.4 フリーキックアニメーション

1. **壁構成フェーズ** (`wall-forming`): 壁プレイヤーが所定位置に移動（最大1.2秒）
2. **助走フェーズ** (`fk-run`): キッカーが0.4秒の助走アニメーション
3. **キック**: シュートまたはパスを実行

---

## 13. 攻撃参加レベルシステム

### 13.1 概要

両チームに個別の攻撃参加レベル（1〜10）が設定可能。画面下部左右のUIパネルで +/− ボタンにより調整する。

### 13.2 攻撃ファクター

```
atkFactor = (atkLevel - 1) / 9    // 0.0 (レベル1) 〜 1.0 (レベル10)
```

### 13.3 影響範囲

| 影響対象 | レベル1（守備的） | レベル10（超攻撃的） |
|---------|-----------------|-------------------|
| DEFの前進量 | ほぼホームポジション | 中盤まで押し上げ |
| MIDの攻撃参加率 | 控えめ | 積極的に前線へ |
| FWDの位置 | 中盤寄り | 相手ゴール近く |
| 守備時の後退量 | 通常 | 30%減少 |

---

## 14. ロングパスとクロス

### 14.1 ロングパス

`bestLongPass` 関数で評価。距離8〜22ユニットの味方を対象に、FWDへのボーナス（+2.5）、ワイドMIDへのボーナス（+1.5）を加えたスコアで選択。ロブボール（`lob = 1.0`）として放たれ、黄色の弧線トレイルで表示。

### 14.2 クロス

`doCross` 関数で実行。ウインガーがバイライン付近からペナルティエリア内のFWD/MIDに向けてロブボールを送る。ニアポスト/ファーポストの選択はウインガーの位置（上下）に依存。

---

## 15. 試合フロー

### 15.1 状態遷移

```
[初期化] → [キックオフ] → [プレイ中] → [ゴール/ファウル/アウト] → [一時停止/セットピース]
                                          ↓
                                    [タイムアップ] → [FULL TIME] → [自動リスタート]
```

### 15.2 キックオフ処理

1. 全プレイヤーをホームポジションにリセット
2. ボールをピッチ中央に配置
3. キックオフ側チームの中央に最も近いプレイヤーにボールを渡す
4. ゴール後は**失点したチーム**がキックオフ

### 15.3 試合終了と自動リスタート

経過時間が `matchDuration`（120秒）に達すると「FULL TIME」表示、5秒後に自動リスタート。

---

## 16. 更新ループ

### 16.1 更新順序

1. フラッシュ減衰
2. 試合終了チェック → リスタートタイマー減算
3. セットピースアニメーション更新
4. 一時停止チェック → タイマー減算
5. 経過時間更新 → タイムアップ判定
6. クールダウン/ロブ減算
7. デッドボール回復
8. ボール物理（保持追従 or フリー移動）
9. GKセーブ判定
10. アウトオブプレー判定
11. ゴール判定
12. ボール減速
13. トレイル減衰
14. プレイヤーループ（22人）: インターセプト → 意思決定 → 移動 → ジャンプ減衰

---

## 17. 描画仕様

### 17.1 描画レイヤー順序

| 順序 | レイヤー | 説明 |
|------|---------|------|
| 1 | 背景 | `#0a0a10` の暗色で全画面塗りつぶし |
| 2 | ピッチ | 緑のグラデーション + 12本の縦縞パターン |
| 3 | ピッチライン | 外枠、センターライン、センターサークル、ペナルティエリア、ゴールエリア、ペナルティスポット、ペナルティアーク、コーナーアーク |
| 4 | ゴール | 半透明の白い矩形 + 枠線 + ゴールポスト |
| 5 | 壁インジケーター | フリーキック時の壁プレイヤー周囲の黄色点線リング |
| 6 | 軌跡（Trail） | パス: 白い点線、シュート: オレンジ太線、ロングパス: 黄色弧線 |
| 7 | プレイヤー | ジャンプ影 → 保持者リング → スローイン腕アニメーション → 円形本体 → 背番号 |
| 8 | ボール | ロブ影 → 通常影 → 白いグラデーション円 |
| 9 | フラッシュ | 半透明オーバーレイ + テキスト |
| 10 | HUD | スコアバー + タイマー |
| 11 | スピード切替ボタン | 右上 |
| 12 | 攻撃レベルパネル | 左下（BLUE）、右下（RED） |

### 17.2 カラーパレット

| 用途 | カラーコード | 説明 |
|------|------------|------|
| 背景 | `#0a0a10` | ダークネイビー |
| ピッチ（明） | `#1a6b3a` | フォレストグリーン |
| ピッチ（暗） | `#145e30` | ダークグリーン |
| ライン | `rgba(255,255,255,0.75)` | 半透明白 |
| BLUE チーム | `#2563eb` / `#60a5fa` | ロイヤルブルー系 |
| RED チーム | `#dc2626` / `#f87171` | クリムゾンレッド系 |
| 保持リング BLUE | `rgba(37,99,235,0.5)` | 半透明ブルー |
| 保持リング RED | `rgba(220,38,38,0.5)` | 半透明レッド |
| HUD背景 | `rgba(10,10,20,0.88)` | 半透明ダーク |
| スピードLOW | `#60a5fa` | ライトブルー |
| スピードMID | `#fbbf24` | イエロー |
| スピードFAST | `#f87171` | ライトレッド |

---

## 18. UIコントロール

### 18.1 スピード切替ボタン

画面右上に配置。クリック/タップで LOW → MID → FAST をサイクル。各モードで時間の進行速度が変化する。

### 18.2 攻撃参加レベルパネル

画面下部左右に配置。BLUE（左）とRED（右）のパネルにそれぞれ −/+ ボタンと10段階のセグメントバーを表示。セグメントの色はレベルに応じて緑（守備的）から赤（攻撃的）にグラデーション。

### 18.3 タッチ/クリックハンドリング

Canvas上の `click` および `touchstart` イベントをリスンし、各UIボタンの矩形範囲とのヒットテストで判定。`touchAction: "none"` でモバイルのスクロール/ズームを防止。

---

## 19. Reactコンポーネント構造

### 19.1 `Home` コンポーネント

シミュレーション全体を管理する唯一のReactコンポーネント。`useRef` で状態を管理し、Reactの再レンダリングを回避してCanvas描画のパフォーマンスを最大化。

### 19.2 ライフサイクル

`useEffect` 内で Canvas初期化 → キックオフ → リサイズハンドラ → アニメーションループ（`requestAnimationFrame`）を実行。クリーンアップ時に `cancelAnimationFrame` とリスナー解除。

---

## 20. レスポンシブ対応

### 20.1 Canvas解像度

`window.devicePixelRatio` を考慮し、Retinaディスプレイでもシャープな描画を維持。

### 20.2 スケーリング

```
sc = min(canvasWidth / (pitchHalfW * 2 + 2.5), canvasHeight / (pitchHalfH * 2 + 3.5))
```

画面のアスペクト比に関わらずピッチ全体が常に表示される。

---

## 21. 既知の制約と拡張可能性

### 21.1 現在の制約

| 項目 | 説明 |
|------|------|
| イエロー/レッドカード | 未実装。ファウルは発生するがカードは出ない |
| 選手交代 | 未実装。22人が試合終了まで固定 |
| 体力・疲労 | 未実装。全選手が一定速度で動き続ける |
| フォーメーション変更 | 実行時の動的変更は未対応 |
| ペナルティキック | 未実装。ペナルティエリア内のファウルも通常フリーキック |
| VAR/リプレイ | 未実装 |

### 21.2 拡張可能性

| 拡張項目 | 実装方針 |
|---------|---------|
| フォーメーション切替 | `FORM_442` を複数定義し、UIで選択可能にする |
| 選手個別能力値 | `Player` に `speed`, `accuracy`, `stamina` 等を追加 |
| 試合統計 | ポゼッション率、シュート数、パス成功率等のカウンター |
| ハーフタイム | 前後半制にして統計表示 |
| 音声効果 | Web Audio API でホイッスル音、キック音、歓声等 |
| 実在チームデータ | 選手名・背番号・チームカラーを外部JSONから読み込み |

---

## 付録A: 全関数一覧

| 関数名 | 引数 | 戻り値 | 説明 |
|--------|------|--------|------|
| `slotRole` | `slot` | `Role` | スロット番号から役割を返す |
| `mkPlayers` | — | `Player[]` | 22人のプレイヤーを初期化 |
| `mkState` | — | `State` | 試合状態を初期化 |
| `getAtkLevel` | `st, team` | `number` | チームの攻撃レベル（1-10）を返す |
| `atkFactor` | `st, team` | `number` | 攻撃ファクター（0.0-1.0）を返す |
| `checkGoal` | `pos` | `number` | ゴール判定（1/-1/0） |
| `give` | `ball, idx, pl` | `void` | ボールをプレイヤーに渡す |
| `kick` | `st, dir, spd, shot, tgt, isLong?` | `void` | ボールを蹴る |
| `nearest` | `st, pos, teamFilter?` | `number` | 最寄りプレイヤーのインデックス |
| `nearestOutfield` | `st, pos, team` | `number` | 最寄りフィールドプレイヤー |
| `findGK` | `st, team` | `number` | GKのインデックス |
| `isOffside` | `st, receiver, ballPos` | `boolean` | オフサイド判定 |
| `openness` | `st, p` | `number` | プレイヤーの開き具合 |
| `laneBlocked` | `st, from, to, team` | `boolean` | パスレーンブロック判定 |
| `bestPass` | `st, idx, relaxed?` | `number \| null` | 最適なパス先 |
| `bestLongPass` | `st, idx` | `number \| null` | 最適なロングパス先 |
| `doPassTo` | `st, idx, targetIdx` | `void` | パスを実行 |
| `doLongPassTo` | `st, idx, targetIdx` | `void` | ロングパスを実行 |
| `doDribble` | `st, idx` | `void` | ドリブルを実行 |
| `doCross` | `st, idx` | `void` | クロスを実行 |
| `decideHasBall` | `st, idx` | `void` | ボール保持時の意思決定 |
| `decideNoBall` | `st, idx` | `void` | ボール非保持時の意思決定 |
| `triggerFoul` | `st, fouledIdx, foulerIdx` | `void` | ファウルを発生させる |
| `doKickOff` | `st` | `void` | キックオフ処理 |
| `startThrowIn` | `st, throwerIdx, targetPos` | `void` | スローインアニメーション開始 |
| `startCornerKick` | `st, kickerIdx, targetPos` | `void` | コーナーキックアニメーション開始 |
| `updateSetPiece` | `st, dtSim` | `void` | セットピースアニメーション更新 |
| `update` | `st, dt` | `void` | 1フレーム分の状態更新 |
| `render` | `ctx, canvas, st, ...bounds` | `void` | 1フレーム分の描画 |

---

## 付録B: パラメータ調整ガイド

| 目的 | 調整するパラメータ | 方向 |
|------|------------------|------|
| 試合のテンポを速くする | `moveSpeed` ↑, `passSpeed` ↑, `decisionInterval` ↓ | 全体的に速度を上げ、判断を頻繁にする |
| ゴールを増やす | `shotAccuracy` ↑, `shotRange` ↑, `gkSaveBase` ↓ | シュート成功率を上げ、GKを弱くする |
| ゴールを減らす | `shotAccuracy` ↓, `interceptRadius` ↑, `gkSaveBase` ↑ | シュート精度を下げ、守備力を上げる |
| パスサッカーにする | `passAccuracy` ↑, `dribbleControl` ↓ | パスを正確にし、ドリブルを失敗しやすくする |
| ドリブル中心にする | `dribbleControl` ↑, `dribbleSpeed` ↑ | ドリブルの成功率と速度を上げる |
| ファウルを増やす | `foulChanceOnTackle` ↑, `foulChanceOnDribble` ↑ | ファウル確率を上げる |
| 直接FKゴールを増やす | `directFKShotChance` ↑, `directFKShotRange` ↑ | シュート選択率と距離を拡大 |
| ロングボール主体にする | `longPassMinDist` ↓, `longPassAccuracy` ↑ | ロングパスの条件を緩和し精度を上げる |
| 攻撃的な試合にする | `atkLevelBlue` / `atkLevelRed` を 7-10 に設定 | 両チームの攻撃参加を最大化 |
| よりリアルな試合時間 | `matchDuration` → 5400（90分相当） | 試合時間を延長 |

---

## 付録C: 完全ソースコード

以下は `client/src/pages/Home.tsx` の完全なソースコードである。本ファイルのみでシミュレーション全体が動作する。
```typescript
import { useEffect, useRef, useCallback } from "react";

/*
 * ============================================================
 *  2D 11v11 Soccer Autoplay — Clean Broadcast / Sports TV
 *  Formation: 4-4-2 for both teams
 *  Features: Offside, Out-of-play restarts (throw-in anim,
 *            corner + heading contest), GK saves, Speed toggle,
 *            Long pass AI, Attack level toggle (1-10 per team),
 *            Fouls, Free-kicks with wall + direct shot
 * ============================================================
 */

// ── Tunable Parameters ──────────────────────────────────────
const P = {
  matchDuration: 120,
  goalResetDelay: 2.0,

  pitchHalfW: 10.5,
  pitchHalfH: 6.8,
  goalHalfH: 1.22,
  goalDepth: 0.4,
  penAreaW: 2.75,
  penAreaH: 3.35,
  goalAreaW: 0.92,
  goalAreaH: 1.55,
  centreCircleR: 1.53,
  penSpotDist: 1.83,
  cornerArcR: 0.17,

  moveSpeed: 4.8,
  dribbleSpeed: 3.8,
  passSpeed: 12,
  shotSpeed: 18,
  longPassSpeed: 10,
  passAccuracy: 0.88,
  shotAccuracy: 0.60,
  longPassAccuracy: 0.65,
  dribbleControl: 0.90,
  interceptRadius: 0.75,
  decisionInterval: 0.20,
  shotRange: 5.5,
  shotAngle: 55,

  looseBallDrag: 3.5,
  deadBallTime: 0.7,

  trailDuration: 0.35,
  playerRadius: 0.30,
  ballRadius: 0.13,

  // Offside
  offsideEnabled: true,
  offsideMargin: 0.25,
  offsidePause: 1.2,
  restartNoIntercept: 0.5,

  // Out-of-play
  outEnabled: true,
  outMargin: 0.02,
  restartPause: 1.0,
  throwInInset: 0.35,
  cornerInset: 0.25,
  goalKickX: 10.5 - 0.92 + 0.2,

  // GK saves
  gkSaveEnabled: true,
  gkSaveRadius: 0.9,
  gkSaveBase: 0.55,
  gkSaveAngleBonus: 0.20,
  gkParryChance: 0.25,
  gkHoldCooldown: 0.6,

  // Speed toggle
  speedMult: { LOW: 0.75, MID: 1.0, FAST: 1.35 } as Record<string, number>,

  // Long pass
  longPassMinDist: 8,
  longPassMaxDist: 22,

  // Throw-in / Corner animation
  throwInMaxDist: 12,
  throwInAnimDur: 0.5,
  cornerAnimDur: 0.4,
  headingContestRadius: 2.5,
  headingContestDur: 0.35,

  // Foul
  foulChanceOnTackle: 0.18,    // chance of foul when tackling
  foulChanceOnDribble: 0.10,   // chance of foul when intercepting dribbler
  foulPause: 1.5,              // pause after foul
  freeKickNoIntercept: 0.8,    // cooldown after free kick
  wallDistance: 1.83,           // 9.15m / 5 ≈ 1.83 units
  wallPlayerCount: 3,          // number of players in wall (can be 4 for close range)
  directFKShotRange: 7.0,      // within this distance, FK taker may shoot
  directFKShotChance: 0.65,    // probability of choosing shot over pass at FK
};

// ── Vec2 ────────────────────────────────────────────────────
interface V { x: number; y: number }
const v = (x: number, y: number): V => ({ x, y });
const vadd = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
const vsub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
const vscl = (a: V, s: number): V => ({ x: a.x * s, y: a.y * s });
const vlen = (a: V): number => Math.sqrt(a.x * a.x + a.y * a.y);
const vnorm = (a: V): V => { const l = vlen(a); return l < 1e-4 ? v(1, 0) : v(a.x / l, a.y / l); };
const vdist = (a: V, b: V): number => vlen(vsub(a, b));
const vdot = (a: V, b: V): number => a.x * b.x + a.y * b.y;
const vlerp = (a: V, b: V, t: number): V => v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
const vang = (a: V, b: V): number => {
  const la = vlen(a), lb = vlen(b);
  if (la < 0.001 || lb < 0.001) return 0;
  return Math.acos(Math.max(-1, Math.min(1, vdot(a, b) / (la * lb)))) * 180 / Math.PI;
};
const vmove = (from: V, to: V, d: number): V => {
  const diff = vsub(to, from); const l = vlen(diff);
  return l <= d ? { ...to } : vadd(from, vscl(vnorm(diff), d));
};
const vperp = (a: V): V => v(-a.y, a.x);
const clamp = (val: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, val));
const clamp01 = (val: number) => Math.max(0, Math.min(1, val));
const rng = (a: number, b: number) => a + Math.random() * (b - a);
const pitchClamp = (p: V): V => v(
  clamp(p.x, -P.pitchHalfW, P.pitchHalfW),
  clamp(p.y, -P.pitchHalfH, P.pitchHalfH)
);

// ── Types ───────────────────────────────────────────────────
interface Trail { start: V; end: V; shot: boolean; longPass: boolean; t: number }

type Role = "GK" | "DEF" | "MID" | "FWD";
function slotRole(slot: number): Role {
  if (slot === 0) return "GK";
  if (slot <= 4) return "DEF";
  if (slot <= 8) return "MID";
  return "FWD";
}

type SpeedMode = "LOW" | "MID" | "FAST";

type SetPieceType = "throw-in" | "corner" | "free-kick" | null;

interface SetPieceAnim {
  type: SetPieceType;
  timer: number;
  duration: number;
  throwerIdx: number;
  ballTarget: V;
  phase: "windup" | "release" | "heading" | "wall-forming" | "fk-run";
  headingTimer: number;
  headingPlayers: number[];
  headingWinner: number;
  wallPlayers: number[];     // indices of players forming wall
  fkIsShot: boolean;         // whether the FK will be a shot
  fkTeam: number;            // team taking the FK
}

interface Player {
  pos: V; team: number; num: number; home: V;
  face: V; act: "idle" | "dribble" | "move"; tgt: V;
  dt: number;
  isGK: boolean;
  slot: number;
  role: Role;
  jumpY: number;
}

interface Ball {
  pos: V; vel: V; owner: number | null;
  free: boolean; shot: boolean; dead: number;
  cooldown: number;
  lastTouchTeam: number;
  lob: number;
}

interface State {
  pl: Player[]; ball: Ball;
  sL: number; sR: number; time: number;
  over: boolean; paused: boolean; pauseT: number;
  koSide: number; trail: Trail | null;
  flash: number; flashTxt: string; restartT: number;
  speed: SpeedMode;
  setPiece: SetPieceAnim | null;
  atkLevelBlue: number;  // 1-10
  atkLevelRed: number;   // 1-10
}

// ── 4-4-2 Formation ─────────────────────────────────────────
const FORM_442: V[] = [
  v(-9.8, 0),       // 0  GK
  v(-7.5, -4.5),    // 1  LB
  v(-7.5, -1.5),    // 2  CB
  v(-7.5, 1.5),     // 3  CB
  v(-7.5, 4.5),     // 4  RB
  v(-4.5, -5.0),    // 5  LM
  v(-4.5, -1.5),    // 6  CM
  v(-4.5, 1.5),     // 7  CM
  v(-4.5, 5.0),     // 8  RM
  v(-1.5, -1.8),    // 9  ST
  v(-1.5, 1.8),     // 10 ST
];

const NUMS_11 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

// ── Init ────────────────────────────────────────────────────
function mkPlayers(): Player[] {
  const out: Player[] = [];
  for (let t = 0; t < 2; t++) {
    const s = t === 0 ? -1 : 1;
    for (let i = 0; i < 11; i++) {
      const f = { ...FORM_442[i] };
      if (s === 1) { f.x = -f.x; f.y = -f.y; }
      out.push({
        pos: { ...f }, team: s, num: NUMS_11[i], home: { ...f },
        face: v(-s, 0), act: "idle", tgt: { ...f },
        dt: Math.random() * P.decisionInterval,
        isGK: i === 0, slot: i, role: slotRole(i),
        jumpY: 0,
      });
    }
  }
  return out;
}

function mkState(): State {
  return {
    pl: mkPlayers(),
    ball: { pos: v(0, 0), vel: v(0, 0), owner: null, free: false, shot: false, dead: 0, cooldown: 0, lastTouchTeam: -1, lob: 0 },
    sL: 0, sR: 0, time: 0,
    over: false, paused: false, pauseT: 0,
    koSide: 1, trail: null,
    flash: 0, flashTxt: "", restartT: 0,
    speed: "MID",
    setPiece: null,
    atkLevelBlue: 5,
    atkLevelRed: 5,
  };
}

// ── Helpers ─────────────────────────────────────────────────
function getAtkLevel(st: State, team: number): number {
  return team < 0 ? st.atkLevelBlue : st.atkLevelRed;
}

// Attack factor: 0.0 (defensive) to 1.0 (all-out attack)
function atkFactor(st: State, team: number): number {
  return (getAtkLevel(st, team) - 1) / 9;
}

function checkGoal(pos: V): number {
  if (pos.x >= P.pitchHalfW - 0.05 && Math.abs(pos.y) <= P.goalHalfH) return 1;
  if (pos.x <= -P.pitchHalfW + 0.05 && Math.abs(pos.y) <= P.goalHalfH) return -1;
  return 0;
}

function give(ball: Ball, idx: number, pl: Player[]) {
  ball.owner = idx; ball.free = false; ball.shot = false;
  ball.vel = v(0, 0); ball.dead = 0; ball.cooldown = 0.35;
  ball.lastTouchTeam = pl[idx].team;
  ball.lob = 0;
}

function kick(st: State, dir: V, spd: number, shot: boolean, tgt: V, isLong: boolean = false) {
  const b = st.ball;
  if (b.owner !== null) b.lastTouchTeam = st.pl[b.owner].team;
  st.trail = { start: { ...b.pos }, end: { ...tgt }, shot, longPass: isLong, t: P.trailDuration };
  b.owner = null; b.free = true; b.shot = shot;
  b.vel = vscl(vnorm(dir), spd); b.dead = 0;
  b.lob = isLong ? 1.0 : 0;
}

function nearest(st: State, pos: V, teamFilter?: number): number {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < st.pl.length; i++) {
    if (teamFilter !== undefined && st.pl[i].team !== teamFilter) continue;
    const d = vdist(st.pl[i].pos, pos);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

function nearestOutfield(st: State, pos: V, team: number): number {
  let bi = -1, bd = Infinity;
  for (let i = 0; i < st.pl.length; i++) {
    if (st.pl[i].team !== team || st.pl[i].isGK) continue;
    const d = vdist(st.pl[i].pos, pos);
    if (d < bd) { bd = d; bi = i; }
  }
  if (bi === -1) return nearest(st, pos, team);
  return bi;
}

function findGK(st: State, team: number): number {
  for (let i = 0; i < st.pl.length; i++) {
    if (st.pl[i].team === team && st.pl[i].isGK) return i;
  }
  return nearest(st, v(team * P.pitchHalfW, 0), team);
}

// ── Offside ─────────────────────────────────────────────────
function isOffside(st: State, receiver: Player, ballPosAtKick: V): boolean {
  if (!P.offsideEnabled) return false;
  const rTeam = receiver.team;
  const oppTeam = -rTeam;
  if (rTeam * receiver.pos.x >= 0) return false;
  if (rTeam * receiver.pos.x >= rTeam * ballPosAtKick.x) return false;
  const oppXvals: number[] = [];
  for (const p of st.pl) {
    if (p.team !== oppTeam || p.isGK) continue;
    oppXvals.push(p.pos.x);
  }
  if (oppXvals.length < 1) return false;
  oppXvals.sort((a, b) => (rTeam * a) - (rTeam * b));
  const lastDefX = oppXvals.length >= 2 ? oppXvals[1] : oppXvals[0];
  if (rTeam * receiver.pos.x < rTeam * lastDefX - P.offsideMargin) return true;
  return false;
}

// ── AI ──────────────────────────────────────────────────────
function openness(st: State, p: Player): number {
  let mn = Infinity;
  for (const q of st.pl) {
    if (q.team === p.team) continue;
    mn = Math.min(mn, vdist(p.pos, q.pos));
  }
  return mn;
}

function laneBlocked(st: State, from: V, to: V, team: number): boolean {
  const d = vnorm(vsub(to, from));
  const dist = vdist(from, to);
  for (const p of st.pl) {
    if (p.team === team) continue;
    const tp = vsub(p.pos, from);
    const proj = vdot(tp, d);
    if (proj < 0.5 || proj > dist - 0.5) continue;
    const cl = vadd(from, vscl(d, proj));
    if (vdist(cl, p.pos) < 1.0) return true;
  }
  return false;
}

function bestPass(st: State, idx: number, relaxed: boolean = false): number | null {
  const me = st.pl[idx];
  let bi: number | null = null, bs = -Infinity;
  for (let i = 0; i < st.pl.length; i++) {
    const p = st.pl[i];
    if (p.team !== me.team || i === idx) continue;
    const d = vdist(me.pos, p.pos);
    if (d < 1.0 || d > 18) continue;
    const op = openness(st, p);
    const gp = -me.team * p.pos.x;
    let sc = op * 2 + gp * 0.5 - d * 0.12;
    if (!relaxed && laneBlocked(st, me.pos, p.pos, me.team)) sc -= 4;
    else if (relaxed && laneBlocked(st, me.pos, p.pos, me.team)) sc -= 1.5;
    if (P.offsideEnabled && isOffside(st, p, st.ball.pos)) sc -= 10;
    if (sc > bs) { bs = sc; bi = i; }
  }
  return bi;
}

function bestLongPass(st: State, idx: number): number | null {
  const me = st.pl[idx];
  let bi: number | null = null, bs = -Infinity;
  for (let i = 0; i < st.pl.length; i++) {
    const p = st.pl[i];
    if (p.team !== me.team || i === idx || p.isGK) continue;
    const d = vdist(me.pos, p.pos);
    if (d < P.longPassMinDist || d > P.longPassMaxDist) continue;
    const op = openness(st, p);
    const gp = -me.team * p.pos.x;
    let bonus = 0;
    if (p.role === "FWD") bonus = 2.5;
    else if (p.role === "MID" && (p.slot === 5 || p.slot === 8)) bonus = 1.5;
    let sc = op * 1.5 + gp * 0.8 + bonus - d * 0.05;
    if (laneBlocked(st, me.pos, p.pos, me.team)) sc -= 1.0;
    if (P.offsideEnabled && isOffside(st, p, st.ball.pos)) sc -= 10;
    if (sc > bs) { bs = sc; bi = i; }
  }
  return (bi !== null && bs > 2) ? bi : null;
}

function doPassTo(st: State, idx: number, targetIdx: number) {
  const me = st.pl[idx];
  const tm = st.pl[targetIdx];

  if (P.offsideEnabled && isOffside(st, tm, st.ball.pos)) {
    const oppTeam = -me.team;
    st.paused = true; st.pauseT = P.offsidePause;
    st.flash = 1.2; st.flashTxt = "OFFSIDE";
    st.ball.pos = pitchClamp({ ...tm.pos });
    st.ball.vel = v(0, 0); st.ball.free = false; st.ball.shot = false; st.ball.owner = null;
    const defIdx = nearestOutfield(st, tm.pos, oppTeam);
    give(st.ball, defIdx, st.pl);
    st.ball.cooldown = P.restartNoIntercept;
    return;
  }

  let tp = { ...tm.pos };
  if (tm.act !== "idle") {
    const lead = vnorm(vsub(tm.tgt, tm.pos));
    const pd = vdist(me.pos, tm.pos);
    tp = vadd(tp, vscl(lead, Math.min(pd * 0.1, 1.2)));
  }

  let baseErr = (1 - P.passAccuracy) * 1.5;
  let nearestOppDist = Infinity;
  for (const p of st.pl) {
    if (p.team === me.team) continue;
    const d = vdist(me.pos, p.pos);
    if (d < nearestOppDist) nearestOppDist = d;
  }
  if (nearestOppDist > 5.0) baseErr *= 0.25;
  else if (nearestOppDist > 3.0) baseErr *= 0.45;
  else if (nearestOppDist > 2.0) baseErr *= 0.70;

  const passDist = vdist(me.pos, tm.pos);
  if (passDist < 4.0) baseErr *= 0.5;
  else if (passDist < 7.0) baseErr *= 0.7;

  const inOwnHalf = me.team * me.pos.x > 0;
  if (inOwnHalf) baseErr *= 0.6;

  tp.x += rng(-baseErr, baseErr); tp.y += rng(-baseErr, baseErr);
  me.face = vnorm(vsub(tp, me.pos));
  kick(st, me.face, P.passSpeed, false, tp);
}

function doLongPassTo(st: State, idx: number, targetIdx: number) {
  const me = st.pl[idx];
  const tm = st.pl[targetIdx];

  if (P.offsideEnabled && isOffside(st, tm, st.ball.pos)) {
    const oppTeam = -me.team;
    st.paused = true; st.pauseT = P.offsidePause;
    st.flash = 1.2; st.flashTxt = "OFFSIDE";
    st.ball.pos = pitchClamp({ ...tm.pos });
    st.ball.vel = v(0, 0); st.ball.free = false; st.ball.shot = false; st.ball.owner = null;
    const defIdx = nearestOutfield(st, tm.pos, oppTeam);
    give(st.ball, defIdx, st.pl);
    st.ball.cooldown = P.restartNoIntercept;
    return;
  }

  let tp = { ...tm.pos };
  if (tm.act !== "idle") {
    const lead = vnorm(vsub(tm.tgt, tm.pos));
    const pd = vdist(me.pos, tm.pos);
    tp = vadd(tp, vscl(lead, Math.min(pd * 0.15, 2.0)));
  }
  const err = (1 - P.longPassAccuracy) * 2.5;
  tp.x += rng(-err, err); tp.y += rng(-err, err);
  me.face = vnorm(vsub(tp, me.pos));
  kick(st, me.face, P.longPassSpeed, false, tp, true);
}

function doDribble(st: State, idx: number) {
  const me = st.pl[idx];
  if (Math.random() > P.dribbleControl) {
    const fd = vnorm(v(rng(-1, 1), rng(-1, 1)));
    kick(st, fd, 3, false, vadd(me.pos, vscl(fd, 2)));
    return;
  }
  const gd = vnorm(v(-me.team, 0));
  let avoid = v(0, 0);
  let cd = Infinity;
  for (const p of st.pl) {
    if (p.team === me.team) continue;
    const d = vdist(me.pos, p.pos);
    if (d < cd && d < 3.5) { cd = d; avoid = vnorm(vsub(me.pos, p.pos)); }
  }
  let wa = v(0, 0);
  const edgeY = P.pitchHalfH - 0.8;
  const edgeX = P.pitchHalfW - 1.0;
  if (me.pos.y > edgeY) wa.y = -(me.pos.y - edgeY) * 1.5;
  if (me.pos.y < -edgeY) wa.y = (-edgeY - me.pos.y) * 1.5;
  if (me.pos.x > edgeX) wa.x = -(me.pos.x - edgeX) * 1.2;
  if (me.pos.x < -edgeX) wa.x = (-edgeX - me.pos.x) * 1.2;
  const jink = v(0, rng(-0.4, 0.4));
  const desired = vnorm(vadd(vadd(vadd(vscl(gd, 0.55), vscl(avoid, 0.3)), wa), jink));
  me.tgt = pitchClamp(vadd(me.pos, vscl(desired, 4.0)));
  me.act = "dribble";
  me.face = desired;
}

// ── Cross into the box (winger special) ─────────────────────
function doCross(st: State, idx: number) {
  const me = st.pl[idx];
  const oppGoalX = -me.team * P.pitchHalfW;
  const nearPost = v(oppGoalX * 0.88, -P.goalHalfH * rng(0.3, 1.2));
  const farPost = v(oppGoalX * 0.88, P.goalHalfH * rng(0.3, 1.2));
  const isTopWinger = me.home.y < 0;
  const crossTarget = isTopWinger ? farPost : nearPost;
  let bestIdx: number | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < st.pl.length; i++) {
    const p = st.pl[i];
    if (p.team !== me.team || i === idx || p.isGK) continue;
    if (p.role !== "FWD" && p.role !== "MID") continue;
    const d = vdist(p.pos, crossTarget);
    if (d < bestDist && d < 6) { bestDist = d; bestIdx = i; }
  }
  let tp = bestIdx !== null ? { ...st.pl[bestIdx].pos } : crossTarget;
  if (bestIdx !== null && st.pl[bestIdx].act !== "idle") {
    const lead = vnorm(vsub(st.pl[bestIdx].tgt, st.pl[bestIdx].pos));
    tp = vadd(tp, vscl(lead, 1.0));
  }
  const err = 1.2;
  tp.x += rng(-err * 0.5, err * 0.5); tp.y += rng(-err, err);
  me.face = vnorm(vsub(tp, me.pos));
  kick(st, me.face, P.longPassSpeed * 1.1, false, tp, true);
}

function decideHasBall(st: State, idx: number) {
  const me = st.pl[idx];
  const gc = v(-me.team * P.pitchHalfW, 0);
  const dg = vdist(me.pos, gc);
  const tg = vnorm(vsub(gc, me.pos));
  const ag = vang(me.face, tg);

  const inOwnThird = me.team * me.pos.x > P.pitchHalfW * 0.33;
  const inAttackingThird = -me.team * me.pos.x > P.pitchHalfW * 0.33;
  const isWinger = me.slot === 5 || me.slot === 8;
  const isWide = Math.abs(me.pos.y) > P.pitchHalfH * 0.45;

  if (me.isGK || inOwnThird) {
    const lp = bestLongPass(st, idx);
    if (lp !== null && Math.random() < 0.45) {
      doLongPassTo(st, idx, lp); return;
    }
    const bp = bestPass(st, idx, true);
    if (bp !== null) { doPassTo(st, idx, bp); return; }
    if (lp !== null) { doLongPassTo(st, idx, lp); return; }
    const fwd = vnorm(v(-me.team + rng(-0.3, 0.3), rng(-0.5, 0.5)));
    me.face = fwd;
    kick(st, fwd, P.passSpeed * 0.8, false, vadd(me.pos, vscl(fwd, 8)));
    return;
  }

  // Winger in attacking third
  if (isWinger && inAttackingThird) {
    const nearByline = Math.abs(me.pos.x) > P.pitchHalfW * 0.75;
    if (nearByline && isWide) {
      if (Math.random() < 0.70) { doCross(st, idx); return; }
    }
    if (isWide && !nearByline) {
      const bylineDir = vnorm(v(-me.team, 0));
      const wideKeep = v(0, me.pos.y > 0 ? 0.15 : -0.15);
      const desired = vnorm(vadd(bylineDir, wideKeep));
      me.tgt = pitchClamp(vadd(me.pos, vscl(desired, 4.0)));
      me.act = "dribble"; me.face = desired;
      return;
    }
    if (dg < P.shotRange * 1.1 && ag < P.shotAngle * 1.2) {
      const err = (1 - P.shotAccuracy) * 3.0;
      const t = v(gc.x, gc.y + rng(-err, err));
      me.face = vnorm(vsub(t, me.pos));
      kick(st, me.face, P.shotSpeed, true, t);
      return;
    }
    if (Math.random() < 0.40) { doCross(st, idx); return; }
  }

  // SHOT
  if (dg < P.shotRange && ag < P.shotAngle) {
    const err = (1 - P.shotAccuracy) * 3.0;
    const t = v(gc.x, gc.y + rng(-err, err));
    me.face = vnorm(vsub(t, me.pos));
    kick(st, me.face, P.shotSpeed, true, t);
    return;
  }

  // SHORT PASS
  const bp = bestPass(st, idx);
  if (bp !== null) {
    const lp = bestLongPass(st, idx);
    if (lp !== null && Math.random() < 0.3) { doLongPassTo(st, idx, lp); return; }
    doPassTo(st, idx, bp); return;
  }

  // LONG PASS
  const lp = bestLongPass(st, idx);
  if (lp !== null) { doLongPassTo(st, idx, lp); return; }

  // DRIBBLE
  doDribble(st, idx);
}

function decideNoBall(st: State, idx: number) {
  const me = st.pl[idx];
  const b = st.ball;
  const ballPos = b.pos;
  const af = atkFactor(st, me.team);

  if (me.isGK) {
    const gx = me.team * (P.pitchHalfW - 0.6);
    const gy = clamp(ballPos.y * 0.5, -P.goalHalfH + 0.2, P.goalHalfH - 0.2);
    me.tgt = v(gx, gy);
    me.act = "move";
    if (b.free && vdist(me.pos, ballPos) < 2.5) { me.tgt = { ...ballPos }; }
    return;
  }

  // Chase loose ball
  if (b.free || (b.owner === null && !b.free)) {
    const d = vdist(me.pos, ballPos);
    let rank = 0;
    for (let i = 0; i < st.pl.length; i++) {
      if (i === idx || st.pl[i].team !== me.team || st.pl[i].isGK) continue;
      if (vdist(st.pl[i].pos, ballPos) < d) rank++;
    }
    if (rank < 2 && d < 12) {
      me.tgt = { ...ballPos }; me.act = "move"; return;
    }
  }

  const teamHasBall = b.owner !== null && st.pl[b.owner].team === me.team;

  if (teamHasBall) {
    const oppGoalX = -me.team * P.pitchHalfW;
    const carrier = st.pl[b.owner!];
    const role = me.role;
    let targetX: number, targetY: number;

    // Attack factor shifts positions forward
    // af=0 → defensive, af=1 → all-out attack
    const pushFwd = af * 3.0; // extra forward push based on attack level

    if (role === "DEF") {
      // DEF: at low atk level, stay back; at high, push up significantly
      const baseFwd = carrier.pos.x + me.team * 3;
      targetX = baseFwd - me.team * pushFwd * 0.7; // push toward opponent goal
      const minX = me.team < 0 ? -P.pitchHalfW : -P.pitchHalfW * (0.5 - af * 0.3);
      const maxX = me.team < 0 ? P.pitchHalfW * (0.5 - af * 0.3) : P.pitchHalfW;
      targetX = clamp(targetX, minX, maxX);
      targetY = me.home.y + clamp(ballPos.y * 0.25, -2.0, 2.0);
    } else if (role === "MID") {
      const isWide = me.slot === 5 || me.slot === 8;
      if (isWide) {
        const teamAttacking = -me.team * carrier.pos.x > P.pitchHalfW * 0.15;
        if (teamAttacking) {
          targetX = oppGoalX * rng(0.55, 0.75);
          targetY = me.home.y > 0
            ? P.pitchHalfH * rng(0.6, 0.85)
            : -P.pitchHalfH * rng(0.6, 0.85);
        } else {
          targetX = (carrier.pos.x + oppGoalX) * (0.35 + af * 0.1);
          targetY = me.home.y * 0.8 + ballPos.y * 0.2;
        }
      } else {
        // CM: push forward more with higher attack level
        targetX = (carrier.pos.x + oppGoalX) * (0.4 + af * 0.15);
        targetY = ballPos.y + (me.home.y > 0 ? rng(1.5, 3.5) : rng(-3.5, -1.5));
      }
    } else {
      // FWD: always push forward, more aggressive with higher attack level
      targetX = oppGoalX * (0.55 + af * 0.15) + rng(-1, 1);
      targetY = me.home.y + rng(-2, 2);
    }

    me.tgt = pitchClamp(v(targetX, targetY));
    me.act = "move";
    return;
  }

  // Defending
  if (b.owner !== null && st.pl[b.owner].team !== me.team) {
    const carrier = st.pl[b.owner];
    const myGoal = v(me.team * P.pitchHalfW, 0);
    const dc = vdist(me.pos, carrier.pos);
    const role = me.role;
    // Higher attack level → less defensive retreat
    const defRetreat = 1.0 - af * 0.3;

    if (role === "FWD") {
      if (dc < 5) {
        me.tgt = pitchClamp(vlerp(carrier.pos, myGoal, 0.1));
      } else {
        me.tgt = pitchClamp(v(me.home.x + (ballPos.x - me.home.x) * 0.3, me.home.y));
      }
    } else if (role === "MID") {
      if (dc < 4.5) {
        me.tgt = pitchClamp(vlerp(carrier.pos, myGoal, 0.15 * defRetreat));
      } else {
        const shift = v(
          clamp((ballPos.x - me.home.x) * 0.4 * defRetreat, -3.5, 3.5),
          clamp((ballPos.y - me.home.y) * 0.45, -3, 3)
        );
        me.tgt = pitchClamp(vadd(me.home, shift));
      }
    } else {
      const shift = v(
        clamp((ballPos.x - me.home.x) * 0.25 * defRetreat, -2.5, 2.5),
        clamp((ballPos.y - me.home.y) * 0.5, -3, 3)
      );
      me.tgt = pitchClamp(vadd(me.home, shift));
    }
    me.act = "move";
    return;
  }

  // Default: shift toward ball
  const shift = v(
    clamp((ballPos.x - me.home.x) * 0.25, -2.5, 2.5),
    clamp((ballPos.y - me.home.y) * 0.35, -2, 2)
  );
  me.tgt = pitchClamp(vadd(me.home, shift));
  me.act = "move";
}

// ── Foul & Free-kick ────────────────────────────────────────
function triggerFoul(st: State, fouledIdx: number, foulerIdx: number) {
  const fouled = st.pl[fouledIdx];
  const fkPos = pitchClamp({ ...fouled.pos });
  const fkTeam = fouled.team;
  const oppTeam = -fkTeam;

  st.ball.vel = v(0, 0); st.ball.free = false; st.ball.shot = false;
  st.ball.owner = null; st.ball.lob = 0;
  st.ball.pos = { ...fkPos };
  st.flash = 1.5; st.flashTxt = "FOUL";

  // Determine if this is a direct shot opportunity
  const oppGoal = v(-fkTeam * P.pitchHalfW, 0);
  const distToGoal = vdist(fkPos, oppGoal);
  const fkIsShot = distToGoal < P.directFKShotRange && Math.random() < P.directFKShotChance;

  // Find FK taker (nearest outfield teammate)
  const takerIdx = nearestOutfield(st, fkPos, fkTeam);
  st.pl[takerIdx].pos = vadd(fkPos, vscl(vnorm(vsub(fkPos, oppGoal)), 0.4));
  st.pl[takerIdx].face = vnorm(vsub(oppGoal, fkPos));

  // Build wall
  const wallPlayers: number[] = [];
  if (fkIsShot) {
    const wallDir = vnorm(vsub(fkPos, oppGoal));
    const wallCenter = vadd(fkPos, vscl(vnorm(vsub(oppGoal, fkPos)), P.wallDistance));
    const perpDir = vperp(wallDir);
    const numWall = distToGoal < 4.5 ? 4 : P.wallPlayerCount;

    // Find closest defenders to wall position
    const candidates: { idx: number; dist: number }[] = [];
    for (let i = 0; i < st.pl.length; i++) {
      const p = st.pl[i];
      if (p.team !== oppTeam || p.isGK) continue;
      candidates.push({ idx: i, dist: vdist(p.pos, wallCenter) });
    }
    candidates.sort((a, b) => a.dist - b.dist);

    for (let w = 0; w < Math.min(numWall, candidates.length); w++) {
      const wi = candidates[w].idx;
      wallPlayers.push(wi);
      const offset = (w - (numWall - 1) / 2) * 0.55;
      st.pl[wi].tgt = pitchClamp(vadd(wallCenter, vscl(perpDir, offset)));
      st.pl[wi].act = "move";
    }
  }

  // FK target
  let ballTarget: V;
  if (fkIsShot) {
    const err = (1 - P.shotAccuracy) * 2.5;
    ballTarget = v(oppGoal.x, rng(-P.goalHalfH + 0.2, P.goalHalfH - 0.2) + rng(-err, err));
  } else {
    const bp = bestPass(st, takerIdx, true);
    if (bp !== null) {
      ballTarget = { ...st.pl[bp].pos };
    } else {
      ballTarget = vadd(fkPos, vscl(vnorm(vsub(oppGoal, fkPos)), 5));
    }
  }

  // Give ball to taker temporarily
  give(st.ball, takerIdx, st.pl);
  st.ball.cooldown = P.freeKickNoIntercept;

  // Start set piece animation
  st.setPiece = {
    type: "free-kick",
    timer: fkIsShot ? 1.2 : 0.8, // longer for wall forming
    duration: fkIsShot ? 1.2 : 0.8,
    throwerIdx: takerIdx,
    ballTarget,
    phase: fkIsShot ? "wall-forming" : "windup",
    headingTimer: 0,
    headingPlayers: [],
    headingWinner: -1,
    wallPlayers,
    fkIsShot,
    fkTeam,
  };
}

// ── Kick-off ────────────────────────────────────────────────
function doKickOff(st: State) {
  st.paused = false;
  st.setPiece = null;
  st.ball = { pos: v(0, 0), vel: v(0, 0), owner: null, free: false, shot: false, dead: 0, cooldown: 0, lastTouchTeam: st.koSide, lob: 0 };
  st.trail = null;
  for (const p of st.pl) {
    p.pos = { ...p.home }; p.act = "idle"; p.tgt = { ...p.home };
    p.face = v(-p.team, 0); p.dt = Math.random() * P.decisionInterval;
    p.jumpY = 0;
  }
  const ki = nearest(st, v(0, 0), st.koSide);
  give(st.ball, ki, st.pl);
}

// ── Set-piece animations ────────────────────────────────────
function startThrowIn(st: State, throwerIdx: number, targetPos: V) {
  const thrower = st.pl[throwerIdx];
  thrower.face = vnorm(vsub(targetPos, thrower.pos));
  st.setPiece = {
    type: "throw-in",
    timer: P.throwInAnimDur,
    duration: P.throwInAnimDur,
    throwerIdx,
    ballTarget: targetPos,
    phase: "windup",
    headingTimer: 0,
    headingPlayers: [],
    headingWinner: -1,
    wallPlayers: [],
    fkIsShot: false,
    fkTeam: 0,
  };
}

function startCornerKick(st: State, kickerIdx: number, targetPos: V) {
  st.setPiece = {
    type: "corner",
    timer: P.cornerAnimDur,
    duration: P.cornerAnimDur,
    throwerIdx: kickerIdx,
    ballTarget: targetPos,
    phase: "windup",
    headingTimer: P.headingContestDur,
    headingPlayers: [],
    headingWinner: -1,
    wallPlayers: [],
    fkIsShot: false,
    fkTeam: 0,
  };
}

function updateSetPiece(st: State, dtSim: number) {
  const sp = st.setPiece;
  if (!sp) return;

  sp.timer -= dtSim;

  // ── Free-kick: wall-forming phase ──
  if (sp.type === "free-kick" && sp.phase === "wall-forming") {
    // Wait for wall to form, then switch to run-up
    const thrower = st.pl[sp.throwerIdx];
    thrower.jumpY = 0;

    // Move wall players into position
    let wallReady = true;
    for (const wi of sp.wallPlayers) {
      const p = st.pl[wi];
      if (vdist(p.pos, p.tgt) > 0.3) wallReady = false;
    }

    if (sp.timer <= 0 || wallReady) {
      sp.phase = "fk-run";
      sp.timer = 0.4; // run-up time
      sp.duration = 0.4;
    }
    return;
  }

  // ── Free-kick: run-up phase ──
  if (sp.type === "free-kick" && sp.phase === "fk-run") {
    const thrower = st.pl[sp.throwerIdx];
    const progress = 1 - (sp.timer / sp.duration);
    thrower.jumpY = Math.sin(progress * Math.PI) * 0.2;

    if (sp.timer <= 0) {
      thrower.jumpY = 0;
      const b = st.ball;
      b.owner = null; b.free = true;

      if (sp.fkIsShot) {
        // Direct free-kick shot
        const dir = vnorm(vsub(sp.ballTarget, b.pos));
        const err = (1 - P.shotAccuracy) * 2.0;
        const tgt = v(sp.ballTarget.x, sp.ballTarget.y + rng(-err, err));
        b.vel = vscl(vnorm(vsub(tgt, b.pos)), P.shotSpeed * 0.9);
        b.shot = true;
        b.lob = 0;
        st.trail = { start: { ...b.pos }, end: tgt, shot: true, longPass: false, t: P.trailDuration * 1.5 };
      } else {
        // Free-kick pass
        const dir = vnorm(vsub(sp.ballTarget, b.pos));
        const err = 0.6;
        const tgt = v(sp.ballTarget.x + rng(-err, err), sp.ballTarget.y + rng(-err, err));
        b.vel = vscl(vnorm(vsub(tgt, b.pos)), P.passSpeed);
        b.shot = false;
        b.lob = 0;
        st.trail = { start: { ...b.pos }, end: tgt, shot: false, longPass: false, t: P.trailDuration };
      }
      b.cooldown = 0.3;
      b.lastTouchTeam = sp.fkTeam;
      st.setPiece = null;
    }
    return;
  }

  // ── Throw-in / Corner ──
  if (sp.phase === "windup") {
    const thrower = st.pl[sp.throwerIdx];
    const progress = 1 - (sp.timer / sp.duration);
    thrower.jumpY = Math.sin(progress * Math.PI) * 0.4;

    if (sp.timer <= 0) {
      sp.phase = "release";
      thrower.jumpY = 0;
      const b = st.ball;
      b.owner = null; b.free = true; b.shot = false;

      if (sp.type === "throw-in") {
        const err = 0.4;
        const tgt = v(sp.ballTarget.x + rng(-err, err), sp.ballTarget.y + rng(-err, err));
        b.vel = vscl(vnorm(vsub(tgt, b.pos)), P.passSpeed * 0.7);
        b.lob = 0.5;
        st.trail = { start: { ...b.pos }, end: tgt, shot: false, longPass: false, t: P.trailDuration };
        b.cooldown = 0.3;
      } else if (sp.type === "corner") {
        const err = 1.0;
        const tgt = v(sp.ballTarget.x + rng(-err, err), sp.ballTarget.y + rng(-err, err));
        b.vel = vscl(vnorm(vsub(tgt, b.pos)), P.longPassSpeed * 1.1);
        b.lob = 1.0;
        st.trail = { start: { ...b.pos }, end: tgt, shot: false, longPass: true, t: P.trailDuration * 1.5 };
        b.cooldown = 0.2;

        sp.headingPlayers = [];
        for (let i = 0; i < st.pl.length; i++) {
          if (st.pl[i].isGK) continue;
          if (vdist(st.pl[i].pos, sp.ballTarget) < P.headingContestRadius) {
            sp.headingPlayers.push(i);
            st.pl[i].tgt = vadd(sp.ballTarget, v(rng(-0.5, 0.5), rng(-0.5, 0.5)));
            st.pl[i].act = "move";
          }
        }
        const kickerTeam = st.pl[sp.throwerIdx].team;
        for (let i = 0; i < st.pl.length; i++) {
          const p = st.pl[i];
          if (p.isGK || sp.headingPlayers.includes(i)) continue;
          if ((p.role === "FWD" || p.role === "DEF") && vdist(p.pos, sp.ballTarget) < 6) {
            sp.headingPlayers.push(i);
            const offset = p.team === kickerTeam ? v(rng(-0.8, 0.8), rng(-0.8, 0.8)) : v(rng(-0.5, 0.5), rng(-0.5, 0.5));
            p.tgt = pitchClamp(vadd(sp.ballTarget, offset));
            p.act = "move";
          }
        }
        sp.headingTimer = P.headingContestDur;
      }
    }
  } else if (sp.phase === "release") {
    if (sp.type === "corner") {
      const distToTarget = vdist(st.ball.pos, sp.ballTarget);
      if (distToTarget < 1.5 || vlen(st.ball.vel) < 2) {
        sp.phase = "heading";
        sp.headingTimer = P.headingContestDur;

        const contestants: number[] = [];
        for (let i = 0; i < st.pl.length; i++) {
          if (st.pl[i].isGK && vdist(st.pl[i].pos, st.ball.pos) > 2) continue;
          if (vdist(st.pl[i].pos, st.ball.pos) < P.headingContestRadius) {
            contestants.push(i);
          }
        }

        if (contestants.length > 0) {
          let bestIdx = contestants[0];
          let bestScore = -Infinity;
          for (const ci of contestants) {
            const dist = vdist(st.pl[ci].pos, st.ball.pos);
            const score = -dist + rng(0, 1.5);
            if (score > bestScore) { bestScore = score; bestIdx = ci; }
          }
          sp.headingWinner = bestIdx;
          sp.headingPlayers = contestants;
          for (const ci of contestants) {
            st.pl[ci].jumpY = 0.5 + rng(0, 0.3);
          }
        } else {
          st.setPiece = null;
        }
      }
    } else {
      if (vlen(st.ball.vel) < 1 || st.ball.owner !== null) {
        st.setPiece = null;
      }
    }
  } else if (sp.phase === "heading") {
    sp.headingTimer -= dtSim;
    for (const ci of sp.headingPlayers) {
      const progress = 1 - (sp.headingTimer / P.headingContestDur);
      st.pl[ci].jumpY = Math.max(0, Math.sin(progress * Math.PI) * 0.6);
    }

    if (sp.headingTimer <= 0) {
      for (const ci of sp.headingPlayers) { st.pl[ci].jumpY = 0; }

      if (sp.headingWinner >= 0) {
        const winner = st.pl[sp.headingWinner];
        const b = st.ball;
        b.lob = 0;
        const oppGoal = v(-winner.team * P.pitchHalfW, 0);
        const distToGoal = vdist(winner.pos, oppGoal);

        if (distToGoal < P.shotRange * 1.2) {
          const tgt = v(oppGoal.x, rng(-P.goalHalfH + 0.2, P.goalHalfH - 0.2));
          b.pos = { ...winner.pos };
          b.vel = vscl(vnorm(vsub(tgt, winner.pos)), P.shotSpeed * 0.7);
          b.free = true; b.shot = true; b.owner = null;
          b.lastTouchTeam = winner.team;
          st.trail = { start: { ...winner.pos }, end: tgt, shot: true, longPass: false, t: P.trailDuration };
        } else {
          give(b, sp.headingWinner, st.pl);
          b.cooldown = 0.4;
        }
      }
      st.setPiece = null;
    }
  }
}

// ── Update ──────────────────────────────────────────────────
function update(st: State, dt: number) {
  const dtSim = dt * P.speedMult[st.speed];

  if (st.flash > 0) st.flash -= dtSim;

  if (st.over) {
    st.restartT -= dtSim;
    if (st.restartT <= 0) { Object.assign(st, mkState()); doKickOff(st); }
    return;
  }

  // Set-piece animation
  if (st.setPiece) {
    updateSetPiece(st, dtSim);
    if (st.setPiece && (st.setPiece.phase === "release" || st.setPiece.phase === "heading")) {
      const b = st.ball;
      if (b.free) {
        b.pos = vadd(b.pos, vscl(b.vel, dtSim));
        if (b.lob > 0) b.lob = Math.max(0, b.lob - dtSim * 1.5);
        const spd = vlen(b.vel);
        if (spd > 0.1) {
          b.vel = vscl(vnorm(b.vel), Math.max(0, spd - P.looseBallDrag * 0.5 * dtSim));
        }
        if (b.cooldown > 0) b.cooldown -= dtSim;

        const gs = checkGoal(b.pos);
        if (gs !== 0) {
          if (gs > 0) st.sL++; else st.sR++;
          st.koSide = (gs > 0) ? 1 : -1;
          st.paused = true; st.pauseT = P.goalResetDelay;
          st.flash = 1.8; st.flashTxt = "GOAL!";
          st.setPiece = null;
          return;
        }

        if (b.cooldown <= 0) {
          for (let i = 0; i < st.pl.length; i++) {
            if (b.owner !== null) break;
            if (b.free && vdist(st.pl[i].pos, b.pos) < P.interceptRadius) {
              give(b, i, st.pl);
              st.setPiece = null;
              break;
            }
          }
        }
      }

      for (const p of st.pl) {
        if (p.act !== "idle") {
          const spd = P.moveSpeed;
          const d = vsub(p.tgt, p.pos);
          if (vlen(d) < 0.08) { p.act = "idle"; }
          else {
            p.face = vnorm(d);
            p.pos = pitchClamp(vmove(p.pos, p.tgt, spd * dtSim));
          }
        }
      }
    }
    // During wall-forming / fk-run, still move players
    if (st.setPiece && (st.setPiece.phase === "wall-forming" || st.setPiece.phase === "fk-run" || st.setPiece.phase === "windup")) {
      for (const p of st.pl) {
        if (p.act !== "idle") {
          const spd = P.moveSpeed;
          const d = vsub(p.tgt, p.pos);
          if (vlen(d) < 0.08) { p.act = "idle"; }
          else {
            p.face = vnorm(d);
            p.pos = pitchClamp(vmove(p.pos, p.tgt, spd * dtSim));
          }
        }
      }
    }
    if (st.setPiece) return;
  }

  if (st.paused) {
    st.pauseT -= dtSim;
    if (st.pauseT <= 0) {
      if (st.flashTxt === "GOAL!") {
        doKickOff(st);
      } else {
        st.paused = false;
      }
    }
    return;
  }

  st.time += dtSim;
  if (st.time >= P.matchDuration) {
    st.over = true; st.restartT = 5; st.flashTxt = "FULL TIME"; st.flash = 2.5;
    return;
  }

  const b = st.ball;

  if (b.cooldown > 0) b.cooldown -= dtSim;
  if (b.lob > 0) b.lob = Math.max(0, b.lob - dtSim * 2);

  // Dead ball recovery
  if (b.owner === null && !b.free) { b.free = true; b.dead = 0; }
  if (b.free && vlen(b.vel) < 0.5) {
    b.dead += dtSim;
    if (b.dead > P.deadBallTime) {
      give(b, nearest(st, b.pos), st.pl);
    }
  } else if (!b.free) {
    b.dead = 0;
  }

  // Ball physics
  if (b.owner !== null && !b.free) {
    const o = st.pl[b.owner];
    b.pos = vadd(o.pos, vscl(o.face, 0.22));
  } else if (b.free) {
    b.pos = vadd(b.pos, vscl(b.vel, dtSim));

    // GK save check
    if (P.gkSaveEnabled && b.shot) {
      for (let ti = 0; ti < 2; ti++) {
        const gkTeam = ti === 0 ? -1 : 1;
        const shotHeadingToGoal = (gkTeam === -1 && b.vel.x < -1) || (gkTeam === 1 && b.vel.x > 1);
        if (!shotHeadingToGoal) continue;
        const gkIdx = findGK(st, gkTeam);
        const gk = st.pl[gkIdx];
        const dist = vdist(gk.pos, b.pos);
        if (dist < P.gkSaveRadius) {
          const velDir = vnorm(b.vel);
          const toGK = vnorm(vsub(gk.pos, b.pos));
          const shotAngleToGK = vang(velDir, toGK);
          const saveP = P.gkSaveBase + P.gkSaveAngleBonus * clamp01(1 - shotAngleToGK / 90);
          if (Math.random() < saveP) {
            if (Math.random() > P.gkParryChance) {
              give(b, gkIdx, st.pl);
              b.cooldown = P.gkHoldCooldown;
              st.flash = 0.6; st.flashTxt = "SAVE!";
            } else {
              const goalCenter = v(gkTeam * P.pitchHalfW, 0);
              const parryDir = vnorm(vsub(b.pos, goalCenter));
              b.vel = vscl(parryDir, 5 + Math.random() * 3);
              b.shot = false;
              b.cooldown = P.restartNoIntercept;
              st.flash = 0.6; st.flashTxt = "SAVE!";
            }
            break;
          }
        }
      }
    }

    // Out-of-play detection
    const outY = Math.abs(b.pos.y) > P.pitchHalfH + P.outMargin;
    const outX = Math.abs(b.pos.x) > P.pitchHalfW + P.outMargin;

    if (P.outEnabled && (outY || outX)) {
      const gs = checkGoal(b.pos);
      if (gs !== 0) {
        if (gs > 0) st.sL++; else st.sR++;
        st.koSide = (gs > 0) ? 1 : -1;
        st.paused = true; st.pauseT = P.goalResetDelay;
        st.flash = 1.8; st.flashTxt = "GOAL!";
        return;
      }

      b.vel = v(0, 0); b.free = false; b.shot = false; b.owner = null; b.lob = 0;

      if (outY && !outX) {
        // THROW-IN
        st.flashTxt = "THROW IN"; st.flash = 1.0;
        const restartTeam = -b.lastTouchTeam;
        const outSign = b.pos.y > 0 ? 1 : -1;
        const restartY = outSign * (P.pitchHalfH - P.throwInInset);
        const restartX = clamp(b.pos.x, -P.pitchHalfW + 0.5, P.pitchHalfW - 0.5);
        b.pos = v(restartX, restartY);
        const ri = nearestOutfield(st, b.pos, restartTeam);
        give(b, ri, st.pl);
        b.cooldown = P.restartNoIntercept;

        st.pl[ri].pos = { ...b.pos };
        st.pl[ri].face = v(0, -outSign);

        let throwTarget = vadd(b.pos, v(-restartTeam * 3, -outSign * 2));
        let bestScore = -Infinity;
        for (let i = 0; i < st.pl.length; i++) {
          if (i === ri || st.pl[i].team !== restartTeam || st.pl[i].isGK) continue;
          const d = vdist(st.pl[i].pos, b.pos);
          if (d > P.throwInMaxDist || d < 1.0) continue;
          const op = openness(st, st.pl[i]);
          const sc = op * 2 - d * 0.3;
          if (sc > bestScore) { bestScore = sc; throwTarget = { ...st.pl[i].pos }; }
        }
        const throwDist = vdist(b.pos, throwTarget);
        if (throwDist > P.throwInMaxDist) {
          const dir = vnorm(vsub(throwTarget, b.pos));
          throwTarget = vadd(b.pos, vscl(dir, P.throwInMaxDist));
        }

        startThrowIn(st, ri, throwTarget);
        return;
      } else if (outX) {
        const goalSide = b.pos.x > 0 ? 1 : -1;
        const defendingTeam = goalSide;
        const attackingTeam = -defendingTeam;

        if (b.lastTouchTeam === defendingTeam) {
          // CORNER
          st.flashTxt = "CORNER"; st.flash = 1.0;
          const cornerX = goalSide * (P.pitchHalfW - P.cornerInset);
          const cornerY = (b.pos.y > 0 ? 1 : -1) * (P.pitchHalfH - P.cornerInset);
          b.pos = v(cornerX, cornerY);
          const ri = nearestOutfield(st, b.pos, attackingTeam);
          give(b, ri, st.pl);
          b.cooldown = P.restartNoIntercept;

          st.pl[ri].pos = { ...b.pos };

          const targetX = goalSide * (P.pitchHalfW - P.penAreaW * 0.6);
          const targetY = rng(-P.penAreaH * 0.5, P.penAreaH * 0.5);

          for (let i = 0; i < st.pl.length; i++) {
            const p = st.pl[i];
            if (p.isGK || i === ri) continue;
            if (p.team === attackingTeam && (p.role === "FWD" || p.role === "MID")) {
              p.tgt = pitchClamp(v(targetX + rng(-1.5, 1.5), targetY + rng(-2, 2)));
              p.act = "move";
            } else if (p.team === defendingTeam && (p.role === "DEF" || p.role === "MID")) {
              p.tgt = pitchClamp(v(targetX + rng(-1, 1), targetY + rng(-1.5, 1.5)));
              p.act = "move";
            }
          }

          startCornerKick(st, ri, v(targetX, targetY));
          return;
        } else {
          // GOAL KICK
          st.flashTxt = "GOAL KICK"; st.flash = 1.0;
          st.paused = true; st.pauseT = P.restartPause;
          const gkX = goalSide * P.goalKickX;
          b.pos = v(gkX, 0);
          const gkIdx = findGK(st, defendingTeam);
          give(b, gkIdx, st.pl);
          b.cooldown = P.restartNoIntercept;
          return;
        }
      }
      return;
    }

    // In-bounds goal check
    if (P.outEnabled) {
      const gs = checkGoal(b.pos);
      if (gs !== 0) {
        if (gs > 0) st.sL++; else st.sR++;
        st.koSide = (gs > 0) ? 1 : -1;
        st.paused = true; st.pauseT = P.goalResetDelay;
        st.flash = 1.8; st.flashTxt = "GOAL!";
        return;
      }
    }

    if (!P.outEnabled) {
      if (Math.abs(b.pos.y) > P.pitchHalfH) {
        b.pos.y = clamp(b.pos.y, -P.pitchHalfH, P.pitchHalfH);
        b.vel.y *= -0.4;
      }
      const gs = checkGoal(b.pos);
      if (gs !== 0) {
        if (gs > 0) st.sL++; else st.sR++;
        st.koSide = (gs > 0) ? 1 : -1;
        st.paused = true; st.pauseT = P.goalResetDelay;
        st.flash = 1.8; st.flashTxt = "GOAL!";
        return;
      }
      if (Math.abs(b.pos.x) > P.pitchHalfW) {
        b.pos.x = clamp(b.pos.x, -P.pitchHalfW, P.pitchHalfW);
        b.vel.x *= -0.4;
      }
    }

    // Drag
    const spd = vlen(b.vel);
    if (spd > 0.1) {
      b.vel = vscl(vnorm(b.vel), Math.max(0, spd - P.looseBallDrag * dtSim));
    } else {
      b.vel = v(0, 0); b.shot = false;
    }
  }

  // Trail
  if (st.trail) { st.trail.t -= dtSim; if (st.trail.t <= 0) st.trail = null; }

  // Players
  for (let i = 0; i < st.pl.length; i++) {
    const p = st.pl[i];

    // Intercept with foul check
    if (b.cooldown > 0) { /* skip intercept */ }
    else if (b.owner !== i && b.free && vdist(p.pos, b.pos) < P.interceptRadius) {
      if (b.lob < 0.3) give(b, i, st.pl);
    }
    else if (b.owner !== null && b.owner !== i && !b.free && b.cooldown <= 0
      && st.pl[b.owner].team !== p.team && vdist(p.pos, b.pos) < P.interceptRadius * 0.65) {
      // Tackle attempt — may cause foul
      const foulChance = st.pl[b.owner].act === "dribble" ? P.foulChanceOnDribble : P.foulChanceOnTackle;
      if (Math.random() < foulChance) {
        // FOUL!
        triggerFoul(st, b.owner, i);
        return;
      } else {
        give(b, i, st.pl);
      }
    }

    p.dt -= dtSim;
    if (p.dt <= 0) {
      p.dt = P.decisionInterval;
      if (b.owner === i) decideHasBall(st, i);
      else decideNoBall(st, i);
    }

    if (p.act !== "idle") {
      const spd = p.act === "dribble" ? P.dribbleSpeed : P.moveSpeed;
      const d = vsub(p.tgt, p.pos);
      if (vlen(d) < 0.08) { p.act = "idle"; }
      else {
        p.face = vnorm(d);
        p.pos = pitchClamp(vmove(p.pos, p.tgt, spd * dtSim));
      }
    }

    if (p.jumpY > 0) p.jumpY = Math.max(0, p.jumpY - dtSim * 3);
  }
}

// ── Render ──────────────────────────────────────────────────
const COL = {
  bg: "#0a0a10",
  pitch: "#1a6b3a", pitchDk: "#145e30",
  line: "rgba(255,255,255,0.75)",
  tA: "#2563eb", tAL: "#60a5fa",
  tB: "#dc2626", tBL: "#f87171",
  hBg: "rgba(10,10,20,0.88)", hTxt: "#fff", hTime: "#aabbcc",
  rA: "rgba(37,99,235,0.5)", rB: "rgba(220,38,38,0.5)",
};

interface UIBounds { x: number; y: number; w: number; h: number }

function render(
  ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, st: State,
  speedBtnBounds: UIBounds,
  atkBlueBounds: { minus: UIBounds; plus: UIBounds },
  atkRedBounds: { minus: UIBounds; plus: UIBounds },
) {
  const W = c.width, H = c.height;
  const cW = P.pitchHalfW * 2 + 2.5, cH = P.pitchHalfH * 2 + 3.5;
  const sc = Math.min(W / cW, H / cH);
  const ox = W / 2, oy = H / 2 + 0.75 * sc;
  const w2s = (p: V): V => v(ox + p.x * sc, oy - p.y * sc);
  const s = (n: number) => n * sc;
  const dpr = window.devicePixelRatio || 1;

  ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, H);

  // Pitch
  const tl = w2s(v(-P.pitchHalfW, P.pitchHalfH));
  const pSz = v(s(P.pitchHalfW * 2), s(P.pitchHalfH * 2));
  const grd = ctx.createLinearGradient(tl.x, tl.y, tl.x, tl.y + pSz.y);
  grd.addColorStop(0, COL.pitch); grd.addColorStop(0.5, COL.pitchDk); grd.addColorStop(1, COL.pitch);
  ctx.fillStyle = grd; ctx.fillRect(tl.x, tl.y, pSz.x, pSz.y);

  ctx.fillStyle = "rgba(255,255,255,0.025)";
  const sw = pSz.x / 12;
  for (let i = 0; i < 12; i += 2) ctx.fillRect(tl.x + i * sw, tl.y, sw, pSz.y);

  ctx.strokeStyle = COL.line; ctx.lineWidth = Math.max(1, s(0.035));
  ctx.strokeRect(tl.x, tl.y, pSz.x, pSz.y);

  const ct = w2s(v(0, P.pitchHalfH)), cb = w2s(v(0, -P.pitchHalfH));
  ctx.beginPath(); ctx.moveTo(ct.x, ct.y); ctx.lineTo(cb.x, cb.y); ctx.stroke();

  const cc = w2s(v(0, 0));
  ctx.beginPath(); ctx.arc(cc.x, cc.y, s(P.centreCircleR), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = COL.line;
  ctx.beginPath(); ctx.arc(cc.x, cc.y, s(0.06), 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = COL.line; ctx.lineWidth = Math.max(1, s(0.035));
  const paL = w2s(v(-P.pitchHalfW, P.penAreaH));
  ctx.strokeRect(paL.x, paL.y, s(P.penAreaW), s(P.penAreaH * 2));
  const paR = w2s(v(P.pitchHalfW - P.penAreaW, P.penAreaH));
  ctx.strokeRect(paR.x, paR.y, s(P.penAreaW), s(P.penAreaH * 2));

  const gaL = w2s(v(-P.pitchHalfW, P.goalAreaH));
  ctx.strokeRect(gaL.x, gaL.y, s(P.goalAreaW), s(P.goalAreaH * 2));
  const gaR = w2s(v(P.pitchHalfW - P.goalAreaW, P.goalAreaH));
  ctx.strokeRect(gaR.x, gaR.y, s(P.goalAreaW), s(P.goalAreaH * 2));

  ctx.fillStyle = COL.line;
  const psL = w2s(v(-P.pitchHalfW + P.penSpotDist, 0));
  ctx.beginPath(); ctx.arc(psL.x, psL.y, s(0.06), 0, Math.PI * 2); ctx.fill();
  const psR = w2s(v(P.pitchHalfW - P.penSpotDist, 0));
  ctx.beginPath(); ctx.arc(psR.x, psR.y, s(0.06), 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = COL.line; ctx.lineWidth = Math.max(1, s(0.035));
  const dL = w2s(v(-P.pitchHalfW + P.penSpotDist, 0));
  ctx.beginPath(); ctx.arc(dL.x, dL.y, s(P.centreCircleR), -0.85, 0.85); ctx.stroke();
  const dR = w2s(v(P.pitchHalfW - P.penSpotDist, 0));
  ctx.beginPath(); ctx.arc(dR.x, dR.y, s(P.centreCircleR), Math.PI - 0.85, Math.PI + 0.85); ctx.stroke();

  ctx.strokeStyle = COL.line; ctx.lineWidth = Math.max(1, s(0.03));
  const corners = [
    { pos: v(-P.pitchHalfW, P.pitchHalfH), sa: -Math.PI / 2, ea: 0 },
    { pos: v(P.pitchHalfW, P.pitchHalfH), sa: Math.PI, ea: Math.PI * 1.5 },
    { pos: v(-P.pitchHalfW, -P.pitchHalfH), sa: 0, ea: Math.PI / 2 },
    { pos: v(P.pitchHalfW, -P.pitchHalfH), sa: Math.PI / 2, ea: Math.PI },
  ];
  for (const cn of corners) {
    const cp = w2s(cn.pos);
    ctx.beginPath(); ctx.arc(cp.x, cp.y, s(P.cornerArcR), cn.sa, cn.ea); ctx.stroke();
  }

  // Goals
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  const gl = w2s(v(-P.pitchHalfW - P.goalDepth, P.goalHalfH));
  ctx.fillRect(gl.x, gl.y, s(P.goalDepth), s(P.goalHalfH * 2));
  ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = Math.max(1, s(0.03));
  ctx.strokeRect(gl.x, gl.y, s(P.goalDepth), s(P.goalHalfH * 2));
  const gr = w2s(v(P.pitchHalfW, P.goalHalfH));
  ctx.fillRect(gr.x, gr.y, s(P.goalDepth), s(P.goalHalfH * 2));
  ctx.strokeRect(gr.x, gr.y, s(P.goalDepth), s(P.goalHalfH * 2));

  ctx.fillStyle = "#fff";
  for (const pp of [
    v(-P.pitchHalfW, P.goalHalfH), v(-P.pitchHalfW, -P.goalHalfH),
    v(P.pitchHalfW, P.goalHalfH), v(P.pitchHalfW, -P.goalHalfH)
  ]) {
    const ps = w2s(pp);
    ctx.beginPath(); ctx.arc(ps.x, ps.y, s(0.06), 0, Math.PI * 2); ctx.fill();
  }

  // Wall indicator (during free-kick)
  if (st.setPiece && st.setPiece.type === "free-kick" && st.setPiece.wallPlayers.length > 0) {
    for (const wi of st.setPiece.wallPlayers) {
      const wp = w2s(st.pl[wi].pos);
      const wr = s(P.playerRadius * 0.5);
      ctx.strokeStyle = "rgba(255,255,100,0.5)";
      ctx.lineWidth = Math.max(1, s(0.03));
      ctx.setLineDash([s(0.05), s(0.05)]);
      ctx.beginPath(); ctx.arc(wp.x, wp.y, s(P.playerRadius) * 1.8, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Trail
  if (st.trail) {
    const tr = st.trail, a = tr.t / P.trailDuration;
    const ts = w2s(tr.start), te = w2s(tr.end);
    if (tr.shot) {
      ctx.strokeStyle = `rgba(255,100,30,${(0.65 * a).toFixed(2)})`;
      ctx.lineWidth = Math.max(2, s(0.08));
    } else if (tr.longPass) {
      ctx.strokeStyle = `rgba(255,220,80,${(0.5 * a).toFixed(2)})`;
      ctx.lineWidth = Math.max(1.5, s(0.05));
      ctx.setLineDash([s(0.18), s(0.1)]);
    } else {
      ctx.strokeStyle = `rgba(255,255,255,${(0.45 * a).toFixed(2)})`;
      ctx.lineWidth = Math.max(1, s(0.035));
      ctx.setLineDash([s(0.12), s(0.12)]);
    }
    if (tr.longPass) {
      const mx = (ts.x + te.x) / 2;
      const my = Math.min(ts.y, te.y) - s(1.5);
      ctx.beginPath(); ctx.moveTo(ts.x, ts.y);
      ctx.quadraticCurveTo(mx, my, te.x, te.y); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(ts.x, ts.y); ctx.lineTo(te.x, te.y); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.lineWidth = 1;
  }

  // Players
  for (let i = 0; i < st.pl.length; i++) {
    const p = st.pl[i];
    const jumpOffset = p.jumpY * sc;
    const ps = w2s(p.pos);
    ps.y -= jumpOffset;
    const r = s(P.playerRadius);
    const isA = p.team < 0, col = isA ? COL.tA : COL.tB, colL = isA ? COL.tAL : COL.tBL;

    if (p.jumpY > 0.05) {
      const shadowPs = w2s(p.pos);
      ctx.fillStyle = `rgba(0,0,0,${0.2 * p.jumpY})`;
      ctx.beginPath();
      ctx.ellipse(shadowPs.x, shadowPs.y + r * 0.3, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (st.ball.owner === i) {
      ctx.strokeStyle = isA ? COL.rA : COL.rB;
      ctx.lineWidth = Math.max(2, s(0.05));
      ctx.beginPath(); ctx.arc(ps.x, ps.y, r * 1.6, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowColor = col; ctx.shadowBlur = s(0.25);
    }

    // Throw-in arm animation
    if (st.setPiece && st.setPiece.type === "throw-in" && st.setPiece.throwerIdx === i && st.setPiece.phase === "windup") {
      const progress = 1 - (st.setPiece.timer / st.setPiece.duration);
      ctx.strokeStyle = colL;
      ctx.lineWidth = Math.max(2, s(0.04));
      const armAngle = -Math.PI / 2 + Math.sin(progress * Math.PI) * 0.8;
      const armLen = r * 1.2;
      ctx.beginPath();
      ctx.moveTo(ps.x - r * 0.3, ps.y - r * 0.5);
      ctx.lineTo(ps.x - r * 0.3 + Math.cos(armAngle) * armLen, ps.y - r * 0.5 + Math.sin(armAngle) * armLen);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ps.x + r * 0.3, ps.y - r * 0.5);
      ctx.lineTo(ps.x + r * 0.3 + Math.cos(armAngle) * armLen, ps.y - r * 0.5 + Math.sin(armAngle) * armLen);
      ctx.stroke();
    }

    const pg = ctx.createRadialGradient(ps.x - r * 0.3, ps.y - r * 0.3, r * 0.1, ps.x, ps.y, r);
    pg.addColorStop(0, colL); pg.addColorStop(1, col);
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(ps.x, ps.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;

    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.max(8, r * 1.0 | 0)}px "Roboto Condensed","Arial Narrow",sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(p.num), ps.x, ps.y + 1);
  }

  // Ball
  {
    const b = st.ball;
    const lobOffset = b.lob * sc * 1.2;
    const bs = w2s(b.pos);
    bs.y -= lobOffset;
    const br = s(P.ballRadius + b.lob * 0.05);

    if (b.lob > 0.05) {
      const groundBs = w2s(b.pos);
      ctx.fillStyle = `rgba(0,0,0,${0.15 * (1 - b.lob * 0.5)})`;
      ctx.beginPath();
      ctx.ellipse(groundBs.x + s(0.02), groundBs.y + s(0.02), br * 0.7, br * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(bs.x + s(0.04), bs.y + s(0.04), br, br * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    const bg = ctx.createRadialGradient(bs.x - br * 0.3, bs.y - br * 0.3, br * 0.1, bs.x, bs.y, br);
    bg.addColorStop(0, "#fff"); bg.addColorStop(1, "#ccc");
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bs.x, bs.y, br, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = Math.max(1, s(0.015)); ctx.stroke();
  }

  // Flash
  if (st.flash > 0) {
    const a = Math.min(1, st.flash) * 0.22;
    ctx.fillStyle = `rgba(255,255,200,${a.toFixed(2)})`; ctx.fillRect(0, 0, W, H);
    if (st.flashTxt) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, st.flash).toFixed(2)})`;
      ctx.font = `bold ${s(1.1)}px "Roboto Condensed","Arial Narrow",sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = s(0.3);
      ctx.fillText(st.flashTxt, W / 2, H / 2);
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
    }
  }

  // ── HUD ──
  const hH = s(0.9), hY = s(0.25), hW = Math.min(W * 0.55, s(9)), hX = (W - hW) / 2;
  ctx.fillStyle = COL.hBg;
  const hR = s(0.12);
  ctx.beginPath();
  ctx.moveTo(hX + hR, hY); ctx.lineTo(hX + hW - hR, hY);
  ctx.quadraticCurveTo(hX + hW, hY, hX + hW, hY + hR);
  ctx.lineTo(hX + hW, hY + hH - hR);
  ctx.quadraticCurveTo(hX + hW, hY + hH, hX + hW - hR, hY + hH);
  ctx.lineTo(hX + hR, hY + hH);
  ctx.quadraticCurveTo(hX, hY + hH, hX, hY + hH - hR);
  ctx.lineTo(hX, hY + hR);
  ctx.quadraticCurveTo(hX, hY, hX + hR, hY);
  ctx.closePath(); ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(hX, hY + hH); ctx.lineTo(hX + hW, hY + hH); ctx.stroke();

  const hCY = hY + hH / 2;
  ctx.fillStyle = COL.tA; ctx.fillRect(hX, hY, s(0.12), hH);
  ctx.fillStyle = COL.tB; ctx.fillRect(hX + hW - s(0.12), hY, s(0.12), hH);

  ctx.fillStyle = COL.tAL;
  ctx.font = `bold ${Math.max(10, s(0.28))}px "Roboto Condensed","Arial Narrow",sans-serif`;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText("BLUE", hX + s(0.35), hCY);

  ctx.fillStyle = COL.tBL; ctx.textAlign = "right";
  ctx.fillText("RED", hX + hW - s(0.35), hCY);

  ctx.fillStyle = COL.hTxt;
  ctx.font = `bold ${Math.max(13, s(0.4))}px "Roboto Condensed","Arial Narrow",sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(`${st.sL}  -  ${st.sR}`, W / 2, hCY);

  const rem = Math.max(0, P.matchDuration - st.time);
  const mn = Math.floor(rem / 60), sc2 = Math.floor(rem % 60);
  const ts = `${String(mn).padStart(2, "0")}:${String(sc2).padStart(2, "0")}`;
  const tbH = s(0.38), tbW = s(1.4), tbX = (W - tbW) / 2, tbY = hY + hH;
  ctx.fillStyle = "rgba(10,10,20,0.72)";
  ctx.beginPath();
  ctx.moveTo(tbX, tbY); ctx.lineTo(tbX + tbW, tbY);
  ctx.lineTo(tbX + tbW - s(0.08), tbY + tbH); ctx.lineTo(tbX + s(0.08), tbY + tbH);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = COL.hTime;
  ctx.font = `bold ${Math.max(9, s(0.24))}px "Roboto Mono","Courier New",monospace`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(ts, W / 2, tbY + tbH / 2);

  // ── Speed toggle (top-right) ──
  const speedLabel = `SPEED: ${st.speed}`;
  const spFontSize = Math.max(9, s(0.22));
  ctx.font = `bold ${spFontSize}px "Roboto Condensed","Arial Narrow",sans-serif`;
  const spMetrics = ctx.measureText(speedLabel);
  const spPadX = s(0.2), spPadY = s(0.1);
  const spW = spMetrics.width + spPadX * 2;
  const spH = spFontSize + spPadY * 2;
  const spX = W - spW - s(0.3);
  const spY = s(0.3);

  speedBtnBounds.x = spX / dpr;
  speedBtnBounds.y = spY / dpr;
  speedBtnBounds.w = spW / dpr;
  speedBtnBounds.h = spH / dpr;

  ctx.fillStyle = "rgba(10,10,20,0.75)";
  const spR = s(0.08);
  ctx.beginPath();
  ctx.moveTo(spX + spR, spY); ctx.lineTo(spX + spW - spR, spY);
  ctx.quadraticCurveTo(spX + spW, spY, spX + spW, spY + spR);
  ctx.lineTo(spX + spW, spY + spH - spR);
  ctx.quadraticCurveTo(spX + spW, spY + spH, spX + spW - spR, spY + spH);
  ctx.lineTo(spX + spR, spY + spH);
  ctx.quadraticCurveTo(spX, spY + spH, spX, spY + spH - spR);
  ctx.lineTo(spX, spY + spR);
  ctx.quadraticCurveTo(spX, spY, spX + spR, spY);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 1; ctx.stroke();

  const speedColors: Record<string, string> = { LOW: "#60a5fa", MID: "#fbbf24", FAST: "#f87171" };
  ctx.fillStyle = speedColors[st.speed] || "#fff";
  ctx.font = `bold ${spFontSize}px "Roboto Condensed","Arial Narrow",sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(speedLabel, spX + spW / 2, spY + spH / 2);

  // ── Attack Level Controls (bottom-left and bottom-right) ──
  const drawAtkControl = (
    team: "BLUE" | "RED",
    level: number,
    baseX: number,
    baseY: number,
    bounds: { minus: UIBounds; plus: UIBounds }
  ) => {
    const panelW = s(3.8);
    const panelH = s(1.1);
    const bR = s(0.08);

    // Panel background
    ctx.fillStyle = "rgba(10,10,20,0.80)";
    ctx.beginPath();
    ctx.moveTo(baseX + bR, baseY); ctx.lineTo(baseX + panelW - bR, baseY);
    ctx.quadraticCurveTo(baseX + panelW, baseY, baseX + panelW, baseY + bR);
    ctx.lineTo(baseX + panelW, baseY + panelH - bR);
    ctx.quadraticCurveTo(baseX + panelW, baseY + panelH, baseX + panelW - bR, baseY + panelH);
    ctx.lineTo(baseX + bR, baseY + panelH);
    ctx.quadraticCurveTo(baseX, baseY + panelH, baseX, baseY + panelH - bR);
    ctx.lineTo(baseX, baseY + bR);
    ctx.quadraticCurveTo(baseX, baseY, baseX + bR, baseY);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 1; ctx.stroke();

    // Team color accent
    const accentCol = team === "BLUE" ? COL.tA : COL.tB;
    ctx.fillStyle = accentCol;
    ctx.fillRect(baseX, baseY, s(0.08), panelH);

    // Label
    const labelFont = Math.max(8, s(0.18));
    ctx.fillStyle = team === "BLUE" ? COL.tAL : COL.tBL;
    ctx.font = `bold ${labelFont}px "Roboto Condensed","Arial Narrow",sans-serif`;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(`${team} ATK`, baseX + s(0.2), baseY + panelH * 0.3);

    // Level bar
    const barX = baseX + s(0.2);
    const barY = baseY + panelH * 0.55;
    const barW = panelW - s(0.4);
    const barH = s(0.22);

    // Minus button
    const btnSize = s(0.35);
    const minusX = barX;
    const minusY = barY;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(minusX, minusY, btnSize, barH);
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.max(10, s(0.2))}px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("−", minusX + btnSize / 2, minusY + barH / 2);
    bounds.minus = { x: minusX / dpr, y: minusY / dpr, w: btnSize / dpr, h: barH / dpr };

    // Plus button
    const plusX = barX + barW - btnSize;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(plusX, minusY, btnSize, barH);
    ctx.fillStyle = "#fff";
    ctx.fillText("+", plusX + btnSize / 2, minusY + barH / 2);
    bounds.plus = { x: plusX / dpr, y: minusY / dpr, w: btnSize / dpr, h: barH / dpr };

    // Level segments
    const segStart = minusX + btnSize + s(0.08);
    const segEnd = plusX - s(0.08);
    const segW = (segEnd - segStart) / 10;
    for (let lv = 1; lv <= 10; lv++) {
      const sx = segStart + (lv - 1) * segW;
      if (lv <= level) {
        // Filled: gradient from green (1) to red (10)
        const t = (lv - 1) / 9;
        const r = Math.round(40 + t * 200);
        const g = Math.round(180 - t * 140);
        const bl = Math.round(80 - t * 50);
        ctx.fillStyle = `rgb(${r},${g},${bl})`;
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.08)";
      }
      ctx.fillRect(sx + 1, minusY + 1, segW - 2, barH - 2);
    }

    // Level number
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.max(9, s(0.18))}px "Roboto Mono",monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(level), barX + barW / 2, barY + barH / 2);
  };

  // Position: bottom-left for BLUE, bottom-right for RED
  const atkPanelW = s(3.8);
  const atkPanelH = s(1.1);
  const atkMargin = s(0.3);
  const atkY = H - atkPanelH - atkMargin;

  drawAtkControl("BLUE", st.atkLevelBlue, atkMargin, atkY, atkBlueBounds);
  drawAtkControl("RED", st.atkLevelRed, W - atkPanelW - atkMargin, atkY, atkRedBounds);
}

// ── Component ───────────────────────────────────────────────
export default function Home() {
  const ref = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<State>(mkState());
  const ltRef = useRef(0);
  const speedBtnRef = useRef<UIBounds>({ x: 0, y: 0, w: 0, h: 0 });
  const atkBlueRef = useRef<{ minus: UIBounds; plus: UIBounds }>({
    minus: { x: 0, y: 0, w: 0, h: 0 },
    plus: { x: 0, y: 0, w: 0, h: 0 },
  });
  const atkRedRef = useRef<{ minus: UIBounds; plus: UIBounds }>({
    minus: { x: 0, y: 0, w: 0, h: 0 },
    plus: { x: 0, y: 0, w: 0, h: 0 },
  });

  const handleClick = useCallback((e: MouseEvent | TouchEvent) => {
    let cx: number, cy: number;
    if ("touches" in e) {
      cx = e.touches[0]?.clientX ?? (e as TouchEvent).changedTouches[0]?.clientX ?? 0;
      cy = e.touches[0]?.clientY ?? (e as TouchEvent).changedTouches[0]?.clientY ?? 0;
    } else {
      cx = e.clientX; cy = e.clientY;
    }

    const hitTest = (b: UIBounds) => cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
    const st = stRef.current;

    // Speed toggle
    if (hitTest(speedBtnRef.current)) {
      const cycle: SpeedMode[] = ["LOW", "MID", "FAST"];
      const idx = cycle.indexOf(st.speed);
      st.speed = cycle[(idx + 1) % 3];
      e.preventDefault(); return;
    }

    // BLUE attack level
    if (hitTest(atkBlueRef.current.minus)) {
      st.atkLevelBlue = Math.max(1, st.atkLevelBlue - 1);
      e.preventDefault(); return;
    }
    if (hitTest(atkBlueRef.current.plus)) {
      st.atkLevelBlue = Math.min(10, st.atkLevelBlue + 1);
      e.preventDefault(); return;
    }

    // RED attack level
    if (hitTest(atkRedRef.current.minus)) {
      st.atkLevelRed = Math.max(1, st.atkLevelRed - 1);
      e.preventDefault(); return;
    }
    if (hitTest(atkRedRef.current.plus)) {
      st.atkLevelRed = Math.min(10, st.atkLevelRed + 1);
      e.preventDefault(); return;
    }
  }, []);

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;

    doKickOff(stRef.current);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      cv.width = window.innerWidth * dpr;
      cv.height = window.innerHeight * dpr;
      cv.style.width = window.innerWidth + "px";
      cv.style.height = window.innerHeight + "px";
    };
    resize();
    window.addEventListener("resize", resize);
    cv.addEventListener("click", handleClick);
    cv.addEventListener("touchstart", handleClick, { passive: false });

    let id: number;
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - ltRef.current) / 1000);
      ltRef.current = t;
      if (dt > 0.001 && dt < 0.1) update(stRef.current, dt);
      render(ctx, cv, stRef.current, speedBtnRef.current, atkBlueRef.current, atkRedRef.current);
      id = requestAnimationFrame(loop);
    };
    ltRef.current = performance.now();
    id = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", resize);
      cv.removeEventListener("click", handleClick);
      cv.removeEventListener("touchstart", handleClick);
    };
  }, [handleClick]);

  return (
    <canvas ref={ref} style={{ display: "block", width: "100vw", height: "100vh", background: "#0a0a10", touchAction: "none" }} />
  );
}

```

---

> 本文書は自動生成されたものであり、ソースコードの変更に伴い更新が必要な場合がある。
