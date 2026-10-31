"""TriClair real-photo evaluation harness (jury externe pass 1, J1).

Classifies the photos in eval/photos/ with the model loaded in the REAL
deployed page (https://samehbenhouria.github.io/triclair/), using the exact
load config the app uses (mobilenet 2.1.1, version 2, alpha 1.0, vendored
modelUrl). The verdict for each photo is produced by the page's own shipped
window.TriRules.fromLabel() — no reimplementation — with city=longueuil and
the condition encoded in the filename:

    <item>__<pexels-id>.jpg                  -> condition "clean"
    <item>__<pexels-id>__soiled.jpg          -> condition "soiled"
    <item>__<pexels-id>__broken.jpg          -> condition "broken"

For every photo it records: top-3 MobileNet predictions, the shipped
verdict, the expected item/bin, the outcome (correct / incertain / faux),
and the outcome the SAME shipped label mapping would give at other
confidence thresholds (0.20 / 0.25 / 0.30 / 0.35 / 0.45) — computed in-page
via TriRules.itemForLabel, so the sweep reuses the shipped token matching.

Results are merged into eval/results.json after EVERY photo, so an
interrupted run resumes where it stopped (files already present are
skipped unless --force is given).

Usage:
    python3 eval/run_eval.py eval/photos/*.jpg [--force]
"""
import asyncio, base64, hashlib, json, os, subprocess, sys, urllib.request
import websockets

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
VIDEO = os.path.join(os.path.dirname(REPO), "video")

# The VM's Chromium build refuses to start without the platform's WebGL
# domain policy ("Hatch WebGL domain policy is required for browser
# startup"). The image ships that policy at the path below for its
# browser daemon; we pass the file UNMODIFIED, with its own sha256 —
# the daemon's own mechanism, nothing fabricated. (Found 2026-10-31;
# the earlier "no policy file on disk" note was wrong — the disk search
# had been interrupted before reaching /var/lib.)
_POLICY_FILE = "/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt"


def _policy_args():
    try:
        with open(_POLICY_FILE, "rb") as fh:
            digest = hashlib.sha256(fh.read()).hexdigest()
        return [f"--hatch-webgl-allowed-domains-file={_POLICY_FILE}",
                f"--hatch-webgl-allowed-domains-sha256={digest}"]
    except OSError:
        return []


POLICY_ARGS = _policy_args()
BASE = "https://samehbenhouria.github.io/triclair/"
PORT = 9351
RESULTS = os.path.join(HERE, "results.json")
THRESHOLDS = [0.20, 0.25, 0.30, 0.35, 0.45]
FORCE = "--force" in sys.argv
FILES = [f for f in sys.argv[1:] if not f.startswith("--")]


def parse_name(path):
    base = os.path.basename(path)
    parts = base[:-4].split("__") if base.endswith(".jpg") else base.split("__")
    item = parts[0]
    cond = parts[2] if len(parts) > 2 and parts[2] in ("soiled", "broken") else "clean"
    return item, cond


def load_results():
    if os.path.exists(RESULTS):
        with open(RESULTS) as fh:
            return json.load(fh)
    return {}


def save_results(data):
    tmp = RESULTS + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
    os.replace(tmp, RESULTS)


