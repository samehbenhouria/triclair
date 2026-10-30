'use strict';
/*
 * TriClair real-photo evaluation — Node runner (eval/run_eval_node.js).
 *
 * WHY NODE (documented deviation, 2026-10-30): the prescribed route was the
 * model loaded in the deployed page via headless Chromium (run_eval.py).
 * Since the 2026-10-30 platform restart, the VM's Chromium build refuses
 * to start at all without the browser-daemon's WebGL domain policy
 * ("Hatch WebGL domain policy is required for browser startup" — the
 * policy is supplied by browser-daemon to its own browser tasks and is not
 * available to a headless script; no policy file exists on disk). The
 * in-browser scripts of 2026-10-28 predate that change.
 *
 * What stays identical to the shipped app:
 * - the vendored TensorFlow.js (vendor/tf.min.js) and MobileNet package
 *   (vendor/mobilenet.min.js, 2.1.1) — the exact files the page loads;
 * - the vendored weights (model/model.json + shards), fetched over HTTP
 *   from the repo root with the app's exact load config
 *   {version: 2, alpha: 1.0, modelUrl: 'model/model.json'};
 * - the verdict engine: the shipped rules.js, via its Node module export;
 * - the threshold sweep reuses TriRules.itemForLabel (shipped matching).
 * What differs: inference runs on tf.js's CPU backend (Node has no WebGL),
 * and JPEGs are decoded with Python PIL to raw RGB tensors (MobileNet's
 * classify() then applies its own resize/normalize, as it does for an
 * <img>). Backend numeric noise is possible in the last decimals; the
 * deviation and its reason are stated in eval/RESULTS.md.
 *
 * Filename convention (same as run_eval.py):
 *   <item>__<pexels-id>.jpg           -> condition "clean"
 *   <item>__<pexels-id>__soiled.jpg   -> "soiled"
 *   <item>__<pexels-id>__broken.jpg   -> "broken"
 * City is longueuil. Results merge into eval/results.json after EVERY
 * photo (same schema as run_eval.py, plus backend:"cpu-node"); existing
 * entries are skipped unless --force.
 *
 * Usage: node eval/run_eval_node.js eval/photos/*.jpg [--force]
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const REPO = path.dirname(HERE);
const RESULTS = path.join(HERE, 'results.json');
const THRESHOLDS = [0.20, 0.25, 0.30, 0.35, 0.45];
const FORCE = process.argv.includes('--force');
const FILES = process.argv.slice(2).filter(a => !a.startsWith('--'));

// --- tiny static server for the repo root (model weights over HTTP) -------
function serveRepo() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const p = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
        res.writeHead(404); res.end(); return;
      }
      res.writeHead(200, { 'Content-Type': p.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// --- JPEG -> raw RGB via PIL (no resize: MobileNet preprocesses) ----------
function decodeJpeg(file) {
  // PIL writes the size as JSON on stdout line 1, then the raw RGB bytes.
  const out = execFileSync('python3', ['-c',
    'import sys,json;from PIL import Image;' +
    'im=Image.open(sys.argv[1]).convert("RGB");' +
    'sys.stdout.buffer.write(json.dumps(list(im.size)).encode()+b"\\n"+im.tobytes())',
    file], { maxBuffer: 64 * 1024 * 1024 });
  const nl = out.indexOf(0x0a);
  const [w, h] = JSON.parse(out.slice(0, nl).toString());
  const pixels = out.slice(nl + 1);
  if (pixels.length !== w * h * 3) throw new Error('pixel size mismatch for ' + file);
  return { data: new Uint8Array(pixels), width: w, height: h };
}

function parseName(file) {
  const parts = path.basename(file).replace(/\.jpg$/, '').split('__');
  const cond = (parts.length > 2 && ['soiled', 'broken'].includes(parts[2])) ? parts[2] : 'clean';
  return { item: parts[0], cond };
}

function loadResults() {
  try { return JSON.parse(fs.readFileSync(RESULTS, 'utf8')); } catch (e) { return {}; }
}
function saveResults(data) {
  fs.writeFileSync(RESULTS + '.tmp', JSON.stringify(data, null, 2));
  fs.renameSync(RESULTS + '.tmp', RESULTS);
}

(async () => {
  const results = loadResults();
  const todo = FILES.filter(f => FORCE || !results[path.basename(f)]);
  FILES.filter(f => !todo.includes(f)).forEach(f => console.log('SKIP (already done)', path.basename(f)));
  if (!todo.length) { console.log('nothing to do'); return; }

  // Load the vendored tf.js (UMD -> CommonJS require works for tf.min.js).
  const tf = require(path.join(REPO, 'vendor', 'tf.min.js'));
  globalThis.tf = tf;
  // Load the vendored MobileNet UMD with a require shim for its tf import.
  const mnSrc = fs.readFileSync(path.join(REPO, 'vendor', 'mobilenet.min.js'), 'utf8');
  const mnModule = { exports: {} };
  const shimRequire = name => {
    // The vendored tf.min.js is the full tf.js bundle: it includes the
    // converter (loadGraphModel) that MobileNet imports separately.
    if (name.startsWith('@tensorflow/')) return tf;
    throw new Error('unexpected require in mobilenet.min.js: ' + name);
  };
  new Function('module', 'exports', 'require', 'self', 'window', 'global', mnSrc)
    (mnModule, mnModule.exports, shimRequire, globalThis, globalThis, globalThis);
  const mobilenet = mnModule.exports;

  const R = require(path.join(REPO, 'rules.js'));
  const server = await serveRepo();
  const port = server.address().port;
  try {
    await tf.setBackend('cpu');
    await tf.ready();
    console.log('tf backend:', tf.getBackend());
    const model = await mobilenet.load({
      version: 2, alpha: 1.0,
      modelUrl: `http://127.0.0.1:${port}/model/model.json`
    });
    console.log('model loaded (vendored weights, app config)');
    const opts = { city: 'longueuil', lang: 'en' };
    for (const file of todo) {
      const { item, cond } = parseName(file);
      const { data, width, height } = decodeJpeg(file);
      const tensor = tf.tensor3d(data, [height, width, 3], 'int32');
      let preds;
      try { preds = await model.classify(tensor, 3); } finally { tensor.dispose(); }
      const top3 = preds.map(p => ({ label: p.className, p: +p.probability.toFixed(4) }));
      const top = top3[0];
      const v = R.fromLabel(top.label, top.p, cond, opts);
      const expectedBin = R.decide(item, cond, opts).bin;
      const sweep = {};
      for (const T of THRESHOLDS) {
        const mapped = R.itemForLabel(top.label);
        sweep[T] = (!mapped || top.p < T) ? 'incertain' : (mapped === item ? 'correct' : 'faux');
      }
      const rec = {
        file: path.basename(file), expected_item: item, condition: cond,
        top3,
        verdict: {
          status: v.status, item: v.itemKey, bin: v.bin,
          confidence: (typeof v.confidence === 'number') ? +v.confidence.toFixed(4) : null
        },
        expected_bin: expectedBin,
        outcome: v.status === 'uncertain' ? 'incertain' : (v.itemKey === item ? 'correct' : 'faux'),
        bin_match: v.status !== 'uncertain' && v.bin === expectedBin,
        sweep, backend: 'cpu-node'
      };
      results[rec.file] = rec;
      saveResults(results);
      console.log('DONE', rec.file, '->', top.label, top.p,
        '| item:', rec.verdict.item, '| outcome:', rec.outcome);
    }
  } finally {
    server.close();
  }
  console.log('TOTAL in results.json:', Object.keys(results).length);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
