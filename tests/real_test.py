import sys, pathlib, json, datetime
from playwright.sync_api import sync_playwright
OUT = pathlib.Path('/Users/wavef/Desktop/svganim-test-out')
SHOTS = pathlib.Path(__file__).parent / 'out'
RUNTIME = (pathlib.Path(__file__).parent.parent / 'dist' / 'svg-anim-runtime.min.js').read_text()
fails = 0
def check(c, msg):
    global fails
    print(('ok  ' if c else 'FAIL'), msg)
    if not c: fails += 1
STATE = '''() => {
  const root = document.querySelector('svg'); const api = root.__svgAnim;
  const texts = Array.from(document.querySelectorAll('[data-svganim]')).filter(e => /count|clock/.test(e.getAttribute('data-svganim'))).map(e => e.textContent.trim());
  const wraps = Array.from(document.querySelectorAll('.svganim-wrap')).map(g => (g.getAttribute('transform') || '') + '|' + g.style.opacity);
  const hidden = Array.from(document.querySelectorAll('[data-svganim]')).filter(e => /frames/.test(e.getAttribute('data-svganim'))).map(e => Array.from(e.querySelectorAll('*')).filter(c => c.style.visibility === 'hidden').length);
  return { players: api ? api.players.length : -1, texts, wraps, hidden };
}'''
with sync_playwright() as pw:
    b = pw.chromium.launch()
    cdn_hits = []
    def serve_cdn(route):
        cdn_hits.append(route.request.url)
        route.fulfill(status=200, content_type='application/javascript', body=RUNTIME)
    for name in ['watch-embed.svg', 'watch-embed.html', 'watch-link.svg', 'watch-local.svg']:
        page = b.new_page(viewport={'width': 900, 'height': 640})
        page.route('https://cdn.jsdelivr.net/**', serve_cdn)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.goto((OUT / name).as_uri())
        page.wait_for_timeout(400)
        a = page.evaluate(STATE)
        page.screenshot(path=str(SHOTS / (name + '-a.png')))
        page.wait_for_timeout(1300)
        z = page.evaluate(STATE)
        page.screenshot(path=str(SHOTS / (name + '-b.png')))
        print(name, 'players', a['players'], 'texts', a['texts'][:8], '→', z['texts'][:8], 'frames hidden', a['hidden'])
        check(not errors, name + ': no errors ' + '; '.join(errors)[:300])
        check(a['players'] > 30, name + ': runtime started')
        now = datetime.datetime.now()
        check(now.strftime('%H') in a['texts'] and now.strftime('%M') in a['texts'] or (now - datetime.timedelta(seconds=2)).strftime('%M') in a['texts'], name + ': clock HH / mm shown')
        check(a['texts'] != z['texts'], name + ': counters change over time')
        check(a['wraps'] != z['wraps'], name + ': transforms/opacity change over time')
        check(all(h == 3 for h in a['hidden']), name + ': frames show one of four children')
        page.close()
    check(len(cdn_hits) == 1 and 'cdn.jsdelivr.net/gh/' in cdn_hits[0], 'only watch-link.svg requested the player from jsDelivr: ' + ', '.join(cdn_hits))
    b.close()
print('ALL PASSED' if not fails else f'{fails} FAILED')
