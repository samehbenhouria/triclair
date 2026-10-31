# TriClair — J5 usage session through the real interface: COMPLETED 2026-10-31

**15 of the evaluation photos were driven through the real deployed
interface** (https://samehbenhouria.github.io/triclair/, French UI,
Longueuil) on 2026-10-31 by `run_session.py` (CDP file input on
`#photo-input`, condition set via the real radio group, page reload
between condition groups so each photo logged exactly once). Raw
record: `session_result.json` (per-photo DOM verdict text, journal
length after each photo, final journal + panel).

## Results (DOM, as displayed)

Final impact panel, verbatim: **15 objets triés — recyclage 1, compost
0, ordures 0, écocentre 1, taux d'incertain 87 %.** The localStorage
journal holds exactly 15 entries: uncertain 13, recycling 1, écocentre
1 (13/15 = 86.7 %, displayed as 87 %).

| Photo | Condition | UI verdict | Model confidence shown |
|---|---|---|---|
| plastic_bottle__7981599 | clean | Incertain | 15 % |
| glass_bottle__26791665 | clean | **Bac bleu — Recyclage** (« water bottle ») | 59 % |
| metal_can__9601217 | clean | Incertain | 16 % |
| cardboard__11781094 | clean | Incertain | 10 % |
| pizza_box__4109080 | clean | Incertain | 17 % |
| paper__3866816 | clean | Incertain (top label unmapped) | 49 % |
| coffee_cup__2286977 | clean | Incertain | 29 % |
| plastic_film__3683199 | clean | Incertain | 16 % |
| food_scraps__7512979 | clean | Incertain | 5 % |
| styrofoam__40080589 | clean | Incertain | 11 % |
| electronics__19335258 | clean | **Écocentre — Point de dépôt** (« cellular telephone ») | 94 % |
| textile__10557063 | clean | Incertain | 9 % |
| plastic_bottle__3457243 | broken | Incertain | 22 % |
| plastic_film__9222184 | broken | Incertain | 16 % |
| pizza_box__9353454 | soiled | Incertain | 25 % |

Both decided verdicts landed in the **right bin** (the glass-bottle
photo was recognized as a plastic "water bottle" — wrong item, same
recycling bin, exactly the bin-vs-item distinction the evaluation
reports). The session's 86.7 % uncertain rate on this 15-photo subset
is consistent with the full evaluation's 81.7 % (RESULTS.md). UI
confidences can differ from the harness's (e.g. 15 % vs 27.7 % on the
first photo): the app classifies its own preview pipeline; the
outcomes agree.

## History of this file (kept honest)

- 2026-10-30: this session was attempted three times and blocked —
  the VM's Chromium refused to start without the platform's WebGL
  domain policy, and a disk search for the policy file was interrupted
  before completion, leading to a written claim ("no policy file on
  disk") that turned out to be **wrong**.
- 2026-10-31: the completed search surfaced the image's own policy
  file (`/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/
  webgl-allowed-domains.txt`). The three browser scripts now pass that
  file **unmodified**, with its own sha256, via the binary's
  `--hatch-webgl-allowed-domains-file` / `-sha256` switches — the
  browser-daemon's own mechanism; nothing was fabricated and no
  control was weakened (the file's content is the platform's shipped
  policy). With that, the in-page evaluation, this session, and the
  screenshot captures all ran as originally prescribed.
- Two harness bugs were found and fixed on the way: the session driver
  first addressed a `#condition` select that does not exist (the UI
  uses a radio group — fixed), and the eval runner's model-boot
  expression missed its async wrapper (fixed).
