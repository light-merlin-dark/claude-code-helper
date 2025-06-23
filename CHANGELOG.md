# Changelog

All notable changes to this project will be documented in this file.

## [2.3.0] - 2025-06-23

### 🚀 Major Architecture Refactor - Separate MCP Binary

This release follows the successful AIA blueprint approach by introducing a dedicated MCP server binary and simplified installation process, making CCH more reliable and easier to use.

### Added
- **Dedicated MCP Binary**: New `cch-mcp` binary specifically for MCP server operations
- **Automated Installation**: New `cch --install` command that automatically configures Claude Code
- **Uninstall Command**: Added `cch --uninstall` for easy removal

### Changed
- **Architecture**: Separated CLI and MCP server into distinct binaries (following AIA pattern)
- **Installation Process**: Simplified from manual JSON configuration to single command
- **MCP Registration**: Now uses `cch-mcp` instead of `cch --mcp`

### Fixed
- **Tool Discovery**: Claude Code now properly detects all CCH tools on startup
- **Binary Execution**: Eliminated the confusing `--mcp` flag requirement
- **Installation UX**: Clear, friendly output with next steps and available tools

### Developer Experience
- Installation is now just two commands: `npm install` and `cch --install`
- No more manual Claude MCP configuration required
- Automatic handling of existing installations during setup
- Clear success/error messages with actionable next steps

## [2.2.3] - 2025-06-23

### 🔧 MCP Tool Naming Fix

This release fixes the MCP tool naming convention to align with Claude Code's requirements, ensuring all CCH tools are properly recognized and available in the chat interface.

### Fixed
- **MCP Tool Naming**: All MCP tools now use the proper `mcp__cch__` prefix format
  - `mcp__cch__reload-mcp`: Reload MCP configuration  
  - `mcp__cch__doctor`: Run diagnostics
  - `mcp__cch__view-logs`: View logs with filtering
  - `mcp__cch__discover-mcp-tools`: Discover frequently used MCP tools
  - `mcp__cch__list-mcps`: List all MCPs across projects
  - `mcp__cch__get-mcp-stats`: Get usage statistics
- **Tool Discovery**: Tools are now properly exposed to Claude Code's MCP interface
- **Consistency**: Aligned with Claude Code's MCP tool naming conventions

### Technical Details
- Updated MCP server to register all tools with `mcp__cch__` prefix
- Updated tool request handlers to match the new naming scheme
- No changes to underlying functionality - purely a naming convention fix

## [2.2.2] - 2025-06-23

### 🔧 MCP Server CLI Integration

This release fundamentally changes how MCP tools work by routing all operations through the CLI, ensuring consistent access to user configuration files and fixing the integration issues with Claude Code's chat interface.

### Fixed
- **MCP Tools in Chat Interface**: All MCP tools now work correctly when invoked through Claude Code's chat interface
  - `mcp__cch__list-mcps`: Lists all MCPs across projects
  - `mcp__cch__discover-mcp-tools`: Discovers frequently used tools
  - `mcp__cch__get-mcp-stats`: Provides usage statistics
- **Configuration Access**: MCP server now reliably accesses `~/.claude.json` by using CLI commands internally
- **Standardized Approach**: All MCP tools now use the same CLI-based execution pattern for consistency

### Changed
- **MCP Server Architecture**: Complete rewrite to use CLI commands instead of direct service calls
- **CLI Enhancements**: Added support for `--min-projects` and `--stats` flags in discover command
- **Service Initialization**: Improved service registration in discover command for proper dependency injection

### Technical Details
- MCP server handlers now execute CLI commands via `execSync` with proper environment setup
- CLI output parsing handles ANSI color codes and various output formats
- Consistent error handling across all MCP tool invocations
- All tools tested and verified to work in production environment

## [2.2.1] - 2025-06-22

### 🚀 Performance Fix for MCP Discovery

This release fixes a critical performance issue where MCP discovery tools would fail to find MCPs due to inefficient service instantiation. Now all MCP discovery tools work reliably with significant performance improvements.

### Fixed
- **Singleton Pattern for GlobalConfigReaderService**: Implemented proper singleton pattern to ensure all MCP handlers share the same cached service instance
- **Service Registration**: Added GlobalConfigReaderService to the service registry for proper dependency injection
- **MCP Tool Performance**: All MCP discovery tools (list-mcps, discover-mcp-tools, get-mcp-stats) now work correctly
  - Cache hit performance improved by 2500x (20ms → 0.01ms)
  - Consistent results across all MCP tool calls

