```
 ██████╗ ██████╗██╗  ██╗
██╔════╝██╔════╝██║  ██║
██║     ██║     ███████║
██║     ██║     ██╔══██║
╚██████╗╚██████╗██║  ██║
 ╚═════╝ ╚═════╝╚═╝  ╚═╝

Configuration management and security toolkit for Claude Code
CLI & MCP Server • Always-on secret detection • Dry-run by default
```

## Why CCH?

- **CLI-First**: Simple commands Claude can run directly - no MCP complexity required
- **Safe by Default**: Every cleanup previews changes before execution
- **Intelligent Cleanup**: 99.4% reduction capability (14MB → 84KB)
- **Security Focused**: Automatic secret detection on every command
- **Global Analysis**: Analyzes entire Claude workspace, not just individual projects

## Install

```bash
# As global CLI (recommended)
npm install -g @light-merlin-dark/claude-code-helper

# Or as package
npm install @light-merlin-dark/claude-code-helper
```

## Quick Start

**CLI:**

```bash
# Clean your config (dry-run by default)
cch clean                  # Preview what will be removed
cch clean --execute        # Actually perform cleanup

# Remove empty projects
cch clean projects -e      # Execute after preview

# Security audit
cch --audit                # Analyze config health
cch --mask-secrets-now     # Emergency secret removal
```

**With Claude:**

Tell Claude to run commands directly:
- "Run cch clean to preview cleanup"
- "Use cch --audit to analyze my config"
- "Run cch --mask-secrets-now to secure my config"

## Cache Optimization

Claude Code accumulates session transcripts, debug logs, and file history in `~/.claude/`. Over time, this can grow to 1.5GB+. CCH provides intelligent cache management:

- **Analyze cache usage** - See exactly what's using space
- **Safe cleanup** - Remove orphaned projects, stale sessions, large files
- **Blob removal** - Extract large images/outputs from sessions (surgical, preserves conversations)
- **Dry-run first** - All commands preview changes before execution

Typical savings: 100-200MB from orphaned projects, 10-50MB from blob cleanup.

## Core Commands

**Clean:**

```bash
cch clean              # Remove large pastes, images, dangerous permissions
cch clean projects     # Remove empty or accidental projects
cch clean history      # Clear all conversation history
cch clean help         # See all options

# All commands preview first, use --execute to run
cch clean -e           # Execute after preview
```

**Cache Management:**

```bash
cch cache stats            # Quick cache overview
cch cache analyze          # Detailed cache breakdown
cch cache clean --orphaned # Remove orphaned projects
cch cache clean --stale 60 # Clean projects not accessed in 60 days
cch cache clean --large    # Clean sessions >10MB

# Blob cleanup (remove images/large outputs from sessions)
cch blob analyze           # Find sessions with large blobs
cch blob clean             # Preview blob removal
cch blob clean --execute   # Remove blobs, preserve conversation
```

**Security:**

```bash
cch --audit                # Full config analysis
cch --audit --stats        # Quick summary
cch --mask-secrets-now     # Emergency secret masking
```

**Permissions:**

```bash
cch -lp                # List current permissions
cch -add "docker"      # Add permission (auto-expands to docker:*)
cch -ap                # Apply permissions to all projects
cch -dp                # Discover common permissions
```

**Settings:**

```bash
cch fix-settings       # Fix Claude settings validation errors
cch fix-settings -e    # Apply fixes across all projects
```

Fixes validation errors in bulk:
- Tool names: "git status" → "Git status"
- Wildcards: "Bash(command *)" → "Bash(command :*)"
- MCP tools: "mcp__tool__name" → "Mcp__tool__name"

## MCP Server (Optional)

For advanced integrations, install as MCP server:

```bash
cch install            # Install as MCP server
cch uninstall          # Remove MCP server
```

Most users only need the CLI. MCP provides programmatic access to the same functionality.

Available tools include:
- `doctor` - Comprehensive diagnostics and health checks
- `audit` - Security analysis and config health
- `backup`/`restore` - Configuration backup management
- `view-logs` - Filter and search CCH logs
- `reload-mcp` - Reload MCP configurations
- `discover-mcp-tools` - Analyze MCP tool usage across projects
- `list-mcps` - Show all MCPs in workspace
- `get-mcp-stats` - MCP usage statistics
- Bulk operations: `add-permission`, `remove-permission`, `add-tool`, `remove-tool`

Ask Claude to use them:
```
"Use CCH to reload the aia MCP"
"Run CCH diagnostics on my setup"
"Show me recent error logs"
"Audit my configuration for issues"
```

## Safety Features

- **Always-On Secret Detection**: Automatic scanning on every command
- **Dry-Run by Default**: All clean commands preview before execution
- **Emergency Response**: `cch --mask-secrets-now` for immediate action
- **Blocked Commands**: Prevents `rm -rf /`, fork bombs, disk formatting
- **Automatic Backups**: Created before any changes
- **Smart Expansion**: `docker` → `docker:*` automatically

## Configuration

```
~/.claude.json         # Claude's main config (managed by Claude)
~/.cch/                # CCH configuration directory
  ├── permissions.json # Your base permissions
  ├── preferences.json # User preferences
  ├── state.json       # Usage tracking
  └── backups/         # Configuration backups
```

Default safe permissions when starting fresh:
- `make:*`, `npm run:*`, `npm test:*`
- `git status`, `git diff:*`, `git log:*`

## Development

```bash
# Clone and setup
git clone https://github.com/light-merlin-dark/claude-code-helper.git
cd claude-code-helper
npm install

# Build and test
npm run build       # Build for production
npm run dev         # Run in development mode
bun test            # Run all tests
bun test:watch      # Watch mode
```

Comprehensive test coverage: unit tests, integration tests, E2E CLI tests, MCP validation, and performance benchmarks.

## License

MIT

---

Built by [Robert E. Beckner III (Merlin)](https://rbeckner.com)
