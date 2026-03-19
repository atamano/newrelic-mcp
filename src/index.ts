import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { NewRelicClient } from "./newrelic-client.js";

const server = new McpServer({
  name: "newrelic-mcp",
  version: "1.0.0",
});

let client: NewRelicClient;

try {
  client = new NewRelicClient();
} catch (e: any) {
  console.error(`Failed to initialize New Relic client: ${e.message}`);
  process.exit(1);
}

// ── Tool: Run arbitrary NRQL query ──────────────────────────────────────────

server.tool(
  "query_nrql",
  "Run an arbitrary NRQL query against New Relic. Use this for any custom metric exploration.",
  { query: z.string().describe("The NRQL query to execute") },
  async ({ query }) => {
    try {
      const result = await client.nrql(query);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${e.message}` }],
        isError: true,
      };
    }
  },
);

// ── Tool: Get recent errors ─────────────────────────────────────────────────

server.tool(
  "get_errors",
  "Get recent application errors/exceptions from New Relic. Returns error class, message, count, and transaction name.",
  {
    app_name: z
      .string()
      .optional()
      .describe("Filter by app name (default: all apps)"),
    since: z
      .string()
      .default("1 hour ago")
      .describe("Time range, e.g. '1 hour ago', '1 day ago', '1 week ago'"),
    limit: z.number().default(25).describe("Max number of errors to return"),
  },
  async ({ app_name, since, limit }) => {
    try {
      const whereClause = app_name ? `WHERE appName = '${app_name}'` : "";
      const query = `SELECT count(*), latest(error.message), latest(transactionName) FROM TransactionError ${whereClause} FACET error.class SINCE ${since} LIMIT ${limit}`;
      const result = await client.nrql(query);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${e.message}` }],
        isError: true,
      };
    }
  },
);

// ── Tool: Get slow transactions ─────────────────────────────────────────────

server.tool(
  "get_slow_transactions",
  "Get the slowest HTTP transactions. Useful for identifying performance bottlenecks.",
  {
    app_name: z
      .string()
      .optional()
      .describe("Filter by app name (default: all apps)"),
    since: z
      .string()
      .default("1 hour ago")
      .describe("Time range, e.g. '1 hour ago', '1 day ago'"),
    limit: z.number().default(20).describe("Max number of transactions to return"),
  },
  async ({ app_name, since, limit }) => {
    try {
      const whereClause = app_name ? `WHERE appName = '${app_name}'` : "";
      const query = `SELECT average(duration), max(duration), count(*), percentile(duration, 95) FROM Transaction ${whereClause} FACET name SINCE ${since} LIMIT ${limit} ORDER BY average(duration) DESC`;
      const result = await client.nrql(query);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${e.message}` }],
        isError: true,
      };
    }
  },
);

// ── Tool: Get throughput overview ────────────────────────────────────────────

server.tool(
  "get_throughput",
  "Get request throughput (requests/min) and error rate overview.",
  {
    app_name: z
      .string()
      .optional()
      .describe("Filter by app name (default: all apps)"),
    since: z
      .string()
      .default("1 hour ago")
      .describe("Time range, e.g. '1 hour ago', '1 day ago'"),
  },
  async ({ app_name, since }) => {
    try {
      const whereClause = app_name ? `WHERE appName = '${app_name}'` : "";
      const query = `SELECT rate(count(*), 1 minute) AS 'rpm', percentage(count(*), WHERE error IS true) AS 'error_rate', average(duration) AS 'avg_duration', percentile(duration, 95) AS 'p95' FROM Transaction ${whereClause} SINCE ${since} TIMESERIES AUTO`;
      const result = await client.nrql(query);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${e.message}` }],
        isError: true,
      };
    }
  },
);

// ── Tool: Get active alerts ─────────────────────────────────────────────────

