# Screenshots — status and measured verdicts

**Status (2026-10-30): no fresh captures of the current interface are
committed here, on purpose.** The interface changed on 2026-10-30
(French by default, city selector, Montréal rule set). The only captures
in existence predate that change (English UI, project workspace
`video/frames/`, 2026-10-28) and are **not** republished here: showing
the old UI as the current one would misrepresent the product. The
current interface is live and judgeable at
https://samehbenhouria.github.io/triclair/.

Fresh captures are produced by `video/capture_shots.py` (project
workspace), already adapted to the bilingual UI (it waits out both
"Classifying…" and "Classification en cours…"). Its 2026-10-30 run is
documented in `eval/SESSION_USAGE.md`: the VM's Chromium currently
refuses to start without the platform browser-daemon's WebGL policy, so
the capture is queued for the first browser-capable session before the
2026-12-21 deadline, in this order: home (French default + city
selector), bottle verdict, glass clean, glass broken, banana, phone,
unknown, impact panel, plus one Montréal verdict (coffee cup →
recycling).

## Measured demo verdicts (live app, 2026-10-28, pre-correction UI)

These are real outputs of the deployed app on its built-in samples —
the demo flow and samples are unchanged by the corrections:

| Sample | Verdict | Model label | Confidence |
|---|---|---|---|
| Plastic bottle | Recycling | water bottle | 73 % |
| Beer bottles, clean | Recycling | beer bottle | 78 % |
| Beer bottles, broken | Garbage (wrapped — safety rule) | beer bottle | 78 % |
| Banana | Compost | banana | 96 % |
| Cell phone | Ecocentre | cellular telephone | 91 % |
| Teddy bear | Uncertain + manual picker | (unmapped) | 98 % |

Demo impact panel after those six: 6 items sorted, uncertain rate 17 %
(1 of 6) — a curated-samples figure; the uncurated real-photo rates are
in `eval/RESULTS.md` and are very different. Both are published; neither
is hidden.
