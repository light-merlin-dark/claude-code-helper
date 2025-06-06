import fs from 'fs';
import path from 'path';
import { loadClaudeConfig, saveClaudeConfig, ensureBackupsDir } from '../../core/config';
import { getBackupsDir, DEFAULT_BACKUP_NAME } from '../../core/paths';
import { logger } from '../../utils/logger';
import { BackupNotFoundError } from '../../shared/errors';

/**
 * Backup and restore Claude configuration
 */

export async function backupConfig(backupName?: string, testMode: boolean = false): Promise<void> {
  await ensureBackupsDir(testMode);

  const config = await loadClaudeConfig(testMode);
  const filename = backupName ? `${backupName}.json` : DEFAULT_BACKUP_NAME;
  const backupsDir = getBackupsDir(testMode);
  const backupPath = path.join(backupsDir, filename);

  fs.writeFileSync(backupPath, JSON.stringify(config, null, 2));
  logger.success(`Config backed up to ${filename}`);
}

export async function restoreConfig(backupName?: string, testMode: boolean = false): Promise<void> {
  const filename = backupName ? `${backupName}.json` : DEFAULT_BACKUP_NAME;
  const backupsDir = getBackupsDir(testMode);
  const backupPath = path.join(backupsDir, filename);

  if (!fs.existsSync(backupPath)) {
    throw new BackupNotFoundError(filename);
  }

  const backupContent = fs.readFileSync(backupPath, 'utf8');
  const backupConfig = JSON.parse(backupContent);

  await saveClaudeConfig(backupConfig, testMode);
  logger.success(`Config restored from ${filename}`);
}