// Builds the Affinity script and the browser runtime.
// Usage: npm run build            (or: node build.js)
// Output: dist/svg-anim-v<VERSION>.js, dist/svg-anim-runtime.js, dist/svg-anim-runtime.min.js
// Optional: AFFINITY_EXPORTS=/path/to/dir also copies the Affinity script there.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const VERSION = require('./package.json').version;
const REPO = 'WaveF/affinity-svg-anim';
// jsDelivr serves files from the git tag v<VERSION>; the tag must contain dist/svg-anim-runtime.min.js.
const CDN_URL = 'https://cdn.jsdelivr.net/gh/' + REPO + '@v' + VERSION + '/dist/svg-anim-runtime.min.js';

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');

fs.mkdirSync(DIST, { recursive: true });
for (const f of fs.readdirSync(DIST)) {
    if (/^svg-anim-v\d+\.\d+\.\d+\.js$/.test(f)) fs.unlinkSync(path.join(DIST, f)); // older script builds live in git history
}

// ---- runtime
const runtimeSrc = read('runtime.js').replace(/runtime v\d+\.\d+\.\d+/, 'runtime v' + VERSION).replace(/version: '\d+\.\d+\.\d+'/, "version: '" + VERSION + "'");
fs.writeFileSync(path.join(DIST, 'svg-anim-runtime.js'), runtimeSrc);
const esbuild = path.join(__dirname, 'node_modules', '.bin', 'esbuild');
const minified = execFileSync(esbuild, ['--minify', '--target=es2017', '--legal-comments=inline', '--log-level=warning'], { input: runtimeSrc, encoding: 'utf8' }).trim();
if (minified.includes(']]>')) throw new Error('minified runtime contains ]]>');
fs.writeFileSync(path.join(DIST, 'svg-anim-runtime.min.js'), minified + '\n');

// ---- Affinity script
const NAME = 'SVG Anim';
const DESCRIPTION = 'Animate elements and export them as an animated SVG, in one dialog. Animate mode: up to eight tracks per element (Fade, Move, Rotate, Scale, Draw stroke, Count number, Clock, Frames) with duration, delay, stagger, easing, direction, repeats and start trigger (load, visible, click, hover), stored in the element metadata and shown again when reselected; animated layers get a name suffix (default __anim). Export mode: the document, current spread or an artboard as SVG with the animation data and an embedded or linked (jsDelivr) player, plus an optional HTML preview page.';
const header = [
    '/**',
    ' * name: ' + NAME,
    ' * version: ' + VERSION,
    ' * description: ' + DESCRIPTION,
    ' * author: WaveF',
    ' * email: wavef@live.com',
    ' * website: https://minicg.com',
    ' * source: https://github.com/' + REPO,
    ' * license: MIT',
    ' */',
    "'use strict';",
    '',
    "const { app } = require('/application');",
    "const { Document, FileExportOptions, FileExportArea } = require('/document');",
    "const { DocumentCommand, CompoundCommandBuilder } = require('/commands');",
    "const { Selection } = require('/selections');",
    "const { Dialog, DialogResult, UnitType, SpatialAnchor } = require('/dialog');",
    "const { File } = require('/fs');",
    "const fsApi = require('/fs');",
    '',
    "const SCRIPT_NAME = '" + NAME + "';",
    "const VERSION = '" + VERSION + "';",
    "const SCRIPT_TITLE = SCRIPT_NAME + ' v' + VERSION;",
    'const RUNTIME_CDN_URL = ' + JSON.stringify(CDN_URL) + ';',
    'const RUNTIME_SOURCE = ' + JSON.stringify(minified) + ';',
    ''
].join('\n');
const body = header + '\n' + ['core.js', 'animate.js', 'export.js', 'main.js'].map(read).join('\n') + '\nmain();\n';
const scriptName = 'svg-anim-v' + VERSION + '.js';
const outPath = path.join(DIST, scriptName);
fs.writeFileSync(outPath, body);
execFileSync('node', ['--check', outPath]);
if (process.env.AFFINITY_EXPORTS) fs.copyFileSync(outPath, path.join(process.env.AFFINITY_EXPORTS, scriptName));
console.log('built dist/' + scriptName, Buffer.byteLength(body), 'bytes');
console.log('runtime', Buffer.byteLength(runtimeSrc), 'bytes, minified', Buffer.byteLength(minified), 'bytes');
console.log('CDN', CDN_URL);
