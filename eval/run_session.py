#!/usr/bin/env python3
"""TriClair J5 usage session — drives the REAL deployed UI via CDP.

Self-contained CDP driver modelled on video/classify_dataurl.py (same
relay + headless Chromium + flatten-session pattern; classify_dataurl.py
itself cannot be imported — it runs its main() at module level).

Feeds a fixed list of eval photos through the deployed page's file input
(#photo-input), reads each verdict from the DOM, then reads the impact
panel and the localStorage journal. Photos are grouped by condition with
a page reload between groups: the journal persists per profile, and each
photo must be classified exactly once, under its filename condition (the
condition select is set BEFORE the file is fed).

Writes eval/session_result.json incrementally (one record per photo plus
a final "__panel__" record). SESSION_USAGE.md is written from that file.

Usage: python3 eval/run_session.py
Requires a Chromium that can start on this machine — see
eval/SESSION_USAGE.md for the 2026-10-30 platform limitation.
"""
import asyncio
import json
import os
import subprocess
import sys
import urllib.request

import websockets

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PROJECT = os.path.dirname(ROOT)
PAGE = "https://samehbenhouria.github.io/triclair/?session=1"
PROFILE = "/tmp/triclair-session-profile"
OUT = os.path.join(HERE, "session_result.json")
PORT = 9352

# 14 photos: every item at least once, the 4 non-clean conditions included.
PHOTOS = [
    "plastic_bottle__7981599.jpg",
    "plastic_bottle__3457243__broken.jpg",
    "glass_bottle__26791665.jpg",
    "metal_can__9601217.jpg",
    "cardboard__11781094.jpg",
    "pizza_box__4109080.jpg",
    "pizza_box__9353454__soiled.jpg",
    "paper__3866816.jpg",
    "coffee_cup__2286977.jpg",
    "plastic_film__3683199.jpg",
    "plastic_film__9222184__broken.jpg",
    "food_scraps__7512979.jpg",
    "styrofoam__40080589.jpg",
    "electronics__19335258.jpg",
    "textile__10557063.jpg",
]


def cond_of(name):
    parts = name.replace(".jpg", "").split("__")
    return parts[2] if len(parts) > 2 and parts[2] in ("soiled", "broken") else "clean"


async def main():
    relay = subprocess.Popen(
        [sys.executable, os.path.join(PROJECT, "video", "relay_proxy.py")],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(2)
    chrome = subprocess.Popen(
        ["/opt/meta-chromium/chrome", "--headless=new", "--disable-gpu",
         "--no-sandbox", "--proxy-server=http://127.0.0.1:8899",
         "--ignore-certificate-errors",
         f"--remote-debugging-port={PORT}",
         f"--user-data-dir={PROFILE}", "--window-size=1200,1400", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ws_url = None
        for _ in range(45):
            try:
                data = json.load(urllib.request.urlopen(
                    f"http://localhost:{PORT}/json/version", timeout=2))
                ws_url = data["webSocketDebuggerUrl"]
                break
            except Exception:
                await asyncio.sleep(1)
        if not ws_url:
            raise RuntimeError("no devtools — Chromium did not start")
        async with websockets.connect(ws_url, max_size=256 * 1024 * 1024) as ws:
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
            a = await cmd("Target.attachToTarget",
                          {"targetId": t["result"]["targetId"], "flatten": True})
            sid = a["result"]["sessionId"]
            await cmd("Page.enable", sid=sid)
            await cmd("Runtime.enable", sid=sid)
            await cmd("DOM.enable", sid=sid)

            async def evalj(expr):
                r = await cmd("Runtime.evaluate",
                              {"expression": expr, "awaitPromise": True,
                               "returnByValue": True}, sid=sid)
                outer = r.get("result") or {}
                if "exceptionDetails" in outer:
                    raise RuntimeError("page JS: " + str(outer["exceptionDetails"])[:400])
                return (outer.get("result") or {}).get("value", "")

            async def wait_ready():
                for _ in range(60):
                    txt = await evalj(
                        "(document.querySelector('#model-status')||{}).textContent||''")
                    if "prêt" in txt or "ready" in txt:
                        return True
                    if "indisponible" in txt or "unavailable" in txt:
                        raise RuntimeError("app model unavailable: " + txt)
                    await asyncio.sleep(5)
                raise RuntimeError("app model not ready in 300 s")

            await cmd("Page.navigate", {"url": PAGE}, sid=sid)
            await wait_ready()
            # Fresh journal for a clean session count.
            await evalj("localStorage.removeItem('triclair.journal.v1'); 'cleared'")

            records = {}
            if os.path.exists(OUT):
                records = json.load(open(OUT))

            def flush():
                with open(OUT + ".tmp", "w") as f:
                    json.dump(records, f, indent=2, ensure_ascii=False)
                os.replace(OUT + ".tmp", OUT)

            groups = {}
            for name in PHOTOS:
                groups.setdefault(cond_of(name), []).append(name)
            first = True
            for cond, names in groups.items():
                if not first:
                    # Reload per group so each photo logs exactly once.
                    await cmd("Page.reload", sid=sid)
                    await wait_ready()
                first = False
                await evalj(
                    "(() => { const s = document.querySelector('#condition');"
                    f" s.value = '{cond}';"
                    " s.dispatchEvent(new Event('change', {bubbles:true}));"
                    " return s.value; })()")
                for name in names:
                    if name in records and records[name].get("verdict_text"):
                        print("SKIP", name, flush=True)
                        continue
                    doc = await cmd("DOM.getDocument", sid=sid)
                    node = await cmd("DOM.querySelector",
                                     {"nodeId": doc["result"]["root"]["nodeId"],
                                      "selector": "#photo-input"}, sid=sid)
                    await cmd("DOM.setFileInputFiles",
                              {"files": [os.path.join(HERE, "photos", name)],
                               "nodeId": node["result"]["nodeId"]}, sid=sid)
                    text = ""
                    for _ in range(45):
                        await asyncio.sleep(2)
                        text = await evalj(
                            "(document.querySelector('#verdict')||{}).textContent||''")
                        if text and "Classification en cours" not in text \
                                and "Classifying" not in text:
                            break
                    journal_len = await evalj(
                        "(JSON.parse(localStorage.getItem('triclair.journal.v1')||'[]')).length")
                    records[name] = {"condition": cond, "verdict_text": text,
                                     "journal_len_after": journal_len}
                    flush()
                    print("SESSION", name, "->", text.replace("\n", " ")[:120],
                          "| journal:", journal_len, flush=True)
            panel = await evalj(
                "(document.querySelector('#impact')||{}).textContent||''")
            journal = await evalj(
                "localStorage.getItem('triclair.journal.v1')||'[]'")
            records["__panel__"] = {"impact_text": panel,
                                    "journal": json.loads(journal)}
            flush()
            print("PANEL:", panel.replace("\n", " ")[:300], flush=True)
    finally:
        chrome.terminate()
        relay.terminate()


if __name__ == "__main__":
    asyncio.run(main())
