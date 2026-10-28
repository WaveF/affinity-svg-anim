// Builds a self-checking browser page: old runtime regression + real SVG matrices.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const version = require('../package.json').version;
const root = path.join(__dirname, '..'), output = path.join(__dirname, 'out');
fs.mkdirSync(output, {recursive: true});
const source = fs.readFileSync(path.join(root, 'dist/svg-anim-runtime.min.js'), 'utf8');
const old = cp.execFileSync('git', ['show', 'v0.2.2:dist/svg-anim-runtime.min.js'], {cwd: root, encoding: 'utf8'});
const base = {dur: 1, ease: 'linear', dir: 'normal', loops: 1, target: 'self'};
const attr = tracks => "data-svganim='" + JSON.stringify({v: 1, n: 3, tracks: tracks.map(t => ({...base, ...t}))}) + "'";
const wrap = (name, tracks, tag = 'rect', extra = '') => `<${tag} id="${name}" ${attr(tracks)} ${tag === 'rect' ? 'x="10" y="20" width="40" height="30"' : ''} ${extra}/>`;
let legacy = wrap('move', [{type: 'move', x: 100, y: -50}]) + wrap('rotate', [{type: 'rotate', angle: 90, pivot: 'br'}]) + wrap('scale', [{type: 'scale', sx: 150, sy: 50, pivot: 'c'}]) + wrap('fade', [{type: 'fade', from: 100, to: 0}]) + wrap('draw', [{type: 'draw'}], 'path', 'd="M0 0L100 0"') + `<text id="count" ${attr([{type: 'count', start: 0, end: 100, decimals: 2}])}>0</text>`;
legacy += `<g id="frames" ${attr([{type: 'frames', target: 'children'}])}><rect width="1" height="1"/><rect width="1" height="1"/><rect width="1" height="1"/></g>`;
legacy += `<g transform="matrix(-2 .3 .4 1.5 300 0)">${wrap('combo', [{type: 'move', x: 20, y: 30}, {type: 'rotate', angle: 40, pivot: 'c'}, {type: 'scale', sx: 150, sy: 80, pivot: 'c'}])}</g>`;
const pivots = {tl:[0,0],tc:[.5,0],tr:[1,0],cl:[0,.5],c:[.5,.5],cr:[1,.5],bl:[0,1],bc:[.5,1],br:[1,1]};
let skew = Object.keys(pivots).map(pivot => `<g transform="matrix(-2 .3 .4 1.5 300 0)">${wrap('skew-'+pivot, [{type: 'skew', ax: 30, ay: -15, pivot}])}</g>`).join('');
skew += `<g id="children" ${attr([{type: 'skew', ax: 30, ay: 0, pivot: 'tl', target: 'children', stagger: .5}])}><rect id="child0" width="10" height="10"/><rect id="child1" width="10" height="10"/><rect id="child2" width="10" height="10"/></g>`;
skew += wrap('mixed', [{type: 'skew', ax: 30, ay: -15, pivot: 'c'}, {type: 'move', x: 10, y: 20}, {type: 'rotate', angle: 90, pivot: 'c'}, {type: 'scale', sx: 200, sy: 50, pivot: 'c'}]);
skew += wrap('overshoot', [{type:'skew',ax:135,ay:0,pivot:'tl',ease:'backOut'}]);
const svg = (body, player) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 300">${body}<script><![CDATA[${player};document.currentScript.ownerSVGElement.__svgAnim.pause();]]></script></svg>`;
const html = `<!doctype html><meta charset="utf-8"><title>SVG Anim v${version} verification</title><h1>SVG Anim v${version} verification</h1><pre id="report">Running…</pre><div id="fixtures"></div><script>
const inputs=${JSON.stringify([svg(legacy,old),svg(legacy,source),svg(skew,source)]).replace(/</g, '\\u003c')};
const pivots=${JSON.stringify(pivots)};
const checks=[]; function check(ok,message){checks.push({ok,message});if(!ok)throw new Error(message)}
const ready=inputs.map((src,i)=>new Promise(resolve=>{const f=document.createElement('iframe');f.width=500;f.height=300;f.onload=()=>resolve(f.contentDocument);f.srcdoc=src;document.querySelector('#fixtures').append(f)}));
Promise.all(ready).then(docs=>{
 const svgs=docs.map(d=>d.querySelector('svg'));svgs.forEach(s=>s.__svgAnim.pause());
 function matrix(el){const m=el.ownerSVGElement.getCTM().inverse().multiply(el.getCTM());return [m.a,m.b,m.c,m.d,m.e,m.f]}
 function snapshot(doc){return Array.from(doc.querySelectorAll('[id]')).map(el=>({id:el.id,m:matrix(el),style:el.getAttribute('style'),w:el.parentNode.getAttribute('transform'),o:el.parentNode.style.opacity,text:el.localName==='text'?el.textContent:null,children:Array.from(el.children).map(c=>c.style.visibility)}))}
 for(const t of [0,.125,.25,.5,.75,1,1.5]){svgs[0].__svgAnim.seek(t);svgs[1].__svgAnim.seek(t);check(JSON.stringify(snapshot(docs[0]))===JSON.stringify(snapshot(docs[1])),'v0.2.2 regression at '+t+'s')}
 const s=svgs[2],doc=docs[2],keys=['a','b','c','d','e','f'];
 const near=(a,b)=>Math.abs(a-b)<.001;
 for(const t of [0,.25,.5,1,0]){s.__svgAnim.seek(t);for(const [name,p] of Object.entries(pivots)){
  const x=10+40*p[0],y=20+30*p[1];const local=new DOMMatrix().translate(x,y).skewX(30*t).skewY(-15*t).translate(-x,-y);
  const expected=new DOMMatrix([-2,.3,.4,1.5,300,0]).multiply(local);const actual=s.getCTM().inverse().multiply(doc.getElementById('skew-'+name).getCTM());
  check(keys.every(k=>near(actual[k],expected[k])),'Skew '+name+' matrix under mirrored/nonuniform parent at '+t+'s');
 }}
 s.__svgAnim.seek(.5);check(near(s.getCTM().inverse().multiply(doc.getElementById('child0').getCTM()).c,Math.tan(15*Math.PI/180))&&near(s.getCTM().inverse().multiply(doc.getElementById('child1').getCTM()).c,0)&&near(s.getCTM().inverse().multiply(doc.getElementById('child2').getCTM()).c,0),'Skew stagger per child');
 s.__svgAnim.seek(1);const expected=new DOMMatrix().translate(10,20).translate(30,35).rotate(90).translate(-30,-35).translate(30,35).scale(2,.5).translate(-30,-35).translate(30,35).skewX(30).skewY(-15).translate(-30,-35);
 check(keys.every(k=>near(s.getCTM().inverse().multiply(doc.getElementById('mixed').getCTM())[k],expected[k])),'Mixed transform list preserves Move / Rotate / Scale / Skew composition');
 s.__svgAnim.seek(.7);const transform=doc.getElementById('overshoot').parentNode.getAttribute('transform');const angle=Number(transform.match(/skewX\\(([^)]+)/)[1]);check(angle>135,'Unrestricted 135° Skew retains Back easing overshoot');
 check(s.__svgAnim.version===${JSON.stringify(version)},'Player version '+${JSON.stringify(version)});
 window.testResult={passed:true,checks};document.querySelector('#report').textContent=checks.length+' checks passed\\n'+checks.map(x=>x.message).join('\\n');
}).catch(e=>{window.testResult={passed:false,error:e.stack,checks};document.querySelector('#report').textContent=e.stack});
</script>`;
fs.writeFileSync(path.join(output, 'verification.html'),html);
console.log(path.join(output,'verification.html'));
