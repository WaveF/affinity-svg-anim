// Native round trip: actual form, JSON, File API, tags and one-step undo.
const { DocumentPreset } = require('/document');
const { AddChildNodesCommandBuilder } = require('/commands');
const { ShapeNodeDefinition, NodeChildType } = require('/nodes');
const doc = Document.createFromPreset(DocumentPreset.all.filter(p => p.name.includes('A4'))[0], true);
let failures = 0;
const check = (condition, message) => { console.log(condition ? 'ok   ' + message : 'FAIL ' + message); if (!condition) failures++; };
const out = app.userDesktopPath + '/svganim-v030-test.json';
try {
    const b = AddChildNodesCommandBuilder.create(); b.addNode(ShapeNodeDefinition.createDefault());
    doc.executeCommand(b.createCommand(true, NodeChildType.Main));
    const node = doc.selection.at(0).node;
    const s = setupDialog(doc), c = s.ui.animate.c;
    check(s.ui.config.importButton.isEnabled && s.ui.config.exportButton.isEnabled, 'Config exposes two enabled momentary action buttons');
    check(c.effectSpace.isVisible && c.timingSpace.isVisible, 'None reserves effect and full timing space before runModal');
    c.track.selectedIndex = 7; s.onChange();
    c.type.selectedIndex = TYPES.indexOf('skew'); s.onChange();
    c.skewX.value = 135; c.skewY.value = -120; c.pivot.value = anchorValue('br');
    c.target.selectedIndex = 1; c.stagger.value = 0.25; c.ease.selectedIndex = EASES.indexOf('elasticOut'); s.onChange();
    check(c.skewX.noMinValue && c.skewX.noMaxValue && c.skewY.noMinValue && c.skewY.noMaxValue, 'native Skew editors have no min/max');
    check(!c.timingSpace.isVisible, 'all nine timing rows shown for Each child');
    const text = configText(s.anim, ' preset');
    check(JSON.parse(text).tracks[7].ax === 135 && JSON.parse(text).tracks[0] === null, 'preset captures uncommitted edits and empty track slots');
    writeText(out, text);
    const before = readNodeData(node).raw;
    c.exportAfter.value = true;
    importConfigText(readText(out), s.ui, s.anim); s.onChange();
    check(readNodeData(node).raw === before, 'import changes only the panel');
    check(!c.exportAfter.value && c.suffix.text === ' preset', 'import restores suffix and disables implicit SVG export');
    c.track.selectedIndex = 7; s.onChange();
    check(c.skewX.value === 135 && c.skewY.value === -120 && anchorKey(c.pivot.value) === 'br', 'import restores Skew and pivot in track 8');
    let rejected = false;
    try { importConfigText('{"format":"svg-anim-preset","schemaVersion":1,"tracks":[{"type":"fade"},{"type":"future"}]}', s.ui, s.anim); } catch (_) { rejected = true; }
    check(rejected && s.anim.peek()[0].type === 'skew', 'invalid import leaves the entire panel intact');
    const history = doc.history.size; performOk(doc, s);
    check(doc.history.size === history + 1 && readNodeData(node).data.tracks[0].type === 'skew', 'OK commits Skew in one history step');
    doc.undo();
    check(readNodeData(node).raw === before, 'one undo restores original animation');
} finally { try { fsApi.remove(out); } catch (_) {} doc.close(); }
console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
