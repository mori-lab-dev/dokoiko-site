#!/usr/bin/env python3
"""auditTravelTimeSpeed.py の出力(rows.json)から、疑わしい組の集計・上位一覧・ハブ/日帰りへの影響を出す（読み取りのみ）。
使い方: python3 scripts/auditTravelTimeReport.py rows.json [flagged.json]
"""
import json, sys
from collections import Counter, defaultdict
from pathlib import Path

root = Path(__file__).resolve().parent.parent
rows = json.load(open(sys.argv[1]))
hubs = {h['id'] for h in json.load(open(root / 'src/data/hubCities.json'))}
hubs.add('miyako')  # hub id=miyakojima ⇔ travelTime key=miyako
HUBNAME = {h['name']: h['id'] for h in json.load(open(root / 'src/data/hubCities.json'))}

def thr(r):
    d, g = r['dist'], r['grp']
    if g.startswith('R'):
        return 90 if d < 200 else (130 if d < 400 else 160)
    if g.startswith('S'):
        return 130 if d < 200 else 170
    return None

def lower_bound(r):
    """この値より短くは行けない、という最短分（直線距離を閾値の時速で走った場合）。航空は 800km/h + 90分。"""
    if r['grp'].startswith('X'):
        return r['dist'] / 800 * 60 + 90
    return r['dist'] / thr(r) * 60

flag = []
for r in rows:
    lb = lower_bound(r)
    if r['m'] < lb - 0.5:
        r['lb'] = lb
        r['ratio'] = lb / r['m']
        flag.append(r)

print('全', len(rows), '組 / 疑わしい', len(flag), '組（%.1f%%）' % (len(flag)/len(rows)*100))
print('区分別:', {g: sum(1 for r in flag if r['grp'] == g) for g in sorted({r['grp'] for r in rows})},
      '/ 母数', dict(Counter(r['grp'] for r in rows)))
# 強さ別
for t in (1.0, 1.25, 1.5, 2.0, 3.0):
    print(f'  下限の{t}倍以上に足りない(ratio>={t}):', sum(1 for r in flag if r['ratio'] >= t))
# 旅先の数
print('旅先の数(1組でも該当):', len({r['id'] for r in flag}), '/ 全', len({r['id'] for r in rows}))
# 「読み取り用の割り切り」: 90固定の素朴な基準
naive = [r for r in rows if r['grp'].startswith('R') and r['sp'] > 90]
print('参考: R区分を時速90固定で切ると', len(naive), '組(R母数', sum(1 for r in rows if r['grp'].startswith('R')), ')')

# 出発地別
byo = Counter(r['oname'] for r in flag); tot = Counter(r['oname'] for r in rows)
print('\n--- 出発地別（該当/母数） ---')
for k, v in byo.most_common(): print(f'{k} {v}/{tot[k]}', end=' | ')
print()
# 県別
byp = Counter(r['pref'] for r in flag); totp = Counter(r['pref'] for r in rows)
print('\n--- 県別（該当/母数） ---')
for k, v in byp.most_common(): print(f'{k} {v}/{totp[k]}', end=' | ')
print()

# ハブ・日帰りへの影響
hubkey = lambda r: r['o'] in hubs
f_hub = [r for r in flag if hubkey(r)]
f_day = [r for r in flag if 'daytrip' in r['stay'] and r['m'] <= 120 and r['lb'] > 120 and hubkey(r)]
f_day_any = [r for r in flag if 'daytrip' in r['stay'] and r['m'] <= 120 and r['lb'] > 120]
f_ownhub = [r for r in flag if HUBNAME.get(r['hub']) == r['o'] or (r['hub'] == '宮古島' and r['o'] == 'miyako')]
print('\n--- 影響の分類 ---')
print('出発地がハブページを持つ(ハブの一覧・並びに出る):', len(f_hub), '組 / 持たない(旅先ページの所要時間表示のみ):', len(flag) - len(f_hub))
print('日帰り分類が変わる(日帰り可かつ今120分以内なのに、下限は120分超)・ハブあり:', len(f_day), '組 / ハブなしも含め', len(f_day_any), '組')
print('その旅先自身のハブ(d.hub)との組で該当:', len(f_ownhub), '組')
print('日帰り分類が変わる旅先の数:', len({r['id'] for r in f_day}))
# 旅先ごと：ハブ組に該当する旅先
print('ハブ組に該当する旅先の数:', len({r['id'] for r in f_hub}))

if len(sys.argv) > 2:
    json.dump(flag, open(sys.argv[2], 'w'), ensure_ascii=False)
print('\n--- 上位50（足りなさ=下限÷今の値） ---')
top = sorted(flag, key=lambda r: -r['ratio'])
for r in top[:50]:
    tag = ''
    if hubkey(r): tag += 'H'
    if r in f_day_any: tag += 'D'
    print(f"{r['name']}({r['id']})\t{r['oname']}\t{r['m']}分\t{r['dist']:.0f}km\t{r['sp']:.0f}km/h\t下限{r['lb']:.0f}分\t{r['grp'][0]}\t{tag}")
