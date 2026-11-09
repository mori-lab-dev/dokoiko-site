# dokoiko 週1の自動点検

毎週火曜 21:00（日本時間）に、読み取りだけの点検を回す。**ビルドもデプロイもしない。サイトのコード・データは変えない。**
（中で呼ぶ既存の監査は、従来どおり自分の `logs/*.json` を書き直す。）

## 中身
`scripts/weeklyCheck.mjs` が次を順に流す（途中で失敗しても残りは流す）。

1. `npm run audit:all`
2. `node scripts/auditOuenWari.mjs`（応援割の確認日が14日を超えていないか）
3. `npm run baseline`（速い検査。`baseline:full` は楽天・じゃらんに約3千件のリクエストを送るので入れない。**月1回は手動**）
4. `npm run gsc`（URL検査 → 検索パフォーマンス → 集計。差分は `logs/gsc/inspect_summary_<日付>.md`）

ログ: `logs/weekly/<日付>.log`（launchd 自身の出力は `launchd.out.log` / `launchd.err.log`）。

## macOS の通知が出るとき（それ以外は出さない）
- audit:all が失敗した
- 応援割の確認日が14日を超えた
- npm run gsc がエラー（403 など）で止まった
- gsc の登録済み（URL検査 verdict=PASS）の件数が前回より減った

## GSC のキー
plist の環境変数 `GSC_KEY_FILE` に**パスだけ**を書く（`~/.config/morilab/gsc-key.json`）。キーの中身・client_email はログにも出さない。

## 動作の確認
```sh
launchctl print gui/$(id -u)/com.morilab.dokoiko-weekly     # 登録の状態（state・曜日・時刻・環境変数のパス）
launchctl kickstart gui/$(id -u)/com.morilab.dokoiko-weekly # 今すぐ1回流す（約10〜15分）
tail -n 40 logs/weekly/$(date +%F).log                      # 結果
node scripts/weeklyCheck.mjs --notify-test                  # 通知が出ることだけ確かめる
```
実行中は `logs/weekly/.lock` に PID が入る（終わると消える。二重起動は自分で止まる）。

## 止め方
```sh
launchctl bootout gui/$(id -u)/com.morilab.dokoiko-weekly   # 止める（plist は残る）
rm ~/Library/LaunchAgents/com.morilab.dokoiko-weekly.plist  # 完全に外す
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.morilab.dokoiko-weekly.plist   # また動かす
```
実行中のものだけを止めるときは、`.lock` の PID に `kill <PID>`（名前指定の kill は使わない）。

## Mac がスリープ中だったとき
launchd の `StartCalendarInterval` は、時刻にスリープしていると**起きた直後に1回**実行する（複数回分は1回にまとめる）。電源が切れていた場合は、その回は飛ぶ。
この Mac は AC 接続中に `disablesleep=1`（power_guard）で、毎朝 6:55 に wake の予定もあるため、通常は 21:00 に起きている。
