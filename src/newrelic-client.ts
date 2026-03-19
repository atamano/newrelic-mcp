const NERDGRAPH_US = "https://api.newrelic.com/graphql";
const NERDGRAPH_EU = "https://api.eu.newrelic.com/graphql";

const VALID_REGIONS = ["US", "EU"] as const;
type Region = (typeof VALID_REGIONS)[number];

const REQUEST_TIMEOUT_MS = 30_000;

export interface NrqlResult {
  results: Record<string, unknown>[];
  metadata?: {
    timeWindow?: { begin: string; end: string };
  };
}

interface NerdGraphResponse {
  data?: Record<string, unknown>;
  errors?: Array<{ message: string }>;
}

export class NewRelicClient {
  private apiKey: string;
  private accountId: number;
  private endpoint: string;

  constructor() {
    const apiKey = process.env.NEW_RELIC_API_KEY;
    const accountId = process.env.NEW_RELIC_ACCOUNT_ID;
    const region = (process.env.NEW_RELIC_REGION || "EU").toUpperCase();

    if (!apiKey) throw new Error("NEW_RELIC_API_KEY is required");
    if (!apiKey.startsWith("NRAK-")) {
      throw new Error("NEW_RELIC_API_KEY must be a User API key (starts with NRAK-)");
    }
    if (!accountId) throw new Error("NEW_RELIC_ACCOUNT_ID is required");

    const parsed = Number(accountId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`NEW_RELIC_ACCOUNT_ID must be a positive integer, got: ${accountId}`);
    }

    if (!VALID_REGIONS.includes(region as Region)) {
      throw new Error(`NEW_RELIC_REGION must be US or EU, got: ${region}`);
    }

    this.apiKey = apiKey;
    this.accountId = parsed;
    this.endpoint = region === "EU" ? NERDGRAPH_EU : NERDGRAPH_US;
  }

  async nrql(query: string): Promise<NrqlResult> {
    const escaped = query
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n");
    const gql = `
      {
        actor {
          account(id: ${this.accountId}) {
            nrql(query: "${escaped}") {
              results
              metadata {
                timeWindow {
                  begin
                  end
                }
              }
            }
          }
        }
      }
    `;

    const body = await this.query(gql);
    const actor = body.data?.actor as Record<string, unknown> | undefined;
    const account = actor?.account as Record<string, unknown> | undefined;
    const nrqlData = account?.nrql as NrqlResult | undefined;
    if (!nrqlData) {
      throw new Error("Unexpected NerdGraph response: missing nrql data");
    }
    return nrqlData;
  }

  private async query(gql: string): Promise<NerdGraphResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "API-Key": this.apiKey,
        },
        body: JSON.stringify({ query: gql }),
        signal: controller.signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error(`NerdGraph request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      throw new Error(`NerdGraph request failed: ${res.status} ${res.statusText}`);
    }

    const body = (await res.json()) as NerdGraphResponse;

    if (body.errors?.length) {
      const messages = body.errors.map((e) => e.message).join("; ");
      throw new Error(`NerdGraph error: ${messages}`);
    }

    return body;
  }
}
