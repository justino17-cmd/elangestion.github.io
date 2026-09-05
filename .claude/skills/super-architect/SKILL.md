---
name: "super-architect"
description: "Architecture authority for the TeamOP / ELAN GESTION codebase (single-file HTML apps, Express API, Firestore sync). Use when adding a feature that spans app.html and beta.html, when deciding where code belongs, when bumping APP_VERSION, or when production and beta risk drifting apart."
---

# Super Architect — TeamOP

## Description

Guards the structural decisions of a codebase whose main artefacts are two ~2.2 MB single-file HTML applications (`app.html` = production, `beta.html` = beta), a single Express server (`server/index.js`, ~2 400 lines), and Firestore for cross-device sync.

## The shape of this system

| Layer | File | Notes |
|---|---|---|
| Production app | `app.html` | `APP_VERSION` near the top; everything inline |
| Beta app | `beta.html` | `APP_VERSION` suffixed `-beta`; generated/maintained alongside |
| Beta build | `beta-build.js` | Keeps beta in step with production |
| API | `server/index.js` | Express, no framework layering |
| Mail | `server/mail.js` + `mailerEnvoi()` | Every outbound mail goes through the wrapper |
| Rules | `firestore.rules`, `storage.rules` | Versioned; must be deployed, not just edited |
| Offline | `sw.js` | Precache + update banner |

## Rules

1. **Never change one app without the other.** Any behaviour landing in `app.html` needs a decision recorded for `beta.html`: ported, deliberately beta-only, or deliberately prod-only. Silent divergence is the main defect source in this repo.
2. **Bump `APP_VERSION` for any user-visible change** and update the in-app changelog/announcement in the same commit. A version whose announcement text is stale is a bug.
3. **Server is the only trust boundary.** The HTML apps are fully readable by users; never treat anything inline in them as secret.
4. **Prefer server-side fixes.** A change in `server/index.js` fixes production and beta at once — a change in the HTML must be done twice.
5. **Resist new files.** This codebase is deliberately flat. Add a file only when the alternative is worse, and never leave working files at repo root.
6. **Firestore collections are namespaced per environment** (`elan_teams` vs `elanB_teams`). A new collection needs a matching rule before it ships — an unruled collection is an open door.

## Checklist before declaring an architecture change done

- [ ] Applied to production and beta, or divergence deliberately recorded
- [ ] `APP_VERSION` bumped and announcement text updated
- [ ] New Firestore collections covered by `firestore.rules`
- [ ] No secret introduced into client-side code
- [ ] Rollback path stated (which version to return to)
