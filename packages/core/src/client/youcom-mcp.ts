/**
 * You.com Search MCP adapter.
 *
 * Implements MCP protocol compatible interface for You.com web search API.
 * Provides web search capabilities as MCP tools that can be used by AI agents.
 *
 * Features:
 * - Compatible with existing MCP toolchain
 * - Optional API key authentication (falls back to keyless API)
 * - Structured search results with snippets and metadata
 * - Error handling with graceful degradation
 */

import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import type { HttpDeps } from "./http.ts";
import { trackingHeaders } from "./headers.ts";
import type { McpTool, McpToolResult } from "./mcp.ts";

// ---- You.com API Types ----

interface YouComSearchParams {
  query: string;
  count?: number;
  offset?: number;
  safesearch?: 'strict' | 'moderate' | 'off';
  country?: string;
  search_lang?: string;
  ui_lang?: string;
  spellcheck?: boolean;
}

interface YouComSearchResult {
  url: string;
  title: string;
  snippet: string;
  thumbnail?: {
    src: string;
    width?: number;
    height?: number;
  };
  age?: string;
}

interface YouComApiResponse {
  hits?: YouComSearchResult[];
  query?: string;
  query_url?: string;
  error_type?: string;
  error_message?: string;
}

// ---- You.com MCP Client ----

export class YouComMcpClient {
  private baseUrl: string;
  private apiKey?: string;
  private deps: HttpDeps;

  constructor(deps: HttpDeps, apiKey?: string, baseUrl: string = "https://api.you.com") {
    this.deps = deps;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  /** Alternative constructor that accepts a Client and extracts HttpDeps */
  static fromClient(client: any, apiKey?: string, baseUrl: string = "https://api.you.com"): YouComMcpClient {
    const deps = { identity: client.identity || {}, settings: client.settings || {} };
    return new YouComMcpClient(deps, apiKey, baseUrl);
  }

  /** Initialize - no-op for You.com API but keeps MCP interface consistent */
  async initialize(): Promise<void> {
    if (this.deps.settings.verbose) {
      console.error(`[YouCom MCP] Initialized with${this.apiKey ? '' : 'out'} API key`);
    }
  }

  /** List available You.com search tools */
  async listTools(): Promise<McpTool[]> {
    return [
      {
        name: "youcom_web_search",
        description: "Search the web using You.com. Returns relevant results with titles, URLs, and snippets.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query"
            },
            count: {
              type: "number",
              description: "Number of results to return (default: 10, max: 20)",
              minimum: 1,
              maximum: 20,
              default: 10
            },
            safesearch: {
              type: "string",
              enum: ["strict", "moderate", "off"],
              description: "Safe search setting (default: moderate)",
              default: "moderate"
            },
            country: {
              type: "string",
              description: "Country code for localized results (e.g. 'US', 'GB')"
            }
          },
          required: ["query"]
        }
      }
    ];
  }

  /** Execute You.com web search tool */
  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    if (name !== "youcom_web_search") {
      throw new BailianError(`Unknown You.com tool: ${name}`, ExitCode.INPUT);
    }

    const { query, count = 10, safesearch = "moderate", country } = args as YouComSearchParams;

    if (!query || typeof query !== "string") {
      return {
        isError: true,
        content: [{
          type: "text",
          text: "Error: query parameter is required and must be a string"
        }]
      };
    }

    try {
      const searchParams = new URLSearchParams({
        query: query.trim(),
        count: Math.min(Math.max(1, Number(count) || 10), 20).toString(),
        safesearch,
      });

      if (country) {
        searchParams.set('country', country.toString());
      }

      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'User-Agent': `${this.deps.identity.clientName}/${this.deps.identity.version}`,
        ...trackingHeaders(this.deps.identity),
      };

      if (this.apiKey) {
        headers['X-API-Key'] = this.apiKey;
      }

      if (this.deps.settings.verbose) {
        console.error(`[YouCom Search] Query: ${query} (${searchParams.get('count')} results)`);
      }

      const response = await fetch(`${this.baseUrl}/api/search?${searchParams}`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(30000), // 30s timeout
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        
        if (response.status === 401) {
          throw new BailianError(
            this.apiKey 
              ? "You.com API key is invalid. Check your YDC_API_KEY environment variable."
              : "You.com API authentication failed. Set YDC_API_KEY environment variable or try again later.",
            ExitCode.AUTH
          );
        }

        if (response.status === 429) {
          throw new BailianError(
            "You.com API rate limit exceeded. Please wait before making more requests.",
            ExitCode.NETWORK
          );
        }

        throw new BailianError(
          `You.com API error (${response.status}): ${errorText}`,
          ExitCode.NETWORK
        );
      }

      const data: YouComApiResponse = await response.json();

      if (data.error_type || data.error_message) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `You.com API error: ${data.error_message || data.error_type || 'Unknown error'}`
          }]
        };
      }

      const hits = data.hits || [];
      
      if (hits.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No search results found for query: "${query}"`
          }]
        };
      }

      // Format results for MCP response
      const resultsText = hits.map((hit, index) => {
        let result = `${index + 1}. **${hit.title}**\n`;
        result += `   URL: ${hit.url}\n`;
        result += `   ${hit.snippet}\n`;
        if (hit.age) {
          result += `   Age: ${hit.age}\n`;
        }
        return result;
      }).join('\n');

      const summary = `Found ${hits.length} result${hits.length !== 1 ? 's' : ''} for "${query}":\n\n${resultsText}`;

      return {
        content: [{
          type: "text",
          text: summary
        }]
      };

    } catch (error) {
      if (error instanceof BailianError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      if (this.deps.settings.verbose) {
        console.error(`[YouCom Search Error] ${errorMessage}`);
      }

      return {
        isError: true,
        content: [{
          type: "text", 
          text: `You.com search failed: ${errorMessage}`
        }]
      };
    }
  }

  /** Get environment configuration for You.com integration */
  static getConfig(): { apiKey?: string; baseUrl: string } {
    return {
      apiKey: process.env.YDC_API_KEY || process.env.YOUCOM_API_KEY,
      baseUrl: process.env.YOUCOM_BASE_URL || "https://api.you.com"
    };
  }
}