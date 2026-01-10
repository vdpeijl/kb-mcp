# Project: Zendesk Knowledge Base MCP Server

Build an MCP (Model Context Protocol) server that indexes multiple Zendesk Help Center knowledge bases and exposes them as a searchable tool. The tool should be easily distributable to developers and work with multiple AI coding assistants.

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Zendesk APIs   │────▶│   Sync Worker   │────▶│  SQLite + Vec   │
│  (multiple KBs) │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Claude Code    │     │                 │     │                 │
│  Cursor         │◀───▶│   MCP Server    │◀───▶│  Ollama Local   │
│  Windsurf       │     │   (stdio)       │     │  Embeddings     │
│  VS Code + Ext  │     │                 │     │                 │
│  Continue.dev   │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Target MCP Clients

The server should work with any MCP-compatible client, but specifically document setup for:

1. **Claude Code** - Anthropic's CLI coding assistant
2. **Cursor** - AI-powered code editor (MCP support via settings)
3. **Windsurf** - Codeium's AI IDE (MCP support built-in)
4. **VS Code + Continue.dev** - Open-source AI extension
5. **Zed** - Modern editor with MCP support

All these use the same MCP protocol over stdio, so the server implementation is identical — only the client configuration differs.

## Tech Stack

- **Runtime**: Node.js 20+ with TypeScript (ESM)
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Database**: SQLite with `better-sqlite3`
- **Vector Search**: `sqlite-vec` extension (auto-downloaded via postinstall)
- **Embeddings**: Ollama running locally (model: `nomic-embed-text`)
- **HTML Parsing**: `cheerio` for stripping HTML from article bodies
- **CLI Framework**: `citty` (lightweight, good DX) or `commander`

## Distribution Strategy

The tool will be distributed as an **npm package** that developers install globally:

```bash
npm install -g @yourorg/kb-mcp-server
```

### Why npm?

1. Your team already has Node.js (frontend developers)
2. Simple distribution via private npm registry or git
3. Native dependencies (sqlite-vec) handled via postinstall
4. Works across macOS, Linux, Windows
5. Easy updates via npm

### postinstall Script

The package includes a postinstall script that:

1. Detects the platform (darwin-arm64, darwin-x64, linux-x64, win32-x64)
2. Downloads the correct sqlite-vec binary from GitHub releases
3. Places it in the package's `native/` directory
4. Verifies the checksum

```typescript
// scripts/postinstall.ts
const SQLITE_VEC_VERSION = "0.1.6";
const PLATFORM_MAP = {
  "darwin-arm64": "vec0-macos-aarch64.dylib",
  "darwin-x64": "vec0-macos-x86_64.dylib",
  "linux-x64": "vec0-linux-x86_64.so",
  "win32-x64": "vec0-windows-x86_64.dll",
};
```

## Project Structure

````
kb-mcp-server/
├── src/
│   ├── index.ts           # MCP server entry point (stdio)
│   ├── cli.ts             # CLI entry point using citty
│   ├── commands/
│   │   ├── serve.ts       # Start MCP server
│   │   ├── sync.ts        # Sync knowledge bases
│   │   ├── sources.ts     # Manage sources (add/remove/list)
│   │   ├── init.ts        # Interactive setup wizard
│   │   └── setup.ts       # Print config for various MCP clients
│   ├── sync/
│   │   ├── zendesk.ts     # Zendesk API client
│   │   ├── chunker.ts     # Text chunking logic
│   │   └── index.ts       # Sync orchestration
│   ├── search/
│   │   ├── embeddings.ts  # Ollama embedding client
│   │   └── index.ts       # Search logic
│   ├── db/
│   │   ├── index.ts       # Database connection + extension loading
│   │   ├── schema.ts      # Database schema & migrations
│   │   ├── articles.ts    # Article CRUD operations
│   │   ├── chunks.ts      # Chunk CRUD + vector ops
│   │   └── sources.ts     # Knowledge base source management
│   └── config.ts          # Configuration loading (XDG paths)
├── scripts/
│   └── postinstall.ts     # Download sqlite-vec for platform
├── native/                # sqlite-vec binaries (populated by postinstall)
├── package.json
├── tsconfig.json
└── README.md

## Configuration

Configuration and data are stored in XDG-compliant paths:

