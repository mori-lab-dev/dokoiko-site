# PR #2（feat/affiliate-pr-notice）公開手順と GA4 の確認（2026-11-06）

マージも公開も本人の OK のあと。公開は平日のみ（土日はしない）。

## 1. この PR の中身
- PR 表記（通常サイズ・通常の文字色）をページ冒頭と各アフィリエイトのブロックの直前に置く
- 宿カードの rel を `sponsored noopener` に
- sponsored リンクのクリックを GA4 の `affiliate_click` で計測（partner / page_type / destination_id / link_kind）
- 楽天トラベルのカードの文言を中立に（「ポイントが貯まる・使える」→「楽天トラベルの検索結果を開く」。旅先5・ハブ1の6か所）
- 宿カードの下に価格の注記1文（「宿泊料金は時期やプランによって変わります。料金は予約サイトの画面で確認してください。」）
- 応援割・クーポン関連（アフィリエイトなし）には PR 表記を足さない

## 2. 公開前の検査（2026-11-06・main の 14 コミットを取り込んだ状態）
- `npm run build`: 1383 ページ
- `npm run audit:affiliate`: アフィリエイトありの 1358 ページすべてで PR 表記あり・sponsored 欠け 0
- `npm run audit:all`: 全項目合格

## 3. 公開手順（DEPLOY.md の経路）
1. きれいな worktree でビルドする（この PR のブランチを worktree に出し、`npm run build`）
2. 差分を見る（書き込まない）:
   `rsync -rnci --delete --exclude=CNAME --exclude=scripts --exclude=.git --exclude=.DS_Store <worktree>/dist/ <dokoiko リポ>/`
   - 内容が変わる見込み: 旅先ページ約 1,310・ハブ 49・応援割系の各ページ・トップ/404/list/about/contact/privacy/terms、`_astro` の CSS 2 つ差し替え
   - images は時刻の違いだけ（`-c` なら内容は同じ。`-t` を付けずに反映する）
   - 消える見込み: 古い `_astro` の CSS（ハッシュ違い）
3. `rsync -rc --delete --exclude=CNAME --exclude=scripts --exclude=.git --exclude=.DS_Store <worktree>/dist/ <dokoiko リポ>/`
4. dokoiko リポで、変わったファイルだけをパス指定で add → commit → push（`git add -A` は使わない）
5. `node scripts/verifyDeploy.mjs` で反映を確認

## 4. 公開後の確認
1. 本番の旅先ページ（例 /destinations/agematsu/）を 390px 幅で開き、PR 表記・カードの文言・価格の注記を目で見る
2. GA4 のリアルタイム → イベント: 宿カードをタップして `affiliate_click` が出ること。パラメータに
   partner・page_type・destination_id・link_kind があること（DebugView なら拡張機能の GA debug を使う）
3. `?utm_source=x&utm_medium=social&utm_campaign=test_xxx` 付きで開いてタップし、
   リアルタイムの流入元が `x / social` になること（テストは test_ を付けて本番の集計と分ける）
4. 手元でのブラウザ試験（2026-11-06・Playwright・GA の送信を遮って内容を見た）では、
   - `page_view` と `affiliate_click` が `/g/collect` に送られた
   - 送信先のページ URL（dl）に utm が含まれていた
   - `affiliate_click` のパラメータは partner=rakuten・page_type=destination・destination_id=agematsu・link_kind=hotel・transport_type=beacon
   - 各イベントが2回ずつ観測されたが、試験で通信を中断したため GA が再送した可能性が高い。本番の
     リアルタイムで二重計上されていないか 4-2 で確認する

## 5. 公開後に GA4 のカスタム定義へ登録する項目（本人・画面操作）
管理 → データの表示 → カスタム定義 → カスタム ディメンションを作成。範囲は「イベント」。反映まで約 24 時間。
| ディメンション名 | イベント パラメータ |
|---|---|
| partner | partner |
| page_type | page_type |
| destination_id | destination_id |
| link_kind | link_kind |
（`transport_type` は集計に使わないので登録しない）
- 画面名は見込み。違っていたら近い名前を探す
- 登録前のデータは遡って埋まらない。公開と同じ日に登録する

## 6. 戻し方
dokoiko リポの該当コミットを `git revert`（履歴を書き換えない）して push。
