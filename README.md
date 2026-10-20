# FOI — Freelance Opportunity Intelligence

A local-first tool that finds freelance projects, scores them against the combined skills of the two studio partners, and writes technical assessments for the strongest leads. It runs on your Mac, only searches when you ask it to, and never submits bids or messages anyone.

**Status:** Phase 1 of 7 (foundation) is complete. See [`docs/PROGRESS.md`](docs/PROGRESS.md) for what works today and what comes next.

## Requirements

- macOS (the only supported platform for the MVP)
- Node.js 22.12 or newer (the current LTS is recommended)
- Xcode Command Line Tools, in case the SQLite driver has to be compiled: `xcode-select --install`
- git

## First run

```sh
npm ci                   # installs exactly what package-lock.json lists; install scripts are disabled
npm run rebuild:native   # builds the SQLite driver, the one package allowed to run a build step
npm start                # builds the web interface if needed, starts FOI, opens your browser
```

`npm start` prints a one-time sign-in link and opens it. The link works once and expires after 2 minutes. If it expired, or you closed the tab, run `npm run open` in a second terminal for a fresh one. Press Ctrl+C to stop FOI.

FOI starts in **demo mode**: a banner says so, and nothing it shows is a real opportunity. Turn it off in `config.json` once real sources are connected.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm start` | Start FOI at http://127.0.0.1:4311 |
| `npm run open` | Get a new sign-in link for a running FOI |
| `npm run check` | Typecheck, lint, test and build: run before every commit |
| `npm run dev` | Development mode with hot reload (UI at http://127.0.0.1:5173) |
| `npm run hooks:install` | After `git init`: blocks commits of databases, logs and secrets |

## Where your data lives

Everything stays inside this folder:

```
data/
  shared/      committed to Git: readable text files the team shares
  foi.sqlite   this machine only: working database and listing cache
  backups/     this machine only
  logs/        this machine only
```

API keys and tokens never live in this folder. They go in your macOS Keychain (from Phase 3 on). Keep the folder on a local disk, not in iCloud Drive, Dropbox or a network share: sync tools can corrupt a live database, and FOI warns if it detects one.

## Configuration

`config.json` holds the only settings that are not secret:

```json
{ "port": 4311, "logLevel": "info", "fixtureMode": true }
```

FOI always listens on 127.0.0.1 only. There is no setting that exposes it on a network.

## Documents

- [`docs/FOI_DESIGN_BASELINE.md`](docs/FOI_DESIGN_BASELINE.md): what must be true (v1.1.0, frozen)
- [`docs/FOI_ARCHITECTURE_SPECIFICATION.md`](docs/FOI_ARCHITECTURE_SPECIFICATION.md): how it is built and verified (v1.1.0, frozen; §16 is normative)
- [`docs/FOI_SPEC_REVIEW_2026-10-20.md`](docs/FOI_SPEC_REVIEW_2026-10-20.md): the review behind v1.1.0
- [`docs/SECURITY.md`](docs/SECURITY.md): threat model and security controls
- [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md): the dependency allowlist
- [`docs/PROGRESS.md`](docs/PROGRESS.md): phase status and handoff notes
