---
name: "database-architect"
description: "Data-model and Firestore authority for TeamOP / ELAN GESTION. Use when adding a collection or field, changing security rules, touching the team sync key model, or working with the elan_* localStorage namespace and the space registry JSON files."
---

# Database Architect — TeamOP

## Description

TeamOP stores data in three distinct places, each with different trust properties. Most data bugs here come from confusing them.

## The three stores

| Store | Where | Trust |
|---|---|---|
| Firestore | `elan_teams` (prod), `elanB_teams` (beta) | Shared, rule-enforced |
| Browser | `localStorage`, `elan_*` keys | Per-device, fully user-readable |
| Server JSON | `DATA_DIR/*.json` (`espaces`, `mails-envoyes`, `clients`, …) | Server-only, on disk, unencrypted |

## Rules

1. **Every new Firestore collection ships with a rule.** A collection without a matching entry in `firestore.rules` is world-accessible in practice. Editing the file is not enough — the rules must be deployed.
2. **Keep prod and beta collections separate.** Never let a beta code path write into `elan_teams`.
3. **The team key (`k`) is the crown jewel.** It is the sync secret: whoever holds it can read and write the whole space. It must never appear in a response to an unauthenticated caller, in a log, or in an e-mail.
4. **Base64 is not encryption.** The space `code` is a base64 JSON blob (`t`, `k`, `n`, `e`, …). Treat every field in it as public the moment the blob is served.
5. **Server JSON files are plaintext on disk.** Never write a password, security code, or team key into one. If a field could be a secret, store a derived hash or a reference, not the value.
6. **`localStorage` is not storage for secrets.** `elan_*` keys are readable by anyone with the device. Bootstrap credentials placed there must be consumed and removed in the same session.
7. **Migrations must tolerate old records.** Registry entries written by earlier versions still exist; read paths need a fallback, and rewrites must preserve `t` and `k` exactly.

## Checklist

- [ ] New collection has a deployed rule
- [ ] No secret written to a JSON data file or `localStorage`
- [ ] Prod/beta namespaces respected
- [ ] Old-format records still readable
