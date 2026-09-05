---
name: "security-penetration-tester"
description: "Offensive review of TeamOP's own attack surface — unauthenticated endpoints, credential and team-key disclosure, secrets in logs and e-mail archives, Firestore rule gaps. Use when auditing server/index.js, adding an endpoint, or verifying a security fix on this codebase."
---

# Security Penetration Tester — TeamOP

## Description

Adversarial review of TeamOP, scoped to **this codebase, with authorisation from its owner**. The recurring weakness is not memory safety — it is disclosure: endpoints and logs that hand out more than the caller has proved they may have.

## Threat model

The realistic attacker knows only a **company name**. Company names are public. Anything reachable from a company name alone is effectively public.

## Attack surface to re-test

| Surface | Question |
|---|---|
| Unauthenticated `/api` routes | What does a caller with only a company name obtain? |
| Space `code` blob | Base64 is not encryption — is `k` (team key) or a credential inside? |
| `mails-envoyes.json` | Does any archived body contain a password or security code? |
| Contact-box copies (bcc) | Is a credential-bearing mail copied there? |
| Firestore collections | Any collection, prod or beta, with no deployed rule? |
| `localStorage` (`elan_*`) | Is a bootstrap credential left behind after use? |
| Error messages | Do they distinguish cases usefully enough to enumerate? |

## Rules

1. **Assume enumeration.** Rate limiting slows an attacker; it does not authenticate one.
2. **Base64, hex, and obfuscation are encodings.** If a blob is served, every field in it is disclosed.
3. **A secret in a log is a disclosed secret.** Fixing the code does not fix the archive — historical files must be purged separately.
4. **Provisional and derived credentials are credentials.** "It expires at first login" is not a control if an attacker can reach it first.
5. **Verify the fix by replaying the attack**, not by reading the diff.
6. **Report severity by what the attacker gains**, not by how clever the bug is. Full space read/write outranks a guessable password.
7. **Stay in scope.** This skill covers the owner's own systems; it is not for third-party targets.

## Checklist when auditing a change

- [ ] Attacker model applied: what does a company name alone yield?
- [ ] No credential or team key in any unauthenticated response
- [ ] No secret in logs, archives, or bcc copies
- [ ] Historical data purged where a secret was previously written
- [ ] Firestore rules cover every collection touched
- [ ] Fix verified by replaying the original attack
