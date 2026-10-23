// ---------------------------------------------------------------------------
// Dialog: mode switch on top, two shared columns, a line saying what OK does.
// ---------------------------------------------------------------------------

const MODES = ['animate', 'export'];
const MODE_LABELS = ['Animate', 'Export'];

function buildDialog(doc, state, ctx) {
    const dialog = Dialog.create(SCRIPT_TITLE);
    dialog.initialWidth = 760;
    const main = dialog.addColumn();
    const modeGroup = main.addGroup(null);
    const mode = modeGroup.addButtonSet('Mode', MODE_LABELS, state.items.length ? 0 : 1);
    const stack = main.addGroup(null).addColumnStack();
    const left = stack.addColumn();
    const right = stack.addColumn();
    const animate = buildAnimatePanel(doc, left, right, state);
    const exporter = buildExportPanel(left, right, ctx);
    const okLine = main.addGroup(null).addStaticText(null, '').setIsFullWidth();
    return { dialog, mode, animate, exporter, okLine };
}

function currentMode(ui) { return MODES[ui.mode.selectedIndex] || 'animate'; }

function okText(doc, ui, state, ctx, peekTracks) {
    const o = readExportOptions(ui.exporter.c, ctx);
    const target = svgPathOf(o);
    if (currentMode(ui) === 'export') {
        const n = animatedCount(doc, ctx, o.area);
        return n ? 'OK exports ' + n + ' animated element(s) to ' + target + '.' : 'Nothing to export: OK closes the dialog.';
    }
    const n = state.items.length;
    if (!n) return 'Nothing is selected: OK closes the dialog.';
    const tracks = peekTracks();
    const what = tracks.length
        ? 'OK writes ' + tracks.length + ' track(s) to ' + n + ' element(s)'
        : 'OK removes the animation from ' + n + ' element(s)';
    return what + (ui.animate.c.exportAfter.value ? ', then exports to ' + target + '.' : '.');
}

function updateDialog(doc, ui, state, ctx, peekTracks) {
    const animateMode = currentMode(ui) === 'animate';
    for (const g of ui.animate.groups) setVisible(g, animateMode);
    for (const g of ui.exporter.groups) setVisible(g, !animateMode);
    updateExportControls(doc, ui.exporter.c, ctx);
    ui.okLine.text = okText(doc, ui, state, ctx, peekTracks);
}

/** Builds and wires the whole dialog (no runModal), so tests can drive it. */
function setupDialog(doc) {
    const state = loadSelectionState(selectedNodes(doc)); // also satisfies runModal's selection access
    const ctx = buildExportContext(doc);
    const ui = buildDialog(doc, state, ctx);
    const anim = attachAnimate(ui.animate, state);
    const refresh = () => updateDialog(doc, ui, state, ctx, anim.peek);
    const onChange = () => {
        if (currentMode(ui) === 'animate') anim.onChange();
        refresh();
    };
    refresh();
    ui.dialog.onControlValueChangedHandler = onChange;
    return { state, ctx, ui, anim, onChange };
}

/** Carries out the OK action. Returns a message for the user, or null. */
function performOk(doc, s) {
    const { state, ctx, ui, anim } = s;
    if (currentMode(ui) === 'export') {
        const o = readExportOptions(ui.exporter.c, ctx);
        if (!animatedCount(doc, ctx, o.area)) return null;
        return exportReport(exportAnimated(doc, o));
    }
    if (!state.items.length) return null;
    const tracks = anim.collect();
    const suffix = cleanSuffix(String(ui.animate.c.suffix.text || ''));
    doc.executeCommand(buildApplyCommand(doc, state, tracks, suffix).command, false);
    if (!ui.animate.c.exportAfter.value) return null;
    return exportReport(exportAnimated(doc, readExportOptions(ui.exporter.c, ctx)));
}

function main() {
    const doc = Document.current;
    if (!doc) { app.alert('Please open a document first.', SCRIPT_TITLE); return; }
    try {
        const s = setupDialog(doc);
        const result = s.ui.dialog.runModal();
        if ((result?.value ?? result) !== DialogResult.Ok.value) return;
        const message = performOk(doc, s);
        if (message) app.alert(message, SCRIPT_TITLE);
    } catch (error) {
        app.alert(compactError(error), SCRIPT_TITLE);
    }
}
