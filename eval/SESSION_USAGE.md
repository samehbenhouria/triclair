# TriClair — J5 usage session through the real interface: BLOCKED, documented

**Status (2026-10-30): NOT COMPLETED on this machine. No session numbers
exist, and none are claimed anywhere in the submission.** The session was
attempted three times through three distinct routes; all three failed at
the same root cause before a single photo could be fed to the page. The
driver script is finished and committed (`run_session.py`); the protocol
below is ready to execute verbatim on any machine whose Chromium can
start, or through a hosted browser session.

## What was attempted (real attempts, in order)

1. **`eval/run_eval.py`** (the in-page evaluation runner, same machinery):
   launched 2026-10-30 against the deployed page. Chromium never exposed
   its DevTools endpoint: `RuntimeError: no devtools` after the full
   45 s wait.
2. **Direct Chromium launch** (same binary the working scripts of
   2026-10-28 used, `/opt/meta-chromium/chrome --headless=new …`):
   exits immediately with the verbatim error
   `Hatch WebGL domain policy is required for browser startup`.
   The build's own README states: *"Normal startup requires the
   image-owned WebGL policy supplied by browser-daemon."* A filesystem
   search found no policy file on disk, and the switch that carries it
   (`--hatch-webgl-allowed-domains-file` + its sha256) is populated by
   the platform's browser-daemon for its own browser tasks only — it is
   not available to a headless script, and supplying a self-made policy
   would mean weakening a platform security control, which we do not do.
3. **`eval/run_session.py`** (the dedicated session driver): launched
   2026-10-30, same result — `RuntimeError: no devtools — Chromium did
   not start` after the full wait.

On 2026-10-28 the same scripts drove the same page successfully (the
demo verdicts of the original submission were measured that way); the
block dates from the 2026-10-30 platform restart, which replaced the
browser build with this policy-gated one.

## The protocol (ready to run)

`run_session.py` drives the deployed page
(https://samehbenhouria.github.io/triclair/) with 14 of the evaluation
photos through the real file input, grouped by filename condition with a
page reload between groups (each photo logs exactly once), then reads
the impact panel and the `localStorage` journal. Planned set: plastic
bottle clean + crushed, glass bottle, metal can, cardboard, pizza box
clean + soiled, paper, coffee cup, plastic film clean + crumpled, food
scraps, styrofoam, phone, textile. Expected outputs had it run: per-photo
DOM verdict texts, journal length after each photo, final per-stream
counts and uncertain rate — the numbers the submission's usage section
was to carry.

## Consequence for the submission text

The submission makes **no usage-session claim**. Where a session was
previously implied by a bare impact counter, the text now points to the
measured evaluation (`RESULTS.md`) as the usage evidence and states this
block plainly. If a browser-capable session runs the protocol above
before the 2026-12-21 deadline, this file gets its numbers appended with
date and method, and the submission text is updated to match.
