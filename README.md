# Claude Code Helper

An MCP (Model Context Protocol) server and CLI tool for managing Claude Code bash command permissions and MCP tools across your projects. Provides AI agents with programmatic access to your Claude Code configuration while offering built-in safety features.

## MCP Server for Claude Code

Claude Code Helper functions as an MCP server, allowing AI agents to query and manage your Claude Code configurations programmatically. This enables automated permission management, tool discovery, and configuration analysis.

### Add to Claude Code

Add Claude Code Helper as an MCP server to your Claude Code configuration:

```bash
claude mcp add-json cch '{
  "type": "stdio",
  "command": "npx",
  "args": ["@light-merlin-dark/claude-code-helper", "--mcp"],
  "env": {"NODE_NO_WARNINGS": "1"}
}'
```

If you have it installed globally, you can use:

```bash
claude mcp add-json cch '{
  "type": "stdio",
  "command": "cch",
  "args": ["--mcp"],
  "env": {"NODE_NO_WARNINGS": "1"}
}'
```

### Available MCP Commands

Once added as an MCP server, the following commands are available to AI agents:

- **`list_permissions`** - Get all current bash command permissions
- **`discover_permissions`** - Find frequently used permissions across projects
- **`discover_mcp_tools`** - Find MCP tools (`mcp__*`) used in 3+ projects
- **`get_config`** - View current configuration and file paths
- **`analyze_safety`** - Check permissions for safety issues
- **`get_project_stats`** - Get statistics about configured projects

### MCP Usage Examples

When using Claude Code with the MCP server enabled, you can ask Claude to:

```
"Check what bash permissions I have configured"
→ Claude will use the list_permissions command

"Find MCP tools I use frequently across my projects"
→ Claude will use the discover_mcp_tools command

"Analyze my permissions for safety issues"
→ Claude will use the analyze_safety command

"Show me statistics about my Claude Code projects"
→ Claude will use the get_project_stats command
```

The MCP server enables Claude to programmatically manage your configurations without manual CLI interaction.

## What it does

Claude Code requires explicit permission to run terminal commands in your projects. This tool allows developers to:
- Act as an MCP server for AI agents to manage configurations programmatically
- Define a base set of permissions that should be available across all projects
- Discover and manage MCP tools used across projects
- Smart command expansion (e.g., `docker` → `docker:*`)
- Built-in safety guards against dangerous commands
- Apply permissions to multiple projects with detailed change tracking
- Backup and restore your Claude Code configuration
- Keep your permissions organized and consistent

## CLI Installation

```bash
npm install -g @light-merlin-dark/claude-code-helper
# or
npm i -g @light-merlin-dark/claude-code-helper
```

## Features

### MCP Server Capabilities
- **AI Agent Integration**: Acts as an MCP server for programmatic access to Claude Code configurations
- **Permission Query API**: AI agents can list, discover, and analyze bash command permissions
- **MCP Tool Discovery**: Find and manage MCP tools (`mcp__*`) used across projects via AI agents
- **Safety Analysis**: Programmatic safety checks for dangerous commands
- **Configuration Management**: Query and analyze Claude Code configurations through MCP protocol

### CLI Features
- **Permission Management**: Define and apply bash command permissions across all your Claude Code projects
- **Smart Command Expansion**: Automatically expands simple commands (e.g., `make` → `make:*`)
- **Safety Guards**: Blocks dangerous commands like `rm -rf /` and warns about risky ones
- **Detailed Change Tracking**: See exactly what permissions were added or removed per project
- **Auto-Apply**: New permissions are immediately applied to all projects (configurable)
- **Smart Discovery**: Find permissions and MCP tools you use frequently across projects
- **Backup/Restore**: Save snapshots of your Claude configuration before making changes
- **User Preferences**: Configure behavior via `~/.cch/preferences.json`

## Architecture

Claude Code Helper follows a clean architecture pattern optimized for both CLI and MCP server operations:
- **MCP Server Mode**: Full Model Context Protocol implementation for AI agent integration
- **Service Registry**: Lightweight dependency injection for all services
- **Structured Logging**: Context-aware logging with audit trails
- **Safety Service**: Multi-layered command validation accessible via MCP and CLI
- **State Management**: Persistent state with usage tracking
- **Dual Interface**: Seamless operation as both CLI tool and MCP server

