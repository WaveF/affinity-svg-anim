"""Plays ~/Desktop/svganim-test-out/children-blur.svg (from tests/children-blur.scenario.js)
plus a synthetic Blur / legacy fixture in Chromium."""
import json, pathlib
from playwright.sync_api import sync_playwright
HERE = pathlib.Path(__file__).parent
OUT = pathlib.Path.home() / 'Desktop' / 'svganim-test-out'
RUNTIME = (HERE.parent / 'dist' / 'svg-anim-runtime.min.js').read_text()
fails = 0
def check(c, msg):
    global fails
    print(('ok  ' if c else 'FAIL'), msg)
    if not c: fails += 1

T = dict(dur=1, delay=0, stagger=0, order='forward', ease='linear', dir='normal', loops=1, loopDelay=0, trigger='load', target='self')
def anim(tracks, **extra):
    d = {"v": 1}; d.update(extra); d["tracks"] = [dict(T, **t) for t in tracks]
    return "data-svganim='" + json.dumps(d) + "'"
def ft(type, a, z): return {'type': type, 'from': a, 'to': z}
synthetic = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <g transform="scale(2)"><rect id="bl" {anim([ft('blur', 0, 8)])} x="10" y="10" width="40" height="40"/></g>
  <rect id="b2" {anim([ft('blur', 0, 3), ft('blur', 0, 4), ft('fade', 100, 50)])} x="200" y="10" width="40" height="40"/>
  <g id="old" {anim([dict(type='move', target='children', x=0, y=100, stagger=0.5)], n=2)}><rect id="o1" width="5" height="5"/><rect id="o2" width="5" height="5"/></g>
  <g id="fr" {anim([dict(type='frames', target='children')], n=3, c=1)}><rect id="fa" data-svganim-c="2" width="5" height="5"/><g><rect id="fb" data-svganim-c="1" width="5" height="5"/></g><rect id="fc" data-svganim-c="0" width="5" height="5"/></g>
<script><![CDATA[
{RUNTIME}
]]></script>
</svg>'''
(HERE / 'out').mkdir(exist_ok=True)
syn = HERE / 'out' / 'children-blur-synthetic.svg'; syn.write_text(synthetic)

STATE = '''() => {
  const R = document.documentElement;
  const ctmY = el => { const m = R.getScreenCTM().inverse().multiply(el.getScreenCTM()); return Math.round(m.f * 1000) / 1000; };
  const marked = Array.from(document.querySelectorAll('[data-svganim-c]'));
  const blurOf = el => { const f = el.parentNode.getAttribute('filter'); if (!f) return null; const id = f.slice(5, -1); return Number(document.getElementById(id).firstChild.getAttribute('stdDeviation')); };
  return {
    marked: marked.map(el => ({ pos: el.getAttribute('data-svganim-c'), y: ctmY(el), wrapped: el.parentNode.getAttribute('class') === 'svganim-wrap' })),
    deepWrapped: document.querySelectorAll('.svganim-wrap .svganim-wrap').length,
    blur: Array.from(document.querySelectorAll('[data-svganim]')).filter(e => /"blur"/.test(e.getAttribute('data-svganim'))).map(blurOf),
  };
}'''
with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type in ('error', 'warning') else None)
    page.goto((OUT / 'children-blur.svg').as_uri())
    page.evaluate('() => document.documentElement.__svgAnim.pause()')
    def at(t):
        page.evaluate(f'() => document.documentElement.__svgAnim.seek({t})')
        return page.evaluate(STATE)
    s0, s1, s15, s2 = at(0), at(1.0), at(1.5), at(2.0)
    check(not errors, 'exported SVG: no console errors ' + '; '.join(errors))
    dy = lambda a, z: {m['pos']: round(z_m['y'] - m['y'], 3) for m, z_m in zip(a['marked'], z['marked'])}
    print('marked', s0['marked'])
    check(all(m['wrapped'] for m in s0['marked']), 'every marked first-level child is animated (wrapped)')
    check(s0['deepWrapped'] == 0, 'nothing below the first level is wrapped; the Blur child shares its wrapper: ' + str(s0['deepWrapped']))
    outer = lambda s: [m for m in s['marked']][1:]  # Wrap's single child comes first in the SVG
    o0, o1, o15, o2 = outer(s0), outer(s1), outer(s15), outer(s2)
    moved = lambda a, z: {m['pos']: round(n['y'] - m['y'], 3) for m, n in zip(a, z)}
    check(moved(o0, o1) == {'2': 0, '1': 50, '0': 100}, 'Top to bottom layer at 1 s: top done, middle halfway, bottom waiting ' + str(moved(o0, o1)))
    check(moved(o0, o15) == {'2': 50, '1': 100, '0': 100}, 'at 1.5 s the bottom layer is halfway ' + str(moved(o0, o15)))
    check(moved(o0, o2) == {'2': 100, '1': 100, '0': 100}, 'all children done at 2 s ' + str(moved(o0, o2)))
    check(dy(s0, s1)['0'] == 100 and s0['marked'][0]['pos'] == '0', 'single-group child moves as one unit (no descent into its children)')
    check(s0['blur'] == [None] and at(0.5)['blur'] == [6] and s1['blur'] == [12], 'exported Blur 0 → 6 → 12 px, filter removed at 0')

    errors.clear()
    page.goto(syn.as_uri())
    page.evaluate('() => document.documentElement.__svgAnim.pause()')
    q = '''() => { const R = document.documentElement; const g = id => document.getElementById(id);
      const sd = id => { const f = g(id).parentNode.getAttribute('filter'); return f ? Number(document.getElementById(f.slice(5, -1)).firstChild.getAttribute('stdDeviation')) : null; };
      const reg = id => { const f = g(id).parentNode.getAttribute('filter'); if (!f) return null; const e = document.getElementById(f.slice(5, -1)); return ['x','y','width','height'].map(k => Number(e.getAttribute(k))); };
      const y = id => Math.round(R.getScreenCTM().inverse().multiply(g(id).getScreenCTM()).f * 1000) / 1000;
      return { bl: sd('bl'), b2: sd('b2'), b2o: g('b2').parentNode.style.opacity, reg: reg('bl'), o: [y('o1'), y('o2')], fr: ['fa','fb','fc'].map(id => g(id).style.visibility || 'v') }; }'''
    def at2(t):
        page.evaluate(f'() => document.documentElement.__svgAnim.seek({t})')
        return page.evaluate(q)
    a, h, z = at2(0), at2(0.5), at2(1)
    print('synthetic', a, h, z)
    check(not errors, 'synthetic: no console errors ' + '; '.join(errors))
    check(h['bl'] == 2 and z['bl'] == 4, 'Blur radius in document px under a 2× parent (stdDeviation 2 → 4 local)')
    check(z['reg'][0] < 10 - 12 and z['reg'][2] > 40 + 24, 'filter region covers the blur spread')
    check(z['b2'] == 5 and z['b2o'] == '0.5', 'two Blur tracks combine as sqrt(3² + 4²) and compose with Fade')
    check(a['bl'] is None and a['b2'] is None, 'zero blur leaves no filter attribute')
    check(at2(0.75)['o'] == [75, 25], 'unmarked SVG keeps the v0.4 child order (document order)')
    check(a['fr'] == ['v', 'hidden', 'hidden'] and at2(0.5)['fr'] == ['hidden', 'v', 'hidden'] and at2(0.9)['fr'] == ['hidden', 'hidden', 'v'], 'Frames: bottom layer first, top last; nested marked child found')
    b.close()
print('ALL PASSED' if not fails else f'{fails} FAILED')
