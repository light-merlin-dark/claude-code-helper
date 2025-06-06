# Changelog

All notable changes to this project will be documented in this file.

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