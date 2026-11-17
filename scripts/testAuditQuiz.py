#!/usr/bin/env python3
"""auditQuiz.mjs が、違反を本当に検出できるかの試験（2026-11-17）。dist/quiz/index.html を一時的に壊して audit を流し、元に戻す。
usage: python3 scripts/testAuditQuiz.py   （先に npm run build）"""
import subprocess, shutil, re, os, json
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
F = 'dist/quiz/index.html'
shutil.copy(F, '/private/tmp/claude-501/quiz_index_backup.html')
orig = open(F, encoding='utf8').read()
def run():
    r = subprocess.run(['node', 'scripts/auditQuiz.mjs', '--n', '1500'], capture_output=True, text=True)
    return r.returncode, [l for l in r.stdout.split('\n') if re.search(r': [1-9]\d*件', l)]
def case(name, mutate):
    open(F, 'w', encoding='utf8').write(mutate(orig))
    rc, lines = run()
    print(('検出 ' if rc else '見逃し'), '|', name, '|', (lines[0][:90] if lines else '-'))
    open(F, 'w', encoding='utf8').write(orig)
data = re.search(r'<script id="quiz-data"[^>]*>(.*?)</script>', orig, re.S)[1]
j = json.loads(data)
def withdata(f):
    def m(t):
        d = json.loads(data); f(d); return t.replace(data, json.dumps(d, ensure_ascii=False, separators=(',', ':')))
    return m
print('基準（壊さない）:', run()[0] == 0 and '合格' or '不合格')
case('禁止語「運命」を画面に足す', lambda t: t.replace('診断をはじめる', '運命の診断をはじめる'))
case('JSONに travelTime を足す', withdata(lambda d: d[0].update({'travelTime': {'大阪': 60}})))
case('JSONの tags に「無料送迎」', withdata(lambda d: d[1]['tags'].append('無料送迎')))
case('JSONに lat/lng を足す', withdata(lambda d: d[2].update({'lat': 35.123456})))
case('JSONに県名が2つの旅先を入れる', withdata(lambda d: d[3].update({'prefecture': '愛媛県・高知県'})))
case('JSONに存在しない旅先IDを入れる', withdata(lambda d: d.append({'id': 'no-such', 'name': 'x', 'prefecture': '東京都', 'tags': [], 'weight': 1, 'stayAllowed': ['daytrip'], 'url': '/destinations/no-such/'})))
case('診断ページ内リンクに utm を付ける', lambda t: t.replace('href="/about/"', 'href="/about/?utm_source=x"', 1))
case('canonical を壊す', lambda t: t.replace('<link rel="canonical" href="https://tabidokoiko.com/quiz/"', '<link rel="canonical" href="https://tabidokoiko.com/"'))
case('勤務先名・実名の混入（git の user.name）', lambda t: t.replace('診断をはじめる', subprocess.run(['git', 'config', 'user.name'], capture_output=True, text=True).stdout.strip() + 'の診断'))
shutil.copy('/private/tmp/claude-501/quiz_index_backup.html', F)
print('復元後:', run()[0] == 0 and '合格' or '不合格')
