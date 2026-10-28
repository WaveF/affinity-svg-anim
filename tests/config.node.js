const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const version = require('../package.json').version;
const files = new Map(), alerts = [];
let chosen = null, prompted = null, replace = true;
const modules = {
    '/application': {app: {
        userDesktopPath: '/test/Desktop',
        chooseFile: () => chosen,
        prompt: () => prompted,
        confirm: () => replace,
        alert: message => alerts.push(message)
    }},
    '/document': {}, '/commands': {}, '/selections': {}, '/dialog': {},
    '/fs': {exists: p => files.has(p), createDirectory: p => files.set(p, null), File: {
        create: p => ({writeString: t => files.set(p, t), close() {}}),
        readAll: p => {if (!files.has(p)) throw new Error('Missing file'); return files.get(p);}
    }}
};
const ctx = vm.createContext({require: name => modules[name]});
const src = fs.readFileSync(path.join(__dirname, '../dist/svg-anim-v' + version + '.js'), 'utf8').replace(/\nmain\(\);\s*$/, '\n');
vm.runInContext(src + '\nglobalThis.C={parseConfig,configText,importConfigText,attachConfig,normalizeTrack,newTrack};', ctx);
const C = ctx.C;
let slots = [C.newTrack('move'), null, C.newTrack('skew')];
slots[2].ax = 135; slots[2].ay = -120;
const anim = {slots: () => slots, replace: data => slots = data};
const ui = {config: {importButton: {}, exportButton: {}, clearButton: {}}, dialog: {isRunningModal: true}, mode: {selectedIndex: 1}, animate: {c: {suffix: {text: '__anim'}, exportAfter: {value: true}}}};
let refreshes = 0;
const valid = C.configText(anim, '__anim');
const parsed = C.parseConfig('\uFEFF' + valid);
assert.equal(parsed.tracks[1], null);
assert.equal(parsed.tracks[2].ax, 135);
assert.equal(parsed.tracks[2].ay, -120);
assert.equal(parsed.tracks[2].pivot, 'c');
const config = overrides => JSON.stringify({format: 'svg-anim-preset', schemaVersion: 1, tracks: [{type: 'fade'}], ...overrides});
for (const text of ['{', 'null', '[]', config({schemaVersion: 9}), config({tracks: Array(9).fill(null)}), config({tracks: [{type: 'unknown'}]}), config({tracks: [{type: 'fade', dur: -1}]}), config({tracks: [{type: 'move', ease: 'unknown'}]}), config({tracks: [{type: 'skew', ax: '20'}]}), config({tracks: [{type: 'move', x: true}]}), config({suffix: 3})]) {
    const before = JSON.stringify(slots);
    assert.throws(() => C.importConfigText(text, ui, anim));
    assert.equal(JSON.stringify(slots), before, 'invalid file cannot partially replace tracks');
}
C.attachConfig(ui, anim, {folder: '/test/Desktop/presets'}, () => refreshes++);
// Save uncommitted panel settings without applying them to a document.
prompted = '/test/Desktop/presets/roundtrip';
ui.config.exportButton.onClickHandler();
assert.equal(files.get(prompted + '.json'), valid);
assert.equal(ui.config.importButton.isEnabled, true);
assert.equal(ui.config.exportButton.isEnabled, true);
// Existing-file cancellation never truncates the file.
slots = [];
replace = false;
ui.config.exportButton.onClickHandler();
assert.equal(files.get(prompted + '.json'), valid);
chosen = prompted + '.json';
ui.config.importButton.onClickHandler();
assert.equal(slots[2].type, 'skew');
assert.equal(slots[1], null);
assert.equal(ui.mode.selectedIndex, 0);
assert.equal(ui.animate.c.exportAfter.value, false);
assert.equal(refreshes, 1);
// The same action can be clicked repeatedly; cancellation is a no-op.
chosen = null;
ui.config.importButton.onClickHandler();
assert.equal(refreshes, 1);
chosen = '/missing.json';
ui.config.importButton.onClickHandler();
assert.ok(alerts.some(x => /Missing file/.test(x)));
assert.equal(ui.config.importButton.isEnabled, true);
ui.animate.c.exportAfter.value = true;
ui.mode.selectedIndex = 1;
ui.config.clearButton.onClickHandler();
assert.equal(slots.length, 0);
assert.equal(ui.mode.selectedIndex, 0);
assert.equal(ui.animate.c.exportAfter.value, false);
console.log('config tests OK: JSON round trip, eight slots, strict validation, atomic import, action handlers, repeat clicks, cancellation and overwrite protection');
