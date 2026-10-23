// ---------------------------------------------------------------------------
// Export panel: export an SVG with animation data and the playback runtime.
// ---------------------------------------------------------------------------
// Affinity's SVG export does not include tags, so animated elements are briefly
// renamed to unique tokens (one command), exported, and the rename is undone.
// The tokens are then located in the SVG text and replaced by the real ids plus
// a data-svganim attribute.

const RUNTIME_FILE = 'svg-anim-runtime.min.js';
const RUNTIME_MODES = ['embed', 'link'];
const RUNTIME_LABELS = ['Embed', 'Link'];
const TOKEN_PREFIX = 'svganimtok';

function stripExtension(name) { return String(name || '').replace(/\.[A-Za-z0-9]{1,8}$/, ''); }
function safeFileName(name) {
    const s = String(name || '').replace(/[\/\\:*?"<>|\u0000-\u001f]+/g, '-').replace(/^[\s.]+|[\s.]+$/g, '');
    return s || 'animation';
}
function joinPath(dir, file) { return String(dir).replace(/\/+$/, '') + '/' + file; }
function xmlAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function homePath() {
    return String(app.userDesktopPath).replace(/\/+$/, '').replace(/\/Desktop$/, '');
}
function defaultFolder() {
    return joinPath(homePath(), 'Downloads/SVG Anim');
}

function isArtboardNode(node) {
    try { return node.isArtboardEnabled === true; } catch (_) { return false; }
}

/** Animated nodes under the given roots: [{node, data}] */
function collectAnimated(roots) {
    const out = [];
    for (const r of roots) {
        forEachNode(r, node => {
            const data = readNodeData(node).data;
            if (data) out.push({ node, data });
        });
    }
    return out;
}

function areaRoots(doc, area) {
    if (area.kind === 'artboard') return [area.node];
    if (area.kind === 'spread') return [doc.currentSpread];
    return Array.from(doc.spreads);
}

function exportArea(area) {
    if (area.kind === 'artboard') return FileExportArea.createForArtboard(area.node.artboardInterface);
    if (area.kind === 'spread') return FileExportArea.createForCurrentSpread();
    return null;
}

function svgPresetNames() {
    return FileExportOptions.allPresetNames.filter(n => /svg/i.test(n));
}

function runExportWithTokens(doc, items, path, presetName, area) {
    const builder = CompoundCommandBuilder.create();
    items.forEach((it, i) => {
        it.token = TOKEN_PREFIX + i + 'x';
        it.originalName = userName(it.node);
        builder.addCommand(DocumentCommand.createSetDescription(Selection.create(doc, [it.node]), it.token));
    });
    doc.executeCommand(builder.createCommand(), false);
    let records = null;
    try {
        // Synced instances share their name: only the last token written survives.
        for (const it of items) it.alias = userName(it.node) !== it.token ? userName(it.node) : null;
        records = doc.export(path, FileExportOptions.createWithPresetName(presetName), exportArea(area), null);
    } finally {
        doc.undo();
    }
    const restored = items.every(it => userName(it.node) === it.originalName);
    let error = null;
    if (records) {
        records.enumerate(rec => {
            const msg = rec.errorMessage;
            if (msg) error = msg;
            return 0;
        });
    }
    return { restored, error };
}

/** Rewrites token ids into real ids + data-svganim. Returns {svg, found:Set of item index}. */
function injectData(svg, items) {
    const used = new Set();
    svg.replace(/\sid="([^"]*)"/g, (m, id) => { used.add(id); return m; });
    const uniqueId = (name) => {
        let base = String(name).trim().replace(/[^\p{L}\p{N}_\-.]+/gu, '-').replace(/^-+|-+$/g, '');
        if (!base) return null;
        if (!/^[\p{L}_]/u.test(base)) base = '_' + base;
        let id = base, k = 1;
        while (used.has(id)) id = base + (k++);
        used.add(id);
        return id;
    };
    const byToken = new Map(items.map((it, i) => [it.token, i]));
    const found = new Set();
    const tagRe = new RegExp('<([A-Za-z][\\w:.-]*)(\\s[^>]*?\\bid="' + TOKEN_PREFIX + '(\\d+)x\\d*"[^>]*?)(/?)>', 'g');
    const out = svg.replace(tagRe, (m, tagName, attrs, idx, selfClose) => {
        const i = Number(idx);
        if (!byToken.has(TOKEN_PREFIX + i + 'x')) return m;
        const it = items[i];
        found.add(i);
        const a = attrs
            .replace(new RegExp('\\s(?:affinity|serif):id="' + TOKEN_PREFIX + '\\d+x\\d*"', 'g'), '')
            .replace(new RegExp('\\sid="' + TOKEN_PREFIX + '\\d+x\\d*"'), '');
        const name = it.exportName;
        const id = name ? uniqueId(name) : null;
        let extra = '';
        if (id) extra += ' id="' + xmlAttr(id) + '"';
        if (name && id !== name) extra += ' affinity:id="' + xmlAttr(name) + '"';
        const payload = { v: DATA_VERSION, n: childCount(it.node), tracks: it.data.tracks };
        extra += " data-svganim='" + JSON.stringify(payload).replace(/&/g, '&amp;').replace(/'/g, '&apos;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + "'";
        return '<' + tagName + extra + a + selfClose + '>';
    });
    // Synced instances: tokens that never appeared but share a name with one that did.
    items.forEach((it, i) => { if (it.alias && byToken.has(it.alias) && found.has(byToken.get(it.alias))) found.add(i); });
    return { svg: out, found };
}

function insertRuntime(svg, mode, url) {
    const at = svg.lastIndexOf('</svg>');
    if (at < 0) throw new Error('The exported file is not a valid SVG (no closing </svg> tag).');
    let tag;
    if (mode === 'embed') {
        if (RUNTIME_SOURCE.indexOf(']]>') >= 0) throw new Error('Runtime source cannot be embedded in CDATA.');
        tag = '<script type="text/javascript"><![CDATA[\n' + RUNTIME_SOURCE + '\n]]></script>\n';
    } else {
        tag = '<script type="text/javascript" href="' + xmlAttr(url) + '" xlink:href="' + xmlAttr(url) + '"></script>\n';
    }
    return svg.slice(0, at) + tag + svg.slice(at);
}

function htmlPreview(svg, title) {
    const body = svg.replace(/^\s*<\?xml[^>]*\?>\s*/, '').replace(/^\s*<!DOCTYPE[^>]*>\s*/i, '');
    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
        '<title>' + xmlAttr(title) + '</title>\n<style>html,body{margin:0;height:100%;background:#f3f3f3}body>svg{display:block;width:100%;height:100%}</style>\n' +
        '</head>\n<body>\n' + body + '\n</body>\n</html>\n';
}

function writeText(path, text) {
    const f = File.create(path, 'wb');
    try { f.writeString(text); } finally { f.close(); }
}
function readText(path) {
    return File.readAll(path).toString();
}
function isRelativeUrl(url) {
    return !/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith('/');
}

// ------------------------------------------------------------------- panel
function buildExportContext(doc) {
    const presets = svgPresetNames();
    if (!presets.length) throw new Error('No SVG export presets were found.');
    const docName = stripExtension(doc.title || 'animation');
    const areas = [
        { kind: 'document', label: 'Whole document', fileBase: docName },
        { kind: 'spread', label: 'Current spread', fileBase: docName }
    ];
    const artboards = [];
    if (doc.currentSpread) forEachNode(doc.currentSpread, node => { if (isArtboardNode(node)) artboards.push(node); });
    for (const ab of artboards) {
        const name = displayName(ab) || 'Artboard';
        areas.push({ kind: 'artboard', node: ab, label: 'Artboard: ' + name, fileBase: docName + ' - ' + name });
    }
    // Default to the artboard containing the selection, if any.
    let defaultArea = 0;
    if (doc.selection.length && artboards.length) {
        for (let p = doc.selection.at(0).node; p; p = p.parent) {
            const k = artboards.findIndex(ab => ab.isSameNode(p));
            if (k >= 0) { defaultArea = 2 + k; break; }
        }
    }
    return { areas, presets, folder: defaultFolder(), defaultArea, countCache: new Map() };
}

function buildExportPanel(left, right, ctx) {
    const c = {};
    const groups = [];
    const out = left.addGroup('Output'); groups.push(out);
    c.area = out.addComboBox('Export', ctx.areas.map(a => a.label), ctx.defaultArea);
    c.preset = out.addComboBox('SVG preset', ctx.presets, 0);
    c.folder = out.addTextBox('Folder', ctx.folder);
    c.file = out.addTextBox('File name (blank = automatic)', '');
    c.html = out.addSwitch('Also write an HTML preview page', true);
    c.fileHint = out.addStaticText(null, '').setIsFullWidth();

    const rt = right.addGroup('Player'); groups.push(rt);
    c.runtime = rt.addButtonSet('Player', RUNTIME_LABELS, 0);
    c.url = rt.addTextBox('Script URL', RUNTIME_CDN_URL);
    c.rtHint = rt.addStaticText(null, '').setIsFullWidth();

    const sum = right.addGroup('Content'); groups.push(sum);
    c.summary = sum.addStaticText(null, '').setIsFullWidth();
    return { c, groups };
}

function readExportOptions(c, ctx) {
    const area = ctx.areas[c.area.selectedIndex] || ctx.areas[0];
    const fileText = String(c.file.text || '').trim();
    return {
        area,
        preset: ctx.presets[c.preset.selectedIndex] || ctx.presets[0],
        folder: String(c.folder.text || '').trim() || ctx.folder,
        baseName: safeFileName(stripExtension(fileText) || area.fileBase),
        runtime: RUNTIME_MODES[c.runtime.selectedIndex] || 'embed',
        url: String(c.url.text || '').trim() || RUNTIME_CDN_URL,
        html: !!c.html.value
    };
}

function animatedCount(doc, ctx, area) {
    if (!ctx.countCache.has(area.label)) ctx.countCache.set(area.label, collectAnimated(areaRoots(doc, area)).length);
    return ctx.countCache.get(area.label);
}

function svgPathOf(o) { return joinPath(o.folder, o.baseName + '.svg'); }

function updateExportControls(doc, c, ctx) {
    const o = readExportOptions(c, ctx);
    setVisible(c.url, o.runtime === 'link');
    c.rtHint.text = o.runtime === 'embed'
        ? 'The player (about ' + Math.round(RUNTIME_SOURCE.length / 1024) + ' KB) is embedded in the SVG, so it plays offline as a single file.'
        : 'The SVG loads the player from this URL (needs internet; cached across SVGs). A file name without a folder also writes the player next to the SVG.';
    c.fileHint.text = 'Writes ' + svgPathOf(o) + (o.html ? ' and .html' : '');
    const n = animatedCount(doc, ctx, o.area);
    c.summary.text = n
        ? n + ' animated element(s) in this area.'
        : 'No animated elements in this area yet. Add animations in Animate mode.';
}

function exportAnimated(doc, o) {
    const items = collectAnimated(areaRoots(doc, o.area));
    if (!items.length) throw new Error('No animated elements found in the chosen area.');
    for (const it of items) it.exportName = exportName(it.node, it.data);
    const denied = () => new Error('Affinity does not allow scripts to write to "' + o.folder + '". Allow this folder in Affinity\'s Scripting settings, or choose a folder on the Desktop.');
    try { fsApi.createDirectories(o.folder); } catch (e) {
        if (/PERMISSION/i.test(compactError(e))) throw denied();
        throw new Error('Cannot create folder "' + o.folder + '": ' + compactError(e));
    }
    const svgPath = svgPathOf(o);
    let res;
    try {
        res = runExportWithTokens(doc, items, svgPath, o.preset, o.area);
    } catch (e) {
        if (/PERMISSION/i.test(compactError(e))) throw denied();
        throw e;
    }
    if (res.error) throw new Error('Affinity export failed: ' + res.error);
    const injected = injectData(readText(svgPath), items);
    const finalSvg = insertRuntime(injected.svg, o.runtime, o.url);
    writeText(svgPath, finalSvg);
    const written = [svgPath];
    if (o.runtime === 'link' && isRelativeUrl(o.url) && !o.url.includes('/')) {
        const p = joinPath(o.folder, o.url);
        writeText(p, RUNTIME_SOURCE + '\n');
        written.push(p);
    }
    if (o.html) {
        const p = joinPath(o.folder, o.baseName + '.html');
        writeText(p, htmlPreview(finalSvg, o.baseName));
        written.push(p);
    }
    const missing = items.filter((_, i) => !injected.found.has(i)).map(it => it.exportName || displayName(it.node));
    return { items, written, missing, restored: res.restored };
}

function exportReport(r) {
    const lines = ['Exported ' + (r.items.length - r.missing.length) + ' animated element(s).', '', ...r.written];
    if (r.missing.length) {
        lines.push('', 'Not found in the SVG (hidden, outside the area, or merged by the preset):');
        lines.push(...r.missing.slice(0, 12).map(n => '• ' + n));
        if (r.missing.length > 12) lines.push('• … ' + (r.missing.length - 12) + ' more');
    }
    if (!r.restored) lines.push('', 'Warning: some layer names may not have been restored. Check the History panel.');
    return lines.join('\n');
}
