# Claude Code Helper (CCH)

**MCP configuration management for Claude Code - discover tools, manage permissions, and diagnose issues across all your projects.**

Built as a native MCP server for Claude Code, CCH gives AI agents direct access to manage your configurations, analyze MCP tool usage, and maintain consistent bash permissions across your entire codebase.

## 🚀 Why Claude Code Helper?

### Native MCP Integration
CCH is a first-class MCP server, enabling AI agents to:
- Reload MCP configurations without manual intervention
- Discover MCP tools used across your projects
- Analyze bash command permissions for safety
- Run comprehensive diagnostics on your setup
- View and filter logs with advanced search

### Smart Permission Management
Manage bash permissions across all Claude Code projects:
- Define base permissions that apply everywhere
- Smart command expansion (`docker` → `docker:*`)
- Safety guards against dangerous commands
- Discover frequently used permissions
- Track changes with detailed audit logs

### Project Intelligence
Understand your Claude Code usage patterns:
- Find MCP tools used in multiple projects
- Get statistics on permission usage
- Analyze project configurations
- Identify safety issues proactively

## 🔌 Model Context Protocol (MCP) Setup

### Quick Start
```bash
# Install
npm install -g @light-merlin-dark/claude-code-helper

# Add to Claude Code
claude mcp add-json cch '{
  "type": "stdio",
  "command": "cch",
  "args": ["--mcp"],
  "env": {"NODE_NO_WARNINGS": "1"}
}'
```

### Available MCP Tools

#### Core Management Tools
- `reload-mcp` - Reload MCP configurations from Claude CLI
  - Reload specific MCP by name
  - Reload all MCPs with `all: true`
  - Real-time status updates

- `doctor` - Run comprehensive diagnostics and health checks
  - System configuration analysis
  - Permission safety validation
  - MCP connectivity tests
  - Actionable recommendations

- `view-logs` - View Claude Code Helper logs with filtering
  - Filter by log level (ERROR, WARN, INFO, DEBUG)
  - Search for specific text
  - View logs from specific dates
  - Control number of lines returned

#### MCP Discovery Tools
- `discover-mcp-tools` - Discover MCP tools used across projects
  - Find tools used in multiple projects
  - Get usage statistics and frequency
  - Project association details
  - Optional detailed statistics

- `list-mcps` - List all MCPs found across projects
  - Usage count per MCP
  - Project associations
  - Tool listings per MCP
  - Sort by usage frequency

- `get-mcp-stats` - Get comprehensive MCP usage statistics
  - Total MCPs, tools, and usage counts
  - Top MCPs and tools by usage
  - Group by MCP, tool, or project
  - Cross-project analysis

### MCP Usage Examples

Ask Claude to help with your setup:

```
"Use CCH to reload the aia MCP"
"Run diagnostics on my Claude Code setup"
"Show me error logs from the last hour"
"Find MCP tools I use frequently"
"Give me statistics about my MCP usage"
"Check my bash permissions for safety issues"
```

## ✨ Key Features

### 🤖 MCP-Powered Intelligence
```json
{
  "tool": "discover-mcp-tools",
  "minProjectCount": 3,
  "includeStats": true
}
```

Returns frequently used MCP tools across your projects:
```
🔍 MCP Tools Used in 3+ Projects

1. mcp__github__search_code
   • MCP: github
   • Tool: search_code
   • Used in 5 projects: api-server, frontend, cli-tool (+2 more)
   • Total usage count: 127

2. mcp__aia__consult
   • MCP: aia
   • Tool: consult
   • Used in 4 projects: backend, ml-service, data-pipeline (+1 more)
   • Total usage count: 89
```

### 🛡️ Enterprise-Ready Safety
- **Blocked Commands**: Prevents `rm -rf /`, fork bombs, disk formatting
- **Warning System**: Confirms risky operations before execution
- **Smart Expansion**: `docker` → `docker:*` automatically
- **Audit Trail**: Detailed change tracking for compliance

### 📊 Project Analytics
Real-time insights into your Claude Code usage:
- MCP tool frequency analysis
- Permission usage patterns
- Project configuration health
- Cross-project statistics

