// Run after npm run build. Exercises the actual runtime, built script and form.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const version = require('../package.json').version;
const anchors = Object.fromEntries(['TopLeft','TopCentre','TopRight','CentreLeft','Centre','CentreRight','BottomLeft','BottomCentre','BottomRight'].map((k, value) => [k, {value}]));
const files = new Map();
const modules = {
    '/application': {}, '/document': {}, '/commands': {}, '/selections': {},
    '/dialog': {UnitType: {}, SpatialAnchor: anchors},
    '/fs': {File: {create: name => ({writeString: text => files.set(name, text), close() {}})}}
};
const context = vm.createContext({require: name => modules[name]});
const built = read('dist/svg-anim-v' + version + '.js').replace(/\nmain\(\);\s*$/, '\n');
vm.runInContext(built + '\nglobalThis.api = {EASES,EASE_LABELS,COMMON_DEFAULTS,normalizeTrack,normalizeData,serializeData,newTrack,buildAnimatePanel,loadSelectionState,loadForm,readForm,attachAnimate,insertRuntime,writeText,RUNTIME_SOURCE,RUNTIME_CDN_URL};', context);
const C = context.api;
const ids = Array.from(C.EASES);
const families = ['Sine','Quad','Cubic','Quart','Quint','Expo','Circ','Back','Elastic','Bounce'];
assert.equal(ids.length, 31);
assert.equal(new Set(ids).size, 31);
assert.deepEqual(Array.from(C.EASE_LABELS), ['Linear', ...families.flatMap(f => ['in','out','in-out'].map(d => f + ' ' + d))]);
assert.equal(C.COMMON_DEFAULTS.ease, 'inOut');
assert.equal(C.newTrack('count').ease, 'out');

// A minimal dialog host verifies real panel indices, reload and track switching.
const ctl = values => Object.assign({isVisible: true, setIsFullWidth() { return this; }}, values);
const group = {
    addGroup() { return this; },
    addStaticText: (label, text) => ctl({text}),
    addComboBox: (label, labels, selectedIndex) => ctl({labels, selectedIndex}),
    addButtonSet: (label, labels, selectedIndex) => ctl({labels, selectedIndex}),
    addUnitValueEditor: (label, unit, docUnit, value) => ctl({value}),
    addSpatialAnchor: (label, anchor) => ctl({value: anchor.value}),
    addTextBox: (label, text) => ctl({text}),
    addSwitch: (label, value) => ctl({value})
};
const state = C.loadSelectionState([]);
const panel = C.buildAnimatePanel({units: 0}, group, group, state);
assert.equal(panel.c.ease.labels[panel.c.ease.selectedIndex], 'Cubic in-out');
for (const ease of ids) {
    const track = C.normalizeTrack({type: 'move', ease});
    const data = C.normalizeData(JSON.parse(C.serializeData({tracks: [track], suffix: '__anim'})));
    assert.equal(data.tracks[0].ease, ease, ease + ' survives metadata round trip');
    C.loadForm(panel.c, data.tracks[0]);
    assert.equal(C.readForm(panel.c).ease, ease, ease + ' survives form round trip');
    const binding = C.attachAnimate(panel, {...state, tracks: [track]});
    panel.c.track.selectedIndex = 1; binding.onChange();
    panel.c.track.selectedIndex = 0; binding.onChange();
    assert.equal(binding.collect()[0].ease, ease, ease + ' survives track switching');
}

