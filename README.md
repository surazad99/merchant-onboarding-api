# Merchant Onboarding API (NestJS take-home)

Merchant application lifecycle with RBAC, **object-level authorization**, an asynchronous
BullMQ risk review (retries, backoff, idempotency) and an audit trail.

Stack: TypeScript, NestJS 10, PostgreSQL + TypeORM (reviewed migrations), Redis + BullMQ,
JWT, Swagger, Jest + Supertest, Docker Compose.

## Quick start

```bash
npm install
npm run setup:env          # creates .env with random secrets (never committed)
docker compose up -d postgres redis
npm run seed               # runs migrations + demo users (password = SEED_PASSWORD in .env)
npm run start:dev          # http://localhost:3000  |  Swagger: http://localhost:3000/docs
```

Full stack in Docker: `docker compose up --build` (the API runs migrations on boot).

Demo users (after `npm run seed`): `admin@`, `reviewer@`, `sales1@`, `sales2@` `example.test`.

### Tests

```bash
npm test                   # unit tests (no services needed)
docker compose up -d postgres redis
npm run test:e2e           # integration tests; uses an isolated <DB_NAME>_test database + its own Redis key prefix
```
## Swagger Documents

* Go to /docs to see the swagger api documentation.

## Roles & object-level rules

| Capability                      | ADMIN | REVIEWER                 | SALES            |
|---------------------------------|:-----:|:------------------------:|:----------------:|
| Create / edit / submit app      |  yes  |            no            | only their own   |
| View application                |  all  | only assigned to them    | only their own   |
| Assign reviewer                 |  yes  |            no            |       no         |
| Record decision                 |  **no** | only if assigned       |       no         |
| Audit trail, user management    |  yes  |            no            |       no         |

* `ApplicationPolicy` is the single place for object rules (`canView/canEdit/canDecide`) plus a SQL
  scope used by list queries, so list and by-ID access can't drift apart.
* Objects the caller may not see return **404, not 403**, so IDs can't be probed. A visible-but-forbidden
  action (e.g. ADMIN trying to decide) returns 403.
* `RolesGuard` is **deny-by-default**: a route without `@Roles()` (and not `@Public()`) is rejected.
* Users are re-loaded from the DB on every request, so deactivation / role changes apply immediately.
* DTO validation uses `whitelist + forbidNonWhitelisted`, which blocks mass-assignment (`status`, `createdById`...).

## Lifecycle

```
DRAFT --submit--> SUBMITTED --(risk worker)--> UNDER_REVIEW --approve--> APPROVED
  ^                  ^                              |--reject---------> REJECTED
  |                  '------submit (resubmit)-------'--request_info---> INFO_REQUESTED
  '-- editable only in DRAFT and INFO_REQUESTED
```

Transitions live in one table (`application-state-machine.ts`); invalid ones raise `409 Conflict`.
Decisions are only possible from `UNDER_REVIEW`, i.e. after the risk review has produced a result.

## Async risk review

1. `POST /applications/:id/submit` commits the state change + audit row in one transaction (row-locked),
   then enqueues a job with the deterministic id `risk-<applicationId>-<submissionNumber>` (returns **202**).
2. The worker (`RiskProcessor`) calls the simulated provider **outside** any transaction, then persists the
   result, moves the application to `UNDER_REVIEW`, and writes an audit row in **one transaction under a row lock**.
3. **Retries:** `attempts` (default 5) with exponential backoff (`RISK_BACKOFF_MS`). The provider randomly
   fails (`RISK_SIMULATED_FAILURE_RATE`) so this is visible in dev.
4. **Exhausted retries** don't leave the application stuck: it moves to `UNDER_REVIEW` with
   `riskStatus = FAILED` and a `RISK_REVIEW_FAILED` audit entry, so a human can review manually.
5. **Idempotency (defence in depth):** deterministic job id -> staleness check (skip unless still `SUBMITTED` for
   *this* submission) -> re-check under lock -> `UNIQUE (application_id, submission_number)` on `risk_reviews`.
   Tests replay and race duplicate jobs and assert exactly one result and one audit row.
6. Only minimal data goes to the "third party" (no owner PII / tax ID).

## Security notes

* No secrets in the repo: `.env` is git-ignored and generated; Compose requires it (`${VAR:?}`); config is validated at boot.
* Passwords: bcrypt; constant-ish-time login (dummy hash for unknown emails); identical 401 message.
* JWT: HS256 pinned, short expiry (15m).
* **Audit/log redaction:** audit metadata passes through `redact()` (keys like password/token/secret/taxId/card...).
  Updates log changed field **names only**, never values. The exception filter never logs request bodies.
* **Field-level encryption:** `owner_tax_id` is encrypted with AES-256-GCM (`v1:iv:tag:ciphertext`, key in
  `FIELD_ENCRYPTION_KEY`), returned only masked (`*******4321`). Other fields that *should* get the same treatment
  in production: owner phone/email, bank account details, government IDs. Encrypted columns can't be searched by equality.
* helmet enabled; Swagger disabled when `NODE_ENV=production`.

## Design decisions & trade-offs

* **Enqueue after commit (no outbox).** If Redis is down at submit time, the application is committed as `SUBMITTED`
  but no job exists. Mitigation: `POST /applications/:id/risk-review/enqueue` (ADMIN) re-enqueues idempotently. A
  production system would use a transactional outbox or a periodic sweeper.
* **Pessimistic row locks** on mutations (simple, correct for low contention); `version` column also present.
* **PostgreSQL for audit logs** (permitted by the brief). Table is append-only by convention; production would
  add DB-level immutability (revoke UPDATE/DELETE) or ship to WORM storage.
* **Schema** via hand-written migration with CHECK constraints and indexes matching the scoped list queries;
  `synchronize` is off. Migrations auto-run when `DB_RUN_MIGRATIONS=true`.
* Reviewers see only applications assigned to them (least privilege).


## AI assistance disclosure

> Claude Ai is used as the coding assistant. Every api is manually tested and code enhanced going from controller to the response. 
> output (e.g. read every file, ran unit + e2e suites, manually exercised endpoints through Swagger, reviewed the
> authorization paths line by line).
