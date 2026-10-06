// Stamps index.html with a version made from the contents of every file the page loads, so that after an update a
// browser never mixes old and new files: every address in index.html carries ?v=<version>, and when anything
// changes, every address changes with it.
//
//   node tools/stamp.js           rewrite index.html
//   node tools/stamp.js --check   change nothing; exit 1 when index.html is out of date
//
// How it reaches every file:
// - style sheet, the data and engine scripts, js/main.js and the preload hints: the address in index.html gets ?v=.
// - the game's other files are loaded by "import './hud.js'" inside each other; the import map in index.html sends
//   each of those addresses to the same address with ?v=.
// - the background worker is started by main.js with main.js's own ?v=, and passes it on to what it loads.
// Run it before every commit that changes a file the page loads (a git pre-commit hook can do that for you).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const FOLDERS = ['css', 'js', 'data', 'vendor'];

function walk(dir, out) {
  fs.readdirSync(path.join(root, dir)).sort().forEach(function (name) {
    const rel = dir + '/' + name;
    if (fs.statSync(path.join(root, rel)).isDirectory()) walk(rel, out); else out.push(rel);
  });
  return out;
}

const files = FOLDERS.reduce(function (list, dir) { return walk(dir, list); }, []);
const hash = crypto.createHash('sha1');
files.forEach(function (rel) { hash.update(rel + '\n'); hash.update(fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n')); });

const page = path.join(root, 'index.html');
const before = fs.readFileSync(page, 'utf8'), crlf = before.includes('\r\n');
let html = before.replace(/\r\n/g, '\n');
// What index.html itself says also counts (without the stamps, or it would never settle).
hash.update(html.replace(/\?v=[0-9a-f]+/g, '').replace(/<script type="importmap">[\s\S]*?<\/script>/, ''));
const version = hash.digest('hex').slice(0, 10);

// Every address of a file of ours.
html = html.replace(/\b(href|src)="((?:css|js|data|vendor)\/[^"?]+)(?:\?v=[0-9a-f]+)?"/g, function (all, attr, file) { return attr + '="' + file + '?v=' + version + '"'; });

// The import map: the 3D library, and every file in js/ sent to its stamped address.
const three = /"three":\s*"([^"]+)"/.exec(html);
if (!three) throw new Error('index.html: the import map has no "three" entry');
const lines = ['    "three": "' + three[1] + '"'].concat(files.filter(function (f) { return /^js\/[^/]+\.js$/.test(f) && f !== 'js/sim-worker.js'; })
  .map(function (f) { return '    "./' + f + '": "./' + f + '?v=' + version + '"'; }));
const map = '<script type="importmap">\n{\n  "imports": {\n' + lines.join(',\n') + '\n  }\n}\n</script>';
if (!/<script type="importmap">[\s\S]*?<\/script>/.test(html)) throw new Error('index.html: no import map found');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, function () { return map; });

const after = crlf ? html.replace(/\n/g, '\r\n') : html;
if (process.argv.indexOf('--check') >= 0) {
  if (after !== before) { console.error('index.html is out of date: run "node tools/stamp.js"'); process.exit(1); }
  console.log('index.html is up to date (version ' + version + ')');
} else if (after !== before) {
  fs.writeFileSync(page, after);
  console.log('index.html stamped: version ' + version);
} else console.log('index.html already at version ' + version);
