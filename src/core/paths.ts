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
  return path.join(getBaseDir(testMode), '.claude-backups');
}

export function getBaseCommandsPath(testMode: boolean = false): string {
  return path.join(getBaseDir(testMode), '.cch', 'base-commands.json');
}

export const DEFAULT_BACKUP_NAME = 'claude-backup.json';