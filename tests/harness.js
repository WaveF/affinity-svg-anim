// node tests/harness.js <built script> <scenario> [fixture...]
// Runs the script (without main()) + fixtures + scenario inside Affinity.
const fs = require('node:fs'); const path = require('node:path'); const { execFileSync } = require('node:child_process');
const [scriptPath, scenarioPath, ...fixtures] = process.argv.slice(2);
let src = fs.readFileSync(scriptPath, 'utf8');
if (!/\nmain\(\);\s*$/.test(src)) throw new Error('main(); not found at end');
src = src.replace(/\nmain\(\);\s*$/, '\n');
const parts = [src, ...fixtures.map(f => fs.readFileSync(f, 'utf8')), '// ---- scenario ----', fs.readFileSync(scenarioPath, 'utf8')];
const out = path.join('/tmp', 'svganim-test-run.js');
fs.writeFileSync(out, parts.join('\n'));
process.stdout.write(execFileSync('node', [path.join(__dirname, 'run_script.js'), out], { encoding: 'utf8', maxBuffer: 1 << 26 }));
