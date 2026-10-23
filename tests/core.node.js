const fs = require('fs'); const path = require('path'); const assert = require('assert');
const src = ['../src/core.js', 'fixtures/legacy.js'].map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
eval(src + '\nglobalThis.C={normalizeTrack,newTrack,normalizeData,serializeData,parseLegacyName,describeTrack,cleanSuffix,MAX_TRACKS};');
// normalize: junk in → valid out
const t = C.normalizeTrack({type:'move', x:'12', y:'abc', dur:-3, ease:'nope', loops:2.7, trigger:'x'});
assert.deepEqual([t.x,t.y,t.dur,t.ease,t.loops,t.trigger],[12,-20,0.01,'inOut',2,'load']);
assert.equal(C.normalizeTrack({type:'none'}), null);
assert.equal(C.MAX_TRACKS, 8);
const many = Array.from({length: 11}, (_, i) => ({type: ['fade','move','rotate','scale'][i % 4]}));
assert.equal(C.normalizeData({tracks: many}).tracks.length, 8, 'capped at 8 tracks');
assert.equal(C.serializeData({tracks:[]}), '');
const nt = C.newTrack('rotate'); assert.equal(nt.ease,'linear'); assert.equal(nt.dir,'normal'); assert.equal(nt.angle,360);
// suffix / auto bookkeeping
let d = C.normalizeData({tracks:[{type:'fade'}], suffix:'__anim', auto:true});
assert.equal(d.suffix, '__anim'); assert.equal(d.auto, true);
d = C.normalizeData({tracks:[{type:'fade'}], suffix:'   '}); assert.equal(d.suffix, '', 'whitespace suffix = none');
d = C.normalizeData({tracks:[{type:'fade'}]}); assert.ok(!('suffix' in d), 'v0.1 data: suffix unknown');
d = C.normalizeData({tracks:[{type:'fade'}], auto:'yes'}); assert.ok(!('auto' in d));
assert.equal(C.cleanSuffix('x'.repeat(50)).length, 32);
// round trip
const s = C.serializeData({tracks:[C.newTrack('move'), C.newTrack('fade')], suffix:'__anim'});
assert.deepEqual(C.normalizeData(JSON.parse(s)), JSON.parse(s));
// fixture parser still sane
assert.equal(C.parseLegacyName('{{y_-50*1_2}}').tracks[0].y, -50);
assert.equal(C.parseLegacyName('f1'), null);
// track descriptions stay short enough for 4 per line
const longest = ['fade','move','rotate','scale','draw','count','clock','frames'].map(k => C.describeTrack(C.newTrack(k)));
console.log('descriptions:', longest.join(' | '));
assert.ok(longest.every(x => x.length <= 16));
console.log('core tests OK, sample tag bytes:', s.length);
