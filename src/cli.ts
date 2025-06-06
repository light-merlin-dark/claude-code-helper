import fs from 'fs';
import { parseArgs } from './common';
import { logger } from './utils/logger';

// Permission management
import * as manage from './commands/permissions/manage';
import * as apply from './commands/permissions/apply';
import * as discover from './commands/permissions/discover';

// Config management
import * as backup from './commands/config/backup';
import * as view from './commands/config/view';
import * as changelog from './commands/config/changelog';

// Core utilities
import { ensureBaseCommandsExist } from './core/config';
import { getBaseCommandsPath } from './core/paths';

function generateHelpText(testMode: boolean = false): string {
  const baseCommandsPath = getBaseCommandsPath(testMode);
  const baseCommandsExist = fs.existsSync(baseCommandsPath);
  
  let helpText = `Claude Code Helper - Manage command permissions across your Claude Code projects

Usage: cch [options]

`;

  if (!baseCommandsExist) {
    helpText += `New user? Start by discovering your common commands:
  cch -sc                    # Discover frequently used commands

`;
  }
  
  helpText += `Quick Start:
  cch -lc                    # See your base commands
  cch -ac "docker:*"         # Add a command to your base set
  cch -ec                    # Apply base commands to all projects

Managing Commands:
  -lc, --list-commands       List your base commands
  -sc, --suggest-commands    Suggest frequently used commands
  -ac, --add-command         Add a command to base set
  -dc, --delete-command      Remove a command by number
  -ec, --ensure-commands     Apply base commands to all projects
  -nc, --normalize-commands  Clean up command formatting

Configuration:
  -c, --config               View current configuration and file paths
  --changelog                View recent changes

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
  cch -bc -n before-update   # Create a named backup

View recent changes:
  cch --changelog`;
  
  return helpText;
}

export async function handleCLI(args: string[]): Promise<void> {
  const { options } = parseArgs(args);
  
  const {
    'backup-config': backupConfig_,
    bc: bc,
    'restore-config': restoreConfig_,
    rc: rc,
    'ensure-commands': ensureCommands_,
    ec: ec,
    'list-commands': listCommands_,
    lc: lc,
    'suggest-commands': suggestCommands_,
    sc: sc,
    'add-command': addCommand_,
    ac: ac,
    'delete-command': deleteCommand_,
    dc: dc,
    'normalize-commands': normalizeCommands_,
    nc: nc,
    'config': config_,
    c: c,
    'changelog': changelog_,
    n: backupName,
    name: name,
    test: testMode,
    force: force,
    f: f
  } = options;

  try {
    // Check if we need to show help (no command specified)
    const showingHelp = !backupConfig_ && !bc && !restoreConfig_ && !rc && 
                       !ensureCommands_ && !ec && !listCommands_ && !lc && 
                       !suggestCommands_ && !sc && !addCommand_ && !ac && 
                       !deleteCommand_ && !dc && !normalizeCommands_ && !nc && 
                       !config_ && !c && !changelog_;
    
    // Only ensure base commands exist if we're not just showing help
    if (!showingHelp) {
      await ensureBaseCommandsExist(testMode);
      // Don't auto-normalize in test mode to allow testing the normalize command
      if (!testMode) {
        await manage.normalizeCommands(true, testMode);
      }
    }

    const isBackup = backupConfig_ || bc;
    const isRestore = restoreConfig_ || rc;
    const isEnsure = ensureCommands_ || ec;
    const isList = listCommands_ || lc;
    const isSuggest = suggestCommands_ || sc;
    const isAdd = addCommand_ || ac;
    const isDelete = deleteCommand_ || dc;
    const isNormalize = normalizeCommands_ || nc;
    const isConfig = config_ || c;
    const isChangelog = changelog_;
    const backupNameValue = backupName || name;
    const isForce = force || f;

    if (isBackup) {
      await backup.backupConfig(backupNameValue, testMode);
    } else if (isRestore) {
      await backup.restoreConfig(backupNameValue, testMode);
    } else if (isEnsure) {
      await apply.ensureCommands(testMode);
    } else if (isList) {
      await manage.listCommands(testMode);
    } else if (isSuggest) {
      await discover.suggestCommands(testMode);
    } else if (isAdd) {
      const command = typeof isAdd === 'string' ? isAdd : typeof ac === 'string' ? ac : '';
      if (!command) {
        throw new Error('Please provide a command to add');
      }
      await manage.addCommand(command, testMode);
    } else if (isDelete) {
      const indexStr = typeof isDelete === 'string' ? isDelete : typeof dc === 'string' ? dc : '';
      const index = parseInt(indexStr, 10);
      if (isNaN(index)) {
        throw new Error('Please provide a valid command number');
      }
      await manage.removeCommand(index, isForce, testMode);
    } else if (isNormalize) {
      await manage.normalizeCommands(false, testMode);
    } else if (isConfig) {
      await view.showConfig(testMode);
    } else if (isChangelog) {
      await changelog.showChangelog();
    } else {
      // Show help text
      console.log(generateHelpText(testMode));
    }
    
    // Ensure base commands exist after showing help (if we showed help)
    if (showingHelp) {
      await ensureBaseCommandsExist(testMode);
    }
  } catch (err) {
    if (err instanceof Error) {
      logger.error(err.message);
      process.exit(1);
    }
    logger.error('Unknown error occurred');
    process.exit(1);
  }
}