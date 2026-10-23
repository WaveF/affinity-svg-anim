import json, sys, pathlib
from playwright.sync_api import sync_playwright
HERE = pathlib.Path(__file__).parent
RUNTIME = (HERE.parent / 'dist' / 'svg-anim-runtime.min.js').read_text()

def anim(tracks, n=None):
    d = {"v": 1, "tracks": tracks}
    if n is not None: d["n"] = n
    return "data-svganim='" + json.dumps(d) + "'"

T = dict(dur=1, delay=0, stagger=0, order='forward', ease='linear', dir='normal', loops=1, loopDelay=0, trigger='load', target='self')
def tr(**k): x = dict(T); x.update(k); return x

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="500" height="500">
  <g transform="matrix(2,0,0,2,0,0)">
    <rect id="mv" {anim([tr(type='move', x=100, y=50)])} transform="matrix(1,0,0,1,10,10)" x="0" y="0" width="20" height="20"/>
  </g>
  <rect id="rot" {anim([tr(type='rotate', angle=90, pivot='tl')])} x="100" y="100" width="40" height="20"/>
  <rect id="sc" {anim([tr(type='scale', sx=200, sy=50, pivot='c')])} x="200" y="200" width="40" height="40"/>
  <rect id="fd" {anim([tr(type='fade', **{'from': 100, 'to': 0})])} x="300" y="300" width="40" height="40" style="opacity:0.5"/>
  <path id="dr" {anim([tr(type='draw', mode='reveal', seg=20)])} d="M0,500 L100,500" style="stroke:#000;stroke-width:4;fill:none"/>
  <g id="cnt" {anim([tr(type='count', start=None, end=200, decimals=None, pad=True, group=False, random=False)])}><text x="1 2 3" y="600">050</text></g>
  <g id="cnt2" {anim([tr(type='count', start=0, end=1234.5, decimals=1, pad=False, group=True, random=False)])}><text x="0" y="650">0</text></g>
  <g id="clk" {anim([tr(type='clock', format='HH:mm')])}><text x="0" y="700">00:00</text></g>
  <g id="frm" {anim([tr(type='frames', target='children', dur=0.4)], n=4)}><g><rect id="f1" width="5" height="5"/><rect id="f2" width="5" height="5"/><rect id="f3" width="5" height="5"/><rect id="f4" width="5" height="5"/></g></g>
  <g id="stg" {anim([tr(type='move', target='children', x=0, y=100, stagger=0.5, order='reverse')], n=3)}><rect id="s1" width="5" height="5"/><rect id="s2" width="5" height="5"/><rect id="s3" width="5" height="5"/></g>
  <rect id="multi" {anim([tr(type='move', x=10, y=0), tr(type='fade', **{'from':100,'to':50}), tr(type='rotate', angle=180, pivot='c')])} x="800" y="800" width="10" height="10"/>
  <rect id="loop" {anim([tr(type='move', x=100, y=0, dir='alternate', loops=0, loopDelay=0.5)])} x="0" y="900" width="10" height="10"/>
  <rect id="clickme" {anim([tr(type='move', x=100, y=0, trigger='click')])} x="900" y="0" width="50" height="50"/>
  <rect id="hov" {anim([tr(type='scale', sx=150, sy=150, trigger='hover', dur=0.3)])} x="900" y="100" width="50" height="50"/>