## 📦 Installation

```bash
# Install globally via npm
npm install -g @light-merlin-dark/claude-code-helper

# Or use npx (no installation required)
npx @light-merlin-dark/claude-code-helper --help
```

## 🚀 CLI Quick Start

### Permission Management

```bash
# View current permissions
cch -lp

# Add new permission with smart expansion
cch -add docker    # Becomes docker:* automatically

# Discover frequently used permissions
cch -dp

# Apply permissions to all projects
cch -ap
```

### MCP Tool Discovery

```bash
# Find MCP tools used in 3+ projects
cch -dmc

# Reload specific MCP
cch -rmc aia

# Reload all MCPs
cch -rmc --force
```

### Backup & Safety

```bash
# Backup before changes
cch -bc --name pre-update

# Run diagnostics
cch --doctor

# Restore if needed
cch -rc --name pre-update
```

### Command Reference

| Command | Alias | Description |
|---------|-------|-------------|
| `--list-permissions` | `-lp` | List your permissions |
| `--add-permission` | `-add` | Add permission with smart expansion |
| `--discover` | `-dp` | Discover frequently used permissions |
| `--discover-mcp` | `-dmc` | Discover frequently used MCP tools |
| `--reload-mcp` | `-rmc` | Reload MCP configurations |
| `--apply-permissions` | `-ap` | Apply permissions to all projects |
| `--backup-config` | `-bc` | Create backup |
| `--restore-config` | `-rc` | Restore from backup |
| `--doctor` | - | Run diagnostics |
| `--config` | `-c` | View configuration |

## 🎯 Perfect for Claude Code Users

### Common Use Cases

```bash
# Setting up a new project
cch -add docker         # Add Docker permissions
cch -add npm            # Add npm permissions
cch -add pytest         # Add pytest permissions
cch -ap                 # Apply to all projects at once

# Discovering what you already use
cch -dp                 # Find permissions used across projects
cch -dmc                # Find MCP tools used frequently

# Managing MCP servers
cch -rmc aia            # Reload a specific MCP
cch --doctor            # Diagnose configuration issues

# Safety first
cch -bc                 # Backup before major changes
cch -rc                 # Restore if something goes wrong
```

### How It Works

CCH manages your Claude Code configuration in two powerful ways:

**MCP Server Mode**: When added to Claude Code, CCH provides a full MCP interface that AI agents can use to manage your configuration programmatically.

**CLI Mode**: Direct command-line access for manual configuration management, with smart features like command expansion and safety validation.

Both modes share the same core functionality:
- Permissions stored in `~/.cch/permissions.json`
- Smart command expansion (`docker` → `docker:*`)
- Safety validation for all operations
- Detailed change tracking and audit logs
- Automatic formatting for Claude Code compatibility

## 🔧 Development

```bash
# Clone and setup
git clone https://github.com/light-merlin-dark/claude-code-helper.git
cd claude-code-helper
npm install

# Development workflow
npm run dev         # Run in development mode
npm run build       # Build for production
npm run lint        # Type checking

# Testing with Bun
bun test            # Run all tests
bun test:unit       # Unit tests only
bun test:e2e        # End-to-end tests only
bun test:watch      # Watch mode
```

### Testing Infrastructure

Comprehensive test coverage including:
- Unit tests for services and components
- Integration tests for workflows
- End-to-end CLI command tests
- MCP protocol validation tests
- Performance benchmarks
- Error scenario coverage

## 📁 Configuration Files

```
~/.claude.json         # Claude's main config (managed by Claude)
~/.cch/                # CCH configuration directory
  ├── permissions.json # Your base permissions
  ├── preferences.json # User preferences
  ├── state.json       # Usage tracking
  └── backups/         # Configuration backups
```

## Default Permissions

Safe defaults when starting fresh:
- `make:*` - Make commands
- `npm run:*` - NPM scripts
- `npm test:*` - NPM tests
- `git status` - Git status
- `git diff:*` - Git diffs
- `git log:*` - Git logs

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

Built with ❤️ by [@EnchantedRobot](https://twitter.com/EnchantedRobot)
