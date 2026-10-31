#!/usr/bin/env python3
"""One real Montréal verdict through the deployed UI, as a screenshot.

Sets the city to Montréal (localStorage, exactly what the UI selector
writes), reloads, feeds a real coffee-cup evaluation photo through the
page's file input, waits for the verdict, saves a full-page screenshot
to eval/montreal_coffee.png and prints the verdict text. Same CDP +
relay + platform WebGL policy pattern as run_session.py.

Usage: python3 eval/capture_montreal.py
"""
import asyncio
import base64
import hashlib
import json
import os
import subprocess
import sys
import urllib.request

import websockets

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PROJECT = os.path.dirname(ROOT)
PAGE = "https://samehbenhouria.github.io/triclair/?mtl=1"
PROFILE = "/tmp/triclair-mtl-profile"
PORT = 9353
PHOTO = os.path.join(HERE, "photos", "coffee_cup__2286977.jpg")
OUT = os.path.join(HERE, "montreal_coffee.png")

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


async def main():
    relay = subprocess.Popen(
        [sys.executable, os.path.join(PROJECT, "video", "relay_proxy.py")],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(2)
    chrome = subprocess.Popen(
        ["/opt/meta-chromium/chrome", "--headless=new", "--disable-gpu",
         "--no-sandbox", *POLICY_ARGS,
         "--proxy-server=http://127.0.0.1:8899",
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
                        return
                    await asyncio.sleep(5)
                raise RuntimeError("model not ready in 300 s")

            await cmd("Page.navigate", {"url": PAGE}, sid=sid)
            await wait_ready()
            # Exactly what the city selector writes, then reload.
            await evalj("localStorage.setItem('triclair.city', 'montreal'); 'set'")
            await cmd("Page.reload", sid=sid)
            await wait_ready()
            city_shown = await evalj(
                "(document.querySelector('#city-select')||{}).value||''")
            print("city after reload:", city_shown, flush=True)
            doc = await cmd("DOM.getDocument", sid=sid)
            node = await cmd("DOM.querySelector",
                             {"nodeId": doc["result"]["root"]["nodeId"],
                              "selector": "#photo-input"}, sid=sid)
            await cmd("DOM.setFileInputFiles",
                      {"files": [PHOTO], "nodeId": node["result"]["nodeId"]}, sid=sid)
            text = ""
            for _ in range(45):
                await asyncio.sleep(2)
                text = await evalj(
                    "(document.querySelector('#verdict')||{}).textContent||''")
                if text and "Classification en cours" not in text \
                        and "Classifying" not in text:
                    break
            print("VERDICT:", text.replace("\n", " ")[:300], flush=True)
            shot = await cmd("Page.captureScreenshot",
                             {"format": "png", "captureBeyondViewport": True}, sid=sid)
            with open(OUT, "wb") as f:
                f.write(base64.b64decode(shot["result"]["data"]))
            print("saved", OUT, os.path.getsize(OUT), "bytes", flush=True)
    finally:
        chrome.terminate()
        relay.terminate()


if __name__ == "__main__":
    asyncio.run(main())