## Usage

```bash
cch [options]
```

### Managing Permissions

List your current permissions:
```bash
cch --list-permissions      # or use short alias: cch -lp
```

Add a new permission (with smart expansion and auto-apply):
```bash
cch --add "docker"         # Automatically expands to "docker:*" and applies
cch --add "npm run build"  # Multi-word commands are added as-is
```

Discover frequently used permissions:
```bash
cch --discover             # Analyzes your projects and suggests common permissions
cch -dp                    # Short alias
```

Remove a permission:
```bash
cch --remove 2             # Remove permission #2 (with confirmation)
cch -rm 2 --force          # Remove without confirmation
```

Apply permissions to all projects:
```bash
cch --apply-permissions    # Apply to all projects with detailed change log
cch -ap                    # Short alias
```

### MCP Tool Management

Discover frequently used MCP tools:
```bash
cch --discover-mcp         # Find MCP tools used in 3+ projects
cch -dmc                   # Short alias
```

MCP tools are identified by the `mcp__` prefix (e.g., `mcp__github__search_code:*`).

### Backup and Restore

Create a backup before making changes:
```bash
cch --backup-config                # Create default backup
cch --backup-config --name pre-update    # Create named backup
```

Restore from a backup if needed:
```bash
cch --restore-config               # Restore from default backup
cch --restore-config --name pre-update   # Restore specific backup
```

### Utility Commands

View your configuration:
```bash
cch --config                       # View current config and file paths
cch -c                             # Short alias
```

Check version history:
```bash
cch --changelog                    # View recent changes and updates
```

Diagnose and fix configuration issues:
```bash
cch --doctor                       # Find and fix issues in your Claude config
```

The doctor command will:
- Detect inconsistent tool wrapping (some with `Bash()`, some without)
- Find duplicate tool entries
- Identify dangerous commands
- Offer to fix all issues with interactive prompts

### Cleanup

Remove all Claude Code Helper data:
```bash
cch --delete-data                  # Delete all CCH data (requires confirmation)
cch -dd                            # Short alias
```

This will remove:
- Your permissions configuration
- All backup files
- User preferences
- The entire `~/.cch` directory

**Note**: Your Claude config (`~/.claude.json`) will be preserved.

### Command Aliases

For convenience, all commands have short aliases:

| Long Form | Short Alias | Description |
|-----------|-------------|-------------|
| `--list-permissions` | `-lp` | List your permissions |
| `--discover` | `-dp` | Discover frequently used permissions |
| `--discover-mcp` | `-dmc` | Discover frequently used MCP tools |
| `--add-permission` | `-add` | Add a permission (with smart expansion) |
| `--remove-permission` | `-rm` | Remove a permission by number |
| `--apply-permissions` | `-ap` | Apply permissions to all projects |
| `--backup-config` | `-bc` | Create backup |
| `--restore-config` | `-rc` | Restore backup |
| `--config` | `-c` | View configuration |
| `--changelog` | - | View version history |
| `--doctor` | - | Diagnose and fix config issues |
| `--delete-data` | `-dd` | Delete all CCH data |
| `--name` | `-n` | Specify backup name |
| `--force` | `-f` | Skip confirmations |

## File Locations

- **Claude Config**: `~/.claude.json` (managed by Claude)
- **CCH Directory**: `~/.cch/` (all CCH data)
  - **Permissions**: `~/.cch/permissions.json`
  - **Preferences**: `~/.cch/preferences.json`
  - **State**: `~/.cch/state.json`
  - **Backups**: `~/.cch/backups/`

## Default Permissions

If no permissions file exists, the following safe defaults are created:
- `make:*`
- `npm run:*`
- `npm test:*`
- `git status`
- `git diff:*`
- `git log:*`

## Safety Features

### Blocked Commands
The following commands are completely blocked for safety:
- `rm -rf /` and similar destructive commands
- Fork bombs
- Disk formatting commands
- Direct disk write operations

### Warning Commands
You'll receive warnings and confirmation prompts for:
- `rm` commands without specific paths
- `chmod 777` and similar permission changes
- Commands that could affect system files

