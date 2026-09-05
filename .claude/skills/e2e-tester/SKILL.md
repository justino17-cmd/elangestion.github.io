---
name: "e2e-tester"
description: "End-to-end test authority for TeamOP's critical journeys — link-based login, first connection, interventions, stock and box movements, delivery slips, and DR validation. Use when changing a user-facing flow or before publishing a version to production."
---

# E2E Tester — TeamOP

## Description

TeamOP has little automated coverage and ships as whole HTML files. The protection against regression is a disciplined pass over the journeys that, if broken, stop a business from working that day.

## Critical journeys

1. **Link login** — open `app.html#e=<space>`, land in the right space, data present.
2. **Login by company name** — type the company name, identify, reach the same space.
3. **First connection** — a brand-new space bootstraps its admin account and forces a real password.
4. **Forgotten password** — e-mail code path, including an account with no e-mail on file.
5. **Intervention** — create, edit, complete, with photos and GPS.
6. **Stock and box movements** — create, record the recipient, journal reflects it, counters agree.
7. **Delivery slip** — generate, recipient captured, matches the journal.
8. **DR validation** — approve and refuse; a refusal requires a reason.
9. **Offline** — record while offline, reconcile on reconnection with nothing lost.
10. **Update** — upgrade from the currently published version, not a clean profile.

## Rules

1. **Test the upgrade, not the install.** Regressions hide in the transition from the published version.
2. **Run each journey in production *and* beta** where the feature exists in both.
3. **Assert on data, not just on screens.** A view that renders while the counter is wrong is still a failure.
4. **Cover the refusal paths.** Empty reasons, missing e-mail, expired link, changed team key.
5. **Never test against live customer data.** Use a disposable space.
6. **A journey is a regression test.** When a bug is fixed, the journey that would have caught it gets written down.

## Checklist before publishing

- [ ] All ten journeys pass on the candidate build
- [ ] Upgrade path from the published version verified
- [ ] Prod and beta both exercised
- [ ] Offline path verified
- [ ] Rollback version identified and reachable
