import fs from 'fs';
import path from 'path';
import { getConfigPath, getBackupsDir, getPermissionsPath, getOldBackupsDir } from './paths';
import { DEFAULT_BASE_COMMANDS } from './defaults';
import { ConfigNotFoundError } from '../shared/errors';
import { logger } from '../utils/logger';

export interface ClaudeConfig {
  numStartups?: number;
  autoUpdaterStatus?: string;
  userID?: string;
  hasCompletedOnboarding?: boolean;
  projects?: {
    [path: string]: {
      allowedTools: string[];
      [key: string]: any;
    };
  };
}

export interface TestConfig {
  projects: {
    [path: string]: {
      allowedTools: string[];
    };
  };
}

export async function loadClaudeConfig(testMode: boolean = false): Promise<ClaudeConfig | TestConfig> {
  const configPath = getConfigPath(testMode);
  
  if (!fs.existsSync(configPath)) {
    throw new ConfigNotFoundError(configPath);
  }

  const content = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(content);
}

export async function saveClaudeConfig(config: ClaudeConfig | TestConfig, testMode: boolean = false): Promise<void> {
  const configPath = getConfigPath(testMode);
  
  // Ensure directory exists
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export async function loadBaseCommands(testMode: boolean = false): Promise<string[]> {
  const permissionsPath = getPermissionsPath(testMode);
  
  if (!fs.existsSync(permissionsPath)) {
    return [];
  }

  const content = fs.readFileSync(permissionsPath, 'utf8');
  return JSON.parse(content);
}

export async function saveBaseCommands(commands: string[], testMode: boolean = false): Promise<void> {
  await ensureDataDir(testMode);
  const permissionsPath = getPermissionsPath(testMode);
  fs.writeFileSync(permissionsPath, JSON.stringify(commands, null, 2));
}

export async function ensureBackupsDir(testMode: boolean = false): Promise<void> {
  const backupsDir = getBackupsDir(testMode);
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  
  // Migrate old backups if they exist
  await migrateOldBackups(testMode);
}

export async function migrateOldBackups(testMode: boolean = false): Promise<void> {
  const oldBackupsDir = getOldBackupsDir(testMode);
  const newBackupsDir = getBackupsDir(testMode);
  
  // Check if old backups directory exists
  if (!fs.existsSync(oldBackupsDir)) {
    return;
  }
  
  try {
    // Get all files from old directory
    const files = fs.readdirSync(oldBackupsDir);
    if (files.length === 0) {
      // Remove empty old directory
      fs.rmdirSync(oldBackupsDir);
      return;
    }
    
    // Ensure new directory exists
    if (!fs.existsSync(newBackupsDir)) {
      fs.mkdirSync(newBackupsDir, { recursive: true });
    }
    
    // Move each file
    let movedCount = 0;
    for (const file of files) {
      const oldPath = path.join(oldBackupsDir, file);
      const newPath = path.join(newBackupsDir, file);
      
      // Only move if it's a file and doesn't already exist in new location
      if (fs.statSync(oldPath).isFile() && !fs.existsSync(newPath)) {
        fs.renameSync(oldPath, newPath);
        movedCount++;
      }
    }
    
    // Remove old directory if empty
    const remainingFiles = fs.readdirSync(oldBackupsDir);
    if (remainingFiles.length === 0) {
      fs.rmdirSync(oldBackupsDir);
    }
    
    if (movedCount > 0 && !testMode) {
      logger.info(`Migrated ${movedCount} backup file(s) to new location`);
    }
  } catch (error) {
    // Don't fail if migration fails, just log in debug mode
    if (!testMode) {
      logger.debug('Could not migrate old backups: ' + error);
    }
  }
}

export async function ensureDataDir(testMode: boolean = false): Promise<void> {
  const permissionsPath = getPermissionsPath(testMode);
  const dataDir = path.dirname(permissionsPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

export async function ensureBaseCommandsExist(testMode: boolean = false): Promise<boolean> {
  const permissionsPath = getPermissionsPath(testMode);
  const backupsDir = getBackupsDir(testMode);
  const firstRunBackupPath = path.join(backupsDir, 'first-run-backup.json');
  
  if (!fs.existsSync(permissionsPath)) {
    // First time running - create an automatic backup
    try {
      const configPath = getConfigPath(testMode);
      if (fs.existsSync(configPath)) {
        await ensureBackupsDir(testMode);
        const config = await loadClaudeConfig(testMode);
        fs.writeFileSync(firstRunBackupPath, JSON.stringify(config, null, 2));
        if (!testMode) {
          logger.success(`Created automatic backup of Claude config`);
          logger.info(`  Backup saved to: ${firstRunBackupPath}`);
        }
      }
    } catch (error) {
      // Don't fail if backup creation fails
      if (!testMode) {
        logger.debug('Could not create first-run backup: ' + error);
      }
    }
    
    await saveBaseCommands(DEFAULT_BASE_COMMANDS, testMode);
    if (!testMode) {
      logger.success('Created permissions file with defaults');
      logger.info(`  Permissions saved to: ${permissionsPath}`);
    }
    return true;
  }
  return true;
}