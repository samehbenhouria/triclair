# Screenshots — real verdicts, current French interface

Captured **2026-10-31** on the deployed app
(https://samehbenhouria.github.io/triclair/) with the project's
`video/capture_shots.py` (headless Chromium, demo mode), after the
interface became French-by-default with the city selector. Every
confidence below is the value the page itself displayed at capture
time — and each one reproduces the figure first measured on
2026-10-28, to the point.

| File | What it shows | Measured verdict |
|---|---|---|
| `frame_00_home.png` | Home, French default, city selector (Longueuil), FR/EN toggle, model ready | — |
| `frame_01_bottle.png` | Plastic bottle sample | **Recyclage** — « water bottle », 73 % |
| `frame_02_glass_clean.png` | Beer bottles, condition Propre | **Recyclage** — « beer bottle », 78 % |
| `frame_03_glass_broken.png` | Beer bottles, condition Brisé | **Ordures** (emballé — règle de sécurité) — « beer bottle », 78 % |
| `frame_04_banana.png` | Banana sample | **Compost** — « banana », 96 % |
| `frame_05_phone.png` | Cell phone sample | **Écocentre** — « cellular telephone », 91 % |
| `frame_06_unknown.png` | Teddy bear sample | **Incertain** + sélecteur manuel — « teddy, teddy bear » non reconnu, 98 % |
| `frame_07_impact.png` | Impact panel of the capture profile | 12 objets triés (deux séquences de démo complètes, 2026-10-28 + 2026-10-31, dans le même profil persistant) : recyclage 4, compost 2, ordures 2, écocentre 2, taux d'incertain 17 % |
| `montreal_coffee.png` | **Montréal** selected; a real coffee-cup photo (from the evaluation set) fed through the file input | **Incertain** — confiance 29 % < 35 %; le texte de repli nomme le guide des déchets **de Montréal** (la ville est propagée partout, y compris dans le refus honnête) |

Notes, plainly:

- The demo panel's 17 % uncertain rate is a curated-samples figure.
  The uncurated real-photo rates are in `eval/RESULTS.md` (81.7 %
  uncertain) and the documented UI session in `eval/SESSION_USAGE.md`
  (13 of 15 uncertain). All three are published; none is hidden.
- The Montréal coffee-cup shot shows an *uncertain*, not the
  cup → recycling rule: on that photo the model stopped at 29 %. The
  Montréal differences themselves (cup, film, styrofoam tray) are
  proven by the 805-assertion test suite against the sourced rule
  data, and the selector's effect is visible in the frame (city name
  propagated into the verdict text).
- Capture history: a first capture attempt on 2026-10-30 failed
  (platform WebGL policy gate); the gate's resolution is recorded in
  `eval/SESSION_USAGE.md`.