- **Config**: `~/.config/kb-mcp/config.json`
- **Data**: `~/.local/share/kb-mcp/kb.sqlite`
- **Logs**: `~/.local/share/kb-mcp/logs/`

On first run, `kb-mcp init` creates the config interactively.

### Config file structure (`config.json`):

```json
{
  "ollama": {
    "baseUrl": "http://localhost:11434",
    "model": "nomic-embed-text"
  },
  "sync": {
    "chunkSize": 500,
    "chunkOverlap": 50
  },
  "sources": [
    {
      "id": "sowiso",
      "name": "Sowiso",
      "baseUrl": "https://support.sowiso.com",
      "locale": "en-us",
      "enabled": true
    },
    {
      "id": "paragin",
      "name": "Paragin",
      "baseUrl": "https://support.paragin.nl",
      "locale": "nl",
      "enabled": true
    }
  ]
}
````

## Database Schema

```sql
-- Knowledge base sources
CREATE TABLE sources (
  id TEXT PRIMARY KEY,           -- e.g., "sowiso"
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  locale TEXT NOT NULL,
  last_synced_at TEXT,
  enabled INTEGER DEFAULT 1
);

-- Articles from Zendesk
CREATE TABLE articles (
  id INTEGER PRIMARY KEY,        -- Zendesk article ID
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  section_name TEXT,
  category_name TEXT,
  updated_at TEXT NOT NULL,      -- From Zendesk, for incremental sync
  synced_at TEXT NOT NULL,       -- When we last processed it
  FOREIGN KEY (source_id) REFERENCES sources(id),
  UNIQUE(source_id, id)
);

-- Text chunks with embeddings
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  token_count INTEGER,
  FOREIGN KEY (article_id, source_id) REFERENCES articles(id, source_id)
);

-- Vector index (sqlite-vec virtual table)
CREATE VIRTUAL TABLE chunks_vec USING vec0(
  chunk_id INTEGER PRIMARY KEY,
  embedding float[768]           -- nomic-embed-text dimension
);

-- For filtering by source without scanning vectors
CREATE INDEX idx_chunks_source ON chunks(source_id);
CREATE INDEX idx_articles_updated ON articles(source_id, updated_at);
```

## Zendesk API Integration

The Zendesk Help Center API is public (no auth required for public articles).

### Endpoints to use:

```
GET /api/v2/help_center/{locale}/articles.json?per_page=100
GET /api/v2/help_center/{locale}/sections.json
GET /api/v2/help_center/{locale}/categories.json
```

### Response shape (articles):

```typescript
interface ZendeskArticlesResponse {
  articles: Array<{
    id: number;
    title: string;
    body: string; // HTML content
    section_id: number;
    updated_at: string; // ISO timestamp
    html_url: string;
    draft: boolean;
    promoted: boolean;
  }>;
  next_page: string | null; // Pagination URL
  count: number;
}
```

### Incremental sync logic:

1. Fetch all articles from Zendesk API (paginated)
2. Compare `updated_at` with stored `updated_at` in database
3. Only re-chunk and re-embed articles that have changed
4. Delete chunks for articles that no longer exist in Zendesk
5. Update `sources.last_synced_at` when complete

## Ollama Embeddings

### Setup requirement:

User must have Ollama installed and running with the `nomic-embed-text` model:

```bash
ollama pull nomic-embed-text
```

### API call:

```typescript
async function embed(text: string): Promise<number[]> {
  const response = await fetch("http://localhost:11434/api/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "nomic-embed-text",
      prompt: text,
    }),
  });
  const data = await response.json();
  return data.embedding; // float[768]
}
```

### Batch embedding:

Ollama doesn't support batch embedding natively. Implement a queue with concurrency control (e.g., 5 concurrent requests) to avoid overwhelming it.

## Text Chunking

Implement a chunker that:

1. Strips HTML using `cheerio` (preserve text content, handle lists/tables sensibly)
2. Splits on paragraph boundaries first, then sentences if needed
3. Targets ~500 tokens per chunk (estimate: 1 token ≈ 4 chars for English)
4. Includes configurable overlap (default 50 tokens) for context continuity
5. Preserves the article title as a prefix for each chunk: `"# {title}\n\n{chunk_text}"`

## MCP Server Tools

Expose these tools:

### 1. `search_knowledge_base`

```typescript
{
  name: "search_knowledge_base",
  description: "Search the knowledge base for documentation, guides, and help articles. Returns relevant excerpts with source links.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Natural language search query"
      },
      sources: {
        type: "array",
        items: { type: "string" },
        description: "Filter by source IDs (optional, searches all if omitted)"
      },
      limit: {
        type: "number",
        description: "Maximum results to return (default: 5, max: 20)"
      }
    },
    required: ["query"]
  }
}
```

**Implementation:**

1. Generate embedding for query using Ollama
2. Perform vector similarity search using sqlite-vec
3. Optionally filter by source_id
4. Return formatted results with title, excerpt, and URL

### 2. `list_sources`

```typescript
{
  name: "list_sources",
  description: "List all configured knowledge base sources and their sync status",
  inputSchema: {
    type: "object",
    properties: {}
  }
}
```

**Returns:** List of sources with id, name, article count, last synced timestamp.

## CLI Commands

The CLI is invoked as `kb-mcp` after global installation:

```bash
# Interactive first-time setup (creates config, checks Ollama, adds first source)
kb-mcp init