server.tool(
  "get_alerts",
  "Get active/recent alert incidents from New Relic.",
  {
    since: z
      .string()
      .default("1 day ago")
      .describe("Time range, e.g. '1 hour ago', '1 day ago'"),
  },
  async ({ since }) => {
    try {
      const gql = `
        {
          actor {
            account(id: ${client.getAccountId()}) {
              nrql(query: "SELECT * FROM NrAiIncident SINCE ${since} LIMIT 50") {
                results
              }
            }
          }
        }
      `;
      const result = await client.query(gql);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${e.message}` }],
        isError: true,
      };
    }
  },
);

// ── Tool: Get database performance ──────────────────────────────────────────

server.tool(
  "get_database_performance",
  "Get slow database queries and their performance metrics. Useful for identifying DB bottlenecks.",
  {
    app_name: z
      .string()
      .optional()
      .describe("Filter by app name (default: all apps)"),
    since: z
      .string()
      .default("1 hour ago")
      .describe("Time range, e.g. '1 hour ago', '1 day ago'"),
    limit: z.number().default(20).describe("Max number of queries to return"),
  },
  async ({ app_name, since, limit }) => {
    try {
      const whereClause = app_name ? `WHERE appName = '${app_name}'` : "";
      const query = `SELECT average(databaseDuration), max(databaseDuration), count(*) FROM Transaction ${whereClause} FACET name SINCE ${since} LIMIT ${limit} ORDER BY average(databaseDuration) DESC`;
      const result = await client.nrql(query);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${e.message}` }],
        isError: true,
      };
    }
  },
);

// ── Tool: Get HTTP status code breakdown ────────────────────────────────────

server.tool(
  "get_http_status_breakdown",
  "Get a breakdown of HTTP response status codes. Useful for spotting 4xx/5xx spikes.",
  {
    app_name: z
      .string()
      .optional()
      .describe("Filter by app name (default: all apps)"),
    since: z
      .string()
      .default("1 hour ago")
      .describe("Time range, e.g. '1 hour ago', '1 day ago'"),
  },
  async ({ app_name, since }) => {
    try {
      const whereClause = app_name ? `WHERE appName = '${app_name}'` : "";
      const query = `SELECT count(*) FROM Transaction ${whereClause} FACET http.statusCode SINCE ${since}`;
      const result = await client.nrql(query);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${e.message}` }],
        isError: true,
      };
    }
  },
);

// ── Tool: Get error details with stack traces ───────────────────────────────

server.tool(
  "get_error_details",
  "Get detailed error information including stack traces for a specific error class or transaction.",
  {
    error_class: z
      .string()
      .optional()
      .describe("Filter by error class name"),
    transaction_name: z
      .string()
      .optional()
      .describe("Filter by transaction/endpoint name"),
    since: z
      .string()
      .default("1 hour ago")
      .describe("Time range"),
    limit: z.number().default(10).describe("Max number of error traces"),
  },
  async ({ error_class, transaction_name, since, limit }) => {
    try {
      const conditions: string[] = [];
      if (error_class) conditions.push(`error.class = '${error_class}'`);
      if (transaction_name) conditions.push(`transactionName = '${transaction_name}'`);
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const query = `SELECT timestamp, error.class, error.message, transactionName, error.stack, request.uri, request.method FROM TransactionError ${whereClause} SINCE ${since} LIMIT ${limit}`;
      const result = await client.nrql(query);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${e.message}` }],
        isError: true,
      };
    }
  },
);

// ── Tool: Get app overview / health ─────────────────────────────────────────

server.tool(
  "get_app_health",
  "Get a quick health overview of the application: throughput, error rate, response time, and Apdex.",
  {
    app_name: z
      .string()
      .optional()
      .describe("Filter by app name (default: all apps)"),
    since: z
      .string()
      .default("30 minutes ago")
      .describe("Time range"),
  },
  async ({ app_name, since }) => {
    try {
      const whereClause = app_name ? `WHERE appName = '${app_name}'` : "";
      const query = `SELECT count(*) AS 'total_requests', rate(count(*), 1 minute) AS 'rpm', percentage(count(*), WHERE error IS true) AS 'error_rate_pct', average(duration) AS 'avg_response_s', percentile(duration, 50, 95, 99) AS 'percentiles', apdex(duration, 0.5) AS 'apdex' FROM Transaction ${whereClause} SINCE ${since}`;
      const result = await client.nrql(query);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${e.message}` }],
        isError: true,
      };
    }
  },
);

// ── Start server ────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
