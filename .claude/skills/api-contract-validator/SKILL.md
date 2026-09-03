---
name: "api-contract-validator"
description: "Validates Express endpoint contracts in TeamOP server/index.js — auth middleware, request validation, and above all what each response is allowed to contain. Use when adding or changing an /api route, or when auditing an endpoint for over-disclosure."
---

# API Contract Validator — TeamOP

## Description

`server/index.js` exposes the whole TeamOP API. Endpoints are terse and hand-rolled; the recurring defect is not a crash but **over-disclosure** — a response that returns more than the caller proved they may see.

## Auth tiers

| Middleware | Who | Use for |
|---|---|---|
| *(none)* | Anyone on the internet | Only genuinely public data |
| `monAdmin` | Signed-in control-tower user | Reading client/space data |
| `monPatronStrict` | Owner only | Destructive or credential-bearing actions |

## Rules

1. **Name the audience before writing the response.** For each field ask: may an anonymous caller who guessed an identifier see this? If not, the endpoint needs auth — not obscurity.
2. **A route with no middleware is a public API.** Rate limiting is not authentication. Treat every unauthenticated route as fully enumerable.
3. **Never return a credential, team key, or password — derived or provisional — to an unauthenticated caller.** This includes fields buried inside a base64 blob.
4. **Validate and clamp every input** (`monStr(x, n)` and friends). Length-bound anything that reaches disk, a log, or an e-mail subject.
5. **Errors must not oracle.** Distinguishing "unknown company" from "wrong key" hands an attacker an enumeration tool; keep messages uniform where it matters.
6. **Secrets leave only through `mailerEnvoi` with `confidentiel: true`** and a `trace` describing the delivery without the secret.
7. **Fail closed.** An empty `catch {}` around an auth or ownership check turns a denial into an allow.

## Review checklist per endpoint

- [ ] Correct middleware for the most sensitive field returned
- [ ] Every response field justified for the least-privileged caller
- [ ] Inputs validated and length-clamped
- [ ] No secret in the response, the log line, or the error text
- [ ] Failure paths deny rather than fall through
