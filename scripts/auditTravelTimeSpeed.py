#!/usr/bin/env python3
"""travelTime の信頼性点検（読み取りのみ・変更しない）。
直線距離 ÷ travelTime = 平均時速 を出発地×旅先ごとに計算し、分布・疑わしい一覧・本文の所要時間の文の出どころを出す。
使い方: python3 scripts/auditTravelTimeSpeed.py [出力JSON]
"""
import json, math, re, sys
from collections import Counter, defaultdict
from pathlib import Path

root = Path(__file__).resolve().parent.parent
D = json.loads((root / 'src/data/destinations.json').read_text('utf-8'))
ART = root / 'src/data/articles'

# 出発地の代表駅（key: (日本語名, 緯度, 経度)）
O = {
 'tokyo':('東京',35.6812,139.7671),'osaka':('大阪',34.7025,135.4959),'nagoya':('名古屋',35.1709,136.8815),
 'fukuoka':('福岡',33.5897,130.4207),'takamatsu':('高松',34.3502,134.0467),'gifu':('岐阜',35.4091,136.7566),
 'hamamatsu':('浜松',34.7036,137.7344),'mito':('水戸',36.3711,140.4764),'shimonoseki':('下関',33.9506,130.9234),
 'maebashi':('前橋',36.3830,139.0731),'saga':('佐賀',33.2650,130.3000),'takasaki':('高崎',36.3225,139.0125),
 'oita':('大分',33.2329,131.6063),'beppu':('別府',33.2785,131.5001),'kofu':('甲府',35.6674,138.5685),
 'tanabe':('田辺',33.7283,135.3790),'shirahama':('白浜',33.6806,135.3471),'tottori':('鳥取',35.4938,134.2275),
 'kushimoto':('串本',33.4742,135.7847),'shingu':('新宮',33.7283,135.9886),'wakayama':('和歌山',34.2330,135.1910),
 'hiroshima':('広島',34.3978,132.4753),'sendai':('仙台',38.2601,140.8824),'sapporo':('札幌',43.0687,141.3508),
 'naha':('那覇',26.2125,127.6791),'kushiro':('釧路',42.9930,144.3813),'obihiro':('帯広',42.9206,143.2046),
 'kitami':('北見',43.8040,143.8960),'himeji':('姫路',34.8272,134.6910),'niigata':('新潟',37.9120,139.0618),
 'fukuyama':('福山',34.4895,133.3620),'ishigaki':('石垣',24.3448,124.1572),'kanazawa':('金沢',36.5780,136.6480),
 'miyako':('宮古',24.7960,125.2810),'kurashiki':('倉敷',34.5995,133.7720),'aomori':('青森',40.8280,140.7350),
 'kyoto':('京都',34.9858,135.7588),'kobe':('神戸',34.6913,135.1830),'fukushima':('福島',37.7541,140.4592),
 'akita':('秋田',39.7172,140.1290),'okayama':('岡山',34.6666,133.9183),'yamagata':('山形',38.2486,140.3283),
 'tokushima':('徳島',34.0746,134.5513),'kumamoto':('熊本',32.7900,130.6890),'yamaguchi':('山口',34.1640,131.4740),
 'yokohama':('横浜',35.4658,139.6224),'kochi':('高知',33.5590,133.5360),'nagasaki':('長崎',32.7524,129.8720),
 'hakodate':('函館',41.7736,140.7265),'miyazaki':('宮崎',31.9150,131.4310),'matsue':('松江',35.4628,133.0670),
 'morioka':('盛岡',39.7010,141.1360),'matsumoto':('松本',36.2300,137.9650),'nara':('奈良',34.6810,135.8190),
 'matsuyama':('松山',33.8363,132.7510),'kagoshima':('鹿児島',31.5840,130.5420),'utsunomiya':('宇都宮',36.5590,139.8990),
 'shizuoka':('静岡',34.9717,138.3890),'hachinohe':('八戸',40.5120,141.4880),'kitakyushu':('北九州',33.8840,130.8830),
 'asahikawa':('旭川',43.7640,142.3580),'nagano':('長野',36.6430,138.1880),'toyama':('富山',36.7010,137.2130),
 'fukui':('福井',36.0620,136.2230),
}
SHINK_ORIGINS = set()  # 使わない（目的地側の新幹線フラグで分ける）
ISLAND_ORIGINS = {'naha','ishigaki','miyako'}