# Sync all enabled sources (incremental by default)
kb-mcp sync
kb-mcp sync --source sowiso      # Sync specific source only
kb-mcp sync --full               # Full re-sync (re-embed everything)

# Manage sources
kb-mcp sources                   # List all sources with stats
kb-mcp sources add               # Interactive: add a new source
kb-mcp sources add --id myco --name "My Company" --url https://support.myco.com --locale en-us
kb-mcp sources remove myco       # Remove source and its data
kb-mcp sources enable myco       # Enable a disabled source
kb-mcp sources disable myco      # Disable without removing data

# Print MCP client configuration (copy-paste ready)
kb-mcp setup                     # Auto-detect or list options
kb-mcp setup claude-code         # Config for Claude Code
kb-mcp setup cursor              # Config for Cursor
kb-mcp setup windsurf            # Config for Windsurf
kb-mcp setup continue            # Config for Continue.dev
kb-mcp setup zed                 # Config for Zed

# Start MCP server (normally invoked by the MCP client, not manually)
kb-mcp serve

# Diagnostics
kb-mcp doctor                    # Check Ollama, sqlite-vec, config, etc.
kb-mcp stats                     # Show database stats (articles, chunks, size)
```

### `kb-mcp init` Flow

1. Check if Ollama is running, if not show install instructions
2. Check if `nomic-embed-text` model is pulled, offer to pull it
3. Ask for first knowledge base source (URL, name, locale)
4. Create config file
5. Run initial sync
6. Show `kb-mcp setup` output for their preferred editor

### `kb-mcp setup <client>` Output Examples

**Claude Code** (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "knowledge-base": {
      "command": "kb-mcp",
      "args": ["serve"]
    }
  }
}
```

**Cursor** (Settings → Features → MCP Servers):

```json
{
  "mcpServers": {
    "knowledge-base": {
      "command": "kb-mcp",
      "args": ["serve"]
    }
  }
}
```

**Windsurf** (`~/.codeium/windsurf/mcp_config.json`):

```json
{
  "mcpServers": {
    "knowledge-base": {
      "command": "kb-mcp",
      "args": ["serve"]
    }
  }
}
```

