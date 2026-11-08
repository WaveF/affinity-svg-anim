// v0.5.0: Each child marks only first-level children in Layers panel order; Blur form and data.
// Creates and closes its own document. Leaves the SVG in ~/Desktop/svganim-test-out for
// tests/children_blur_test.py.
const { DocumentPreset } = require('/document');
const { AddChildNodesCommandBuilder, InsertionMode } = require('/commands');
const { ShapeNodeDefinition, NodeChildType } = require('/nodes');
const { Transform } = require('/geometry');
let fails = 0;
const check = (ok, message) => { console.log((ok ? 'ok   ' : 'FAIL ') + message); if (!ok) fails++; };
const OUT = app.userDesktopPath + '/svganim-test-out';
const doc = Document.createFromPreset(DocumentPreset.all.filter(p => p.name.includes('A4'))[0], true);
try {
    let k = 0;
    const shape = () => {
        const b = AddChildNodesCommandBuilder.create();
        b.setInsertionTarget(doc.currentSpread);
        b.setInsertionMode(InsertionMode.Inside_AtFront);
        b.addNode(ShapeNodeDefinition.createDefault());
        const cmd = b.createCommand(false, NodeChildType.Main);
        doc.executeCommand(cmd);
        const n = cmd.newNodes[0];
        doc.executeCommand(DocumentCommand.createTransform(Selection.create(doc, [n]), Transform.createTranslate(150 * (++k), 100)));
        return n;
    };
    const name = (n, s) => doc.executeCommand(DocumentCommand.createSetDescription(Selection.create(doc, [n]), s));
    // Inside_AtFront inserts at index 0 of the child list (bottom of the z-order, first in the SVG),
    // so the first shape created ends up as the top layer.
    const top = shape(); name(top, 'Top');
    const g1 = shape(), g2 = shape(); name(g1, 'Deep');
    doc.groupNodes(Selection.create(doc, [g1, g2])); const pair = g1.parent;
    const bottom = shape();
    doc.groupNodes(Selection.create(doc, [bottom, pair, top])); const outer = top.parent;
    check(childNodes(outer)[0].isSameNode(bottom) && childNodes(outer)[2].isSameNode(top), 'node.children lists the bottom layer first');
    name(outer, 'Outer');
    // A single-group parent: v0.4.1 descended into the inner group's children.
    const s1 = shape(), s2 = shape();
    doc.groupNodes(Selection.create(doc, [s1, s2])); const inner = s1.parent;
    doc.groupNodes(Selection.create(doc, [inner])); const wrap = inner.parent;
    name(wrap, 'Wrap');

    const each = Object.assign(newTrack('move'), { target: 'children', stagger: 0.5, ease: 'linear', dir: 'normal', loops: 1, x: 0, y: 100 });
    doc.executeCommand(buildApplyCommand(doc, loadSelectionState([outer, wrap]), [each], '__anim').command, false);
    // Blur on an Each child target that is itself animated, through the native form.
    doc.executeCommand(DocumentCommand.createSetSelection(Selection.create(doc, [bottom])));
    const s = setupDialog(doc), c = s.ui.animate.c;
    c.type.selectedIndex = TYPES.indexOf('blur'); s.onChange();
    check(c.blurFrom.isVisible && c.blurTo.isVisible && !c.fadeFrom.isVisible && c.target.isVisible, 'Blur shows its two radius editors and Apply to');
    check(c.blurFrom.value === 0 && c.blurTo.value === 10, 'Blur defaults 0 → 10 px');
    c.blurTo.value = 12; c.dir.selectedIndex = DIRS.indexOf('normal'); c.ease.selectedIndex = EASES.indexOf('linear'); c.loops.value = 1; s.onChange();
    c.track.selectedIndex = 1; s.onChange();
    c.type.selectedIndex = TYPES.indexOf('fade'); s.onChange();
    check(c.fadeFrom.value === 100 && c.fadeTo.value === 0, 'Fade on another track keeps its own defaults');
    c.track.selectedIndex = 0; s.onChange();
    check(c.blurTo.value === 12, 'Blur value survives track switching');
    c.track.selectedIndex = 1; s.onChange(); c.type.selectedIndex = 0; s.onChange();
    performOk(doc, s);
    const td = readNodeData(bottom).data;
    check(td && td.tracks.length === 1 && td.tracks[0].type === 'blur' && td.tracks[0].from === 0 && td.tracks[0].to === 12, 'Blur saved as {from:0,to:12}');
    doc.executeCommand(DocumentCommand.createSetSelection(Selection.create(doc, [bottom])));
    const r2 = setupDialog(doc);
    check(TYPES[r2.ui.animate.c.type.selectedIndex] === 'blur' && r2.ui.animate.c.blurTo.value === 12, 'Blur reselected in the panel');
    check(normalizeTrack({ type: 'blur', from: -3, to: 'x' }).from === 0 && normalizeTrack({ type: 'blur', to: 'x' }).to === 10, 'Blur radius clamps at 0 and defaults');

    const names = []; forEachNode(doc.currentSpread, n => names.push(userName(n)));
    const ctx = buildExportContext(doc);
    const r = exportAnimated(doc, { area: ctx.areas[0], preset: ctx.presets[0], folder: OUT, baseName: 'children-blur', runtime: 'embed', url: RUNTIME_CDN_URL, html: false });
    const after = []; forEachNode(doc.currentSpread, n => after.push(userName(n)));
    check(JSON.stringify(names) === JSON.stringify(after) && r.restored, 'every layer name restored, including temporarily marked children');
    check(!r.missing.length && r.items.length === 3, 'three animated elements exported');
    const svg = readText(r.written[0]);
    console.log(svg.replace(/^[\s\S]*?<svg/, '<svg').replace(/<script[\s\S]*$/, ''));
    check(!/svganimtok/.test(svg), 'no tokens left');
    check((svg.match(/data-svganim-c="/g) || []).length === 4, 'four first-level children marked (3 + 1), none deeper');
    check(/<g id="Outer" data-svganim='\{"v":1,"n":3,"c":1,/.test(svg) && /<g id="Wrap" data-svganim='\{"v":1,"n":1,"c":1,/.test(svg), 'Each child payloads flagged with c');
    check(/id="Top"[^>]*data-svganim-c="0"/.test(svg), 'top layer = position 0');
    check(/data-svganim='\{"v":1,"n":0,"tracks":\[\{"type":"blur"[^>]*data-svganim-c="2"/.test(svg), 'animated bottom child keeps its own data and is position 2');
    check(svg.indexOf('data-svganim-c="2"') < svg.indexOf('data-svganim-c="0"', svg.indexOf('id="Outer"')), 'SVG paint order runs from position 2 (bottom) to 0 (top)');
    check(/id="Deep"/.test(svg) && !/id="Deep"[^>]*data-svganim-c/.test(svg), 'grandchild keeps its id but is not marked');
} catch (e) { fails++; console.log('ERROR', e.stack || e); }
finally { doc.close(); }
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
