# @vdpeijl/kb-mcp

MCP (Model Context Protocol) server that indexes multiple Zendesk Help Center knowledge bases and exposes them as searchable tools for AI coding assistants.

## Features

- 🔍 **Vector Search**: Semantic search using Ollama embeddings (nomic-embed-text)
- 📚 **Multiple Sources**: Index and search across multiple Zendesk knowledge bases
- 🔄 **Incremental Sync**: Efficient updates - only process changed articles
- 🚀 **Easy Setup**: Interactive CLI wizard + automated Claude Code configuration
- 🎯 **MCP Compatible**: Works with all MCP clients (automated setup for Claude Code)
- 🛠️ **Version Manager Support**: Compatible with fnm, nvm, volta, asdf via shell wrapper

## Prerequisites

### Node.js 20+

Check your version:
```bash
node --version
```

If you need to install or update Node.js, visit [nodejs.org](https://nodejs.org)

### Ollama

Ollama is required for generating embeddings.

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

**Start Ollama and pull the embedding model:**
```bash
ollama serve &
ollama pull nomic-embed-text
```

## Installation

### From npm

```bash
npm install -g @vdpeijl/kb-mcp
```

### From source

```bash
git clone https://github.com/vdpeijl/kb-mcp.git
cd kb-mcp
npm install
npm run build
npm link
```

## Quick Start

### 1. Run interactive setup

```bash
kb-mcp init
```

This will:
- Check if Ollama is running
- Verify the embedding model is available
- Help you add your first knowledge base
- Create the configuration file

### 2. Sync your knowledge base

```bash
kb-mcp sync
```

This will:
- Fetch all articles from your Zendesk Help Center
- Parse HTML content
- Split into chunks (~500 tokens with overlap)
- Generate embeddings using Ollama
- Store in a local SQLite database with vector search

### 3. Configure your MCP client

**For Claude Code (automated):**
```bash
kb-mcp setup claude-code
```

**For other MCP clients:**
See the [MCP Client Configuration](#mcp-client-configuration) section below for manual setup instructions.

### 4. Restart your MCP client

The knowledge base will now be available for search!

## Commands

### `kb-mcp init`

Interactive setup wizard. Creates configuration and helps you add your first knowledge base.

### `kb-mcp sync`

Sync all enabled knowledge bases. Only processes articles that have changed since the last sync.

**Options:**
- `--source <id>` - Sync specific source only
- `--full` - Full re-sync (re-embed everything)

**Examples:**
```bash
kb-mcp sync                    # Sync all enabled sources
kb-mcp sync --source myco      # Sync specific source
kb-mcp sync --full             # Full re-sync
```

### `kb-mcp sources`

Manage knowledge base sources.

**Subcommands:**
- `list` - List all sources with stats (default)
- `add` - Add a new source (interactive or with flags)
- `remove <id>` - Remove a source and its data
- `enable <id>` - Enable a disabled source
- `disable <id>` - Disable without removing data

**Examples:**
```bash
kb-mcp sources                                    # List all sources
kb-mcp sources add                                # Interactive add
kb-mcp sources add --id myco --name "My Company" --url https://support.myco.com --locale en-us
kb-mcp sources remove myco                        # Remove source
kb-mcp sources disable myco                       # Disable source
kb-mcp sources enable myco                        # Enable source
```

### `kb-mcp serve`

Start the MCP server (stdio). This is normally called by your MCP client, not manually.

### `kb-mcp setup [client]`

Automatically configure MCP clients. Currently supports: claude-code.

**Examples:**
```bash
kb-mcp setup              # List available clients
kb-mcp setup claude-code  # Automatically configure Claude Code
```

**Note:** For other MCP clients (Cursor, Windsurf, Continue.dev, Zed), see the manual configuration instructions below.

### `kb-mcp doctor`

Run diagnostics to check:
- Node.js version
- Configuration validity
- Ollama connection
- Embedding model availability
- Database accessibility
- sqlite-vec extension

### `kb-mcp stats`

Show database statistics:
- Total sources, articles, chunks
- Database file size
- Per-source breakdown

### `kb-mcp uninstall`

Remove kb-mcp data and MCP server configurations.

**Options:**
- `--keep-data` - Keep database and config files, only remove from MCP clients

**Examples:**
```bash
kb-mcp uninstall              # Full uninstall (removes data + MCP configs)
kb-mcp uninstall --keep-data  # Only remove MCP config, keep data
```

This command will:
- Remove the MCP server entry from Claude Code (via `claude mcp remove`)
- Remove the data directory (`~/.local/share/kb-mcp/`)
- Remove the config directory (`~/.config/kb-mcp/`)

After running, you can completely remove the package with:
```bash
npm uninstall -g @vdpeijl/kb-mcp
```

## MCP Client Configuration

### Claude Code

**Automated setup (recommended):**
```bash
kb-mcp setup claude-code
```

**Manual setup:**
The setup command runs: `claude mcp add --transport stdio knowledge-base -- bash -l -c "kb-mcp serve"`

This uses a shell wrapper (`bash -l -c`) for compatibility with node version managers (fnm, nvm, volta, asdf).

### Other MCP Clients

While kb-mcp is compatible with all MCP clients (Cursor, Windsurf, Continue.dev, Zed, etc.), automated setup is currently only available for Claude Code.

**Manual configuration:**
Add kb-mcp to your MCP client's configuration file using:
```json
{
  "command": "bash",
  "args": ["-l", "-c", "kb-mcp serve"]
}
```

> **Note:** The shell wrapper (`bash -l -c`) ensures compatibility with node version managers like fnm, nvm, volta, and asdf.

**Want to add automated setup for your favorite MCP client?**

We welcome contributions! The codebase has an extensible architecture that makes it easy to add support for new clients:

1. See the commented examples in [`src/commands/setup.ts`](src/commands/setup.ts) and [`src/commands/uninstall.ts`](src/commands/uninstall.ts)
2. Add your client configuration to the `CLIENT_CONFIGS` array
3. Implement the setup/remove functions
4. Submit a pull request!

For CLI-based clients (like Claude Code), use `execSync()`. For file-based clients, use the `setupJsonClient()` helper. Check the code for detailed examples.

## MCP Tools

The server exposes two tools to MCP clients:

### `search_knowledge_base`

Search the knowledge base for documentation, guides, and help articles.

**Parameters:**
- `query` (required): Natural language search query
- `sources` (optional): Filter by source IDs (array of strings)
- `limit` (optional): Maximum results (default: 5, max: 20)

**Example usage in Claude Code:**
> "Search the knowledge base for how to create a new user account"

### `list_sources`

List all configured knowledge base sources and their sync status.

**Example usage in Claude Code:**
> "List available knowledge bases"

## Configuration

Configuration is stored in XDG-compliant locations:

- **Config**: `~/.config/kb-mcp/config.json`
- **Data**: `~/.local/share/kb-mcp/kb.sqlite`
- **Logs**: `~/.local/share/kb-mcp/logs/`

On Windows, these paths use `%APPDATA%` and `%LOCALAPPDATA%` instead.

### Config file structure

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
      "id": "myco",
      "name": "My Company",
      "baseUrl": "https://support.myco.com",
      "locale": "en-us",
      "enabled": true
    }
  ]
}
```

## Debug Logging

Enable debug logging with the `DEBUG` environment variable:

```bash
DEBUG=kb-mcp:* kb-mcp sync
```

Available namespaces:
- `kb-mcp:sync` - Sync operations
- `kb-mcp:embed` - Embedding generation
- `kb-mcp:search` - Search operations
- `kb-mcp:mcp` - MCP server
- `kb-mcp:db` - Database operations
- `kb-mcp:cli` - CLI commands

## Troubleshooting

### Cannot connect to Ollama

Make sure Ollama is running:
```bash
ollama serve
```

Check if it's accessible:
```bash
curl http://localhost:11434/api/tags
```

### Model not found

Pull the embedding model:
```bash
ollama pull nomic-embed-text
```

### sqlite-vec extension not loaded

Try reinstalling:
```bash
npm install -g @vdpeijl/kb-mcp --force
```

Or manually download from: https://github.com/asg017/sqlite-vec/releases

### Rate limited by Zendesk

The sync process includes exponential backoff for rate limiting. If you're still hitting limits, try:
- Syncing one source at a time: `kb-mcp sync --source <id>`
- Waiting a few minutes between syncs

## Testing

### Test MCP server with Inspector

```bash
npx @modelcontextprotocol/inspector kb-mcp serve
```

This opens a web interface where you can:
- See available tools
- Call tools with test queries
- Inspect responses

## Development

### Publishing a new version

This project uses GitHub Actions to automatically publish to npm when the version changes in `package.json`.

To release a new version:

```bash
# Bump version (choose one)
npm version patch  # Bug fixes (0.1.0 → 0.1.1)
npm version minor  # New features (0.1.0 → 0.2.0)
npm version major  # Breaking changes (0.1.0 → 1.0.0)

# Push to GitHub (this triggers the publish workflow)
git push origin main --follow-tags
```

The GitHub Action will automatically:
- Build the project
- Publish to npm
- Create a GitHub release

See [.github/workflows/README.md](.github/workflows/README.md) for setup instructions.

## License

MIT

## Author

vdpeijl
