/**
 * Backup service for automatic compressed backups
 */

import fs from 'fs';
import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { loadClaudeConfig, ClaudeConfig } from '../core/config';
import { getBackupsDir } from '../core/paths';
import { logger } from '../utils/logger';

export interface BackupInfo {
  filename: string;
  path: string;
  size: number;
  created: Date;
  prefix: string;
}

/**
 * Create a compressed backup with given prefix
 */
export async function createBackup(prefix: string, testMode: boolean = false): Promise<string> {
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const backupDir = getBackupsDir(testMode);
  const backupPath = `${backupDir}/${prefix}-${timestamp}.json.gz`;
  
  // Ensure backup directory exists
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  // Read config and compress
  const config = await loadClaudeConfig(testMode) as ClaudeConfig;
  const configStr = JSON.stringify(config, null, 2);
  
  // Create gzip stream and write compressed data
  const gzip = createGzip({ level: 9 });
  const destination = fs.createWriteStream(backupPath);
  
  // Create a promise to handle the compression
  await new Promise<void>((resolve, reject) => {
    destination.on('finish', resolve);
    destination.on('error', reject);
    gzip.on('error', reject);
    
    // Pipe gzip output to file
    gzip.pipe(destination);
    
    // Write config to gzip and end the stream
    gzip.write(configStr);
    gzip.end();
  });
  
  logger.info(`Backup created: ${backupPath}`);
  return backupPath;
}

/**
 * List all backups
 */
export async function listBackups(testMode: boolean = false): Promise<BackupInfo[]> {
  const backupDir = getBackupsDir(testMode);
  
  if (!fs.existsSync(backupDir)) {
    return [];
  }
  
  const files = fs.readdirSync(backupDir);
  const backups: BackupInfo[] = [];
  
  for (const file of files) {
    if (file.endsWith('.json.gz')) {
      const path = `${backupDir}/${file}`;
      const stats = fs.statSync(path);
      
      // Parse filename to extract prefix and timestamp
      const match = file.match(/^(.+?)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.json\.gz$/);
      if (match) {
        backups.push({
          filename: file,
          path,
          size: stats.size,
          created: new Date(match[2].replace(/-/g, ':')),
          prefix: match[1]
        });
      }
    }
  }
  
  // Sort by creation date, newest first
  return backups.sort((a, b) => b.created.getTime() - a.created.getTime());
}

/**
 * Clean up old backups (keep last 30 days or last 10 backups)
 */
export async function cleanupOldBackups(testMode: boolean = false): Promise<number> {
  const backups = await listBackups(testMode);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  let removed = 0;
  
  // Keep at least 10 backups
  if (backups.length <= 10) {
    return 0;
  }
  
  // Remove backups older than 30 days
  for (let i = 10; i < backups.length; i++) {
    const backup = backups[i];
    if (backup.created < thirtyDaysAgo) {
      fs.unlinkSync(backup.path);
      removed++;
      logger.info(`Removed old backup: ${backup.filename}`);
    }
  }
  
  return removed;
}

/**
 * Get backup size in human-readable format
 */
export function formatBackupSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}