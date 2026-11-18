# メタ（description）の数字の公式確認（確認担当への指示・2026-11-18）
作業ディレクトリ: /Users/moririn/MORI-LAB/projects/dokoiko-site。確認日 2026-11-18。報告は途中で出さず、最後に5行以内で1回だけ。
## 守ること
- サイトのファイルは変更しない。書いてよいのは logs/priority_meta_20261118/sample_results/ と logs/priority_meta_20261118/sample_snapshots/ だけ。~/.private は見ない。プロセスは kill しない。
- 根拠は公式のみ: 施設・運営者の公式／自治体（*.lg.jp・city.*・pref.*）／観光協会・観光連盟の公式／公的データベース。個人ブログ・まとめ記事・予約サイト（じゃらん・楽天等）・Wikipedia・SNS・口コミ・地図アプリ・ニュースは根拠にしない。
- 検索は mcp__claude_ai_Parallel_Search__web_search / web_fetch（スキーマ未読込なら ToolSearch で select:mcp__claude_ai_Parallel_Search__web_search,mcp__claude_ai_Parallel_Search__web_fetch）か WebSearch/WebFetch。ツールが上限で失敗したら別の経路を試す。それでも不可なら判定の理由を「検索失敗」にする。
## 手順
1. logs/priority_meta_20261118/sample20.json の、担当の番号の項目を調べる。各項目は「旅先ページ・県・種類・確認する文・メタ全文」。確認する文の数字（料金・休館日）が、その施設・場所の公式の記載と合うかを調べる。施設が文から特定できないときは「確認できず（対象を特定できない）」。
2. 公式の該当部分の原文（3,000字まで・要約しない）を logs/priority_meta_20261118/sample_snapshots/<番号>.txt に書く（1行目 `URL: …`、2行目 `確認日: 2026-11-18`、3行目以降は原文）。
3. 結果を logs/priority_meta_20261118/sample_results/<番号>.json に書く: {"番号":…,"判定":"一致|食い違い|確認できず","理由":"確認できずのとき: 記載なし|対象を特定できない|検索失敗","公式の値":"（食い違いのとき・一致のとき: 公式の値）","出典URL":["…"],"snapshot":"sample_snapshots/<番号>.txt"}
- 迷ったら確認できずにする。推測で一致・食い違いにしない。1文に複数の数字があるときは、全部が合うときだけ一致。
- 返答は5行以内（担当の番号・一致/食い違い/確認できずの数）。
