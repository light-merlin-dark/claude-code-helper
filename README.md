# Claude Code Helper (CCH)

<div align="center">
  <img src="assets/terminal-preview.png" alt="Claude Code Helper Terminal Preview" width="700">
  <p><em>Streamline your Claude Code workflow with intelligent MCP management</em></p>
</div>

**MCP configuration management for Claude Code - discover tools, manage permissions, and diagnose issues across all your projects.**

Native MCP server that gives AI agents direct access to manage configurations, analyze MCP tool usage, and maintain consistent bash permissions across your entire codebase.

## 🚀 Key Capabilities

**🤖 AI-Native Design**: First-class MCP server with 15+ tools for configuration management, diagnostics, and bulk operations.

**🛡️ Smart Safety**: Prevents dangerous commands, validates permissions, and creates automatic backups before changes.

**📊 Global Intelligence**: Analyzes your entire Claude Code workspace via global config, discovering usage patterns across all projects.

**⚡ Bulk Operations**: Manage permissions and MCP tools across multiple projects with pattern matching and dry-run previews.

## 🔌 Model Context Protocol (MCP) Setup

### Quick Start
```bash
# Install globally
npm install -g @light-merlin-dark/claude-code-helper

# Install MCP server in Claude Code
cch install
```

That's it! Restart Claude Code and you're ready to go.

### Available MCP Tools

#### Core Management Tools
- `reload-mcp` - Reload MCP configurations from Claude CLI
  - Reload specific MCP by name
  - Reload all MCPs with `all: true`
  - Real-time status updates

- `doctor` - Run comprehensive diagnostics and health checks
  - System configuration analysis
  - Global Claude config analysis (~/.claude.json)
  - Permission safety validation
  - MCP connectivity tests
  - Actionable recommendations

- `view-logs` - View Claude Code Helper logs with filtering
  - Filter by log level (ERROR, WARN, INFO, DEBUG)
  - Search for specific text
  - View logs from specific dates
  - Control number of lines returned

- `backup` - Create configuration backups
  - Compressed backups with automatic naming
  - Optional custom backup names
  - Safe storage in ~/.cch/backups/

- `restore` - Restore from configuration backups
  - List available backups
  - Restore from specific backup by name
  - Automatic backup before restore

- `list-projects` - Show all projects in configuration
  - Extract project tree from audit output
  - Project statistics and details
  - Configuration overview

#### MCP Discovery Tools (Global Config Aware)
- `discover-mcp-tools` - Discover MCP tools used across ALL your projects
  - Reads from global Claude config (~/.claude.json)
  - Find tools used in multiple projects
  - Get usage statistics and frequency
  - Project association details
  - Optional detailed statistics

- `list-mcps` - List all MCPs found across your entire workspace
  - Analyzes global Claude config for all projects
  - Usage count per MCP
  - Project associations
  - Tool listings per MCP
  - Sort by usage frequency

- `get-mcp-stats` - Get comprehensive MCP usage statistics
  - Aggregates data from global config
  - Total MCPs, tools, and usage counts
  - Top MCPs and tools by usage
  - Group by MCP, tool, or project
  - Cross-project analysis

#### Configuration Management Tools
- `audit` - Comprehensive configuration analysis
  - Security analysis with dangerous permission detection
  - Configuration bloat detection
  - Project overview with tree structure
  - Actionable recommendations

- `clean-history` - Remove large pastes from conversation history
  - Identify bloated project configurations
  - Preview changes before applying
  - Automatic backup before cleaning

- `clean-dangerous` - Remove dangerous permissions
  - Detect and remove risky permissions
  - Safety-first approach to permission management

#### Bulk Operations Tools
- `add-permission` - Add permissions to multiple projects
  - Pattern matching for project selection
  - Bulk operations across project sets
  - Dry-run preview mode

- `remove-permission` - Remove permissions from multiple projects
  - Target dangerous permissions specifically
  - Pattern-based project selection
  - Safety confirmations

- `add-tool` - Add MCP tools to multiple projects
  - Bulk MCP tool management
  - Project pattern matching

- `remove-tool` - Remove MCP tools from multiple projects
  - Clean up unused MCP tools
  - Bulk removal operations

### MCP Usage Examples

Ask Claude to help with your setup:

```
"Use CCH to reload the aia MCP"
"Run diagnostics on my Claude Code setup"
"Show me error logs from the last hour"
"Find MCP tools I use frequently"
"Give me statistics about my MCP usage"
"Check my bash permissions for safety issues"
"Audit my Claude Code configuration for issues"
"Create a backup before making changes"
"Clean up dangerous permissions across all projects"
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
- MCP tool frequency analysis across all projects
- Permission usage patterns and recommendations
- Configuration health monitoring
- Cross-project statistics and insights

## 📦 Installation

```bash
# Install globally via npm
npm install -g @light-merlin-dark/claude-code-helper

# Or use npx (no installation required)
npx @light-merlin-dark/claude-code-helper --help
```

## 🚀 CLI Quick Start

```bash
# Permission Management
cch -lp                    # List permissions
cch -add docker            # Add with smart expansion (docker:*)
cch -dp                    # Discover frequent permissions
cch -ap                    # Apply to all projects

# MCP Tool Discovery
cch -dmc                   # Find MCP tools used in 3+ projects
cch -rmc aia               # Reload specific MCP
cch --doctor               # Run diagnostics

# Safety & Backup
cch -bc --name pre-update  # Create backup
cch -rc --name pre-update  # Restore backup
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

## 🎯 How It Works

**Dual Interface**: MCP server for AI agents + CLI for manual control, sharing the same core functionality.

**Smart Permissions**: Stored in `~/.cch/permissions.json` with automatic expansion (`docker` → `docker:*`) and safety validation.

**Global Analysis**: Reads `~/.claude.json` to analyze all your projects at once, not just individual directories.

**Safety First**: Automatic backups, dangerous command blocking, and detailed change tracking for all operations.

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
