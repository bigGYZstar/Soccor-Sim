# フットサルシミュレーション デザインブレインストーム

このプロジェクトはフルスクリーンのHTML5 Canvas上でフットサルの試合を自動再生するものです。UIはほぼなく、コートとプレイヤーとボールの描画が中心です。

---

<response>
<text>
## Idea 1: Retro Arcade / Pixel Sport

**Design Movement**: 80年代アーケードゲーム風のレトロスポーツ
**Core Principles**: CRTスキャンライン風の雰囲気、ネオンカラーのアクセント、ドット絵的なシンプルさ
**Color Philosophy**: 深い黒背景にネオングリーンのコート、シアンとマゼンタのチームカラー。スコアボードはアンバーLED風
**Layout Paradigm**: フルスクリーンCanvas、上部にレトロフォントのスコアバー
**Signature Elements**: CRTビネット効果、ゴール時のピクセル爆発エフェクト
**Interaction Philosophy**: 完全非インタラクティブ、観戦モード
**Animation**: ボールの軌跡にグロー効果、ゴール時のフラッシュ
**Typography System**: Press Start 2P (Google Fonts) でスコアと時間表示
</text>
<probability>0.05</probability>
</response>

<response>
<text>
## Idea 2: Clean Broadcast / Sports TV

**Design Movement**: 現代のスポーツ中継風、ESPN/DAZN的なクリーンデザイン
**Core Principles**: 視認性最優先、コントラストの高いチームカラー、プロフェッショナルな情報表示
**Color Philosophy**: 深緑のリアルなコート、白いライン。チームAはロイヤルブルー、チームBはクリムゾンレッド。HUDは半透明ダークバー
**Layout Paradigm**: フルスクリーンCanvas、下部にブロードキャスト風スコアバー（チーム名・スコア・時間）
**Signature Elements**: パスの点線トレイル、シュートの太線トレイル、ボール保持者のリング、ゴール時の画面フラッシュとテキスト表示
**Interaction Philosophy**: 完全自動再生、TV中継を見ているような体験
**Animation**: スムーズな60fps、パス/シュートの軌跡が0.3秒フェード、ゴール時のスローモーション風演出
**Typography System**: Roboto Condensed (スコアバー) + Roboto Mono (時間表示) でスポーツ中継感
</text>
<probability>0.08</probability>
</response>

<response>
<text>
## Idea 3: Tactical Board / Chalkboard

**Design Movement**: 戦術ボード・黒板風のミニマルデザイン
**Core Principles**: チョーク風の手書き感、教育的・分析的な雰囲気、シンプルで洗練された表現
**Color Philosophy**: ダークグリーンの黒板背景、チョーク白のライン、チームは黄色と水色の丸
**Layout Paradigm**: フルスクリーンCanvas、コーナーにさりげないスコア表示
**Signature Elements**: チョーク風のテクスチャ、パスラインが手書き風の点線
**Interaction Philosophy**: コーチが戦術ボードを見ているような静かな観察体験
**Animation**: 控えめだが滑らかな動き、軌跡は粉っぽいフェード
**Typography System**: Caveat (手書き風) でスコア、Special Elite でタイマー
</text>
<probability>0.04</probability>
</response>

---

## 選択: Idea 2 — Clean Broadcast / Sports TV

理由: フットサルシミュレーションとして最も自然で視認性が高く、ユーザーが直感的に試合の流れを理解できるデザイン。スポーツ中継風のHUDはプロフェッショナルな印象を与え、パス・シュート・ドリブルの視覚的区別も明確にできる。
