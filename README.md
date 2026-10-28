# TriClair — Know which bin, and why

**Arbiter Hacks V1 · Theme Track: Rethinking Waste**

Take a photo of a household waste item. TriClair tells you which bin it belongs
in for **Longueuil, Québec** — blue recycling, brown compost, grey garbage, or
ecocentre drop-off — **and cites the local rule behind the answer**. When it is
not sure, it says so instead of guessing, because one confident mistake can
contaminate a whole bin.

## Run it (no build, no backend, no account)

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Any static file server works. **No internet connection is needed at all**: the
classification libraries and the model weights are vendored in this repo
(`vendor/`, `model/`), and classification runs **100% in your browser** — no
photo ever leaves the device.

## Try the demo path

1. Click a sample photo, or upload your own:
   - **Plastic bottle** → Blue bin (recycling), rule cited.
   - **Pizza** → set condition **Soiled** → Brown bin (compost); set it back to
     **Clean** → Blue bin. The condition is what decides — so TriClair asks.
   - **Banana** → Brown bin (compost).
   - **Cell phone** → Ecocentre drop-off.
   - **Teddy bear ("unknown")** → **Uncertain** verdict + manual material
     picker. TriClair never invents an answer.
2. Watch the **impact journal** (top panel): counts per bin, total sorted, and
   the *uncertain rate* — the share of guesses TriClair refused to make.
   Export the journal as JSON any time.
3. No photo? The **manual material picker** runs the same rules engine.

## How it works

| File | Role |
|---|---|
| `index.html`, `style.css` | Single-page UI |
| `app.js` | Photo flow (MobileNet), journal (localStorage), manual picker wiring |
| `rules.js` | **Pure rules engine** — item × condition (clean / soiled / broken) → bin + rule text. No dependencies; runs in browser and Node. |
| `test/rules.test.js` | Node test suite for the engine (no dependencies) |
| `samples/` | Demo photos (see `samples/CREDITS.md`) |

Classification: TensorFlow.js **4.20.0** + MobileNet **2.1.1**
(`@tensorflow-models/mobilenet`, MobileNet v2 1.0/224 weights), **vendored**
in `vendor/` + `model/` (Apache-2.0, © Google — see the license headers in the
vendored files). The model's top label is mapped to a waste item; below **35%
confidence**, or for an unmapped label, the verdict is *Uncertain* by design.

Rules encode Longueuil / Montréal-area curbside guidance, including the traps
that cause real contamination:

- Grease-soiled pizza box / cardboard → **compost**, not recycling
- Paper coffee cup → **garbage** (plastic-lined, despite being "paper")
- Plastic film and bags → **garbage** (refused curbside, they jam sorters)
- Broken glass → **garbage, wrapped and labelled** (never loose in the blue bin)
- Electronics, phones, batteries → **ecocentre**, never any curbside bin

## Tests

```sh
node test/rules.test.js   # 146 assertions: mappings, traps in every condition,
                          # uncertain logic, manual path — all must pass
```

## Honest limitations

- MobileNet was trained on ImageNet, not on waste. Some items will be misread
  or unknown — that is precisely why the uncertain path and the manual picker
  are first-class features, not afterthoughts.
- The rules are **Longueuil-specific by design**. Another city = another rule
  file, not another app; rule text is separated from logic for that reason.
- The journal lives in your browser's localStorage only. Nothing is uploaded.

## What's next

A small waste-specific fine-tuned model, more municipalities' rule files, and
a French UI.