def hav(a, b, c, d):
    R = 6371.0088
    p1, p2 = math.radians(a), math.radians(c)
    dphi = p2 - p1; dl = math.radians(d - b)
    h = math.sin(dphi/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R*math.asin(math.sqrt(h))

def has_flight(e):
    return any(s.get('type') == 'flight' for s in (e.get('access') or {}).get('steps', [])) or bool(e.get('airportGateway'))

def island_of(lat, lng):
    # 北海道・沖縄・離島の本土側からの移動は飛行機/船が絡む
    if lat >= 41.3 and lng >= 139.3: return 'hokkaido'
    if lat < 28.5 and lng < 131.5: return 'okinawa'  # 沖縄・先島（奄美以南）
    return 'main'

rows = []
for e in D:
    tt = e.get('travelTime') or {}
    for k, m in tt.items():
        if k not in O or not isinstance(m, (int, float)) or m <= 0: continue
        name, la, ln = O[k]
        dist = hav(la, ln, e['lat'], e['lng'])
        sp = dist / (m/60)
        # 区分（出発地と旅先が 本州 / 北海道 / 沖縄先島 のどれか）
        oi, di = island_of(la, ln), island_of(e['lat'], e['lng'])
        if oi != di:
            grp = 'X航空（本州・北海道・沖縄をまたぐ）'
        elif e.get('shinkansenAccess') and dist > 60:
            grp = 'S新幹線の駅がある旅先'
        else:
            grp = 'R在来線・バス・車'
        rows.append(dict(id=e['id'], name=e['name'], pref=e['prefecture'], hub=e.get('hub'), o=k, oname=name, m=m,
                         dist=dist, sp=sp, grp=grp, stay=e.get('stayAllowed') or []))

def pct(a, p):
    a = sorted(a); return a[min(len(a)-1, int(len(a)*p))]
out = {}
print('全 %d 組（旅先%d × 出発地）' % (len(rows), len(D)))
for g in ['R在来線・バス・車','S新幹線の駅がある旅先','X航空（本州・北海道・沖縄をまたぐ）']:
    s = [r['sp'] for r in rows if r['grp'] == g]
    print(f'[{g}] {len(s)}組 中央値{pct(s,.5):.0f} 75%={pct(s,.75):.0f} 90%={pct(s,.9):.0f} 95%={pct(s,.95):.0f} 99%={pct(s,.99):.0f} 最大{max(s):.0f} km/h')
    # 距離帯別
# 距離帯 × 時速（それ以外）
bands = [(0,30),(30,60),(60,100),(100,200),(200,400),(400,2000)]
print('\n--- それ以外の区分: 距離帯別の時速分布 ---')
for lo, hi in bands:
    s = [r['sp'] for r in rows if r['grp'].startswith('R') and lo <= r['dist'] < hi]
    if s: print(f'{lo}-{hi}km {len(s)}組 中央値{pct(s,.5):.0f} 90%={pct(s,.9):.0f} 99%={pct(s,.99):.0f} 最大{max(s):.0f}')
print('\n--- 新幹線の区分: 距離帯別 ---')
for lo, hi in bands:
    s = [r['sp'] for r in rows if r['grp'].startswith('S') and lo <= r['dist'] < hi]
    if s: print(f'{lo}-{hi}km {len(s)}組 中央値{pct(s,.5):.0f} 90%={pct(s,.9):.0f} 99%={pct(s,.99):.0f} 最大{max(s):.0f}')
# ヒストグラム（それ以外）
print('\n--- それ以外の区分: 時速ヒストグラム ---')
h = Counter()
for r in rows:
    if r['grp'].startswith('R'): h[min(int(r['sp']//10)*10, 300)] += 1
for k in sorted(h): print(f'{k:>3}-{k+10:<3}km/h {h[k]}')

json.dump(rows, open(sys.argv[1] if len(sys.argv) > 1 else '/dev/null', 'w'), ensure_ascii=False)