<script><![CDATA[
{RUNTIME}
]]></script>
</svg>'''
(HERE / 'out').mkdir(exist_ok=True)
p = HERE / 'out' / 'synthetic.svg'; p.write_text(svg)

fails = 0
def check(c, msg):
    global fails
    print(('ok  ' if c else 'FAIL'), msg)
    if not c: fails += 1

JS_STATE = '''() => {
  const q = id => document.getElementById(id);
  const w = id => q(id).parentNode;
  const R = document.documentElement; const ctm = id => { const m = R.getScreenCTM().inverse().multiply(q(id).getScreenCTM()); return [m.a,m.b,m.c,m.d,m.e,m.f].map(v => Math.round(v*1000)/1000); };
  return {
    mv: ctm('mv'), rot: ctm('rot'), sc: ctm('sc'), multi: ctm('multi'), loop: ctm('loop'), click: ctm('clickme'), hov: ctm('hov'),
    fdWrapOpacity: w('fd').style.opacity, fdOwn: q('fd').style.opacity,
    dash: q('dr').style.strokeDasharray, dashOff: q('dr').style.strokeDashoffset, drVis: q('dr').style.visibility,
    cnt: q('cnt').textContent, cntX: q('cnt').querySelector('text').getAttribute('x'), cnt2: q('cnt2').textContent, clk: q('clk').textContent,
    frames: ['f1','f2','f3','f4'].map(id => q(id).style.visibility || 'v'),
    stg: ['s1','s2','s3'].map(id => ctm(id)[5]),
    multiOpacity: w('multi').style.opacity,
    players: document.documentElement.__svgAnim.players.length
  };
}'''
with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type in ('error', 'warning') else None)
    page.goto(p.as_uri())
    page.evaluate('() => document.documentElement.__svgAnim.pause()')
    def at(t):
        page.evaluate(f'() => document.documentElement.__svgAnim.seek({t})')
        return page.evaluate(JS_STATE)
    s0 = at(0); s5 = at(0.5); s1 = at(1.0)
    print(json.dumps({'t0': s0, 't0.5': s5, 't1': s1}, indent=None)[:3000])
    check(not errors, 'no console errors: ' + '; '.join(errors))
    check(s0['players'] == 15, 'players created (15 non-clock tracks)')
    # move: parent scale 2 → document dx 100 = local 50. Element CTM e: 2*(10+50)=120 at t=1
    check(s0['mv'][4] == 20 and s1['mv'][4] == 120 and s1['mv'][5] == 70, 'move expressed in document px through scaled parent')
    check(abs(s5['mv'][4] - 70) < 0.01, 'linear move halfway')
    # rotate 90 about top-left (100,100): point (100,100) fixed; matrix a=0,b=1
    check(s1['rot'][:4] == [0, 1, -1, 0] and s1['rot'][4] == 200 and s1['rot'][5] == 0, 'rotate 90° clockwise about top-left pivot')
    check(s1['sc'][0] == 2 and s1['sc'][3] == 0.5 and s1['sc'][4] == -220 and s1['sc'][5] == 110, 'scale 200%x50% about centre')
    check(s5['fdWrapOpacity'] == '0.5' and s1['fdWrapOpacity'] == '0' and s1['fdOwn'] == '0.5', 'fade on wrapper, own opacity untouched')
    check(s0['drVis'] == 'hidden' and s5['dash'].startswith('50') and s1['dash'].startswith('100'), 'draw reveal 0 → 50% → 100%')
    check(s0['cnt'] == '050' and s5['cnt'] == '125' and s1['cnt'] == '200' and s1['cntX'] == '1', 'count from current text with padding, per-glyph x collapsed')
    check(s1['cnt2'] == '1,234.5' and s0['cnt2'] == '0.0', 'count with decimals and thousands separator')
    import datetime; check(s0['clk'] == datetime.datetime.now().strftime('%H:%M'), 'clock shows local time: ' + s0['clk'])
    check(s0['frames'] == ['v','hidden','hidden','hidden'], 'frames: first child at t=0 (through anonymous wrapper g)')
    f = at(0.25)['frames']; check(f == ['hidden','hidden','v','hidden'], 'frames: third child at 0.25/0.4')
    check(s5['stg'] == [0, 0, 50] and at(1.5)['stg'] == [50, 100, 100], 'stagger reverse: last child first, 0.5s apart')
    check(at(2.0)['stg'] == [100, 100, 100], 'stagger: all done at 2.0')
    m = at(1.0); check(m['multiOpacity'] == '0.5' and m['multi'][0] == -1 and m['multi'][4] == 1620, 'three tracks compose (move+fade+rotate)')
    # alternate infinite with pause: cycle 1.5s; t=1.2 → still at end (pause), t=2.0 → reversed halfway
    check(at(1.2)['loop'][4] == 100 and at(2.0)['loop'][4] == 50 and at(3.0)['loop'][4] == 0, 'alternate loop with pause between plays')
    # live: click & hover triggers
    page.evaluate('() => document.documentElement.__svgAnim.restart()')
    page.wait_for_timeout(300)
    st = page.evaluate(JS_STATE)
    check(st['click'][4] == 0 and st['hov'][0] == 1, 'click/hover tracks wait for their trigger')
    page.click('#clickme', force=True); page.wait_for_timeout(1200)
    check(page.evaluate(JS_STATE)['click'][4] == 100, 'click starts animation')
    page.hover('#hov', force=True); page.wait_for_timeout(500)
    check(page.evaluate(JS_STATE)['hov'][0] == 1.5, 'hover enter plays forward')
    page.mouse.move(5, 495); page.wait_for_timeout(500)
    check(page.evaluate(JS_STATE)['hov'][0] == 1, 'hover leave rewinds')
    # standalone check of image rendering
    page.screenshot(path=str(HERE / 'out' / 'synthetic.png'))
    b.close()
print('ALL PASSED' if not fails else f'{fails} FAILED')
