# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server that indexes multiple Zendesk Help Center knowledge bases and exposes them as a searchable tool for AI coding assistants (Claude Code, Cursor, Windsurf, Continue.dev, Zed).

## Tech Stack

- **Runtime**: Node.js 20+ with TypeScript (ESM modules)
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Database**: SQLite with `better-sqlite3` + `sqlite-vec` extension for vector search
- **Embeddings**: Ollama with `nomic-embed-text` model (768 dimensions)
- **HTML Parsing**: `cheerio`
- **CLI Framework**: `citty`

## Build and Development Commands

```bash
# Build TypeScript
npm run build

# Install globally for testing
npm link

# Run CLI commands
kb-mcp init                   # Interactive setup
kb-mcp sync                   # Sync knowledge bases
kb-mcp serve                  # Start MCP server (stdio)
kb-mcp setup <client>         # Auto-configure MCP client (claude-code, cursor, windsurf, continue, zed)
kb-mcp uninstall              # Remove kb-mcp data and MCP configs
kb-mcp uninstall --keep-data  # Remove only MCP configs, keep data
kb-mcp doctor                 # Diagnostics check
kb-mcp sources                # Manage sources
kb-mcp stats                  # Show database statistics

# Test MCP server with inspector
npx @modelcontextprotocol/inspector kb-mcp serve

# Debug logging
DEBUG=kb-mcp:* kb-mcp sync
```

## Setup and Uninstall

### Automatic Setup
The `kb-mcp setup` command automatically configures MCP clients:
- **Claude Code**: Runs `claude mcp add` command
- **Other clients**: Directly modifies their JSON config files

All clients use shell wrapper (`bash -l -c "kb-mcp serve"`) for compatibility with node version managers (fnm, nvm, volta, asdf).

### Uninstall
The `kb-mcp uninstall` command removes:
- MCP server entries from all client configs
- Data directory (`~/.local/share/kb-mcp/`)
- Config directory (`~/.config/kb-mcp/`)

Use `--keep-data` to only remove MCP config entries while preserving local data.

## Architecture

```
Zendesk APIs → Sync Worker → SQLite + sqlite-vec
                                    ↓
MCP Clients ←→ MCP Server (stdio) ←→ Ollama Embeddings
```

**Key flows:**
1. **Sync**: Fetches articles from Zendesk public API → strips HTML with cheerio → chunks text (~500 tokens with 50 token overlap) → generates embeddings via Ollama → stores in SQLite with vector index
2. **Search**: Query embedding via Ollama → vector similarity search in sqlite-vec → returns formatted results with source links

## Configuration Paths (XDG-compliant)

- Config: `~/.config/kb-mcp/config.json`
- Data: `~/.local/share/kb-mcp/kb.sqlite`
- Logs: `~/.local/share/kb-mcp/logs/`

## MCP Tools Exposed

- `search_knowledge_base` - Vector similarity search with optional source filtering
- `list_sources` - List configured knowledge bases and sync status

## Native Extension Handling

The `sqlite-vec` extension is downloaded during `postinstall` based on platform detection. Binaries go in `native/` directory.
