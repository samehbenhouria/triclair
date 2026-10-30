#!/usr/bin/env python3
"""Print every number that eval/RESULTS.md publishes, computed from
eval/results.json. Fractions are exact; percentages use one decimal,
computed as 100*n/d with no rounding in our favour beyond display."""
import json
import os
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, "results.json")))
recs = [data[k] for k in sorted(data)]
N = len(recs)
THRESHOLDS = ["0.2", "0.25", "0.3", "0.35", "0.45"]


def pct(n, d):
    return f"{100.0 * n / d:.1f}%" if d else "n/a"


out = Counter(r["outcome"] for r in recs)
print(f"TOTAL n={N}  correct={out['correct']} ({pct(out['correct'], N)})  "
      f"incertain={out['incertain']} ({pct(out['incertain'], N)})  "
      f"faux={out['faux']} ({pct(out['faux'], N)})")
bm = sum(1 for r in recs if r["bin_match"])
decided = [r for r in recs if r["outcome"] != "incertain"]
bmd = sum(1 for r in decided if r["bin_match"])
print(f"bin_match overall={bm}/{N} ({pct(bm, N)})  among decided={bmd}/{len(decided)} ({pct(bmd, len(decided))})")
print()
by = defaultdict(list)
for r in recs:
    by[r["expected_item"]].append(r)
print(f"{'item':16s} {'n':>2s} {'correct':>7s} {'incertain':>9s} {'faux':>4s}  top-1 labels seen")
for item in sorted(by):
    rs = by[item]
    o = Counter(r["outcome"] for r in rs)
    labels = Counter(r["top3"][0]["label"] for r in rs)
    lab = ", ".join(f"{k} x{v}" for k, v in labels.most_common())
    print(f"{item:16s} {len(rs):2d} {o['correct']:7d} {o['incertain']:9d} {o['faux']:4d}  {lab}")
print()
print("threshold sweep (item-level outcomes across all photos):")
for t in THRESHOLDS:
    o = Counter(r["sweep"][t] for r in recs)
    print(f"  T={t:5s} correct={o['correct']:2d} ({pct(o['correct'], N)})  "
          f"incertain={o['incertain']:2d} ({pct(o['incertain'], N)})  "
          f"faux={o['faux']:2d} ({pct(o['faux'], N)})")
print()
print("non-clean conditions:")
for r in recs:
    if r["condition"] != "clean":
        print(f"  {r['file']:44s} top1={r['top3'][0]['label']} {r['top3'][0]['p']}"
              f" -> {r['outcome']} (bin {r['verdict']['bin']} vs expected {r['expected_bin']})")