**Continue.dev** (`~/.continue/config.json`):

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "kb-mcp",
          "args": ["serve"]
        }
      }
    ]
  }
}
```

**Zed** (`~/.config/zed/settings.json`):

```json
{
  "context_servers": {
    "knowledge-base": {
      "command": {
        "path": "kb-mcp",
        "args": ["serve"]
      }
    }
  }
}
```

## Error Handling

1. **Ollama not running**: Detect connection failure, show clear message:

   ```
   ✗ Cannot connect to Ollama at http://localhost:11434

   Make sure Ollama is running:
     ollama serve

   Or if using a different host, update ~/.config/kb-mcp/config.json
   ```

2. **Embedding model not found**: Detect 404 from Ollama, offer to pull:

   ```
   ✗ Model 'nomic-embed-text' not found

   Pull it with:
     ollama pull nomic-embed-text
   ```

3. **sqlite-vec not found**: Should not happen if postinstall succeeded, but handle gracefully:

   ```
   ✗ Could not load sqlite-vec extension

   Try reinstalling:
     npm install -g @yourorg/kb-mcp-server --force

   Or manually download from:
     https://github.com/asg017/sqlite-vec/releases
   ```

4. **Zendesk rate limiting**: Implement exponential backoff, respect 429 responses, show progress:

   ```
   ⚠ Rate limited by Zendesk, waiting 30s... (retry 2/5)
   ```

5. **Network failures**: Retry with backoff, allow resuming interrupted syncs

6. **Invalid config**: Validate on startup, show specific field errors:

   ```
   ✗ Invalid config at ~/.config/kb-mcp/config.json

   • sources[0].baseUrl: must be a valid URL
   • ollama.model: required field missing

   Run 'kb-mcp init' to reconfigure, or edit the file manually.
   ```

7. **No sources configured**: Friendly prompt to add one:

   ```
   No knowledge base sources configured yet.

   Add one with:
     kb-mcp sources add
   ```

## Performance Considerations

1. **Batch database inserts**: Use transactions for bulk inserts during sync
2. **Embedding concurrency**: Limit to 5 concurrent Ollama requests
3. **Lazy loading**: Don't load sqlite-vec until actually searching
4. **Connection pooling**: Reuse database connection across requests

## package.json Configuration

```json
{
  "name": "@yourorg/kb-mcp-server",
  "version": "1.0.0",
  "description": "MCP server for searching Zendesk knowledge bases",
  "type": "module",
  "bin": {
    "kb-mcp": "./dist/cli.js"
  },
  "files": ["dist", "native", "scripts"],
  "scripts": {
    "build": "tsc",
    "postinstall": "node scripts/postinstall.js",
    "prepublishOnly": "npm run build"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

## Installation & Setup (README Content)

### Prerequisites

1. **Node.js 20+** - Check with `node --version`
2. **Ollama** - Local LLM runtime for embeddings

### Install Ollama

**macOS:**

```bash
brew install ollama
```

**Linux:**

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Arch Linux:**

```bash
pacman -S ollama
```

Then start Ollama and pull the embedding model:

```bash
ollama serve &              # Start in background (or use systemd)
ollama pull nomic-embed-text
```

### Install kb-mcp

**From npm (once published):**

```bash
npm install -g @yourorg/kb-mcp-server
```

**From git (during development):**

```bash
git clone https://github.com/yourorg/kb-mcp-server.git
cd kb-mcp-server
npm install
npm run build
npm link    # Makes 'kb-mcp' available globally
```

### Quick Start

```bash
# 1. Run interactive setup
kb-mcp init

# 2. Add your knowledge base when prompted, or manually:
kb-mcp sources add --id mycompany --name "My Company" --url https://support.mycompany.com --locale en-us

# 3. Sync the knowledge base
kb-mcp sync

# 4. Configure your AI coding assistant
kb-mcp setup cursor    # or: claude-code, windsurf, continue, zed

# 5. Copy the printed config to the appropriate location
```

### Verify Installation

```bash
kb-mcp doctor
```

This checks:

- ✓ Node.js version
- ✓ sqlite-vec native extension loaded
- ✓ Ollama running and reachable
- ✓ Embedding model available
- ✓ Config file exists and is valid
- ✓ Database accessible

## Testing the Implementation

### Manual Testing

1. Install globally with `npm link`
2. Run `kb-mcp doctor` to verify setup
3. Add a test source and sync
4. Test MCP server with the MCP Inspector:
   ```bash
   npx @modelcontextprotocol/inspector kb-mcp serve
   ```
5. Verify search returns relevant results

### Integration Testing

Test with actual MCP clients:

1. Configure in Cursor (easiest to test interactively)
2. Ask: "Search the knowledge base for how to create a test"
3. Verify the tool is called and returns formatted results

## Logging

- Use `debug` package for debug logs: `DEBUG=kb-mcp:* kb-mcp sync`
- Namespaces: `kb-mcp:sync`, `kb-mcp:embed`, `kb-mcp:search`, `kb-mcp:mcp`
- Write error logs to `~/.local/share/kb-mcp/logs/error.log`
- Sync progress should show a nice progress bar (use `cli-progress` or similar)

## Future Enhancements (Out of Scope for Initial Build)

- Scheduled sync via cron/launchd (generate the config with `kb-mcp schedule`)
- Web UI for browsing indexed content
- Webhook support for real-time updates from Zendesk
- Support for other knowledge base platforms (Confluence, Notion, GitBook)
- Hybrid search (combine vector + keyword FTS5)
- Re-ranking with cross-encoder model
- Team config sharing (sync config from a URL)