// Run unmodified player code using text nodes. Its public seek() performs Count
// rendering, so missing names cannot silently fall back to the default curve.
function runtime(source, easeIds = ids) {
    const nodes = easeIds.map(ease => ({
        localName: 'text', textContent: '0', style: {}, firstElementChild: null,
        getAttribute(name) { return name === 'data-svganim' ? JSON.stringify({v: 1, tracks: [{type: 'count', start: 0, end: 100, decimals: 4, ease, dur: 1, loops: 1, dir: 'normal'}]}) : null; },
        removeAttribute() {}
    }));
    const svg = {querySelectorAll: () => nodes};
    const warnings = [];
    const log = {warn: (...args) => warnings.push(args)};
    vm.runInNewContext(source, {document: {documentElement: svg}, window: {requestAnimationFrame() {}, console: log}, console: log});
    assert.equal(warnings.length, 0, 'runtime does not skip tracks');
    assert.equal(svg.__svgAnim.players.length, easeIds.length);
    return {api: svg.__svgAnim, nodes, ease: Object.fromEntries(svg.__svgAnim.players.map(p => [p.spec.ease, p.ease]))};
}
const source = runtime(read('src/runtime.js'));
const bundle = runtime(read('dist/svg-anim-runtime.min.js'));
const linked = runtime(read('dist/svg-anim-runtime.js'));
const embedded = C.insertRuntime('<svg></svg>', 'embed', '').match(/<!\[CDATA\[\n([\s\S]*?)\n\]\]>/)[1];
assert.equal(embedded, C.RUNTIME_SOURCE);
assert.equal(embedded.trim(), read('dist/svg-anim-runtime.min.js').trim());
const embed = runtime(embedded);
const relative = C.insertRuntime('<svg></svg>', 'link', 'svg-anim-runtime.min.js');
assert.ok(relative.includes('href="svg-anim-runtime.min.js"'));
C.writeText('svg-anim-runtime.min.js', C.RUNTIME_SOURCE + '\n');
assert.equal(files.get('svg-anim-runtime.min.js'), read('dist/svg-anim-runtime.min.js'));
assert.ok(C.RUNTIME_CDN_URL.includes('@v' + version + '/'));
for (const r of [bundle, linked, embed]) assert.equal(r.api.version, version);
const near = (actual, expected, msg, epsilon = 1e-12) => assert.ok(Math.abs(actual - expected) <= epsilon, msg + ': ' + actual + ' != ' + expected);
const E = bundle.ease;
for (const id of ids) {
    near(E[id](0), 0, id + ' begins at zero');
    near(E[id](1), 1, id + ' ends at one');
    for (let i = 0; i <= 1000; i++) {
        const t = i / 1000, value = E[id](t);
        assert.ok(Number.isFinite(value), id + ' is finite');
        for (const r of [source, linked, embed]) near(r.ease[id](t), value, id + ' build agrees');
    }
}
for (const family of families) {
    const base = family.toLowerCase();
    const [a, b, c] = family === 'Cubic' ? ['in','out','inOut'] : [base + 'In', base + 'Out', base + 'InOut'];
    near(E[c](0.5), 0.5, family + ' in-out midpoint');
    for (let i = 0; i <= 1000; i++) {
        const t = i / 1000;
        near(E[a](t), 1 - E[b](1 - t), family + ' in/out mirrors', 1e-10);
        near(E[c](t), 1 - E[c](1 - t), family + ' in-out symmetry', 1e-10);
        if (!['Back','Elastic','Bounce'].includes(family)) {
            for (const id of [a,b,c]) {
                assert.ok(E[id](t) >= -1e-12 && E[id](t) <= 1 + 1e-12, id + ' stays bounded');
                if (i) assert.ok(E[id](t) >= E[id]((i - 1) / 1000) - 1e-12, id + ' is monotone');
            }
        }
    }
}
// Independent landmark values distinguish power orders, trig and bounce shapes.
for (const [id, t, expected] of [
    ['linear', .25, .25], ['sineIn', .5, 1 - Math.SQRT1_2], ['sineOut', .5, Math.SQRT1_2],
    ['quadIn', .5, 1/4], ['in', .5, 1/8], ['quartIn', .5, 1/16], ['quintIn', .5, 1/32],
    ['expoIn', .5, 1/32], ['circIn', .5, 1 - Math.sqrt(3)/2],
    ['elasticIn', .5, -1/64], ['elasticOut', .5, 65/64],
    ['bounceOut', .5, 49/64], ['bounceIn', .5, 15/64], ['bounceInOut', .25, 15/128]
]) near(E[id](t), expected, id + ' landmark');
for (const family of ['back','elastic']) {
    const values = id => Array.from({length: 1001}, (_, i) => E[id](i / 1000));
    assert.ok(Math.min(...values(family + 'In')) < 0, family + ' in undershoots');
    assert.ok(Math.max(...values(family + 'Out')) > 1, family + ' out overshoots');
    const both = values(family + 'InOut');
    assert.ok(Math.min(...both) < 0 && Math.max(...both) > 1, family + ' in-out preserves both overshoots');
}
// Frozen v0.2.1 release: every old easing retains its numerical behavior.
const oldSource = execFileSync('git', ['show', 'v0.2.1:dist/svg-anim-runtime.min.js'], {cwd: root, encoding: 'utf8'});
const oldIds = ['linear','in','out','inOut','sineInOut','expoInOut','backIn','backOut','backInOut','elasticOut','bounceOut'];
const old = runtime(oldSource, oldIds);
for (const id of oldIds) for (let i = 0; i <= 1000; i++) near(E[id](i / 1000), old.ease[id](i / 1000), id + ' v0.2.1 compatibility');
for (const r of [bundle, linked, embed]) {
    for (const t of [0, .125, .25, .5, .75, .875, 1]) {
        r.api.seek(t);
        ids.forEach((id, i) => near(Number(r.nodes[i].textContent), 100 * E[id](t), id + ' renders at ' + t, 0.000051));
    }
}
console.log('easing tests OK: 31 options, form/track round trips, 1001 samples per curve, 11 legacy curves, source/minified/embedded players and seek rendering');
