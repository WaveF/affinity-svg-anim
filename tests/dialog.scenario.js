// Drives the combined dialog without runModal: modes, tracks, suffix, OK actions.
const { DocumentPreset } = require('/document');
const { AddChildNodesCommandBuilder } = require('/commands');
const { ShapeNodeDefinition, NodeChildType } = require('/nodes');
const fsMod = require('/fs');
let fails = 0;
const check = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const OUT = app.userDesktopPath + '/svganim-test-out';
const doc = Document.createFromPreset(DocumentPreset.all.filter(p => p.name.includes('A4'))[0], true);
const select = nodes => doc.executeCommand(DocumentCommand.createSetSelection(Selection.create(doc, nodes)));
try {
  for (let i = 0; i < 3; i++) { const b = AddChildNodesCommandBuilder.create(); b.addNode(ShapeNodeDefinition.createDefault()); doc.executeCommand(b.createCommand(true, NodeChildType.Main)); }
  const [A, B, Cn] = Array.from(doc.layers);
  doc.executeCommand(DocumentCommand.createSetDescription(Selection.create(doc, [B]), 'Heart'));
  const dflt = defaultName(A);

  // ---------------------------------------------------------------- no selection
  select([]);
  let s = setupDialog(doc);
  check(currentMode(s.ui) === 'export', 'no selection → starts in Export mode');
  check(s.ui.exporter.groups.every(g => g.isVisible) && s.ui.animate.groups.every(g => !g.isVisible), 'Export mode: only export groups visible');
  check(s.ctx.folder === homePath() + '/Downloads/SVG Anim' && s.ui.exporter.c.folder.text === s.ctx.folder, 'default folder is ~/Downloads/SVG Anim');
  check(s.ui.exporter.c.runtime.selectedIndex === 0 && !s.ui.exporter.c.url.isVisible, 'player defaults to Embed, URL hidden');
  s.ui.exporter.c.runtime.selectedIndex = 1; s.onChange();
  check(s.ui.exporter.c.url.isVisible && s.ui.exporter.c.url.text === RUNTIME_CDN_URL && /^https:\/\/cdn\.jsdelivr\.net\/gh\/WaveF\/affinity-svg-anim@v\d+\.\d+\.\d+\/dist\/svg-anim-runtime\.min\.js$/.test(RUNTIME_CDN_URL), 'Link shows jsDelivr URL');
  console.log('okLine:', s.ui.okLine.text);
  check(/^Nothing to export/.test(s.ui.okLine.text), 'OK line: nothing to export');
  s.ui.mode.selectedIndex = 0; s.onChange();
  check(s.ui.animate.groups.every(g => g.isVisible) && s.ui.exporter.groups.every(g => !g.isVisible), 'switch to Animate: only animate groups visible');
  check(/^Nothing is selected/.test(s.ui.okLine.text), 'OK line: nothing selected');
  check(performOk(doc, s) === null && doc.history.size >= 0, 'OK with nothing selected does nothing');

  // ---------------------------------------------------------------- animate A
  select([A]);
  s = setupDialog(doc);
  const c = s.ui.animate.c;
  check(currentMode(s.ui) === 'animate', 'selection → starts in Animate mode');
  check(c.suffix.text === '__anim', 'suffix defaults to __anim');
  const lines = c.summary.text.split('\n');
  check(lines.length === 2 && /^1▸– /.test(lines[0]) && /^5 – /.test(lines[1]) && /8 –$/.test(lines[1]), 'summary: two lines, 1–4 and 5–8');
  c.type.selectedIndex = TYPES.indexOf('move'); s.onChange();
  c.moveX.value = 50; s.onChange();
  c.track.selectedIndex = 7; s.onChange();
  check(c.type.selectedIndex === 0, 'track 8 starts as None');
  c.type.selectedIndex = TYPES.indexOf('rotate'); s.onChange();
  c.track.selectedIndex = 4; s.onChange();
  c.type.selectedIndex = TYPES.indexOf('fade'); s.onChange();
  console.log('summary:\n' + c.summary.text);
  const sl = c.summary.text.split('\n');
  check(/^1 Move 50,-20/.test(sl[0]) && /5▸Fade 100→0%/.test(sl[1]) && /8 Rotate 360°$/.test(sl[1]), 'summary reflects tracks 1, 5 and 8');
  console.log('okLine:', s.ui.okLine.text);
  check(/^OK writes 3 track\(s\) to 1 element\(s\)\.$/.test(s.ui.okLine.text), 'OK line counts 3 tracks');
  c.exportAfter.value = true; s.onChange();
  check(/then exports to .*Downloads\/SVG Anim\//.test(s.ui.okLine.text), 'OK line mentions export after');
  c.exportAfter.value = false; s.onChange();
  let h = doc.history.size;
  performOk(doc, s);
  check(doc.history.size === h + 1, 'apply = one history step');
  let d = readNodeData(A).data;
  check(d && d.tracks.length === 3 && d.tracks.map(t => t.type).join() === 'move,fade,rotate', 'tracks saved in order 1,5,8 → move,fade,rotate');
  check(userName(A) === dflt + '__anim' && d.suffix === '__anim' && d.auto === true, 'unnamed layer → "' + userName(A) + '", auto flag set');
  check(exportName(A, d) === '', 'auto-named layer exports without id');

  // re-open: tracks + suffix shown, OK without edits changes nothing
  select([A]);
  s = setupDialog(doc);
  check(TYPES[s.ui.animate.c.type.selectedIndex] === 'move' && s.ui.animate.c.suffix.text === '__anim', 'reopen: track 1 and suffix shown');
  const before = readNodeData(A).raw;
  performOk(doc, s);
  check(readNodeData(A).raw === before && userName(A) === dflt + '__anim', 'reopen + OK: data and name unchanged (no double suffix)');

  // change suffix → old one replaced
  select([A]);
  s = setupDialog(doc);
  s.ui.animate.c.suffix.text = ' ✦'; s.onChange();
  performOk(doc, s);
  check(userName(A) === dflt + ' ✦' && readNodeData(A).data.suffix === ' ✦', 'suffix change replaces the old suffix');

  // ---------------------------------------------------------------- named layer B, multi select
  select([A, B]);
  s = setupDialog(doc);
  check(s.state.suffix === ' ✦' && s.ui.animate.c.suffix.text === ' ✦', 'mixed selection: suffix of the animated element offered');
  s.ui.animate.c.suffix.text = '__anim'; s.onChange();
  console.log('info:', s.ui.animate.c.info.text.replace(/\n/g, ' | '));
  performOk(doc, s);
  check(userName(B) === 'Heart__anim' && userName(A) === dflt + '__anim', 'multi apply: Heart__anim and ' + userName(A));
  check(exportName(B, readNodeData(B).data) === 'Heart', 'named layer exports as id "Heart"');
  // user renames manually, keeps suffix
  doc.executeCommand(DocumentCommand.createSetDescription(Selection.create(doc, [A]), 'Star__anim'));
  check(exportName(A, readNodeData(A).data) === 'Star', 'manual rename respected in export id');

  // ---------------------------------------------------------------- clear
  select([A, B]);
  s = setupDialog(doc);
  for (let i = 0; i < 8; i++) { s.ui.animate.c.track.selectedIndex = i; s.onChange(); s.ui.animate.c.type.selectedIndex = 0; s.onChange(); }
  check(/^OK removes the animation from 2 element\(s\)\.$/.test(s.ui.okLine.text), 'OK line for clearing');
  performOk(doc, s);
  check(!readNodeData(A).data && !readNodeData(B).data, 'clear removes data');
  check(userName(A) === 'Star' && userName(B) === 'Heart', 'clear removes suffix, keeps real names');

  // auto layer cleared → back to unnamed
  select([Cn]);
  s = setupDialog(doc);
  s.ui.animate.c.type.selectedIndex = TYPES.indexOf('scale'); s.onChange();
  performOk(doc, s);
  check(userName(Cn) === dflt + '__anim', 'C animated');
  select([Cn]);
  s = setupDialog(doc);
  s.ui.animate.c.type.selectedIndex = 0; s.onChange();
  performOk(doc, s);
  check(userName(Cn) === '' && displayName(Cn) === dflt, 'clearing an auto-named layer restores the default name');

  // empty suffix
  select([B]);
  s = setupDialog(doc);
  s.ui.animate.c.type.selectedIndex = TYPES.indexOf('fade'); s.onChange();
  s.ui.animate.c.suffix.text = ''; s.onChange();
  performOk(doc, s);
  check(userName(B) === 'Heart' && readNodeData(B).data.suffix === '', 'blank suffix: name untouched');
  select([B]);
  check(setupDialog(doc).state.suffix === '', 'blank suffix is remembered for that element');

  // ---------------------------------------------------------------- animate + export after
  select([B]);
  s = setupDialog(doc);
  s.ui.animate.c.suffix.text = '__anim'; s.ui.animate.c.exportAfter.value = true;
  s.ui.exporter.c.folder.text = OUT; s.ui.exporter.c.file.text = 'dialog-test'; s.ui.exporter.c.html.value = false;
  s.ui.mode.selectedIndex = 1; s.onChange(); s.ui.mode.selectedIndex = 0; s.onChange();
  const report = performOk(doc, s);
  console.log('report:', String(report).replace(/\n/g, ' | '));
  const svg = readText(OUT + '/dialog-test.svg');
  check(/<rect id="Heart" data-svganim='\{"v":1,"n":0,"tracks":\[\{"type":"fade"/.test(svg), 'export after apply: id "Heart" + data, suffix not in id');
  console.log('suffix hits:', (svg.match(/.{0,80}__anim.{0,40}/g) || []).join(' || '));
  check(!/__anim/.test(svg) && !/svganimtok/.test(svg), 'no suffix or tokens in SVG');
  check(userName(B) === 'Heart__anim', 'name restored after export');

  // ---------------------------------------------------------------- permission error message
  select([B]);
  s = setupDialog(doc);
  s.ui.mode.selectedIndex = 1; s.onChange();
  let msg = '';
  try { performOk(doc, s); } catch (e) { msg = e.message; }
  console.log('downloads in MCP session:', msg || 'written');
  check(!msg || /Scripting settings/.test(msg), 'Downloads: written, or a clear permission message');
  check(userName(B) === 'Heart__anim', 'name intact after failed export');
} catch (e) { fails++; console.log('ERROR', e.stack || e); }
finally { doc.close(); try { fsMod.removeAll(OUT); } catch (_) {} }
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
