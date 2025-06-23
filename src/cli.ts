import fs from 'fs';
import path from 'path';
import { parseArgs } from './common';
import { logger } from './utils/logger';

// Permission management
import * as manage from './commands/permissions/manage';
import * as apply from './commands/permissions/apply';
import * as discover from './commands/permissions/discover';
import { checkPermissionsOnStartup } from './commands/permissions/check';
import { addPermission } from './commands/permissions/add';

// MCP tools management
import { discoverMcpTools } from './commands/mcp/discover';
import { McpReloadCommand } from './commands/mcp/reload';

// Config management
import * as backup from './commands/config/backup';
import * as view from './commands/config/view';
import * as changelog from './commands/config/changelog';
import * as cleanup from './commands/config/cleanup';

// Doctor command
import { runDoctor } from './commands/doctor';

// Core utilities
import { ensureBaseCommandsExist } from './core/config';
import { getBaseCommandsPath } from './core/paths';

function getVersion(): string {
  try {
    // In production, package.json is at the package root
    let packagePath = path.join(__dirname, '../../package.json');
    
    // If not found, try development location
    if (!fs.existsSync(packagePath)) {
      packagePath = path.join(__dirname, '../package.json');
    }
    
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    return packageJson.version;
  } catch (error) {
    return 'unknown';
  }
}

function generateHelpText(testMode: boolean = false): string {
  const baseCommandsPath = getBaseCommandsPath(testMode);
  const baseCommandsExist = fs.existsSync(baseCommandsPath);
  
  let helpText = `Claude Code Helper - Manage permissions across your Claude Code projects

Usage: cch [options]

`;

  if (!baseCommandsExist) {
    helpText += `New user? Start by discovering your common permissions:
  cch -dp                    # Discover frequently used permissions

`;
  }
  
  helpText += `Quick Start:
  cch -lp                    # See your permissions
  cch -add "docker"          # Add a permission (auto-expands to docker:*)
  cch -ap                    # Apply permissions to all projects

Managing Permissions:
  -lp, --list-permissions    List your permissions
  -dp, --discover            Discover frequently used permissions
  -add, --add-permission     Add a permission (with smart expansion)
  -rm, --remove-permission   Remove a permission by number
  -ap, --apply-permissions   Apply permissions to all projects

MCP Tools:
  -dmc, --discover-mcp       Discover frequently used MCP tools
  -rmc, --reload-mcp         Reload MCP configuration from claude CLI

Configuration:
  -c, --config               View current configuration and file paths
  --changelog                View recent changes
  --doctor                   Diagnose and fix configuration issues

Backup & Restore:
  -bc, --backup-config       Create a backup of Claude config
  -rc, --restore-config      Restore from a backup
  -n, --name <name>          Name your backup (use with -bc/-rc)

Cleanup:
  -dd, --delete-data         Delete all CCH data (with confirmation)

Options:
  --test                     Preview changes without applying
  -f, --force                Skip confirmation prompts

Configuration Locations:
  Permissions:   ~/.cch/permissions.json
  Preferences:   ~/.cch/preferences.json
  Claude Config: ~/.claude.json (managed by Claude)
  Backups:       ~/.cch/backups/

Examples:
  cch -lp                    # Start here - see your permissions
  cch -add "pytest"          # Add pytest (auto-expands to pytest:*)
  cch -ap --test             # Preview what will change
  cch -ap                    # Apply changes
  cch -bc -n before-update   # Create a named backup

View recent changes:
  cch --changelog`;
  
  return helpText;
}

