# Claude Code Helper

A CLI tool for managing Claude Code's configuration, particularly the `allowedTools` permissions across projects. It provides backup/restore functionality, base command management, and automatic normalization of command formats.

## Installation

```bash
npm install -g @light-merlin-dark/claude-code-helper
# or
npm i -g @light-merlin-dark/claude-code-helper
```

## Features

- **Backup/Restore Claude Configuration**: Save and restore your Claude Code settings with named backups
- **Base Commands Management**: Define common commands that should be available across all projects
- **Automatic Deduplication**: Removes duplicate commands from project configurations
- **Command Normalization**: Automatically formats commands for consistency
- **Test Mode**: Dry-run capability to preview changes before applying them

## Usage

```bash
cch [options]
```

### Backup and Restore

Backup your current Claude configuration:
```bash
cch -bc                  # Default backup
cch -bc -n pre-update    # Named backup
```

Restore from a backup:
```bash
cch -rc                  # Restore default backup
cch -rc -n pre-update    # Restore named backup
```

### Base Commands Management

List current base commands:
```bash
cch -lc
```

Add a new base command:
```bash
cch -ac "make:*"         # Add with wildcard
cch -ac "npm run build"  # Add specific command
```

Remove a base command:
```bash
cch -dc 2               # Interactive confirmation
cch -dc 2 -f            # Force removal without confirmation
```

Apply base commands to all projects:
```bash
cch -ec                 # Ensures all projects have base commands
cch -ec --test          # Preview changes without applying
```

Normalize base commands (remove Bash() wrapper):
```bash
cch -nc
```

### Options

- `-bc, --backup-config`: Backup Claude config
- `-rc, --restore-config`: Restore Claude config
- `-n, --name <name>`: Named backup/restore
- `-ec, --ensure-commands`: Apply base commands to all projects
- `-lc, --list-commands`: List base commands
- `-ac, --add-command <cmd>`: Add a base command
- `-dc, --delete-command <n>`: Remove a base command by number
- `-nc, --normalize-commands`: Normalize base commands
- `--test`: Test mode (dry run)
- `-f, --force`: Force operations without confirmation

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

### Complete Workflow

```bash
# 1. Backup current config
cch -bc -n before-changes

# 2. Add custom commands
cch -ac "docker:*"
cch -ac "yarn:*"

# 3. List commands to verify
cch -lc

# 4. Apply to all projects
cch -ec

# 5. If something goes wrong, restore
cch -rc -n before-changes
```

### Managing Project Permissions

```bash
# Check what would happen first
cch -ec --test

# Apply base commands and remove duplicates
cch -ec

# Normalize any improperly formatted commands
cch -nc
```

## How It Works

1. **Base Commands**: Define a set of commands that should be available in all your Claude Code projects
2. **Automatic Formatting**: Commands are automatically formatted as `Bash(command)` when applied to projects
3. **Deduplication**: Removes duplicate entries from project configurations
4. **Order Preservation**: Base commands appear first, followed by project-specific commands

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
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Created by

[@EnchantedRobot](https://x.com/EnchantedRobot)
