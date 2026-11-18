# 取り違えスキャンの疑いの確認（確認担当への指示・2026-11-18）
作業ディレクトリ: /Users/moririn/MORI-LAB/projects/dokoiko-site。確認日 2026-11-18。報告は途中で出さず、最後に5行以内で1回だけ。トークンの節約のため、1ページあたりの検索は多くても4回、取得は多くても2回にとどめる。
## 守ること
- サイトのファイルは変更しない。書いてよいのは logs/identity_20261118/scan_results/ だけ。~/.private は見ない。プロセスは kill しない。
- 根拠は公式のみ（施設・自治体・観光協会・公的データベース）。個人ブログ・まとめ記事・予約サイト・Wikipedia・SNS・ニュースは根拠にしない。
- 検索は mcp__claude_ai_Parallel_Search__web_search / web_fetch（スキーマ未読込なら ToolSearch で select:mcp__claude_ai_Parallel_Search__web_search,mcp__claude_ai_Parallel_Search__web_fetch）か WebSearch/WebFetch。失敗したら別の経路を試す。
## 手順
- logs/identity_20261118/scan_inputs/batch_<番号>.json の ids が担当のページ。各ページの logs/identity_20261118/scan_inputs/<id>.json に、機械的な突き合わせで出た「疑い」（地名・出てくる欄・前後の文脈・種類）がある。必要なら src/data/destinations.json の該当項目と src/data/articles/<id>.json を読む。
- 疑いの地名が、そのページの場所に関係する正しい記述か、別の場所の混入か、を公式で確認する。例: 「同名の別の場所」（同じ名前だが別の県・別の市の場所）、「別の場所の混入」（そのページの場所と関係ない場所の記述）、「施設の混同」（別の施設の情報）、「所在地の誤り」（県・市区町村の誤り）、「問題なし」（そのページの場所に実際に関係する）。
- 結果を logs/identity_20261118/scan_results/<id>.json に書く: {"id":"<id>","判定":"実際の取り違え|問題なし|確認できず","種類":"所在地の誤り|別の場所の混入|施設の混同|同名の別の場所|なし","根拠":"公式で確認した事実（1〜2文）","出典URL":["…"],"取り違えの箇所":"欄と記述の一部（実際の取り違えのとき）","検索回数":<回>}
- 迷ったら「確認できず」。推測で「実際の取り違え」にしない。
- 返答は5行以内（担当ページ数・実際の取り違え・問題なし・確認できずの数）。
