# You.com Web Search Integration

This CLI now supports You.com as an optional web search provider alongside the default DashScope WebSearch service.

## Setup

### Environment Variables

- `YDC_API_KEY` (optional): You.com API key for authenticated requests
- `YOUCOM_BASE_URL` (optional): Custom You.com API base URL (default: https://api.you.com)

### Usage Examples

```bash
# Use default DashScope WebSearch
bailian-cli search web --query "latest AI developments"

# Use You.com search explicitly
bailian-cli search web --query "latest AI developments" --provider youcom

# Use You.com with API key authentication
export YDC_API_KEY="your-api-key-here"
bailian-cli search web --query "TypeScript features" --provider youcom --count 5

# List available tools from You.com
bailian-cli search web --list-tools --provider youcom
```

## Features

### Keyless Operation
You.com search works without an API key (100 free searches per day) but performs better with authentication.

### MCP Tool Integration
When used as an MCP server, the You.com integration exposes:

- **Tool**: `youcom_web_search`
- **Description**: Search the web using You.com. Returns relevant results with titles, URLs, and snippets.
- **Parameters**:
  - `query` (required): The search query string
  - `count` (optional): Number of results (1-20, default: 10)
  - `safesearch` (optional): Safe search setting ("strict", "moderate", "off", default: "moderate")
  - `country` (optional): Country code for localized results (e.g. "US", "GB")

### Error Handling

The integration gracefully handles:
- Network timeouts and connection errors
- API rate limits (HTTP 429)
- Authentication failures (HTTP 401)
- Invalid queries and malformed responses
- Fallback behavior when API key is invalid

### Output Formats

Results are available in both JSON and human-readable text formats, with structured metadata including:
- Page titles and URLs
- Content snippets
- Publication age (when available)
- Provider identification for mixed workflows

## Architecture

The You.com integration is implemented as:
1. **YouComMcpClient**: MCP-compatible client for You.com API
2. **Provider Selection**: Optional `--provider` flag in existing search commands  
3. **Environment Configuration**: Standard environment variable configuration
4. **Graceful Fallback**: Falls back to keyless API when authentication fails

## Contributing

The You.com integration follows the existing CLI patterns:
- MCP protocol compliance for tool interoperability
- Structured error handling with BailianError
- Consistent CLI flag naming and behavior
- Environment-based configuration
- Comprehensive test coverage (when test infrastructure is available)