### Enhanced
- **Debug Logging**: Added comprehensive debug logging to GlobalConfigReaderService for better troubleshooting
- **Test Coverage**: Added production tests that verify MCP tools work with real config structures
- **Error Handling**: Improved error messages with context about config path and parse failures

### Technical Details
- GlobalConfigReaderService is now registered as a singleton in bootstrap.ts
- McpManagerService accepts optional GlobalConfigReaderService parameter for dependency injection
- MCP server handlers retrieve the service from registry ensuring consistent caching
- Tests updated to match real Claude config structure (direct `allowedTools` property)

## [2.2.0] - 2025-06-21

### 🌍 Global Config Support

This release adds support for reading MCPs and tools from the global Claude config file (`~/.claude.json`), enabling CCH to provide insights across ALL your Claude Code projects, not just individual project directories.

### Added
- **Global Config Reader Service**: Efficiently reads and parses the global `~/.claude.json` file using `jq` for performance
- **Enhanced MCP Discovery**: All MCP tools now read from global config by default, with fallback to project scanning
- **Format Support**: Handles both standard (`mcp__name__tool`) and Bash-wrapped (`Bash(mcp__name__tool:*)`) MCP formats
- **Production Tests**: Comprehensive test suite for read-only operations against real Claude configs

### Enhanced
- **Doctor Tool**: Now displays global config statistics including total projects, projects with MCPs, and config size
- **MCP Manager**: Updated to use global config reader for all MCP discovery operations
- **Performance**: Optimized for large config files (tested with 1.4MB configs, 44+ projects)
  - Initial load: ~15ms
  - Cached access: <1ms
  - Smart caching with 1-minute TTL

### Technical Details
- Leverages `jq` for efficient JSON parsing of large config files
- Implements proper error handling with fallback to project scanning
- Supports both direct MCP format and Bash command wrapper format
- Production-tested against real Claude installations

## [2.1.1] - 2025-06-20

### ✨ Enhanced MCP Discovery Tools

This release adds comprehensive MCP discovery capabilities directly accessible through the MCP interface, enabling AI agents to analyze and report on MCP usage across all projects.

### Added
- **`discover-mcp-tools`** MCP command: Analyze MCP tools used across projects with detailed frequency and project information
- **`list-mcps`** MCP command: List all MCPs found across projects with usage statistics and project associations  
- **`get-mcp-stats`** MCP command: Comprehensive statistics about MCP usage across all projects with top MCPs and tools

### Enhanced
- **MCP Server Interface**: Now exposes 6 total MCP commands for complete project analysis
- **Structured Output**: Beautiful markdown formatting with emojis and organized information display
- **Project Analysis**: Deep scanning of all Claude Code projects to identify MCP tool usage patterns

### Technical Details
- Leverages existing MCP Manager Service for robust project scanning
- Provides structured data for AI agents to make informed recommendations
- Handles edge cases gracefully when no MCPs are found
- Performance optimized for large project collections

## [2.1.0] - 2025-06-20

### 🧪 Comprehensive MCP Testing Infrastructure

This release establishes enterprise-grade testing for all MCP tools, ensuring fast, reliable test execution and 100% confidence that releases reflect test success.

### Added
- **Comprehensive MCP Tool Testing**:
  - Complete test coverage for `reload-mcp`, `doctor`, and `view-logs` tools
  - All scenarios tested through MCP interface (not direct function calls)
  - Performance benchmarks and response time validation
  - Error scenario testing (network timeouts, corrupted configs, edge cases)
  
- **Enhanced Test Infrastructure**:
  - Robust MCP test client with proper JSON-RPC handling
  - Isolated test environments with realistic data
  - Integration testing for multi-tool workflows (doctor → view-logs)
  - Concurrent operation testing and state persistence validation
  
- **Performance & Reliability Testing**:
  - Response time benchmarks for each tool (<5s doctor, <3s view-logs, <10s reload-mcp)
  - Large data handling tests (10k+ log entries)
  - Memory usage monitoring and leak detection
  - Concurrent request handling validation
  
- **Real-World Scenario Testing**:
  - New user onboarding workflow simulation
  - Troubleshooting scenario automation
  - Configuration corruption recovery testing
  - Unicode and special character handling

### Enhanced
- **MCP Test Client**: Improved error handling to distinguish between log messages and actual errors
- **Test Execution**: Fast parallel execution with isolated environments
- **Error Coverage**: Comprehensive testing of malformed inputs, missing dependencies, and file system errors

### Technical Details
- Implemented Phase 2 of the MCP testing plan with full coverage
- All tests validate through MCP protocol ensuring real-world accuracy  
- Performance thresholds established and enforced
- Test suite provides fast feedback (<30 seconds for full suite)

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