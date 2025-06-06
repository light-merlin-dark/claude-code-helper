import fs from 'fs';
import path from 'path';
import { getConfigPath, getBackupsDir, getBaseCommandsPath } from './paths';
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
  const commandsPath = getBaseCommandsPath(testMode);
  
  if (!fs.existsSync(commandsPath)) {
    return [];
  }

  const content = fs.readFileSync(commandsPath, 'utf8');
  return JSON.parse(content);
}

export async function saveBaseCommands(commands: string[], testMode: boolean = false): Promise<void> {
  await ensureDataDir(testMode);
  const commandsPath = getBaseCommandsPath(testMode);
  fs.writeFileSync(commandsPath, JSON.stringify(commands, null, 2));
}

export async function ensureBackupsDir(testMode: boolean = false): Promise<void> {
  const backupsDir = getBackupsDir(testMode);
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
}

export async function ensureDataDir(testMode: boolean = false): Promise<void> {
  const commandsPath = getBaseCommandsPath(testMode);
  const dataDir = path.dirname(commandsPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

export async function ensureBaseCommandsExist(testMode: boolean = false): Promise<boolean> {
  const commandsPath = getBaseCommandsPath(testMode);
  const backupsDir = getBackupsDir(testMode);
  const firstRunBackupPath = path.join(backupsDir, 'first-run-backup.json');
  
  if (!fs.existsSync(commandsPath)) {
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
      logger.success('Created base commands file with defaults');
      logger.info(`  Commands saved to: ${commandsPath}`);
    }
    return true;
  }
  return true;
}