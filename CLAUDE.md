# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An MCP (Model Context Protocol) server that exposes New Relic observability data as tools. It uses the NerdGraph GraphQL API to query NRQL metrics and serves them over stdio transport.

## Commands

```bash
pnpm install          # install dependencies
pnpm run build        # compile TypeScript → dist/
pnpm run dev          # run with tsx (hot reload)
pnpm run start        # run compiled output (node dist/index.js)
```

## Environment Variables

Copy `.env.example` to `.env`. Required:
- `NEW_RELIC_API_KEY` — User API key (starts with `NRAK-`)
- `NEW_RELIC_ACCOUNT_ID` — numeric account ID
- `NEW_RELIC_REGION` — `US` or `EU` (defaults to `EU`)

## Architecture

Two source files:

- **`src/newrelic-client.ts`** — `NewRelicClient` class wrapping the NerdGraph GraphQL API. Provides `nrql(query)` for NRQL queries (wraps them in the actor/account/nrql GraphQL envelope) and `query(gql)` for raw GraphQL. Selects US or EU endpoint based on region config.
- **`src/index.ts`** — MCP server setup using `@modelcontextprotocol/sdk`. Registers 9 tools (`query_nrql`, `get_errors`, `get_slow_transactions`, `get_throughput`, `get_alerts`, `get_database_performance`, `get_http_status_breakdown`, `get_error_details`, `get_app_health`) and connects via `StdioServerTransport`.

All tools follow the same pattern: build an NRQL query string, call `client.nrql()`, return JSON results. The `get_alerts` tool is the exception — it calls `client.query()` with raw GraphQL.

## Key Details

- ESM project (`"type": "module"`) — imports use `.js` extensions
- TypeScript strict mode, target ES2022
- No test framework is configured
- Zod v4 is used for tool input schemas
