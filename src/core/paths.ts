import path from 'path';
import os from 'os';

/**
 * Path management utilities for Claude Code Helper
 */

export function getBaseDir(testMode: boolean = false): string {
  return testMode ? path.join(__dirname, '../../tests/data') : os.homedir();
}

export function getConfigPath(testMode: boolean = false): string {
  return path.join(getBaseDir(testMode), '.claude.json');
}

export function getBackupsDir(testMode: boolean = false): string {
  return path.join(getBaseDir(testMode), '.cch', 'backups');
}

export function getOldBackupsDir(testMode: boolean = false): string {
  return path.join(getBaseDir(testMode), '.claude-backups');
}

export function getPermissionsPath(testMode: boolean = false): string {
  return path.join(getBaseDir(testMode), '.cch', 'permissions.json');
}

// Keep the old function name for now to avoid breaking changes
export function getBaseCommandsPath(testMode: boolean = false): string {
  return getPermissionsPath(testMode);
}

export const DEFAULT_BACKUP_NAME = 'claude-backup.json';