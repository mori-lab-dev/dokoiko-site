#!/usr/bin/env python3
"""auditQuiz.mjs が、違反を本当に検出できるかの試験（2026-11-17 / 2026-11-18 に結果ページ・共有画像・11項目のJSONの違反を足した）。
dist の一部を一時的に壊して audit を流し、元に戻す。
usage: python3 scripts/testAuditQuiz.py   （先に npm run build）"""
import subprocess, shutil, re, os, json, struct, zlib
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BK = '/private/tmp/claude-501/quiz_audit_bk'
os.makedirs(BK, exist_ok=True)
F = 'dist/quiz/index.html'
orig = open(F, encoding='utf8').read()
data = re.search(r'<script id="quiz-data"[^>]*>(.*?)</script>', orig, re.S)[1]
D0 = json.loads(data)
c0 = D0[0]['code']
RP = f'dist/quiz/r/{c0}/index.html'
OG = f'dist/quiz/og/{c0}.png'
def run():
    r = subprocess.run(['node', 'scripts/auditQuiz.mjs', '--n', '1500'], capture_output=True, text=True)
    return r.returncode, [l for l in r.stdout.split('\n') if re.search(r': [1-9]\d*件', l)]
def case(name, files, mutate):
    """files: 壊すファイルのリスト。mutate(path, bytes) -> bytes"""
    saved = {f: open(f, 'rb').read() for f in files}
    for f in files:
        out = mutate(f, saved[f])
        if out is None: os.remove(f)
        else: open(f, 'wb').write(out)
    rc, lines = run()
    print(('検出 ' if rc else '見逃し'), '|', name, '|', (lines[0][:96] if lines else '-'))
    for f in files: open(f, 'wb').write(saved[f])
def txt(fn):
    return lambda f, b: fn(b.decode('utf8')).encode('utf8')
def withdata(fn):
    def m(t):
        d = json.loads(data); fn(d); return t.replace(data, json.dumps(d, ensure_ascii=False, separators=(',', ':')))
    return txt(m)
def png_chunk(typ, payload):
    return struct.pack('>I', len(payload)) + typ + payload + struct.pack('>I', zlib.crc32(typ + payload) & 0xffffffff)
def add_chunk(typ, payload):
    def m(f, b):
        i = b.rindex(b'IEND') - 4
        return b[:i] + png_chunk(typ, payload) + b[i:]
    return m
print('基準（壊さない）:', run()[0] == 0 and '合格' or '不合格')
# ---- /quiz/ のページ・JSON
case('禁止語「運命」を画面に足す', [F], txt(lambda t: t.replace('診断をはじめる', '運命の診断をはじめる')))
case('JSONに travelTime を足す', [F], withdata(lambda d: d[0].update({'travelTime': {'大阪': 60}})))
case('JSONの tags に「無料送迎」', [F], withdata(lambda d: d[1]['tags'].append('無料送迎')))
case('JSONに lat/lng を足す（12個目の項目）', [F], withdata(lambda d: d[2].update({'lat': 35.123456})))
case('JSONに県名が2つの旅先を入れる', [F], withdata(lambda d: d[3].update({'prefecture': '愛媛県・高知県'})))
case('JSONに存在しない旅先IDを入れる', [F], withdata(lambda d: d.append({'id': 'no-such', 'name': 'x', 'prefecture': '東京都', 'tags': [], 'weight': 1, 'stayAllowed': ['daytrip'], 'url': '/destinations/no-such/', 'x': 1, 'y': 1, 'code': '00000000', 'win': 0})))
case('x が整数でない', [F], withdata(lambda d: d[4].update({'x': 10.5})))
case('y が範囲外', [F], withdata(lambda d: d[5].update({'y': 5000})))
case('code が重複', [F], withdata(lambda d: d[7].update({'code': d[6]['code']})))
case('code が英数字でない', [F], withdata(lambda d: d[8].update({'code': 'あいうえおかきく'})))
case('win の合計が1万でない', [F], withdata(lambda d: d[9].update({'win': d[9]['win'] + 5})))
case('診断ページ内リンクに utm を付ける', [F], txt(lambda t: t.replace('href="/about/"', 'href="/about/?utm_source=x"', 1)))
case('canonical を壊す', [F], txt(lambda t: t.replace('<link rel="canonical" href="https://tabidokoiko.com/quiz/"', '<link rel="canonical" href="https://tabidokoiko.com/"')))
case('実名の混入（git の user.name）', [F], txt(lambda t: t.replace('診断をはじめる', subprocess.run(['git', 'config', 'user.name'], capture_output=True, text=True).stdout.strip() + 'の診断')))
case('作った人のXのリンクを消す（結果の画面）', [F], txt(lambda t: t.replace('href="https://x.com/mori__lab"', 'href="https://x.com/"')))
# ---- 結果ページ
case('結果ページが空（中身が無い）', [RP], lambda f, b: b'')
case('結果ページが無い（ファイルが存在しない）', [RP], lambda f, b: None)
case('結果ページが noindex でない', [RP], txt(lambda t: t.replace('noindex,follow', 'index,follow')))
case('結果ページの canonical が自分', [RP], txt(lambda t: t.replace('<link rel="canonical" href="https://tabidokoiko.com/quiz/">', f'<link rel="canonical" href="https://tabidokoiko.com/quiz/r/{c0}/">')))
case('結果ページの og:image が共通の画像', [RP], txt(lambda t: t.replace(f'/quiz/og/{c0}.png', '/images/quiz_og.png')))
case('結果ページに utm', [RP], txt(lambda t: t.replace('href="/quiz/"', 'href="/quiz/?utm_source=x"')))
case('結果ページに「無料」', [RP], txt(lambda t: t.replace('あなたも診断する', '無料であなたも診断する')))
case('結果ページに禁止語「必ず」', [RP], txt(lambda t: t.replace('あなたも診断する', '必ずあなたも診断する')))
case('結果ページの作った人のXのリンクを消す', [RP], txt(lambda t: t.replace('href="https://x.com/mori__lab"', 'href="https://x.com/"')))
case('結果ページに位置（緯度経度）', [RP], txt(lambda t: t.replace('<h1', '<!-- 35.123456,139.123456 --><h1', 1)))
case('sitemap に結果ページが入る', ['dist/sitemap.xml'], txt(lambda t: t.replace('</urlset>', f'<url><loc>https://tabidokoiko.com/quiz/r/{c0}/</loc></url></urlset>')))
# ---- 共有画像
case('共有画像にメタデータ（tEXt）', [OG], add_chunk(b'tEXt', b'Author\x00someone'))
case('共有画像にEXIF（eXIf）', [OG], add_chunk(b'eXIf', b'MM\x00*\x00\x00\x00\x08\x00\x00'))
case('共有画像がサイズ超過', [OG], add_chunk(b'prVt', os.urandom(70000)))
case('共有画像が古い（manifest の中身のハッシュが今のデータと違う）', ['src/data/quizOgManifest.json'], txt(lambda t: t.replace(json.loads(t)[c0], 'ffffffffffff', 1)))
case('共有画像が無い（ファイルが存在しない）', [OG], lambda f, b: None)
case('共有画像が壊れている（空）', [OG], lambda f, b: b'')
case('共有画像に実名のバイト列', [OG], add_chunk(b'prVt', subprocess.run(['git', 'config', 'user.name'], capture_output=True, text=True).stdout.strip().encode()))
rc, _ = run()
print('復元後:', rc == 0 and '合格' or '不合格')
