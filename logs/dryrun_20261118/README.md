# 機械的な削除のドライラン（2026-11-18・サイトのファイルは変えていない）

- 実行: `node scripts/dryRunDelete20261118.mjs`（出力: edits.json・metrics.json・before_after_30.md）→ `node scripts/checkDeletionEdits20261118.mjs`（機械検査・check_result.json）→ `node scripts/evalClassifier20261118.mjs`（classifier.json）→ `node scripts/testCheckDeletionEdits20261118.mjs`（検査の試験）。
- 規則: R1（優先ページ129以外の、料金・休館日・営業時間の文を削除。確認済みのリスト verified_keep.json の文は残す。体験談・行程案は対象外）／R2（モデルコースの行程の先頭の時刻だけを外す）。標高・距離は触らない。年号は今回は対象外。
- edits.json は mergeConflictFixes と同じ形式（fixes[].edits[] = {file, group?, field または spot, old, new}。rule・reason・page・種類・削除した文 を足した）。`node scripts/applyMergeConflictFixes20261118.mjs logs/dryrun_20261118/edits.json --dry` で、7,171件すべてが「old が1回だけ当たる」ことを確かめた（group の無い記事にも使えるよう、適用スクリプトを広げた）。
- 数字は metrics.json・classifier.json・check_result.json。変更前後の無作為30件は before_after_30.md。案（出典つきの枠・共通の注意書き）は proposals.md。
