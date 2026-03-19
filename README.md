# New Relic MCP Server

An [MCP](https://modelcontextprotocol.io) server that gives AI assistants access to your New Relic observability data. Query metrics, investigate errors, analyze performance, and check alerts — all through natural language.

## Tools

| Tool | Description |
|------|-------------|
| `query_nrql` | Run any arbitrary NRQL query |
| `get_app_health` | Health overview: throughput, error rate, response time, Apdex |
| `get_errors` | Recent errors/exceptions with class, message, and count |
| `get_error_details` | Detailed errors with stack traces, filterable by class or transaction |
| `get_slow_transactions` | Slowest transactions with avg/max/p95 duration |
| `get_throughput` | Request throughput (rpm) and error rate over time |
| `get_database_performance` | Transactions with the highest database time |
| `get_http_status_breakdown` | HTTP status code distribution |
| `get_alerts` | Recent alert incidents with title, priority, and state |

## Prerequisites

- Node.js 18+
- A New Relic account with a [User API key](https://one.newrelic.com/api-keys) (starts with `NRAK-`)

## Setup

```bash
git clone https://github.com/indiefoundry/newrelic-mcp.git
cd newrelic-mcp
pnpm install
pnpm run build
```

## Configuration

The server reads configuration from environment variables. See `.env.example` for reference.

> **Note:** The server does not load `.env` files automatically. Environment variables must be set in your shell, passed by the MCP client, or exported before running.

| Variable | Required | Description |
|----------|----------|-------------|
| `NEW_RELIC_API_KEY` | Yes | User API key (starts with `NRAK-`) |
| `NEW_RELIC_ACCOUNT_ID` | Yes | Your numeric account ID |
| `NEW_RELIC_REGION` | No | `US` or `EU` (default: `EU`) |

## Usage

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "newrelic": {
      "command": "node",
      "args": ["/absolute/path/to/newrelic-mcp/dist/index.js"],
      "env": {
        "NEW_RELIC_API_KEY": "NRAK-...",
        "NEW_RELIC_ACCOUNT_ID": "1234567",
        "NEW_RELIC_REGION": "EU"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add newrelic \
  -e NEW_RELIC_API_KEY=NRAK-... \
  -e NEW_RELIC_ACCOUNT_ID=1234567 \
  -e NEW_RELIC_REGION=EU \
  -- node /absolute/path/to/newrelic-mcp/dist/index.js
```

### Other MCP Clients

This server uses stdio transport. Any MCP-compatible client can connect by spawning the process:

```bash
NEW_RELIC_API_KEY=NRAK-... NEW_RELIC_ACCOUNT_ID=1234567 node dist/index.js
```

## Development

```bash
pnpm run dev        # run with tsx in watch mode (auto-restarts on changes)
pnpm run build      # compile TypeScript
pnpm run start      # run compiled output
pnpm run typecheck  # type-check without emitting
```

## Example Queries

Once connected, you can ask your AI assistant things like:

- "What errors happened in the last hour?"
- "Show me the slowest API endpoints for my-app"
- "What's the current error rate and throughput?"
- "Are there any active alerts?"
- "Run this NRQL query: `SELECT count(*) FROM Transaction FACET appName SINCE 1 day ago`"

## Architecture

The server consists of two modules:

- **`src/newrelic-client.ts`** — Wraps the [NerdGraph API](https://docs.newrelic.com/docs/apis/nerdgraph/get-started/introduction-new-relic-nerdgraph/) (New Relic's GraphQL API). Handles NRQL query execution, response validation, GraphQL error surfacing, and request timeouts (30s).
- **`src/index.ts`** — MCP server that registers all tools with validated input schemas and connects via stdio transport.

## License

MIT
