# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2025-06-18

### 🚀 Major Update - MCP Server Architecture & Clean Code Transformation

This release completely transforms Claude Code Helper into an MCP-enabled tool with a clean architecture pattern, making it ready for AI agent integration while maintaining all existing CLI functionality.

### Added
- **MCP (Model Context Protocol) Support**:
  - Can now act as an MCP server for AI agents
  - Designed granular commands for AI integration (mcp-list, mcp-stats, mcp-add, etc.)
  - Full MCP tool discovery and management capabilities
  - Structured data output for all commands to support AI consumption
  
- **Service-Based Architecture**:
  - Service Registry for lightweight dependency injection
  - Structured logging with context and audit trails
  - State management service with persistence
  - Safety service with multi-layered validation
  - Project scanner for efficient project discovery
  - MCP manager for tool orchestration
  
- **Enhanced MCP Tool Discovery**:
  - `--discover-mcp` / `-dmc` command to find frequently used MCP tools
  - Automatic detection of `mcp__` prefixed tools across projects
  - Higher threshold (3+ projects) for MCP tool suggestions

- **Testing Infrastructure**:
  - Migrated to Bun's built-in test runner for fast execution
  - Comprehensive unit tests for all services
  - Integration tests for service interactions
  - End-to-end tests for CLI commands
  - 78 tests passing with parallel execution

### Changed
- **Complete Architecture Overhaul**:
  - Migrated from monolithic structure to service-based architecture
  - All services now use dependency injection pattern
  - Commands prepared for dual-mode operation (CLI and MCP)
  - Enhanced error handling with structured error types
  
- **Improved Code Organization**:
  - New directory structure: `services/`, `shared/`, `mcp/`
  - Clear separation of concerns
  - Type-safe service interactions

### Enhanced
- **Better Extensibility**: Easy to add new services and commands
- **Improved Testability**: All services can be easily mocked
- **Performance**: Services are lazy-loaded on demand
- **Type Safety**: Full TypeScript support with strict typing

### Technical Details
- Implemented all core services from the blueprint
- Created foundation for MCP server mode (ready for next phase)
- Maintained 100% backward compatibility with existing CLI
- Prepared codebase for binary compilation with Bun

## [1.2.0] - 2025-01-06

### Added
- **Doctor Command** (`--doctor`): Diagnose and fix configuration issues
  - Detects inconsistent tool wrapping (some with `Bash()`, some without)
  - Finds and removes duplicate tool entries
  - Identifies dangerous commands with all-or-nothing removal
  - Runs all checks concurrently for optimal performance
  - Creates automatic backups before making changes

### Fixed
- **Short Flags**: Fixed issue where short flags like `-lp`, `-dp`, `-ap`, and `-add` weren't working in production
- **Dangerous Command Detection**: Fixed case sensitivity issue preventing proper detection of commands like `chmod -R 777`

### Improved
- Added comprehensive test coverage for doctor command functionality
- Enhanced parseArgs to properly handle multi-character short flags

## [1.1.0] - 2025-01-06

### 🚀 Major Update - Permissions System Overhaul

This release transforms the command management system into a comprehensive permissions system with built-in safety features and improved developer experience.

### Added
- **Smart Command Expansion**: Automatically expands simple commands (e.g., `make` → `make:*`)
- **Dangerous Command Guards**: 
  - Completely blocks destructive commands like `rm -rf /`
  - Warns about potentially dangerous commands with confirmation prompts
- **Detailed Change Tracking**: Shows exactly what permissions were added/removed per project
- **Auto-Apply Feature**: New permissions are immediately applied to all projects (configurable)
- **User Preferences System** (`~/.cch/preferences.json`):
  - Configure auto-apply behavior
  - Control change summary display
  - Manage warning suppression
- **Startup Safety Check**: Automatically checks for dangerous permissions on startup

### Changed
- **Complete Terminology Update**: "Commands" → "Permissions" throughout
- **New Command Structure**:
  - `-lp/--list-permissions` (replaces `-lc`)
  - `-add/--add-permission` (replaces `-ac`)
  - `-rm/--remove-permission` (replaces `-dc`)
  - `-ap/--apply-permissions` (replaces `-ec`)
  - `-dp/--discover` (replaces `-sc`)
- **File Rename**: `base-commands.json` → `permissions.json`
- **Improved Feedback**: Clear, colorful output showing permission changes

### Enhanced
- **Better Safety**: Multiple layers of protection against dangerous commands
- **Improved UX**: Smart defaults, helpful prompts, and detailed feedback
- **Code Organization**: Modular structure with dedicated safety and utility modules

### Removed
- Legacy command aliases (no backwards compatibility needed for pre-release)
- Duplicate code from old monolithic structure

## [1.0.6] - 2025-01-06

### Added
- `-v` / `--version` command to display the current version

### Fixed
- CHANGELOG.md not found error in production
- Include CHANGELOG.md in npm package distribution

## [1.0.5] - 2025-01-06

### Added
- New `--delete-data` / `-dd` command to completely remove all CCH data
- Automatic migration of backups from old location (`~/.claude-backups/`) to new location (`~/.cch/backups/`)

### Changed
- Moved backup files to `~/.cch/backups/` for cleaner organization
- All CCH data now lives under a single directory (`~/.cch/`)

### Enhanced
- Better file organization - everything in one place
- Easier cleanup process for complete uninstall

## [1.0.4] - 2025-01-06

### Added
- New `-c/--config` command to view current configuration with file paths
- Shows backup files with clickable paths for easy access
- `--changelog` command to view version history
- Integrated changelog into help text
- Auto-apply prompt after selecting commands in `--suggest-commands`
- Dynamic help text that shows onboarding message for new users

### Enhanced
- Improved command-line interface with configuration visibility
- Better flow from command discovery to application

### Refactored
- Complete code restructure focused on permission management
- Organized code into logical modules: permissions/, config/, core/, utils/
- Removed unnecessary routing layer
- Improved maintainability and testability

## [1.0.3] - 2025-06-06

### Added
- `--suggest-commands` feature to discover frequently used commands
- Interactive command selection with better UX
- Auto-apply option after adding commands

### Enhanced
- Better onboarding flow for new users
- Smart command discovery across projects

## [1.0.2] - 2025-06-05

### Added
- Auto-backup on first run
- Improved help text organization with file paths

### Enhanced
- Better command organization
- Clearer file location information

## [1.0.1] - 2025-06-05

### Fixed
- Improved README clarity on command permissions

### Enhanced
- Documentation improvements

## [1.0.0] - 2025-06-05

### Initial Release
- Base command management for Claude Code
- Backup and restore functionality
- Command normalization
- Bulk project updates
- Smart deduplication of commands