### Smart Expansion
Simple commands are automatically expanded:
- `docker` → `docker:*`
- `npm` → `npm:*`
- `make` → `make:*`

## Examples

### Setting Up Permissions for All Projects

```bash
# 1. First, backup your current configuration
cch --backup-config --name before-setup

# 2. Check your current permissions
cch -lp

# 3. Add permissions you want available in all projects
cch -add docker    # Automatically expands to docker:* and applies
cch -add yarn      # No need to type the :* anymore!
cch -add pytest    # Smart expansion handles it for you

# 4. See the detailed changes that were made
# (Each add command shows what was changed in each project)

# 5. If needed, restore your original config
cch --restore-config --name before-setup
```

### Quick Permission Updates

```bash
# See what permissions you have
cch -lp

# Add a new tool with auto-apply
cch -add cargo    # Adds cargo:* and immediately applies to all projects

# The tool shows you exactly what changed in each project
```

### Discovering Common Permissions

```bash
# Let the tool analyze your projects
cch -dp

# It will show permissions used in multiple projects:
# 1. docker:*         (used in 8 projects)
# 2. yarn:*           (used in 6 projects)
# 3. pytest:*         (used in 3 projects)

# Select which ones to add (they'll be auto-applied)
```

### Managing MCP Tools

```bash
# Discover MCP tools used across projects
cch -dmc

# It will show MCP tools used in 3+ projects:
# 1. mcp__github__search_code:*    (used in 5 projects)
# 2. mcp__vssh__run_command:*      (used in 4 projects)

# Select which ones to add to your base permissions
```

### Safety Examples

```bash
# Dangerous commands are blocked
cch -add "rm -rf /"
# ⛔ BLOCKED: "rm -rf /"
# This command could cause irreversible system damage

# Warnings for risky commands
cch -add rm
# ⚠️  WARNING: "rm" is a potentially dangerous permission
# Could permanently delete files
# Type "yes" to confirm:
```

## Features in Detail

### Configuration Viewer
The `--config` command shows you:
- Your current base commands
- Total number of configured projects
- All configuration file paths (clickable in many terminals)
- Available backup files with creation dates

### Version History
The `--changelog` command displays:
- Recent version updates
- New features and improvements
- Bug fixes and changes

## How It Works

Claude Code Helper operates in two modes to manage command permissions stored in `~/.claude.json`:

### MCP Server Mode
When configured as an MCP server in Claude Code:
1. **Protocol Communication**: Handles MCP requests from AI agents via stdio
2. **Command Processing**: Executes permission queries and configuration analysis
3. **Real-time Access**: Provides immediate access to your Claude Code configuration
4. **Safety Integration**: All MCP commands respect the same safety rules as CLI

### CLI Mode & Core Functionality
1. **Maintains a Permissions Set**: Your commonly used permissions are stored in `~/.cch/permissions.json`
2. **Smart Expansion**: Simple commands like `docker` are automatically expanded to `docker:*`
3. **Safety First**: Dangerous commands are blocked or require confirmation
4. **Auto-Apply**: New permissions are immediately applied to all projects (configurable)
5. **Preserves Project-Specific Permissions**: Existing project permissions are kept, duplicates are removed
6. **Detailed Tracking**: Shows exactly what changed in each project
7. **Formats Correctly**: Permissions are automatically wrapped in the required `Bash()` format for Claude Code

## Development

```bash
# Clone the repository
git clone https://github.com/light-merlin-dark/claude-code-helper.git
cd claude-code-helper

# Install dependencies
npm install

# Build
npm run build

# Run in development
npm run dev

# Run tests with Bun
bun test

# Run specific test suites
bun test:unit       # Unit tests only
bun test:e2e        # End-to-end tests only
bun test:watch      # Watch mode for development

# Check TypeScript types
npm run lint

# For additional development commands, see Makefile.example
```

## Testing

The project uses Bun's built-in test runner for fast, parallel test execution:
- **Unit Tests**: Test individual services in isolation
- **Integration Tests**: Test service interactions
- **End-to-End Tests**: Test CLI commands with real execution

Run `bun test` to execute all tests.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

Built with ❤️ by [@EnchantedRobot](https://twitter.com/EnchantedRobot)