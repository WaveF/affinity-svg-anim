// Real-world export: the original affinity-svg AppleWatch.af, legacy names converted to tags by the fixture.
// Leaves its output in ~/Desktop/svganim-test-out for tests/real_test.py.
let fails = 0;
const check = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const D = app.userDesktopPath;
const doc = app.documents.load(D + '/svganim-test-AppleWatch.af');
try {
  const spread = Array.from(doc.spreads)[0];
  const legacy = []; forEachNode(spread, n => { const d = parseLegacyName(userName(n)); if (d) legacy.push({ n, d }); });
  // Convert like the dialog would: tag + suffix, legacy name replaced by the default name.
  const cb = CompoundCommandBuilder.create();
  for (const { n, d } of legacy) {
    const one = Selection.create(doc, [n]);
    cb.addCommand(DocumentCommand.createSetTagValueForKey(one, TAG_KEY, serializeData({ tracks: d.tracks, suffix: '__anim', auto: true })));
    cb.addCommand(DocumentCommand.createSetDescription(one, defaultName(n) + '__anim'));
  }
  doc.executeCommand(cb.createCommand(), false);
  const namesBefore = []; forEachNode(spread, n => namesBefore.push(userName(n)));
  const ctx = buildExportContext(doc);
  const base = { preset: ctx.presets[0], folder: D + '/svganim-test-out', html: true };
  const CDN = RUNTIME_CDN_URL;
  const t0 = Date.now();
  let r = exportAnimated(doc, Object.assign({}, base, { area: ctx.areas[0], baseName: 'watch-embed', runtime: 'embed', url: RUNTIME_CDN_URL }));
  console.log('export ms', Date.now() - t0, 'items', r.items.length, 'missing', JSON.stringify(r.missing));
  check(r.items.length === legacy.length && legacy.length === 63, '63 animated elements collected');
  check(!r.missing.length, 'all found in SVG');
  check(r.restored, 'restored flag');
  const namesAfter = []; forEachNode(spread, n => namesAfter.push(userName(n)));
  check(JSON.stringify(namesBefore) === JSON.stringify(namesAfter), 'every layer name identical after export (' + namesAfter.length + ' layers)');
  const svg = readText(r.written[0]);
  check((svg.match(/data-svganim='/g) || []).length === 63, '63 data-svganim attributes');
  check(!/svganimtok|__anim/.test(svg), 'no tokens or suffixes in SVG');
  check(svg.indexOf('<![CDATA[') > 0 && svg.lastIndexOf('</svg>') > svg.indexOf(']]></script>'), 'player embedded before </svg>');
  const ab = ctx.areas.find(a => a.kind === 'artboard');
  r = exportAnimated(doc, Object.assign({}, base, { area: ab, baseName: 'watch-link', runtime: 'link', url: CDN }));
  const svg2 = readText(r.written[0]);
  check(svg2.indexOf('href="' + CDN + '"') > 0 && !/CDATA/.test(svg2), 'Link: jsDelivr script tag, no embedded player');
  check(r.written.length === 2, 'Link with absolute URL writes only .svg + .html: ' + r.written.join(', '));
  r = exportAnimated(doc, Object.assign({}, base, { area: ab, baseName: 'watch-local', runtime: 'link', url: RUNTIME_FILE, html: false }));
  check(r.written.some(p => p.endsWith('/' + RUNTIME_FILE)), 'Link with a bare file name writes the player next to the SVG');
} catch (e) { fails++; console.log('ERROR', e.stack || e); }
finally { doc.close(); }
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
