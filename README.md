# RSS Agent Discovery

AI agent-focused RSS feed discovery tool. JSON-only output to stdout, errors to stderr.

## Why This Tool?

Existing RSS discovery tools (`rss-url-finder`, `rss-finder`) were built for human developers. They output human-readable text and don't validate that feeds actually exist.

This tool is designed for **AI agents** (Claude, Cursor, GPT):
- JSON-only output to stdout (machine-parseable)
- Errors to stderr (separated channel)
- Semantic exit codes (0=found, 1=none, 2=error)
- Fast (10s default timeout, parallel scanning)
- Discovery-only (returns feed URLs, doesn't parse content)
- Finds feeds AI agents miss

**Proof:** Cursor fails to find `https://vercel.com/atom`. This tool succeeds.

## Installation

```bash
npm install
npm run build
```

## Usage

### Basic usage:
```bash
node dist/find-rss-feeds.js https://vercel.com
```

Or via CLI (after `npm link`):
```bash
rss-discover https://vercel.com
```

### Multiple URLs (parallel processing):
```bash
node dist/find-rss-feeds.js https://vercel.com https://news.ycombinator.com https://stripe.com
```

### Parse with jq:
```bash
node dist/find-rss-feeds.js https://vercel.com | jq '.results[0].feeds'
```

### Custom timeout:
```bash
node dist/find-rss-feeds.js --timeout 15000 https://example.com
```

### Skip blog scanning:
```bash
node dist/find-rss-feeds.js --skip-blogs https://example.com
```

### Limit blog scans:
```bash
node dist/find-rss-feeds.js --max-blogs 3 https://example.com
```

### Custom blog paths:
```bash
node dist/find-rss-feeds.js --blog-paths '/blog,/news' https://example.com
# or with pipe separator
node dist/find-rss-feeds.js --blog-paths '/blog|/updates' https://example.com
```

### Verbose mode (debug logging):
```bash
node dist/find-rss-feeds.js --verbose https://example.com
```

### Show help:
```bash
node dist/find-rss-feeds.js --help
```

### Show version:
```bash
node dist/find-rss-feeds.js --version
# or
rss-discover --version
```

### Run tests:
```bash
npm test              # Run all tests (unit + smoke)
npm run test:unit     # Run unit tests only
npm run test:smoke    # Run smoke tests (integration)
```

## Output Schema

```json
{
  "success": true,
  "partialResults": false,
  "results": [
    {
      "url": "https://vercel.com",
      "feeds": [
        {
          "url": "https://vercel.com/atom",
          "title": "atom",
          "type": "atom"
        }
      ],
      "error": null
    }
  ]
}
```

**Fields:**
- `success` (boolean): `true` if no URLs had errors, `false` if at least one URL had an error
- `partialResults` (boolean, optional): `true` if `success === false` but some feeds were still found
- `results` (array): One entry per input URL
  - `url` (string): The scanned URL
  - `feeds` (array): Discovered feed objects with `url`, `title`, and `type` ('rss' | 'atom' | 'unknown')
  - `error` (string | null): Error message if scanning failed, `null` otherwise

## Exit Codes

- `0` - One or more feeds found (or `--help` / `--version` used)
- `1` - No feeds found
- `2` - Error occurred

## Features

- Discovers RSS/Atom feeds from HTML `<link>` tags
- Tests common paths (`/rss.xml`, `/atom`, `/feed`, etc.)
- Scans blog subdirectories (`/blog`, `/news`, `/articles`)
- Parallel processing for multiple URLs
- Deduplicates feeds across all sources
- Validates feeds actually exist and return XML
- JSON-only output to stdout
- Errors to stderr
- 10s default timeout per URL (configurable)

## Examples

### Find feeds for Vercel:
```bash
node dist/find-rss-feeds.js https://vercel.com
```

Output:
```json
{
  "success": true,
  "results": [
    {
      "url": "https://vercel.com",
      "feeds": [
        {"url": "https://vercel.com/atom", "title": "atom", "type": "atom"}
      ],
      "error": null
    }
  ]
}
```

### Check exit code:
```bash
node dist/find-rss-feeds.js https://vercel.com 2>/dev/null
echo $?  # Outputs: 0
```

### No feeds found:
```bash
node dist/find-rss-feeds.js https://example.com 2>/dev/null
echo $?  # Outputs: 1
```

### Parallel scan:
```bash
node dist/find-rss-feeds.js https://vercel.com https://news.ycombinator.com | jq
```

## Integration Example

### Claude AI:
```python
import subprocess
import json

result = subprocess.run(
  ['node', 'dist/find-rss-feeds.js', 'https://vercel.com'],
  capture_output=True,
  text=True
)

data = json.loads(result.stdout)
feeds = data['results'][0]['feeds']
exit_code = result.returncode
```

### Shell script:
```bash
#!/bin/bash
result=$(node dist/find-rss-feeds.js "$1" 2>/dev/null)
exit_code=$?

if [ $exit_code -eq 0 ]; then
  echo "Found feeds:"
  echo "$result" | jq '.results[0].feeds'
fi
```

## AI Agent Integration

This tool is designed to work seamlessly with AI coding agents:

### Opencode / Claude Code
```bash
# Opencode can call this tool directly
npx -y rss-agent-discovery https://example.com | jq '.results[0].feeds[].url'
```

### Cursor
Cursor can integrate this as a custom tool:
```json
{
  "name": "rss_discovery",
  "command": "npx -y rss-agent-discovery {url}",
  "description": "Discover RSS feeds from a website"
}
```

### GitHub Copilot
```javascript
// Use in GitHub Actions or workflows
const { execSync } = require('child_process');
const result = JSON.parse(
  execSync('npx -y rss-agent-discovery https://github.com/blog').toString()
);
```

### Custom MCP Server
```typescript
// Build a Model Context Protocol server
import { spawn } from 'child_process';

async function discoverRSS(url: string) {
  const proc = spawn('npx', ['-y', 'rss-agent-discovery', url]);
  const chunks: Buffer[] = [];
  
  for await (const chunk of proc.stdout) {
    chunks.push(chunk);
  }
  
  return JSON.parse(Buffer.concat(chunks).toString());
}
```

### Why AI Agents Need This Tool

AI agents (Claude, Cursor, ChatGPT Codex) struggle with RSS discovery because:
- They rely on web search which may miss feeds
- They don't systematically parse HTML `<link>` tags
- They give up after trying 2-3 common paths
- They can't validate feeds actually return XML

This tool solves all of those problems with structured JSON output.

## Development

### Build:
```bash
npm run build
```

### Test:
```bash
npm test              # Run all tests (unit + smoke)
npm run test:unit     # Run unit tests only
npm run test:smoke    # Run smoke tests (integration)
```

### Lint:
```bash
tsc --noEmit
```

## Project Structure

- `find-rss-feeds.ts` - TypeScript source
- `dist/` - Compiled JavaScript
- `package.json` - Dependencies and scripts

## License

MIT
