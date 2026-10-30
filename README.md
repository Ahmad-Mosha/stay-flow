# Stay Flow

[![CI](https://github.com/Ahmad-Mosha/stay-flow/actions/workflows/ci.yml/badge.svg)](https://github.com/Ahmad-Mosha/stay-flow/actions/workflows/ci.yml)

A booking platform for small hotels: a booking site for guests and a front desk app for staff. The
backend guarantees that a room is never sold twice: PostgreSQL enforces it, and concurrency tests
prove it.

**Live demo: [stayfloww.duckdns.org](https://stayfloww.duckdns.org)**

![The booking page of the demo hotel, with a price under every night](docs/screenshots/booking.webp)

**Stack:** TypeScript, NestJS, Kysely, PostgreSQL 18, Next.js 16, React Aria, Tailwind CSS 4, Zod.
Tested with Vitest, Testcontainers, Playwright and axe. Deployed with Docker Compose, Caddy and
GitHub Actions.

## Try it

| What                   | Link                                                            |
| ---------------------- | --------------------------------------------------------------- |
| Book a room as a guest | [/stay/dar-nubia](https://stayfloww.duckdns.org/stay/dar-nubia) |
| Run the front desk     | [/sign-in](https://stayfloww.duckdns.org/sign-in)               |
| Open a new property    | [/sign-up](https://stayfloww.duckdns.org/sign-up)               |
| API reference          | [/v1/docs](https://stayfloww.duckdns.org/v1/docs)               |

Staff accounts, all with the password `nubia-demo-password`: `host@example.com` (owner),
`manager@example.com` (manager) and `frontdesk@example.com` (front desk).

Before you test:

- There are six demo hotels in Aswan, Cairo, Dahab, Luxor, Lisbon and Marrakech, with about 2,300
  stays from four months ago to six months ahead. After signing in, switch hotels in the sidebar.
- The demo is shared and nothing resets it, so other people see your changes. Use made-up names
  and emails.
- Payment is simulated: no card is needed. Emails are caught by a test inbox and never delivered,
  so on the live site a guest cannot open the manage-booking link. Staff can still cancel any
  booking, and locally the inbox is at http://localhost:8025.
- A reserved room is held for 10 minutes. Dates follow each hotel's own time zone, and the Dahab
  and Lisbon hotels need at least two nights.
- On the front desk, press `G` then `T`, `C` or `R` for Today, Calendar or Reservations, and `/`
  to search.

## Engineering highlights

- **No double booking, enforced by the database.** Every night a room is taken is a row in
  `occupancies`, and an exclusion constraint makes overlapping rows for one room impossible:

  ```sql
  EXCLUDE USING gist (unit_id WITH =, nights WITH &&) WHERE (released_at IS NULL)
  ```

- **Proven under real races.** Concurrency tests run against a real Postgres: 50 simultaneous holds
  for the last room produce exactly one booking, and a host block against a guest hold, a cancel
  against a check-in, or the expiry job against a confirm never both succeed.
- **Safe retries.** Holds and confirms take an `Idempotency-Key`, so 10 identical requests create one
  hold. Prices and the cancellation policy are copied onto the booking, and money is stored in minor
  units.
- **Reliable emails.** A booking and its email event commit in one transaction (transactional
  outbox). A worker claims events with `FOR UPDATE SKIP LOCKED` under a lease, retries with backoff,
  and fences stale writes. Killing it mid-batch loses no email and sends none twice.
- **Hotel time.** Dates are in the property's time zone (Temporal). A night audit at 04:00 marks
  no-shows, and a housekeeping job removes expired rows.
- **Security.** Database sessions with hashed tokens, argon2id passwords, a `__Host-` cookie, rate
  limits stored in Postgres, an origin check on every write, and per-property roles that answer 404
  to outsiders.
- **One contract.** Zod schemas validate API input, type the web app's calls and generate the
  OpenAPI document. Every integration test checks the response against that document.
- **Ready to operate.** Prometheus metrics, health and readiness checks, JSON logs with request IDs,
  and a graceful shutdown that finishes requests in flight.
- **Accessible.** Keyboard first, light and dark themes, and an end-to-end suite that runs axe on
  every page and fails on any WCAG 2.2 AA violation it finds.

The API is a modular monolith: `identity`, `access`, `properties`, `inventory`, `reservations`,
`frontdesk`, `guest-access` and `notifications`, with shared pieces in `platform`. The API and the
worker are one image started with different commands, and Postgres is the only shared state.

## Tests

| Suite      | Tool                    | Tests | What it covers                                           |
| ---------- | ----------------------- | ----: | -------------------------------------------------------- |
| API        | Vitest + Testcontainers |   524 | Unit, HTTP integration on a real Postgres, races, worker |
| Web        | Vitest + jsdom + axe    |   242 | Components, views and their accessibility                |
| Contracts  | Vitest                  |    41 | The shared Zod schemas                                   |
| End to end | Playwright + axe        |    23 | Guest and host journeys on desktop and phone, WCAG scans |

CI runs formatting, type checks, lint, every suite, the builds, a migrations check and the end-to-end
suite on every pull request.

## Deployment

The live demo runs on one Hetzner cloud server (1 vCPU, 1 GB RAM, Ubuntu) with Docker Compose.
Every merge to `main` deploys itself:

1. CI passes on `main`.
2. The [Deploy workflow](.github/workflows/deploy.yml) builds the API and web images and pushes them
   to GitHub Container Registry (GHCR), tagged with the commit SHA.
3. It connects to the server over SSH and runs `deploy.sh <sha>`: pull the images, run the
   migrations in a one-shot container, restart what changed, and wait until every container is
   healthy. A failed health check fails the workflow.

| Part     | Role                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------- |
| Caddy    | The only public container: HTTPS from Let's Encrypt, HTTP/3, security headers, routing            |
| web, api | Next.js and the NestJS API. Caddy holds requests during a restart, so a deploy drops none of them |
| worker   | Emails, hold expiry and the night audit, from the same image as the API                           |
| Postgres | Not reachable from the internet. `backup.sh` keeps 7 days of `pg_dump` backups                    |
| Mailpit  | Catches emails, reachable only through an SSH tunnel                                              |

The whole stack uses under 250 MB of RAM at rest. Each container has a memory cap, and the server
has 2 GB of swap. A cloud firewall allows only ports 22, 80 and 443, SSH accepts keys only with no
root login, and the deploy key is restricted while the workflow checks the server's pinned host key.
Rolling back is `./deploy.sh <older sha>`. The full runbook is in
[deploy/README.md](deploy/README.md).

## Run it locally

You need Docker:

```sh
docker compose --profile full up -d --build --wait
```

This builds the images, runs the migrations, adds the demo hotels and starts the app at
http://localhost:8080, with the email inbox at http://localhost:8025. Stop it with
`docker compose --profile full down` (add `-v` to delete the database).

To develop, you need Node 24 and pnpm 10 (`corepack enable`):

```sh
pnpm install
docker compose up -d                       # Postgres and Mailpit only
cp apps/api/.env.example apps/api/.env
pnpm build && pnpm db:migrate && pnpm db:seed
pnpm dev                                   # API on :3000
pnpm dev:worker                            # worker
pnpm dev:web                               # web app on :3001
pnpm test                                  # unit and integration tests (needs Docker)
pnpm test:e2e                              # end-to-end tests, against the Docker stack
```

```text
apps/api/             NestJS API and worker: modules, platform, migrations, tests
apps/web/             Next.js guest site and host dashboard
packages/contracts/   Zod schemas shared by the API and the web app
e2e/                  Playwright end-to-end tests
deploy/               Production Compose, Caddy, deploy and backup scripts
```

## How it was built

I led this project. I defined the product and the engineering bar it had to meet (no double booking
enforced by the database, real concurrency tests, migrations, CI on every change), approved the
architecture and the design direction, and set up and run the production server. The code was
written with AI coding tools (Claude Code) working under that direction, and the frontend was built
entirely with AI.
