# TriClair — Know which bin, and why

**Arbiter Hacks V1 · Theme Track: Rethinking Waste**

Take a photo of a household waste item. TriClair tells you which bin it
belongs in — **Longueuil or Montréal, Québec** — recycling, compost,
garbage, or ecocentre drop-off — **and cites the local rule behind the
answer**. When it is not sure, it says so instead of guessing, because one
confident mistake can contaminate a whole bin. The interface is
**bilingual, French by default** (EN toggle in the header), and the city
selector switches the whole rule set.

## Run it (no build, no backend, no account)

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Any static file server works. **No internet connection is needed at
all**: the classification libraries and the model weights are vendored in
this repo (`vendor/`, `model/`), and classification runs **100% in your
browser** — no photo ever leaves the device.

## Try the demo path

1. Click a sample photo, or upload your own (verdicts below were measured
   on the live app):
   - **Plastic bottle** → Recycling, rule cited (model: "water bottle",
     73%).
   - **Beer bottles (glass)** → Recycling; now set the condition to
     **Cassé / Broken** → Garbage, wrapped and labelled: broken glass
     never goes loose in the recycling bin. The condition is what
     decides — so TriClair asks.
   - **Banana** → Compost (96%).
   - **Cell phone** → Ecocentre drop-off (91%).
   - **Teddy bear ("unknown")** → **Uncertain** verdict + manual material
     picker. TriClair never invents an answer.
2. Switch the city to **Montréal** and try a coffee cup or a plastic bag
   by photo or picker: the bins differ from Longueuil (see the traps
   below) — same app, different local rules.
3. Watch the **impact journal** (top panel): it counts **every** verdict
   by stream — including the uncertain ones — plus the uncertain rate,
   the share of photo verdicts the app refused to guess. Export the
   journal as JSON any time.
4. No photo? The **manual material picker** runs the same rules engine.
   Picker answers show the rule but **no confidence percentage** — there
   is no model guess behind them; confidence is a photo-path figure only.

## How it works

| File | Role |
|---|---|
| `index.html`, `style.css` | Single-page bilingual UI (FR default) |
| `app.js` | Photo flow (MobileNet), journal (localStorage), picker, city/language state |
| `rules.js` | **Pure rules engine** — explicit per-city datasets (Longueuil, Montréal); item × condition (clean / soiled / broken) → bin + rule text in French and English. No dependencies; runs in browser and Node. |
| `test/rules.test.js` | Node test suite for the engine (no dependencies) |
| `samples/` | Demo photos (see `samples/CREDITS.md`) |
| `eval/` | Real-photo evaluation: 60 photos, harness, raw results (see below) |

Classification: TensorFlow.js **4.20.0** + MobileNet **2.1.1**
(`@tensorflow-models/mobilenet`, MobileNet v2 1.0/224 weights), **vendored**
in `vendor/` + `model/` (Apache-2.0, © Google — see the license headers in
the vendored files). The model's top label is matched to a waste item by
**exact token phrases** (whole tokens, in order, inside one label
segment — so "can opener" is not a can, a bare "cup" is not a coffee cup,
and "pineapple" does not match via "apple"); known false friends are
excluded by an explicit no-match list. Below **35% confidence**, or for
an unmatched label, the verdict is *Uncertain* by design.

## The traps (where the bin surprises)

Same item, different city — this is the point of the app:

- Grease-soiled pizza box / cardboard → **compost** (both cities), not
  recycling.
- Paper coffee cup → **garbage in Longueuil** (plastic-lined), but
  **recycling in Montréal** (take-out food packaging is accepted there).
