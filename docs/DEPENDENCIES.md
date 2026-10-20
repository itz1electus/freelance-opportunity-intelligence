# Dependency allowlist (ADR-022)

Only these packages may be installed. Adding one needs an ADR or the owner's approval first; an AI implementer must ask before adding anything. Versions are pinned exactly in `package.json` and `package-lock.json`.

| Package | Version | Workspace | Why it is needed |
| --- | --- | --- | --- |
| `hono` | 4.13.13 | server | HTTP routing and middleware (P-009) |
| `@hono/node-server` | 2.1.5 | server | Runs Hono on Node's HTTP server |
| `zod` | 4.6.7 | domain, infra, server | Runtime validation of every contract and request |
| `better-sqlite3` | 13.0.3 | infra, server | SQLite driver. **Native module: the only package allowed a build step** (`npm run rebuild:native`) |
| `drizzle-orm` | 0.45.4 | infra | Typed queries over the SQLite schema (P-009) |
| `react`, `react-dom` | 19.3.1 | web | User interface |
| `vite` | 8.3.4 | web (dev) | Development server and production build |
| `@vitejs/plugin-react` | 6.1.2 | web (dev) | JSX transform for Vite |
| `typescript` | 6.0.3 | root (dev) | Type checking. Held below 6.1 for typescript-eslint compatibility |
| `tsx` | 4.23.15 | root (dev) | Runs the TypeScript server without a separate build step |
| `vitest` | 5.0.5 | root (dev) | Tests |
| `eslint`, `@eslint/js` | 10.13.0, 10.0.1 | root (dev) | Linting |
| `typescript-eslint` | 8.72.0 | root (dev) | TypeScript lint rules |
| `eslint-plugin-react-hooks` | 7.1.1 | root (dev) | React hooks rules |
| `globals` | 17.13.0 | root (dev) | Global variable sets for ESLint |
| `@types/node`, `@types/react`, `@types/react-dom`, `@types/better-sqlite3` | pinned | dev | Type declarations |

## Deliberately not used

- **drizzle-kit:** its current releases pull in an outdated esbuild with a published advisory. Migrations are plain SQL files in `packages/infra/migrations/`, and a test checks they match the Drizzle schema column for column.
- **eslint-plugin-react:** it does not support ESLint 10. The one rule FOI needed from it, a ban on `dangerouslySetInnerHTML`, is a `no-restricted-syntax` rule in `eslint.config.js`.
- **A router, a CSS framework, a state library, an HTTP client:** the app does not need them yet; each would add code to audit.

## Install rules

1. `npm ci` only, so the committed lockfile decides every version.
2. `.npmrc` sets `ignore-scripts=true`: no package can run code at install time. `npm run rebuild:native` builds `better-sqlite3` explicitly.
3. Updates arrive through Renovate or Dependabot (once the repository is on GitHub), with a cool-down of several days before adopting a new release. Recent self-propagating npm worms stole tokens from developer machines within hours of publishing.
4. `npm audit` must report zero findings before a release. At Phase 1 it reports none.
