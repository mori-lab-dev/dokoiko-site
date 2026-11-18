# 優先ページの修正の未適用・旧値の食い違い（2026-11-18）

## a) 判定の区分が対象なのに残っていた文（修正前）
判定の区分（食い違い・確認できず＝記載なし／特定不可）が対象の文 758 件のうち、残っていたのは 19 件（14 ページ）。

残った理由:
- 削除すると欄が空になる: 9
- 判定の理由の文言が、削除の条件と一致しない: 7
- 置換できなかった: 1
- 行の中の文が、行ぜんたいと一致しないため: 2

種類別: {"標高・距離":5,"年号":1,"その他の数値":4,"料金":6,"時刻":2,"営業時間":1}

| ページ | # | 判定 | 種類 | 文 | 残った理由 |
|---|---|---|---|---|---|
| gen_栃木_川俣温泉 | 20 | 確認できず（記載なし） | 標高・距離 | 露出した岩盤を水が複雑に流れ落ち、冬は周囲に薄氷が張る凍結の過程も見られる。 | 削除すると欄が空になる |
| gen_茨城_水戸八幡宮 | 15 | 食い違い | 年号 | 石造の趣ある建築が現存し、講堂や学舎の配置から往時の規模を実感できる。 | 削除すると欄が空になる |
| ibukijima | 10 | 確認できず（記載なし） | その他の数値 | 島の中心部に位置する神社で、苔むした50段ほどの石段を上った先に鳥居と社殿が立つ | 削除すると欄が空になる |
| isawa-onsen | 1 | 確認できず（公式に記載なし） | 料金 | 無料で入れて、時間制限もない。 | 判定の理由の文言が、削除の条件と一致しない |
| isawa-onsen | 3 | 確認できず（公式に記載なし） | その他の数値 | 湯温はだいたい42度くらい。 | 判定の理由の文言が、削除の条件と一致しない |
| isawa-onsen | 12 | 確認できず（公式に記載なし） | 料金 | 冬は宿の料金が比較的安く、1泊2食付きで15000円台から見つかる。 | 判定の理由の文言が、削除の条件と一致しない |
| kashiwajima | 32 | 確認できず（記載なし） | 標高・距離 | 透明度30メートル超の青の世界で、熱帯魚の群れが舞う海に潜れる。 | 削除すると欄が空になる |
| makurazaki | 17 | 確認できず（記載なし） | 時刻 | 朝5時から水揚げされたカツオのセリが行われる漁港で、声が飛び交う朝の活気を間近に | 削除すると欄が空になる |
| mihara | 17 | 確認できず（記載なし） | 時刻 | 市内から車で約45分、標高900メートルの山上にある湖で、早朝は霧が立ちこめ、8 | 削除すると欄が空になる |
| muroto-cape | 3 | 食い違い | 料金 | 入場料200円。 | 置換できなかった（oldが欄に複数・検査で落ちて削除に回したが削除もできない、な |
| ojika-island | 13 | 食い違い | 料金 | 定期船のない無人島・大島へ、チャーター船（1回3,000円前後）で渡って参拝する | 削除すると欄が空になる |
| okinoerabu | 2 | 確認できず（記載なし） | その他の数値 | 約20万年かけて形成された空間を歩いて巡れる。 | 削除すると欄が空になる |
| shoji-ueshima | 3 | 食い違い | 標高・距離 | 標高千三百メートルの頂から日本海を見下ろせ、朝は雲海と層状に色づく山肌の紅葉を望 | 削除すると欄が空になる |
| suo-oshima | 1 | 確認できず（公式に記載なし） | 標高・距離 | 約1.5kmのビーチが、ほぼ人けなく続いている。 | 判定の理由の文言が、削除の条件と一致しない |
| suo-oshima | 2 | 確認できず（公式に記載なし） | 料金 | シャワーは200円。 | 判定の理由の文言が、削除の条件と一致しない |
| suo-oshima | 3 | 確認できず（公式に記載なし） | 料金 | シャワー：200円 | 判定の理由の文言が、削除の条件と一致しない |
| suo-oshima | 14 | 確認できず（公式に記載なし） | 標高・距離 | 約1.5kmのビーチがほぼ人けなく続く浜。 | 判定の理由の文言が、削除の条件と一致しない |
| ginzan-onsen | 17 | 確認できず（記載なし） | 営業時間 | 混雑：日中（11時〜16時）は日帰り観光客で混雑。 | 行の中の文が、行ぜんたいと一致しないため（info の行を「。」で区切った文を、 |
| shimekappu | 12 | 確認できず（記載なし） | その他の数値 | マイナス20度以下になることあり | 行の中の文が、行ぜんたいと一致しないため（同上） |

## b) 置換した値の旧値が同じページに残っていた箇所（修正前）
置換した値（P1）177 種。本文・info・lead・tips・モデルコース・見どころの説明に旧値が残る候補 24 件を人が読み、同じ事実の食い違いだったもの 8 件と、モデルコースの時刻 1 件を直した。ほかは、別の施設・別の項目・置換後の値そのもの（理由つきで allowlist.json）。

