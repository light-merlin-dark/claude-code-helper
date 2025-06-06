import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { CommandSpec, CommandResult, RuntimeContext } from '../shared/core';
import { ConfigNotFoundError, BackupNotFoundError, InvalidCommandError } from '../shared/errors';
import { logger } from '../common';

interface ClaudeConfig {
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

interface TestConfig {
  projects: {
    [path: string]: {
      allowedTools: string[];
    };
  };
}

// Get the base directory based on test mode
function getBaseDir(testMode: boolean = false): string {
  return testMode ? path.join(__dirname, '../../tests/data') : os.homedir();
}

// Define paths as functions that take testMode parameter
function getConfigPath(testMode: boolean = false): string {
  return path.join(getBaseDir(testMode), '.claude.json');
}

function getBackupsDir(testMode: boolean = false): string {
  return path.join(getBaseDir(testMode), '.claude-backups');
}

function getBaseCommandsPath(testMode: boolean = false): string {
  return path.join(getBaseDir(testMode), '.cch', 'base-commands.json');
}

const DEFAULT_BACKUP_NAME = 'claude-backup.json';

const DEFAULT_BASE_COMMANDS = [
  'make:*',
  'npm run:*',
  'npm test:*',
  'git status',
  'git diff:*',
  'git log:*'
];

async function ensureBackupsDir(testMode: boolean = false): Promise<void> {
  const backupsDir = getBackupsDir(testMode);
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
}

async function ensureDataDir(testMode: boolean = false): Promise<void> {
  const commandsPath = getBaseCommandsPath(testMode);
  const dataDir = path.dirname(commandsPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

async function loadClaudeConfig(testMode: boolean = false): Promise<ClaudeConfig | TestConfig> {
  const configPath = getConfigPath(testMode);
  
  if (!fs.existsSync(configPath)) {
    throw new ConfigNotFoundError(configPath);
  }

  const content = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(content);
}

async function saveClaudeConfig(config: ClaudeConfig | TestConfig, testMode: boolean = false): Promise<void> {
  const configPath = getConfigPath(testMode);
  
  // Ensure directory exists
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

async function backupConfig(backupName?: string, testMode: boolean = false): Promise<void> {
  await ensureBackupsDir(testMode);

  const config = await loadClaudeConfig(testMode);
  const filename = backupName ? `${backupName}.json` : DEFAULT_BACKUP_NAME;
  const backupsDir = getBackupsDir(testMode);
  const backupPath = path.join(backupsDir, filename);

  fs.writeFileSync(backupPath, JSON.stringify(config, null, 2));
  logger.success(`Config backed up to ${filename}`);
}

async function restoreConfig(backupName?: string, testMode: boolean = false): Promise<void> {
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

async function loadBaseCommands(testMode: boolean = false): Promise<string[]> {
  const commandsPath = getBaseCommandsPath(testMode);
  
  if (!fs.existsSync(commandsPath)) {
    return [];
  }

  const content = fs.readFileSync(commandsPath, 'utf8');
  return JSON.parse(content);
}

async function saveBaseCommands(commands: string[], testMode: boolean = false): Promise<void> {
  await ensureDataDir(testMode);
  const commandsPath = getBaseCommandsPath(testMode);
  fs.writeFileSync(commandsPath, JSON.stringify(commands, null, 2));
}

async function normalizeCommands(silent: boolean = false, testMode: boolean = false): Promise<boolean> {
  try {
    const commands = await loadBaseCommands(testMode);
    if (commands.length === 0) {
      return false;
    }

    let modified = false;
    const normalizedCommands = commands.map(cmd => {
      if (cmd.startsWith('Bash(') && cmd.endsWith(')')) {
        const innerCmd = cmd.slice(5, -1);
        modified = true;
        return innerCmd;
      }
      return cmd;
    });

    if (modified) {
      await saveBaseCommands(normalizedCommands, testMode);
      if (!silent) {
        logger.success('Normalized base commands');
      }
    }

    return true;
  } catch (error) {
    if (!silent) {
      logger.error('Error normalizing commands: ' + error);
    }
    return false;
  }
}

async function ensureBaseCommandsExist(testMode: boolean = false): Promise<boolean> {
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

async function ensureCommands(testMode: boolean = false): Promise<void> {
  const baseCommands = await loadBaseCommands(testMode);
  if (baseCommands.length === 0) {
    logger.warning('No base commands configured');
    return;
  }

  const config = await loadClaudeConfig(testMode);

  if (!config.projects) {
    logger.warning('No projects found in Claude config');
    return;
  }

  let updatedCount = 0;
  let totalDuplicatesRemoved = 0;

  for (const [projectPath, project] of Object.entries(config.projects)) {
    if (!project.allowedTools) {
      project.allowedTools = [];
    }

    const formattedCommands = baseCommands.map(cmd => {
      if (cmd.startsWith('Bash(') && cmd.endsWith(')')) {
        return cmd;
      }
      return `Bash(${cmd})`;
    });

    const originalLength = project.allowedTools.length;
    const uniqueExistingTools = Array.from(new Set(project.allowedTools));
    const existingToolsWithoutBase = uniqueExistingTools.filter(
      tool => !formattedCommands.includes(tool)
    );
    const newTools = [...formattedCommands, ...existingToolsWithoutBase];

    if (JSON.stringify(newTools) !== JSON.stringify(project.allowedTools)) {
      const duplicatesRemoved = originalLength - uniqueExistingTools.length;
      if (duplicatesRemoved > 0) {
        logger.warning(`  Removed ${duplicatesRemoved} duplicate(s) from ${projectPath}`);
        totalDuplicatesRemoved += duplicatesRemoved;
      }

      project.allowedTools = newTools;
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    await saveClaudeConfig(config, testMode);
    logger.success(`Updated ${updatedCount} project(s) with base commands`);
    if (totalDuplicatesRemoved > 0) {
      logger.info(`Total duplicates removed: ${totalDuplicatesRemoved}`);
    }
  } else {
    logger.success('All projects already have base commands');
  }
}

async function listCommands(testMode: boolean = false): Promise<void> {
  const commands = await loadBaseCommands(testMode);

  if (commands.length === 0) {
    logger.warning('No base commands configured');
    return;
  }

  console.log(chalk.cyan('Base Commands:'));
  commands.forEach((cmd, index) => {
    console.log(`  ${chalk.gray(`${index + 1}.`)} ${cmd}`);
  });
}

async function addCommand(command: string, testMode: boolean = false): Promise<void> {
  const commands = await loadBaseCommands(testMode);

  let normalizedCommand = command;
  if (command.startsWith('Bash(') && command.endsWith(')')) {
    normalizedCommand = command.slice(5, -1);
  }

  let formattedCommand = normalizedCommand;
  if (!normalizedCommand.includes(':') && !normalizedCommand.includes(' ')) {
    formattedCommand = `${normalizedCommand}:*`;
  }

  if (commands.includes(formattedCommand)) {
    logger.warning(`Command already exists: ${formattedCommand}`);
    return;
  }

  commands.push(formattedCommand);
  await saveBaseCommands(commands, testMode);
  logger.success(`Added command: ${formattedCommand}`);
}

async function removeCommand(index: number, force: boolean = false, testMode: boolean = false): Promise<void> {
  const commands = await loadBaseCommands(testMode);

  if (index < 1 || index > commands.length) {
    throw new InvalidCommandError(
      `Invalid command number: ${index}. Use 'cch -lc' to see available commands.`
    );
  }

  const commandToRemove = commands[index - 1];

  if (!force) {
    logger.warning(`Remove command: ${commandToRemove}`);
    logger.info(chalk.gray('Use --force to confirm removal'));
    return;
  }

  commands.splice(index - 1, 1);
  await saveBaseCommands(commands, testMode);
  logger.success(`Removed command: ${commandToRemove}`);
}

const claude: CommandSpec<any> = {
  description: 'Claude configuration helper commands',
  help: `Claude Code Helper - Manage command permissions across your Claude Code projects

Usage: cch [options]

Quick Start:
  cch -lc                    # See your base commands
  cch -ac "docker:*"         # Add a command to your base set
  cch -ec                    # Apply base commands to all projects

Managing Commands:
  -lc, --list-commands       List your base commands
  -ac, --add-command         Add a command to base set
  -dc, --delete-command      Remove a command by number
  -ec, --ensure-commands     Apply base commands to all projects
  -nc, --normalize-commands  Clean up command formatting

Backup & Restore:
  -bc, --backup-config       Create a backup of Claude config
  -rc, --restore-config      Restore from a backup
  -n, --name <name>          Name your backup (use with -bc/-rc)

Options:
  --test                     Preview changes without applying
  -f, --force                Skip confirmation prompts

Configuration Locations:
  Base Commands: ~/.cch/base-commands.json
  Claude Config: ~/.claude.json (managed by Claude)
  Backups:       ~/.claude-backups/

Examples:
  cch -lc                    # Start here - see your commands
  cch -ac "pytest:*"         # Add pytest to all projects
  cch -ec --test             # Preview what will change
  cch -ec                    # Apply changes
  cch -bc -n before-update   # Create a named backup`,

  async execute(
    args: string[],
    options: Record<string, any>,
    ctx: RuntimeContext
  ): Promise<CommandResult> {
    const {
      'backup-config': backupConfig_,
      bc: bc,
      'restore-config': restoreConfig_,
      rc: rc,
      'ensure-commands': ensureCommands_,
      ec: ec,
      'list-commands': listCommands_,
      lc: lc,
      'add-command': addCommand_,
      ac: ac,
      'delete-command': deleteCommand_,
      dc: dc,
      'normalize-commands': normalizeCommands_,
      nc: nc,
      n: backupName,
      name: name,
      test: testMode,
      force: force,
      f: f
    } = options;

    try {
      await ensureBaseCommandsExist(testMode);
      // Don't auto-normalize in test mode to allow testing the normalize command
      if (!testMode) {
        await normalizeCommands(true, testMode);
      }

      const isBackup = backupConfig_ || bc;
      const isRestore = restoreConfig_ || rc;
      const isEnsure = ensureCommands_ || ec;
      const isList = listCommands_ || lc;
      const isAdd = addCommand_ || ac;
      const isDelete = deleteCommand_ || dc;
      const isNormalize = normalizeCommands_ || nc;
      const backupNameValue = backupName || name;
      const isForce = force || f;

      if (isBackup) {
        await backupConfig(backupNameValue, testMode);
      } else if (isRestore) {
        await restoreConfig(backupNameValue, testMode);
      } else if (isEnsure) {
        await ensureCommands(testMode);
      } else if (isList) {
        await listCommands(testMode);
      } else if (isAdd) {
        const command = typeof isAdd === 'string' ? isAdd : typeof ac === 'string' ? ac : '';
        if (!command) {
          throw new InvalidCommandError('Please provide a command to add');
        }
        await addCommand(command, testMode);
      } else if (isDelete) {
        const indexStr = typeof isDelete === 'string' ? isDelete : typeof dc === 'string' ? dc : '';
        const index = parseInt(indexStr, 10);
        if (isNaN(index)) {
          throw new InvalidCommandError('Please provide a valid command number');
        }
        await removeCommand(index, isForce, testMode);
      } else if (isNormalize) {
        await normalizeCommands(false, testMode);
      } else {
        console.log(this.help);
      }

      return { success: true };
    } catch (err) {
      if (err instanceof Error) {
        logger.error(err.message);
        return { success: false, message: err.message };
      }
      return { success: false, message: 'Unknown error occurred' };
    }
  }
};

export default claude;