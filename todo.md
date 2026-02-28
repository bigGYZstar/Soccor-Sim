# v10.2.0 改善TODO

## 1. 選手能力値のエンジン深反映
- [ ] speed → moveSpeed, dribbleSpeed に反映
- [ ] shoot → shotAccuracy, shotSpeed に反映
- [ ] pass → passAccuracy, passSpeed に反映
- [ ] dribble → dribbleControl に反映
- [ ] defense → interceptRadius, tackleSuccess に反映
- [ ] physical → staminaShort回復, burstCD に反映

## 2. 試合ログに選手名表示
- [ ] actionLog生成時にcardNameがあれば選手名を使用
- [ ] ゴール/パス/シュート/タックル等のログに名前表示

## 3. 試合結果画面強化
- [ ] 試合終了後にスタッツ詳細画面を表示
- [ ] ポゼッション率、シュート数、パス成功率等
- [ ] MVP選手の選出ロジック・表示UI

## 4. コイン/ポイント経済システム
- [ ] LocalStorageでコイン残高管理
- [ ] 試合勝利/引分/敗北でコイン獲得
- [ ] ガチャパック購入にコイン消費
- [ ] コイン残高表示UI

## 5. iPhone縦長レスポンシブ修正
- [ ] ガチャ画面のスクロール問題修正
- [ ] 編成画面のスクロール問題修正
- [ ] 見切れ防止