- Plastic film and bags → **garbage in Longueuil** (they jam sorters),
  but **recycling in Montréal** when clean (film and bags are on
  Montréal's accepted list); soiled film stays garbage in both.
- Styrofoam food tray → **garbage in Longueuil**, **recycling in
  Montréal**; protective styrofoam that crumbles into beads → drop-off
  in Montréal, garbage in Longueuil.
- Broken glass → **garbage, wrapped and labelled** (both cities), never
  loose in the recycling bin.
- Electronics, phones, batteries → **ecocentre** (both cities), never a
  curbside bin.

## Evaluation — measured on 60 real photos

We evaluated the shipped app honestly, on **60 real, uncurated Pexels
photos** (5 per item × 12 items, fixed before any classification ran).
Full data, method and per-item tables: **[eval/RESULTS.md](eval/RESULTS.md)**
(raw data: `eval/results.json`; photo sources: `eval/CREDITS.md`).

| Outcome (threshold 0.35, Longueuil) | Count | Share |
|---|---|---|
| Correct item | 6 / 60 | 10.0 % |
| Uncertain (honest refusal) | 49 / 60 | 81.7 % |
| Wrong item | 5 / 60 | 8.3 % |
| Bin correct among decided verdicts | 10 / 11 | 90.9 % |

The generic ImageNet model usually does not recognize real-world waste
photos at all — that is the measured bottleneck, and no threshold in the
0.20–0.45 sweep fixes it (the sweep is in RESULTS.md; 0.35 stays, by the
data). When the model does commit to a known label, the rules engine
puts it in the right bin 10 times out of 11. An earlier draft of this
project claimed an "uncertain rate under 15 %" target: that described
curated demo samples only. **On real photos the measured uncertain rate
is 81.7 %**, and the target is withdrawn as a real-world claim.

## Tests

```sh
node test/rules.test.js   # 805 assertions: both cities × 12 items × 3 conditions,
                          # bilingual rule texts, label-matching edge cases,
                          # uncertain logic, manual path — all must pass
```

## Sources (official)

Rules are encoded from the municipalities' own published guidance —
nothing is invented:

- **Longueuil** — collections hub: https://longueuil.quebec/fr/collectes ;
  brown-bin (organics) guides, Ville de Longueuil (cms.longueuil.quebec),
  which list single-use coffee capsules and coffee cups among the
  materials **refused** in the brown bin; bylaw VL-2008-346 (codification
  of 2025-03-20) defines recyclables as containers, packaging and printed
  matter per its Annex II.
- **Montréal** — "Quoi mettre dans le bac des matières recyclables",
  montreal.ca (article 83068, FR/EN):
  https://montreal.ca/articles/quoi-mettre-dans-le-bac-des-matieres-recyclables-83068
  (film and bags accepted; styrofoam food trays accepted; crumbly
  protective styrofoam refused; soiled paper/cardboard → brown bin;
  electronics, textiles, drinking glass refused at the curb);
  organics guidance, montreal.ca (Saint-Laurent borough page);
  **Bac Impact** (Éco Entreprises Québec, the designated organization
  since 2025-01-01): https://bacimpact.ca — one rule (containers,
  packaging, printed matter), three exceptions (aerosols, protective
  styrofoam packaging, biodegradable/compostable plastics). Montréal's
  open-data portal (donnees.montreal.ca) was consulted: it publishes
  collection sectors/schedules, no materials lists.
- Nomination nuance, stated plainly: montreal.ca does not name coffee
  cups explicitly; cup → recycling in Montréal rests on its accepted
  "take-out food packaging" + container rule and on the Éco Entreprises
  Québec rule (a lidded container; cups are not among the three
  exceptions). The same reasoning is written in the `rules.js` header.

## Screenshots

`docs/screenshots/` documents the gallery status: the current French
interface is best judged live (link at the top of the Devpost page), and
fresh captures are produced by `video/capture_shots.py` in the project
workspace — see `docs/screenshots/README.md` for the measured demo
verdicts and the capture protocol.

## Honest limitations

- MobileNet was trained on ImageNet, not on waste. The evaluation above
  measures exactly how much that costs on real photos; the uncertain
  path and the manual picker are first-class features for that reason.
- Label coverage is partial by construction: only the model's **top-1**
  label is used, matched by exact token phrases against a hand-kept
  phrase list; an object the model names differently is *uncertain*,
  never forced.
- Two cities today (Longueuil, Montréal), each an explicit dataset in
  `rules.js` — Montréal's was built from the published guides above, not
  field-verified bin by bin.
- The journal lives in your browser's localStorage only. Nothing is
  uploaded.

## What's next

A waste-specific fine-tuned classifier (the measured bottleneck), more
municipalities' datasets, and a documented in-interface usage session
(the protocol is written in `eval/SESSION_USAGE.md`).
