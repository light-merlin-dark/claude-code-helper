# Claude Code Helper

A companion tool for Claude Code that helps developers manage command permissions across their projects.

## What it does

Claude Code requires explicit permission to run terminal commands in your projects. This tool allows developers to:
- Define a base set of allowed commands that should be available across all projects
- Apply these command permissions to multiple projects at once
- Backup and restore your Claude Code configuration
- Keep your command permissions organized and consistent

## Installation

```bash
npm install -g @light-merlin-dark/claude-code-helper
# or
npm i -g @light-merlin-dark/claude-code-helper
```

## Features

- **Command Permissions Management**: Define and apply command permissions across all your Claude Code projects
- **Smart Suggestions**: Discovers commands you use frequently and suggests adding them to your base set
- **Backup/Restore**: Save snapshots of your Claude configuration before making changes
- **Bulk Updates**: Apply your base command set to all projects at once
- **Smart Deduplication**: Automatically removes duplicate commands from project configurations
- **Test Mode**: Preview changes before applying them

## Usage

```bash
cch [options]
```

### Managing Command Permissions

List your current base commands:
```bash
cch --list-commands
```

Discover frequently used commands:
```bash
cch --suggest-commands      # Analyzes your projects and suggests common commands
```

Add a new command to your base set:
```bash
cch --add-command "make:*"         # Add with wildcard for all make commands
cch --add-command "npm run build"  # Add specific command
```

Remove a command from your base set:
```bash
cch --delete-command 2             # Remove command #2 (with confirmation)
cch --delete-command 2 --force     # Remove without confirmation
```

Apply your base commands to all projects:
```bash
cch --ensure-commands              # Apply to all projects
cch --ensure-commands --test       # Preview what would change
```

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

Normalize command formatting:
```bash
cch --normalize-commands           # Clean up command formatting
```

### Command Aliases

For convenience, all commands have short aliases:

| Long Form | Short Alias | Description |
|-----------|-------------|-------------|
| `--list-commands` | `-lc` | List base commands |
| `--suggest-commands` | `-sc` | Suggest frequently used commands |
| `--add-command` | `-ac` | Add a command |
| `--delete-command` | `-dc` | Delete a command |
| `--ensure-commands` | `-ec` | Apply to all projects |
| `--backup-config` | `-bc` | Create backup |
| `--restore-config` | `-rc` | Restore backup |
| `--normalize-commands` | `-nc` | Normalize formatting |
| `--config` | `-c` | View configuration |
| `--changelog` | - | View version history |
| `--name` | `-n` | Specify backup name |
| `--force` | `-f` | Skip confirmations |

## File Locations

- **Claude Config**: `~/.claude.json`
- **Backups**: `~/.claude-backups/`
- **Base Commands**: `~/.cch/base-commands.json`

## Default Base Commands

If no base commands file exists, the following defaults are created:
- `make:*`
- `npm run:*`
- `npm test:*`
- `git status`
- `git diff:*`
- `git log:*`

## Examples

### Setting Up Command Permissions for All Projects

```bash
# 1. First, backup your current configuration
cch --backup-config --name before-setup

# 2. Check your current base commands
cch --list-commands

# 3. Add commands you want available in all projects
cch --add-command "docker:*"
cch --add-command "yarn:*"
cch --add-command "pytest:*"

# 4. Preview what will change
cch --ensure-commands --test

# 5. Apply the commands to all projects
cch --ensure-commands

# 6. If needed, restore your original config
cch --restore-config --name before-setup
```

### Quick Permission Updates

```bash
# See what commands are in your base set
cch --list-commands

# Add a new tool you're using across projects
cch --add-command "cargo:*"

# Apply immediately to all projects
cch --ensure-commands
```

### Discovering Common Commands

```bash
# Let the tool analyze your projects
cch --suggest-commands

# It will show commands used in multiple projects:
# 1. docker:*         (used in 8 projects)
# 2. yarn:*           (used in 6 projects)
# 3. pytest:*         (used in 3 projects)

# Select which ones to add to your base set
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

Claude Code stores command permissions in `~/.claude.json` for each project. This tool:

1. **Maintains a Base Command Set**: Your commonly used commands are stored in `~/.cch/base-commands.json`
2. **Syncs Permissions**: When you run `--ensure-commands`, it adds your base commands to all projects
3. **Preserves Project-Specific Commands**: Existing project commands are kept, duplicates are removed
4. **Formats Correctly**: Commands are automatically wrapped in the required `Bash()` format for Claude Code

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

# Run tests
npm test

# For additional development commands, see Makefile.example
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Created by

[@EnchantedRobot](https://x.com/EnchantedRobot)
