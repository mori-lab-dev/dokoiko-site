# 旅先ページの「取り違え」の確認（確認担当への指示・2026-11-18）
作業ディレクトリ: /Users/moririn/MORI-LAB/projects/dokoiko-site。確認日 2026-11-18。報告は途中で出さず、最後に5行以内で1回だけ。トークンの節約のため、検索は多くても15回、取得は多くても5回にとどめる。
## 守ること
- サイトのファイルは変更しない。書いてよいのは logs/identity_20261118/results/ と logs/identity_20261118/snapshots/ だけ。~/.private は見ない。プロセスは kill しない。
- 根拠は公式のみ: 施設・運営者の公式／自治体（*.lg.jp・city.*・pref.*）／観光協会・観光連盟の公式／公的データベース（国土地理院・文化庁など）。個人ブログ・まとめ記事・予約サイト・Wikipedia・SNS・口コミ・ニュースは根拠にしない。
- 検索は mcp__claude_ai_Parallel_Search__web_search / web_fetch（スキーマ未読込なら ToolSearch で select:mcp__claude_ai_Parallel_Search__web_search,mcp__claude_ai_Parallel_Search__web_fetch）か WebSearch/WebFetch。ツールが上限で失敗したら別の経路を試す。
## 手順
1. 担当ページの旅先データ（src/data/destinations.json の該当 id の項目: name・prefecture・lat・lng・hub・tags・spots・image 関連・featured_stay などの宿）と、記事（src/data/articles/<id>.json: lead・節の title/body/info・tips・modelCourse・bestSeason）を読む。
2. ページが言っている「場所・施設」（名前・所在地（県・市町村・島・半島）・施設名・入場料の対象など）を洗い出し、公式で、その場所・施設の正体（所在地・正式名称・料金の対象）を確認する。座標（lat/lng）が、その場所の公式の所在地と合うかも確認する（地図の座標は国土地理院の地名・自治体の所在地で大まかに照合してよい）。
3. 次の欄ごとに、取り違え（別の場所・別の施設の内容・県や市町村の誤り・同名の別の場所）がないかを調べる: タイトル（name）・県・座標・hub・lead・節の本文と info・見どころ（spots）の説明・tips・モデルコース・宿のカード・タグ・画像の説明（alt）とクレジット。
4. 公式の該当部分（原文のまま・3,000字まで・要約しない）を logs/identity_20261118/snapshots/<id>__<番号>.txt に書く（1行目 `URL: …`、2行目 `確認日: 2026-11-18`、3行目以降は原文）。修正の値は、必ずこの写しの中に原文のまま入れる。
5. 結果を logs/identity_20261118/results/<id>.json に書く:
```
{"id":"<id>","総合":"ページ全体が別の場所|一部の混入・誤り|問題なし|確認できず",
 "調べた欄":["name","県","座標","hub","lead","節1〜N","見どころ","tips","モデルコース","宿のカード","タグ","画像"],
 "所見":[{"欄":"lead|sections.0.body|sections.0.info|tips|modelCourse.daytrip|description|spot:<名前>|name|prefecture|lat/lng|hub|stay|tags|image","現在の記述":"（原文の一部）","判定":"誤り|問題なし|確認できず","理由":"…","公式の事実":"…","出典URL":["…"],"snapshot":"logs/identity_20261118/snapshots/<id>__<番号>.txt",
   "修正案": 誤りのとき。 {"種類":"置換","old":"記述の中の、直す部分（その欄に1回だけ含まれる文字列）","new":"公式の値だけ（元に無かった説明を足さない）","値":["写しに原文のまま在る語・値"]} か {"種類":"削除","old":"削除する句・文（その欄に1回だけ含まれる。削除しても文が途中で切れない）"} か {"種類":"案のみ","内容":"座標・県・hub・画像・宿など、データの欄の直し方の案（今回は適用しない）"} }],
 "備考":"…","検索回数":<回>,"取得回数":<回>}
```
- 迷ったら「確認できず」。推測で「誤り」にしない。ページ全体が別の場所の内容（座標・県・画像・宿まで別の場所）なら、総合を「ページ全体が別の場所」にして、修正案は「案のみ」にする。
- 返答は5行以内（担当ページ・総合・誤りの件数）。
