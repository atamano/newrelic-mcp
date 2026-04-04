#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { NewRelicClient } from "./newrelic-client.js";

// ── NRQL helpers ───────────────────────────────────────────────────────────

function escapeNrql(value: string): string {
  return value.replace(/[\x00-\x1f]/g, "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function whereAppName(appName?: string): string {
  return appName ? `WHERE appName = '${escapeNrql(appName)}'` : "";
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nrqlHandler<T>(buildQuery: (params: T) => string): (params: T) => Promise<any> {
  return async (params) => {
    try {
      const result = await client.nrql(buildQuery(params));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${errorMessage(e)}` }], isError: true };
    }
  };
}

const sinceSchema = z
  .string()
  .regex(
    /^[1-9]\d{0,3} (minute|minutes|hour|hours|day|days|week|weeks|month|months) ago$/,
    "Must be a relative time like '1 hour ago', '30 minutes ago', '7 days ago'",
  );

const limitSchema = z.number().int().min(1).max(200);

// ── Server setup ───────────────────────────────────────────────────────────

const server = new McpServer(
  {
    name: "newrelic-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {},
  },
);

let client: NewRelicClient;

try {
  client = new NewRelicClient();
} catch (e) {
  console.error(`Failed to initialize New Relic client: ${errorMessage(e)}`);
  process.exit(1);
}

// ── Tools ──────────────────────────────────────────────────────────────────

server.registerTool(
  "query_nrql",
  {
    title: "Query NRQL",
    description: "Run an arbitrary NRQL query against New Relic. Use this for any custom metric exploration.",
    inputSchema: z.object({
      query: z.string().describe("The NRQL query to execute"),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  nrqlHandler(({ query }) => query),
);

server.registerTool(
  "get_errors",
  {
    title: "Get Errors",
    description: "Get recent application errors/exceptions from New Relic. Returns error class, message, count, and transaction name.",
    inputSchema: z.object({
      app_name: z.string().optional().describe("Filter by app name (default: all apps)"),
      since: sinceSchema.default("1 hour ago").describe("Time range, e.g. '1 hour ago', '7 days ago'"),
      limit: limitSchema.default(25).describe("Max number of errors to return (1-200)"),
    }),
    annotations: { readOnlyHint: true },
  },
  nrqlHandler(({ app_name, since, limit }) =>
    `SELECT count(*), latest(error.message), latest(transactionName) FROM TransactionError ${whereAppName(app_name)} FACET error.class SINCE ${since} LIMIT ${limit}`,
  ),
);

server.registerTool(
  "get_slow_transactions",
  {
    title: "Get Slow Transactions",
    description: "Get the slowest HTTP transactions. Useful for identifying performance bottlenecks.",
    inputSchema: z.object({
      app_name: z.string().optional().describe("Filter by app name (default: all apps)"),
      since: sinceSchema.default("1 hour ago").describe("Time range, e.g. '1 hour ago', '7 days ago'"),
      limit: limitSchema.default(20).describe("Max number of transactions to return (1-200)"),
    }),
    annotations: { readOnlyHint: true },
  },
  nrqlHandler(({ app_name, since, limit }) =>
    `SELECT average(duration), max(duration), count(*), percentile(duration, 95) FROM Transaction ${whereAppName(app_name)} FACET name ORDER BY average(duration) DESC SINCE ${since} LIMIT ${limit}`,
  ),
);

server.registerTool(
  "get_throughput",
  {
    title: "Get Throughput",
    description: "Get request throughput (requests/min) and error rate overview.",
    inputSchema: z.object({
      app_name: z.string().optional().describe("Filter by app name (default: all apps)"),
      since: sinceSchema.default("1 hour ago").describe("Time range, e.g. '1 hour ago', '7 days ago'"),
    }),
    annotations: { readOnlyHint: true },
  },
  nrqlHandler(({ app_name, since }) =>
    `SELECT rate(count(*), 1 minute) AS 'rpm', percentage(count(*), WHERE error IS true) AS 'error_rate', average(duration) AS 'avg_duration', percentile(duration, 95) AS 'p95' FROM Transaction ${whereAppName(app_name)} SINCE ${since} TIMESERIES AUTO`,
  ),
);

server.registerTool(
  "get_alerts",
  {
    title: "Get Alert Incidents",
    description: "Get recent alert incidents from New Relic. Returns incident title, priority, state, and timestamps.",
    inputSchema: z.object({
      since: sinceSchema.default("1 day ago").describe("Time range, e.g. '1 hour ago', '7 days ago'"),
    }),
    annotations: { readOnlyHint: true },
  },
  nrqlHandler(({ since }) =>
    `SELECT timestamp, title, priority, state, conditionName, policyName FROM NrAiIncident SINCE ${since} LIMIT 50`,
  ),
);

server.registerTool(
  "get_database_performance",
  {
    title: "Get Database Performance",
    description: "Get transactions with the highest database time. Useful for identifying which endpoints spend the most time in DB calls.",
    inputSchema: z.object({
      app_name: z.string().optional().describe("Filter by app name (default: all apps)"),
      since: sinceSchema.default("1 hour ago").describe("Time range, e.g. '1 hour ago', '7 days ago'"),
      limit: limitSchema.default(20).describe("Max number of transactions to return (1-200)"),
    }),
    annotations: { readOnlyHint: true },
  },
  nrqlHandler(({ app_name, since, limit }) =>
    `SELECT average(databaseDuration), max(databaseDuration), count(*) FROM Transaction ${whereAppName(app_name)} FACET name ORDER BY average(databaseDuration) DESC SINCE ${since} LIMIT ${limit}`,
  ),
);

server.registerTool(
  "get_http_status_breakdown",
  {
    title: "Get HTTP Status Breakdown",
    description: "Get a breakdown of HTTP response status codes. Useful for spotting 4xx/5xx spikes.",
    inputSchema: z.object({
      app_name: z.string().optional().describe("Filter by app name (default: all apps)"),
      since: sinceSchema.default("1 hour ago").describe("Time range, e.g. '1 hour ago', '7 days ago'"),
    }),
    annotations: { readOnlyHint: true },
  },
  nrqlHandler(({ app_name, since }) =>
    `SELECT count(*) FROM Transaction ${whereAppName(app_name)} FACET http.statusCode SINCE ${since}`,
  ),
);

server.registerTool(
  "get_error_details",
  {
    title: "Get Error Details",
    description: "Get detailed error information including stack traces for a specific error class or transaction.",
    inputSchema: z.object({
      error_class: z.string().optional().describe("Filter by error class name"),
      transaction_name: z.string().optional().describe("Filter by transaction/endpoint name"),
      since: sinceSchema.default("1 hour ago").describe("Time range"),
      limit: limitSchema.default(10).describe("Max number of error traces (1-200)"),
    }),
    annotations: { readOnlyHint: true },
  },
  nrqlHandler(({ error_class, transaction_name, since, limit }) => {
    const conditions: string[] = [];
    if (error_class) conditions.push(`error.class = '${escapeNrql(error_class)}'`);
    if (transaction_name) conditions.push(`transactionName = '${escapeNrql(transaction_name)}'`);
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    return `SELECT timestamp, error.class, error.message, transactionName, error.stack, request.uri, request.method FROM TransactionError ${whereClause} SINCE ${since} LIMIT ${limit}`;
  }),
);

server.registerTool(
  "get_app_health",
  {
    title: "Get App Health",
    description: "Get a quick health overview of the application: throughput, error rate, response time, and Apdex.",
    inputSchema: z.object({
      app_name: z.string().optional().describe("Filter by app name (default: all apps)"),
      since: sinceSchema.default("30 minutes ago").describe("Time range"),
    }),
    annotations: { readOnlyHint: true },
  },
  nrqlHandler(({ app_name, since }) =>
    `SELECT count(*) AS 'total_requests', rate(count(*), 1 minute) AS 'rpm', percentage(count(*), WHERE error IS true) AS 'error_rate_pct', average(duration) AS 'avg_response_s', percentile(duration, 50, 95, 99) AS 'percentiles', apdex(duration, 0.5) AS 'apdex' FROM Transaction ${whereAppName(app_name)} SINCE ${since}`,
  ),
);

// ── Start server ───────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function shutdown() {
  try {
    await server.close();
  } catch {
    // best-effort cleanup
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
