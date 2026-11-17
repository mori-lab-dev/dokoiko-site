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
case('禁止語「当てます」を画面に足す', [F], txt(lambda t: t.replace('診断をはじめる', '旅先を当てます')))
case('禁止語「運命の町」を画面に足す', [F], txt(lambda t: t.replace('診断をはじめる', '運命の町')))
case('禁止語「20の質問」を画面に足す', [F], txt(lambda t: t.replace('診断をはじめる', '20の質問')))
case('禁止語「4万人」を画面に足す', [F], txt(lambda t: t.replace('診断をはじめる', '4万人が診断')))
case('結果ページに禁止語「当てます」', [RP], txt(lambda t: t.replace('あなたも診断する', '当てますあなたも診断する')))
case('共有画像の元データ（生成スクリプト）に禁止語「運命の町」', ['scripts/buildQuizOgAll.mjs'], txt(lambda t: t.replace('<b>どこ行こ？</b>', '<b>運命の町</b>', 1)))
case('結果のJSONの旅先名に禁止語「4万人」', [F], withdata(lambda d: d[0].update({'name': '4万人の町'})))
case('「のこり」の厳密性が崩れる（旧エンジンに戻す）', ['src/lib/quizEngine.js'], lambda f, b: open('logs/quiz_20261118/quizEngine.js.before', 'rb').read())
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
# ---- 地図の出典・落款
AB = 'dist/about/index.html'
case('about から地図の出典（Natural Earth）が消える', [AB], txt(lambda t: t.replace('Natural Earth', 'ある地図データ')))
case('about から都道府県の境のデータ名が消える', [AB], txt(lambda t: t.replace('ne_10m_admin_1_states_provinces', '')))
case('about からライセンス（パブリックドメイン）が消える', [AB], txt(lambda t: t.replace('パブリックドメイン', '')))
case('about から加工内容（間引き）が消える', [AB], txt(lambda t: t.replace('間引き', '')))
case('quizMap.json から都道府県の境が消える', ['src/data/quizMap.json'], lambda f, b: json.dumps({**json.loads(b), 'frames': [{**fr, 'pref': ''} for fr in json.loads(b)['frames']]}, ensure_ascii=False).encode('utf8'))
case('結果ページの落款が別のアカウント名', [RP], txt(lambda t: t.replace('>@mori__lab</span>', '>@someone_else</span>', 1)))
case('共有画像の元データの落款が別のアカウント名', ['scripts/buildQuizOgAll.mjs'], txt(lambda t: t.replace('<div class="seal">${ACCOUNT}</div>', '<div class="seal">@mori_lab</div>', 1)))
case('結果画面の落款が別のアカウント名', ['src/pages/quiz.astro'], txt(lambda t: t.replace('aria-hidden="true">@mori__lab</span>', 'aria-hidden="true">@mori__lab2</span>', 1)))
case('診断ページのXのリンク先が別のアカウント', [F], txt(lambda t: t.replace('https://x.com/mori__lab', 'https://x.com/other', 1)))
# ---- 説明（desc.json）
DJ = 'dist/quiz/desc.json'
d0 = json.load(open(DJ, encoding='utf8'))
def dmut(fn):
    def m(f, b):
        d = json.loads(b.decode('utf8')); fn(d); return json.dumps(d, ensure_ascii=False).encode('utf8')
    return m
id0 = D0[0]['id']; id1 = D0[1]['id']
case('説明に「無料送迎」', [DJ], dmut(lambda d: d.update({id0: '無料送迎があります。'})))
case('説明に料金（円）', [DJ], dmut(lambda d: d.update({id0: d[id0].rstrip('。') + '。入場は500円です。'})))
case('説明に所要時間（分）', [DJ], dmut(lambda d: d.update({id0: '駅から約15分の町です。'})))
case('説明に「車なし」', [DJ], dmut(lambda d: d.update({id0: '車なしで行けます。'})))
case('説明に禁止語「運命の町」', [DJ], dmut(lambda d: d.update({id0: '運命の町です。'})))
case('説明に「当てます」', [DJ], dmut(lambda d: d.update({id0: '旅先を当てます。'})))
case('説明に断定・最上級「日本一」', [DJ], dmut(lambda d: d.update({id0: '日本一の景色です。'})))
case('説明に推測の語「かもしれない」', [DJ], dmut(lambda d: d.update({id0: '行きたくなるかもしれない。'})))
case('説明が文の途中で切れている', [DJ], dmut(lambda d: d.update({id0: d[id0].rstrip('。')[:-1]})))
case('説明が長すぎる', [DJ], dmut(lambda d: d.update({id0: '山と海に囲まれた静かな土地で、' * 8 + '旅先です。'})))
case('説明に新しい文が混ざる（既存の description にも tags の形にも無い）', [DJ], dmut(lambda d: d.update({id1: '空気がおいしい旅先です。'})))
case('結果ページの og:description が desc.json と違う', [RP], txt(lambda t: t.replace('<meta property="og:description" content="', '<meta property="og:description" content="違う説明', 1)))
case('結果ページの本文に説明が無い', [RP], txt(lambda t: re.sub(r'<p class="desc"[^>]*>.*?</p>', '', t, count=1)))
case('診断の最初のJSONに description が入る', [F], withdata(lambda d: d[0].update({'description': 'x'})))
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
