# TriClair — real-photo evaluation results

Measured 2026-10-30 on **60 real, uncurated photos** (Pexels, 5 per item ×
12 items; sources in `CREDITS.md`), run through the shipped model and the
shipped rules engine. Raw per-photo data: `results.json` (top-3 labels +
probabilities, verdict, expected item/bin, outcome, threshold sweep).
Every number below is recomputed from `results.json` by `summarize.py` —
no hand-entered figures, no rounding in our favour (percentages are
100 × n/60 at one decimal).

## Headline numbers (threshold 0.35, city: Longueuil)

| Outcome | Count | Share |
|---|---|---|
| Correct item | 6 / 60 | 10.0 % |
| Uncertain (honest refusal) | 49 / 60 | 81.7 % |
| Wrong item | 5 / 60 | 8.3 % |
| **Bin correct (any route)** | **10 / 60** | **16.7 %** |
| Bin correct among the 11 decided verdicts | 10 / 11 | 90.9 % |

Read this plainly: **on real photos, the generic ImageNet model usually
does not recognize the object at all.** The top-1 labels are often
unrelated ("jigsaw puzzle" for food scraps, "spider web" for a plastic
bag, "ballpoint pen" for bottles and for newspapers). When the model does
commit to a label our mapping knows (11 of 60), the rules engine puts it
in the right bin 10 times out of 11 — the one miss is a worn phone read
as "comic book" (→ paper → recycling instead of écocentre). The
recognition layer is the weak link, not the rules and not the honesty
layer: 49 of 60 photos end in a declared *uncertain* with a manual
material picker offered, instead of a confident wrong answer.

## Per item

| Item | n | Correct | Uncertain | Wrong | What the model saw (top-1 labels) |
|---|---|---|---|---|---|
| cardboard | 5 | 2 | 3 | 0 | carton ×3, wallet, laptop |
| electronics | 5 | 2 | 2 | 1 | cell phone ×2, remote, jigsaw puzzle, comic book |
| pizza_box | 5 | 1 | 3 | 1 | pizza, acorn squash, pencil box, envelope, file cabinet |
| plastic_bottle | 5 | 1 | 4 | 0 | water bottle ×2, bucket, gasmask, bottlecap |
| glass_bottle | 5 | 0 | 3 | 2 | pop bottle, water bottle, ballpoint pen, bobsled, bathtub |
| metal_can | 5 | 0 | 4 | 1 | bottlecap, loudspeaker, wine bottle, seat belt, lighter |
| coffee_cup | 5 | 0 | 5 | 0 | cup, bucket, ashcan, Band Aid, water bottle |
| food_scraps | 5 | 0 | 5 | 0 | jigsaw puzzle ×2, lighter, iron, stove |
| paper | 5 | 0 | 5 | 0 | pencil box, radiator, ballpoint pen, upright piano, wallet |
| plastic_film | 5 | 0 | 5 | 0 | spider web ×2, prayer rug, dragonfly, sarong |
| styrofoam | 5 | 0 | 5 | 0 | candy store, wall clock, bathtub, lens cap, water bottle |
| textile | 5 | 0 | 5 | 0 | sweatshirt ×2, wool, mailbag, Windsor tie |

The four non-clean conditions (from the filename convention): crushed
plastic bottle → uncertain; soiled pizza boxes → uncertain; crumpled
plastic film → uncertain; worn phone (broken) → **wrong** ("comic book",
0.42 — the single decided bin error).

## Threshold sweep (same recorded probabilities, shipped token matching)

| Threshold | Correct | Uncertain | Wrong | Decided |
|---|---|---|---|---|
| 0.20 | 7 (11.7 %) | 48 (80.0 %) | 5 (8.3 %) | 12 |
| 0.25 | 6 (10.0 %) | 49 (81.7 %) | 5 (8.3 %) | 11 |
| 0.30 | 6 (10.0 %) | 49 (81.7 %) | 5 (8.3 %) | 11 |
| **0.35 (shipped)** | **6 (10.0 %)** | **49 (81.7 %)** | **5 (8.3 %)** | **11** |
| 0.45 | 4 (6.7 %) | 55 (91.7 %) | 1 (1.7 %) | 5 |

**Decision: keep 0.35.** No tested threshold materially improves the
correct rate — dropping to 0.20 buys exactly one additional correct item
while the wrong count is unchanged, and 0.45 halves the decided set.
The bottleneck is upstream recognition (most top-1 labels are unmapped
at *any* probability), so recalibrating the threshold cannot fix it; what
a lower threshold would mostly do is dress guesses up as answers. 0.35
keeps the decided set small and 90.9 % bin-accurate.

## The "uncertain rate under 15 %" target — not met, and rewritten

The earlier project text carried a target of "uncertain rate under
15 %". That figure described the curated demo samples only. **On
uncurated real photos the measured uncertain rate is 81.7 % (49/60).**
The target is therefore withdrawn as a claim about real-world photos and
replaced, in the README and the submission text, by the measured rates
above. A waste-specific classifier (fine-tuned on recycling imagery) is
the identified fix and is future work; it is not claimed anywhere in the
current product.

## Method and one declared deviation

- Photos: first suitable results on each item's Pexels search page —
  real photographs only (AI-bundle results excluded), no cropping, no
  selection by outcome (the set was fixed before any classification ran).
- Engine: the shipped `rules.js` (token-phrase label matching,
  Longueuil rule set, condition from the filename convention), the
  vendored MobileNet 2.1.1 package and the vendored weights, loaded with
  the app's exact config (`version: 2, alpha: 1.0, modelUrl`).
- **Deviation:** the prescribed runner drove the model inside the
  deployed web page via headless Chromium (`run_eval.py`). Since the
  2026-10-30 platform restart, this VM's Chromium build refuses to start
  without the browser-daemon's WebGL domain policy, which is not
  available to a headless script (verbatim error and attempts:
  `SESSION_USAGE.md`). The evaluation therefore ran with
  `run_eval_node.js`: the *same* vendored JS artifacts and weights, the
  *same* load config, the *same* shipped rules module — on TensorFlow.js's
  CPU backend in Node, with JPEGs decoded to raw RGB by PIL (MobileNet
  then applies its own resize/normalization, as it does for an `<img>`).
  CPU-vs-WebGL arithmetic can move the last decimals of a probability;
  it does not change which photographs the model fails to recognize.
  Re-runs of sampled photos reproduced `results.json` exactly (3/3 spot
  checks, identical records).
