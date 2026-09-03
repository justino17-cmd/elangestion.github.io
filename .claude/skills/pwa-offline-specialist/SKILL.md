---
name: "pwa-offline-specialist"
description: "Service-worker, caching, and offline-behaviour authority for the TeamOP PWA. Use when touching sw.js, the precache list, the update banner, version rollout, or any feature that must keep working with no network."
---

# PWA / Offline Specialist — TeamOP

## Description

TeamOP is installed as a PWA on phones used in the field, frequently offline. `sw.js` precaches the application shell so `app.html` opens without a network, and an in-app banner announces new versions.

## Rules

1. **Precache must include the shell the app falls back to.** If `app.html` is not precached, an offline launch is a blank screen.
2. **The update banner and `APP_VERSION` move together.** A cached old shell that reports a new version, or the reverse, makes rollout impossible to reason about. Bump the cache name on every release.
3. **Never cache an API response containing per-user data** in the shell cache. Space data, client lists, and mail belong in app storage, not the service-worker cache.
4. **Every network call needs an offline branch.** Field flows — recording an intervention, a stock movement, a delivery slip — must queue locally and reconcile later, never lose the entry.
5. **A failed fetch is not an empty result.** Distinguish "offline" from "server said nothing"; showing an empty list for a network error destroys trust in the data.
6. **Test the second launch, not the first.** Most service-worker defects only appear when a previous version is already installed. Verify upgrade from the currently published version, not from a clean profile.
7. **Keep the precache list honest.** A listed file that no longer exists makes the whole install step fail silently.

## Checklist

- [ ] Cache name bumped; old caches cleaned on activate
- [ ] Shell (`app.html`) reachable offline
- [ ] No per-user data in the shell cache
- [ ] Offline branch for each new network call
- [ ] Upgrade path tested from the published version