export async function handleCLI(args: string[]): Promise<void> {
  const { options } = parseArgs(args);
  
  const {
    // Permission commands
    'list-permissions': listPermissions_,
    lp: lp,
    'discover-permissions': discoverPermissions_,
    'discover': discover_,
    dp: dp,
    'add-permission': addPermission_,
    'add': add_,
    add: add,
    'remove-permission': removePermission_,
    'remove': remove_,
    rm: rm,
    'apply-permissions': applyPermissions_,
    ap: ap,
    
    // MCP tools commands
    'discover-mcp': discoverMcp_,
    dmc: dmc,
    'reload-mcp': reloadMcp_,
    rmc: rmc,
    
    // Config management commands
    'backup-config': backupConfig_,
    bc: bc,
    'restore-config': restoreConfig_,
    rc: rc,
    'config': config_,
    c: c,
    'changelog': changelog_,
    'doctor': doctor_,
    'delete-data': deleteData_,
    dd: dd,
    'version': version_,
    v: v,
    
    // Options
    n: backupName,
    name: name,
    test: testMode,
    force: force,
    f: f
  } = options;

  try {
    // Handle version flag first
    if (version_ || v) {
      console.log(`Claude Code Helper v${getVersion()}`);
      return;
    }
    
    // Check if we need to show help (no command specified)
    const showingHelp = !backupConfig_ && !bc && !restoreConfig_ && !rc && 
                       !config_ && !c && !changelog_ && !doctor_ && !deleteData_ && !dd &&
                       !listPermissions_ && !lp && !discoverPermissions_ && !discover_ && !dp &&
                       !addPermission_ && !add_ && !add && !removePermission_ && !remove_ && !rm &&
                       !applyPermissions_ && !ap && !discoverMcp_ && !dmc && !reloadMcp_ && !rmc;
    
    // Only ensure base commands exist if we're not just showing help or deleting data
    const isDeletingData = deleteData_ || dd;
    if (!showingHelp && !isDeletingData) {
      await ensureBaseCommandsExist(testMode);
      // Check for dangerous permissions on startup
      if (!testMode) {
        await checkPermissionsOnStartup(testMode);
      }
    }

    const isBackup = backupConfig_ || bc;
    const isRestore = restoreConfig_ || rc;
    const isConfig = config_ || c;
    const isChangelog = changelog_;
    const isDoctor = doctor_;
    const isDeleteData = deleteData_ || dd;
    const backupNameValue = backupName || name;
    const isForce = force || f;
    
    // Permission commands
    const isListPermissions = listPermissions_ || lp;
    const isDiscoverPermissions = discoverPermissions_ || discover_ || dp;
    const isAddPermission = addPermission_ || add_ || add;
    const isRemovePermission = removePermission_ || remove_ || rm;
    const isApplyPermissions = applyPermissions_ || ap;
    
    // MCP tools commands
    const isDiscoverMcp = discoverMcp_ || dmc;
    const isReloadMcp = reloadMcp_ || rmc;

    if (isBackup) {
      await backup.backupConfig(backupNameValue, testMode);
    } else if (isRestore) {
      await backup.restoreConfig(backupNameValue, testMode);
    } else if (isListPermissions) {
      await manage.listCommands(testMode);
    } else if (isDiscoverPermissions) {
      await discover.suggestCommands(testMode);
    } else if (isAddPermission) {
      const permission = typeof isAddPermission === 'string' ? isAddPermission : 
                         typeof add_ === 'string' ? add_ : 
                         typeof add === 'string' ? add : '';
      if (!permission) {
        throw new Error('Please provide a permission to add');
      }
      await addPermission(permission, testMode);
    } else if (isRemovePermission) {
      const indexStr = typeof isRemovePermission === 'string' ? isRemovePermission : 
                       typeof remove_ === 'string' ? remove_ : 
                       typeof rm === 'string' ? rm : '';
      const index = parseInt(indexStr, 10);
      if (isNaN(index)) {
        throw new Error('Please provide a valid permission number');
      }
      await manage.removeCommand(index, isForce, testMode);
    } else if (isApplyPermissions) {
      await apply.applyPermissions(testMode, false);
    } else if (isDiscoverMcp) {
      // Parse additional options for discover MCP
      const minProjectsOption = options['min-projects'];
      const statsOption = options.stats;
      
      const discoverOptions = {
        minProjects: minProjectsOption ? parseInt(minProjectsOption, 10) : undefined,
        stats: !!statsOption
      };
      
      await discoverMcpTools(testMode, discoverOptions);
    } else if (isReloadMcp) {
      // Initialize services needed for reload command
      const { registry, ServiceNames } = await import('./registry');
      const { ConfigService } = await import('./services/config');
      const { LoggerService } = await import('./services/logger');
      const { PromptService } = await import('./services/prompt');
      
      // Create service instances
      const config = new ConfigService();
      const logger = new LoggerService(config);
      const prompt = new PromptService();
      
      // Create and execute command
      const reloadCommand = new McpReloadCommand(config, logger, prompt);
      
      // Handle reload options
      const mcpName = typeof isReloadMcp === 'string' ? isReloadMcp : undefined;
      const reloadOptions = {
        name: mcpName,
        all: !mcpName && isForce,
        dryRun: testMode
      };
      
      await reloadCommand.execute(reloadOptions);
    } else if (isConfig) {
      await view.showConfig(testMode);
    } else if (isChangelog) {
      await changelog.showChangelog();
    } else if (isDoctor) {
      await runDoctor(undefined, testMode);
    } else if (isDeleteData) {
      await cleanup.deleteData(testMode);
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