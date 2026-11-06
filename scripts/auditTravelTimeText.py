#!/usr/bin/env python3
"""本文の「◯◯から約N分／N時間」の文が travelTime の値から来ているかを分ける（読み取りのみ）。
対象: 旅先ページに載る文 = description / 記事(lead・各section.body) / spots の説明 / featured_stay の文
使い方: python3 scripts/auditTravelTimeText.py [出力JSON]
"""
import json, re, sys
from collections import Counter
from pathlib import Path

root = Path(__file__).resolve().parent.parent
D = json.loads((root / 'src/data/destinations.json').read_text('utf-8'))
ORIG = {  # 出発地名 -> key
 '東京':'tokyo','大阪':'osaka','名古屋':'nagoya','福岡':'fukuoka','高松':'takamatsu','岐阜':'gifu','浜松':'hamamatsu','水戸':'mito',
 '下関':'shimonoseki','前橋':'maebashi','佐賀':'saga','高崎':'takasaki','大分':'oita','別府':'beppu','甲府':'kofu','田辺':'tanabe',
 '白浜':'shirahama','鳥取':'tottori','串本':'kushimoto','新宮':'shingu','和歌山':'wakayama','広島':'hiroshima','仙台':'sendai',
 '札幌':'sapporo','那覇':'naha','釧路':'kushiro','帯広':'obihiro','北見':'kitami','姫路':'himeji','新潟':'niigata','福山':'fukuyama',
 '石垣':'ishigaki','金沢':'kanazawa','宮古':'miyako','倉敷':'kurashiki','青森':'aomori','京都':'kyoto','神戸':'kobe','福島':'fukushima',
 '秋田':'akita','岡山':'okayama','山形':'yamagata','徳島':'tokushima','熊本':'kumamoto','山口':'yamaguchi','横浜':'yokohama','高知':'kochi',
 '長崎':'nagasaki','函館':'hakodate','宮崎':'miyazaki','松江':'matsue','盛岡':'morioka','松本':'matsumoto','奈良':'nara','松山':'matsuyama',
 '鹿児島':'kagoshima','宇都宮':'utsunomiya','静岡':'shizuoka','八戸':'hachinohe','北九州':'kitakyushu','旭川':'asahikawa','長野':'nagano',
 '富山':'toyama','福井':'fukui',
}
NAMES = sorted(ORIG, key=lambda s: -len(s))
alt = '|'.join(NAMES)
# 「<出発地>(駅|市内|空港|から)…から?約N(時間M分|分|時間半|時間)」
DUR = r'(?:約|およそ)?(?:(\d+)時間(?:(\d+)分|半)?|(\d+)分)'
PAT = re.compile(r'(?P<o>' + alt + r')(?:駅|空港|市内|市街|港)?(?:から|より|発)[^。\n、]{0,14}?' + DUR)
ANY = re.compile(r'から[^。\n、]{0,14}?' + DUR)  # 出発地名でない起点（駅から徒歩…など）

def mins(m):
    g = m.groups()
    if g[-3] is not None:  # N時間 / N時間M分 / N時間半
        h = int(g[-3]); extra = g[-2]
        if extra is not None: return h*60 + int(extra)
        if m.group(0).endswith('半'): return h*60 + 30
        return h*60
    return int(g[-1])

def texts(e):
    out = [('description', e.get('description') or '')]
    f = ART / f"{e['id']}.json"
    if f.exists():
        a = json.loads(f.read_text('utf-8'))
        out.append(('記事lead', a.get('lead') or ''))
        for s in a.get('sections', []): out.append(('記事本文', (s.get('body') or '') + '\n' + (s.get('info') or '')))
    for s in e.get('spots') or []:
        if isinstance(s, dict): out.append(('spots', s.get('description') or s.get('desc') or ''))
    fs = e.get('featured_stay') or {}
    if isinstance(fs, dict): out.append(('featured_stay', ' '.join(str(v) for v in fs.values() if isinstance(v, str))))
    return out

ART = root / 'src/data/articles'
cnt = Counter(); examples = {'一致': [], '不一致': [], '値なし': []}
perdest = Counter(); fieldc = Counter()
fromOrigin = []
for e in D:
    tt = e.get('travelTime') or {}
    seen = set()
    for field, t in texts(e):
        for sent in re.split(r'[。\n]', t):
            if not sent: continue
            m = PAT.search(sent)
            if m:
                o = m.group('o'); k = ORIG[o]; mn = mins(m)
                key = (e['id'], sent)
                if key in seen: continue
                seen.add(key)
                v = tt.get(k)
                if v is None: cat = '値なし'
                elif v == mn: cat = '一致'
                else: cat = '不一致'
                cnt[cat] += 1; fieldc[(field, cat)] += 1
                fromOrigin.append(dict(id=e['id'], name=e['name'], field=field, o=o, text=mn, tt=v, cat=cat, sent=sent[:90]))
                perdest[e['id']] += 1
            elif ANY.search(sent):
                key = (e['id'], sent)
                if key in seen: continue
                seen.add(key); cnt['起点が出発地でない(駅・施設から等)'] += 1
print('出発地名を起点にした所要時間の文:', sum(v for k, v in cnt.items() if k in ('一致', '不一致', '値なし')), '文 / ', len({r['id'] for r in fromOrigin}), '旅先')
for k in ('一致', '不一致', '値なし'): print(' ', k, cnt[k])
print('  起点が出発地でない(駅・施設から等):', cnt['起点が出発地でない(駅・施設から等)'], '文')
print('\n項目別:')
for (f, c), v in sorted(fieldc.items()): print(' ', f, c, v)
# 不一致の差の分布
diffs = [abs(r['text'] - r['tt']) for r in fromOrigin if r['cat'] == '不一致']
if diffs:
    diffs.sort()
    print('\n不一致の差(分) 中央値', diffs[len(diffs)//2], ' 10分以内', sum(1 for d in diffs if d <= 10), ' 30分超', sum(1 for d in diffs if d > 30))
# 出発地別
oc = Counter((r['o'], r['cat']) for r in fromOrigin)
print('\n出発地別(一致/不一致/値なし):')
for o in sorted({r['o'] for r in fromOrigin}, key=lambda x: -sum(v for (a, b), v in oc.items() if a == x))[:12]:
    print(' ', o, oc[(o, '一致')], oc[(o, '不一致')], oc[(o, '値なし')])
if len(sys.argv) > 1: json.dump(fromOrigin, open(sys.argv[1], 'w'), ensure_ascii=False)