description（メタに出る欄）には、旧値が残っている（20 件・19 ページ）。メタを変えない決まりなので、今回は触らず、一覧（gaps_description.json）にした。

## 直した編集（変更前後・出典）
| 規則 | ページ | 場所 | 変更前 | 変更後 | 出典 |
|---|---|---|---|---|---|
| P2 | suo-oshima | sections.0.body | 約1.5kmのビーチが、ほぼ人けなく続いている。⏎ | （削除） | （出典なし＝確認できず） |
| P2 | suo-oshima | sections.0.body | シャワーは200円。⏎ | （削除） | （出典なし＝確認できず） |
| P2 | suo-oshima | sections.0.info | シャワー：200円⏎ | （削除） | （出典なし＝確認できず） |
| P2 | suo-oshima | suo-oshima/片添ヶ浜 | 約1.5kmのビーチがほぼ人けなく続く浜。 | （削除） | （出典なし＝確認できず） |
| P2 | isawa-onsen | sections.0.body | 無料で入れて、時間制限もない。⏎ | （削除） | （出典なし＝確認できず） |
| P2 | isawa-onsen | sections.0.body | 湯温はだいたい42度くらい。⏎ | （削除） | （出典なし＝確認できず） |
| P2 | isawa-onsen | tips | 冬は宿の料金が比較的安く、1泊2食付きで15000円台から見つかる。⏎ | （削除） | （出典なし＝確認できず） |
| P1d | gen_茨城_水戸八幡宮 | gen_茨城_水戸八幡宮/弘道館 | 石造の趣ある建築が現存し、講堂や学舎の配置から往時の規模を実感できる。 | （削除） | https://kodokan-ibaraki.jp/about |
| P1d | ojika-island | ojika-island/大島神社 | 定期船のない無人島・大島へ、チャーター船（1回3,000円前後）で渡って参拝する | （削除） | https://www.town.ojika.lg.jp/soshiki/mirai/4/216.html |
| P2 | mihara | mihara/聖湖 | 市内から車で約45分、標高900メートルの山上にある湖で、早朝は霧が立ちこめ、8 | （削除） | https://dive-hiroshima.com/explore/199 |
| P2 | okinoerabu | okinoerabu/昇竜洞 | 約20万年かけて形成された空間を歩いて巡れる。 | （削除） | https://www.chinatyo-syoryudo.com/ |
| P2 | ibukijima | ibukijima/伊吹八幡神社 | 50段ほどの | （削除） | https://www.city.kanonji.kagawa.jp/soshiki/21/23191.html |
| P2 | kashiwajima | kashiwajima/ダイビングスポット群 | 透明度30メートル超の | （削除） | https://www.town.otsuki.kochi.jp/life/dtl.php?hdnKey=1782 |
| P2 | makurazaki | makurazaki/枕崎港 | 朝5時から | （削除） | https://www.makutabi.jp/travel/189 |
| P1d | shoji-ueshima | shoji-ueshima/扇ノ山 | 標高千三百メートルの | （削除） | https://www.pref.tottori.lg.jp/93958.htm |
| P1 | muroto-cape | sections.0.body | 入場料200円 | 入場料は無料 | https://kochi-tabi.jp/search_spot.html?id=6299 |
| P1 | suo-oshima | sections.2.body | 30分食べ放題 | 1時間の食べ放題 | https://suo-oshima-kanko.net/spot/matsuda-orange |
| P1 | metasequoia | sections.0.body | 国道303号 | 県道小荒路牧野沢線 | https://www.city.takashima.lg.jp/soshiki/shokokankobu/kankoshinkoka/2/2/1128.html |
| P1 | tateyama-kurobe | lead | 20mを超える | 20mにも迫る | https://www.town.tateyama.toyama.jp/soshikikarasagasu/shokokankoka/kankokoryugakari/1/1529.html |
| P1 | tateyama-kurobe | sections.3.info | 約8分 | 約7分 | https://www.kurobe-dam.com/kankou/alpine_vehicle.html |
| P1 | ikoma-kogen | lead | 標高約700m | 標高約540m | https://www.kanko-miyazaki.jp/en/sightseeing/1025 |
| P1 | aogashima | modelCourse.daytrip | （200円） | （大人300円） | https://www.vill.aogashima.tokyo.jp/life/facilities.html |
| P1 | hijori-onsen | modelCourse.daytrip | 300〜500円 | 300〜600円 | https://ohkura-kanko.com/contact/qa |
| P3 | ikoma-kogen | modelCourse.daytrip | 8:30 生駒高原着 | 生駒高原着 | https://ikomakougen.com/information |
| P2 | ginzan-onsen | sections.2.info | 日中（11時〜16時）は日帰り観光客で混雑。 | （削除） | https://www.visityamagata.jp/topics-obanazawa-ginzanonsen |
| P2 | shimekappu | sections.1.info | マイナス20度以下になることあり | （削除） | https://www.snowtomamu.jp/winter/faq |