async def main():
    results = load_results()
    todo = []
    for f in FILES:
        name = os.path.basename(f)
        if name in results and not FORCE:
            print("SKIP (already done)", name, flush=True)
        else:
            todo.append(f)
    if not todo:
        print("nothing to do")
        return
    payload = []
    for f in todo:
        item, cond = parse_name(f)
        with open(f, "rb") as fh:
            data = base64.b64encode(fh.read()).decode()
        payload.append({"name": os.path.basename(f), "expected": item,
                        "condition": cond, "data": "data:image/jpeg;base64," + data})

    relay = subprocess.Popen([sys.executable, os.path.join(VIDEO, "relay_proxy.py")],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(2)
    proc = subprocess.Popen([
        "/opt/meta-chromium/chrome", "--headless=new", "--disable-gpu", "--no-sandbox",
        *POLICY_ARGS,
        "--proxy-server=http://127.0.0.1:8899", "--ignore-certificate-errors",
        f"--remote-debugging-port={PORT}", "--user-data-dir=/tmp/triclair-eval-profile",
        "--window-size=1200,1200", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ws_url = None
        for _ in range(45):
            try:
                data = json.load(urllib.request.urlopen(f"http://localhost:{PORT}/json/version", timeout=2))
                ws_url = data["webSocketDebuggerUrl"]
                break
            except Exception:
                await asyncio.sleep(1)
        if not ws_url:
            raise RuntimeError("no devtools")
        async with websockets.connect(ws_url, max_size=512 * 1024 * 1024) as ws:
            seq = 0

            async def cmd(method, params=None, sid=None):
                nonlocal seq
                seq += 1
                mid = seq
                msg = {"id": mid, "method": method, "params": params or {}}
                if sid:
                    msg["sessionId"] = sid
                await ws.send(json.dumps(msg))
                while True:
                    r = json.loads(await ws.recv())
                    if r.get("id") == mid:
                        return r

            t = await cmd("Target.createTarget", {"url": "about:blank"})
            a = await cmd("Target.attachToTarget", {"targetId": t["result"]["targetId"], "flatten": True})
            sid = a["result"]["sessionId"]
            await cmd("Page.enable", sid=sid)
            await cmd("Runtime.enable", sid=sid)

            async def eval_await(expr):
                r = await cmd("Runtime.evaluate",
                              {"expression": expr, "awaitPromise": True, "returnByValue": True}, sid=sid)
                outer = r.get("result") or {}
                if "exceptionDetails" in outer:
                    return {"exception": str(outer["exceptionDetails"])[:1500]}
                return (outer.get("result") or {}).get("value", "")

            await cmd("Page.navigate", {"url": BASE + "?eval=1"}, sid=sid)
            # Wait for the APP's own model (bilingual status text since phase B).
            ready = False
            for i in range(50):
                await asyncio.sleep(5)
                st = await eval_await("document.getElementById('model-status')?.textContent || ''")
                if isinstance(st, str) and ("prêt" in st or "ready" in st):
                    print("APP MODEL READY after ~", (i + 1) * 5, "s:", st, flush=True)
                    ready = True
                    break
            if not ready:
                raise RuntimeError("app model never became ready")

            # Load our own model instance with the app's exact config, then
            # classify photo by photo, checkpointing after each one.
            boot = await eval_await(
                "(async () => { window.__evalModel = await mobilenet.load({version: 2,"
                " alpha: 1.0, modelUrl: 'model/model.json'}); return 'eval model loaded'; })()")
            print("BOOT:", boot, flush=True)

            for it in payload:
                expr = """(async () => {
                    const it = %s;
                    const img = new Image();
                    img.src = it.data;
                    await img.decode();
                    const preds = await window.__evalModel.classify(img);
                    const top = preds.slice(0, 3).map(p => ({label: p.className, p: +p.probability.toFixed(4)}));
                    const o = {city: 'longueuil', lang: 'en'};
                    const v = TriRules.fromLabel(top[0].label, top[0].p, it.condition, o);
                    const expectedBin = TriRules.decide(it.expected, it.condition, o).bin;
                    const sweep = {};
                    for (const T of %s) {
                        const item = TriRules.itemForLabel(top[0].label);
                        sweep[T] = (!item || top[0].p < T) ? 'incertain'
                            : (item === it.expected ? 'correct' : 'faux');
                    }
                    return {file: it.name, expected_item: it.expected, condition: it.condition,
                            top3: top,
                            verdict: {status: v.status, item: v.itemKey, bin: v.bin,
                                      confidence: (typeof v.confidence === 'number') ? +v.confidence.toFixed(4) : null},
                            expected_bin: expectedBin,
                            outcome: v.status === 'uncertain' ? 'incertain'
                                : (v.itemKey === it.expected ? 'correct' : 'faux'),
                            bin_match: v.status !== 'uncertain' && v.bin === expectedBin,
                            sweep: sweep, backend: 'webgl-page'};
                })()""" % (json.dumps({k: it[k] for k in ("name", "expected", "condition", "data")}),
                           json.dumps(THRESHOLDS))
                rec = await eval_await(expr)
                if isinstance(rec, dict) and "exception" in rec:
                    print("ERROR", it["name"], rec["exception"][:300], flush=True)
                    continue
                results[rec["file"]] = rec
                save_results(results)
                print("DONE", rec["file"], "->", rec["top3"][0]["label"],
                      rec["top3"][0]["p"], "| item:", rec["verdict"]["item"],
                      "| outcome:", rec["outcome"], flush=True)
    finally:
        proc.terminate()
        relay.terminate()
    print("TOTAL in results.json:", len(results))


asyncio.run(main())
