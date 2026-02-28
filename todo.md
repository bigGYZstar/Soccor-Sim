# ガチャ→試合連携 TODO

## Phase 1: コレクション永続化
- [ ] LocalStorageベースのコレクション管理フック(useCollection)を作成
- [ ] GachaPageでuseCollectionフックを使用するように変更
- [ ] コレクションデータの保存・読み込み・クリア機能

## Phase 2: チーム編成画面
- [ ] TeamBuilderPage.tsx を作成（/team-builder ルート）
- [ ] フォーメーション選択 + 各ポジションへの選手配置UI
- [ ] 選手カードをポジションにタップ選択でポジションに配置
- [ ] ポジション適性の表示（FW/MF/DF/GK）
- [ ] 2チーム分の編成（Blue/Red）
- [ ] 編成完了→試合開始ボタン

## Phase 3: エンジン連携
- [ ] mkPlayersを拡張してPlayerCardの能力値を反映
- [ ] PlayerCardのstats → エンジンパラメータへのマッピング
- [ ] 選手名・背番号の表示をカードデータから取得

## Phase 4: ナビゲーション更新
- [ ] TopPageに「チーム編成」ボタン追加
- [ ] 試合開始フローの変更: TopPage → チーム編成 → 試合
- [ ] 従来の「クイックマッチ」も残す（ランダム選手）
