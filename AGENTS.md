# Repository Guidelines

## Project Structure & Module Organization
Keep source code in `src/` and treat `dist/` as generated build output. The repository is intentionally small:

- `src/index.ts` bootstraps the MCP server, registers tools, and connects over stdio.
- `src/newrelic-client.ts` wraps New Relic NerdGraph/NRQL access and environment validation.
- `.env.example` documents required runtime configuration.
- `README.md` covers setup, client integration, and supported tools.

Add new runtime modules under `src/` and keep transport/server concerns separate from API client logic.

## Build, Test, and Development Commands
Use `pnpm` with Node 18+.

- `pnpm install` installs dependencies.
- `pnpm run dev` runs `src/index.ts` with `tsx watch` for local development.
- `pnpm run build` compiles TypeScript into `dist/`.
- `pnpm run start` runs the compiled server from `dist/index.js`.
- `pnpm run typecheck` runs strict TypeScript checks without emitting files.

Run `pnpm run typecheck && pnpm run build` before opening a PR.

## Coding Style & Naming Conventions
This is a strict TypeScript ESM project (`module: NodeNext`). Follow the existing style:

- Use 2-space indentation and keep imports ESM-compatible with `.js` extensions in local import paths.
- Use `PascalCase` for classes and types, `camelCase` for functions and variables.
- Keep MCP tool identifiers and schema fields aligned with existing API naming, such as `query_nrql` and `app_name`.
- Prefer small helper functions for NRQL string construction and input validation.

No ESLint or Prettier config is committed here, so match the formatting already present in `src/`.

## Testing Guidelines
There is no automated test framework configured yet. For now, verification is:

- `pnpm run typecheck`
- `pnpm run build`
- Manual smoke testing against a configured New Relic account when behavior changes

If you add tests, place them near the related module or in a small `test/` directory and name them `*.test.ts`.

## Commit & Pull Request Guidelines
The current history uses short, imperative commit subjects such as `add newrelic mcp server`. Keep commits focused and similarly direct.

PRs should include a short summary, local verification steps, any required environment changes, and example NRQL or tool behavior when user-visible output changes.

## Security & Configuration Tips
Never commit real New Relic credentials. Use `.env.example` as the reference, and document new environment variables there whenever configuration changes.
