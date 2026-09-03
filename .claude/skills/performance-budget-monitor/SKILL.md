---
name: "performance-budget-monitor"
description: "Performance budget guardian for TeamOP. Use before merging anything that grows app.html / beta.html, adds an asset or dependency, or touches list rendering and sync — the app is a multi-megabyte single file loaded on field phones over mobile data."
---

# Performance Budget Monitor — TeamOP

## Description

`app.html` and `beta.html` are single files of roughly 2.2 MB each. Every kilobyte is parsed on every cold start, on a phone, often on a weak connection. There is no bundler to save you.

## Budgets

| Item | Budget | Why |
|---|---|---|
| `app.html` / `beta.html` | Must not grow without justification | Parsed in full at each cold start |
| Any new image | WebP, sized to display | Logos were cut ~930 KB by this alone |
| New runtime dependency | Default: none | No bundler, no tree-shaking |
| Long lists | Virtualise or paginate | Journals and client lists grow unbounded |

## Rules

1. **Measure before and after.** State the byte delta of any change to the HTML apps. "Small" is not a measurement.
2. **New third-party script: justify or refuse.** Prefer a few lines of local code over a library.
3. **Images ship as WebP**, dimensioned to actual display size, never full-resolution originals scaled by CSS.
4. **No unbounded rendering.** Movement journals, consumption analysis, and client lists must cap or virtualise; rendering thousands of rows freezes the device.
5. **Sync payloads stay incremental.** Never re-download a whole space to refresh one view.
6. **Guard the cold start.** Work that is not needed for first paint is deferred; nothing blocking that the field user does not immediately need.
7. **Watch the precache total** — it is downloaded on install, on mobile data.

## Checklist

- [ ] Byte delta measured and stated
- [ ] No new dependency, or justified
- [ ] Images WebP and correctly sized
- [ ] New lists bounded
- [ ] Cold start not regressed
