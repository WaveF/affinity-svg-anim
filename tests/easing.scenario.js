// Native Affinity dialog/metadata test. Creates and closes only its own document.
const { DocumentPreset } = require('/document');
const { AddChildNodesCommandBuilder } = require('/commands');
const { ShapeNodeDefinition, NodeChildType } = require('/nodes');
const presets = DocumentPreset.all;
const doc = Document.createFromPreset(presets.find(p => p.name.includes('A4')) || presets[0], true);
let checks = 0;
function check(ok, message) { checks++; if (!ok) throw new Error(message); }
try {
    const builder = AddChildNodesCommandBuilder.create();
    builder.addNode(ShapeNodeDefinition.createDefault());
    doc.executeCommand(builder.createCommand(true, NodeChildType.Main));
    const node = Array.from(doc.layers)[0];
    doc.executeCommand(DocumentCommand.createSetSelection(Selection.create(doc, [node])));
    let session = setupDialog(doc);
    check(EASES.length === 31 && EASE_LABELS.length === 31, '31 easing choices');
    session.ui.animate.c.type.selectedIndex = TYPES.indexOf('move');
    session.onChange();
    check(EASES[session.ui.animate.c.ease.selectedIndex] === 'inOut', 'default remains Cubic in-out');
    for (let i = 0; i < EASES.length; i++) {
        const ease = EASES[i];
        session.ui.animate.c.ease.selectedIndex = i;
        session.onChange();
        performOk(doc, session);
        check(readNodeData(node).data.tracks[0].ease === ease, ease + ' saved');
        const saved = readNodeData(node).raw;
        session = setupDialog(doc);
        check(session.ui.animate.c.ease.selectedIndex === i, ease + ' reselected');
        performOk(doc, session);
        check(readNodeData(node).raw === saved, ease + ' unchanged on reopen/OK');
        console.log('ok', EASE_LABELS[i], '(' + ease + ')');
    }
    console.log('ALL PASSED:', checks, 'native dialog / metadata checks');
} finally {
    doc.close();
}
