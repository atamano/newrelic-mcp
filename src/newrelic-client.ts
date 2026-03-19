const NERDGRAPH_US = "https://api.newrelic.com/graphql";
const NERDGRAPH_EU = "https://api.eu.newrelic.com/graphql";

export interface NerdGraphResponse {
  data?: any;
  errors?: Array<{ message: string }>;
}

export class NewRelicClient {
  private apiKey: string;
  private accountId: string;
  private endpoint: string;

  constructor() {
    const apiKey = process.env.NEW_RELIC_API_KEY;
    const accountId = process.env.NEW_RELIC_ACCOUNT_ID;
    const region = process.env.NEW_RELIC_REGION || "EU";

    if (!apiKey) throw new Error("NEW_RELIC_API_KEY is required");
    if (!accountId) throw new Error("NEW_RELIC_ACCOUNT_ID is required");

    this.apiKey = apiKey;
    this.accountId = accountId;
    this.endpoint = region.toUpperCase() === "EU" ? NERDGRAPH_EU : NERDGRAPH_US;
  }

  async nrql(query: string): Promise<any> {
    const gql = `
      {
        actor {
          account(id: ${this.accountId}) {
            nrql(query: "${query.replace(/"/g, '\\"')}") {
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
    return this.query(gql);
  }

  async query(gql: string): Promise<NerdGraphResponse> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "API-Key": this.apiKey,
      },
      body: JSON.stringify({ query: gql }),
    });

    if (!res.ok) {
      throw new Error(`NerdGraph request failed: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<NerdGraphResponse>;
  }

  getAccountId(): string {
    return this.accountId;
  }
}
