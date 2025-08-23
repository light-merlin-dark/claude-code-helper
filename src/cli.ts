import fs from 'fs';
import path from 'path';
import { parseArgs } from './common';
import { logger } from './utils/logger';
import { handleCLIError, ValidationError } from './utils/errors';

// Permission management
import * as manage from './commands/permissions/manage';
import * as apply from './commands/permissions/apply';
import * as discover from './commands/permissions/discover';
import { checkPermissionsOnStartup } from './commands/permissions/check';
import { addPermission } from './commands/permissions/add';

// MCP tools management
import { discoverMcpTools } from './commands/mcp/discover';
import { McpReloadCommand } from './commands/mcp/reload';
import { installToClaudeCode, uninstallFromClaudeCode } from './commands/mcp/install';

// Config management
import * as backup from './commands/config/backup';
import * as view from './commands/config/view';
import * as changelog from './commands/config/changelog';
import * as cleanup from './commands/config/cleanup';

// Doctor command
import { runDoctor } from './commands/doctor';

// Audit and clean commands
import { audit } from './commands/audit';
import { cleanHistory as cleanHistoryOld, cleanDangerous } from './commands/clean';
import { cleanConfig } from './commands/config-clean';
import { cleanGeneral, cleanProjects, cleanHistory } from './commands/clean-unified';

// Bulk operation commands
import { bulkAddPermission, bulkRemovePermission, bulkAddTool, bulkRemoveTool } from './commands/bulk';

// Core utilities
import { ensureBaseCommandsExist } from './core/config';
import { getBaseCommandsPath } from './core/paths';

// Secret warning service
import { secretWarningService } from './services/secret-warning';

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

function generateCleanHelp(): string {
  return `Claude Code Helper - Clean Command

OVERVIEW:
  The clean command helps maintain a lean and efficient Claude config.
  All clean commands default to dry-run mode for safety.

USAGE:
  cch clean [subcommand] [options]

COMMANDS:
  cch clean                  General cleanup (large pastes, dangerous permissions)
  cch clean projects         Remove empty or accidental projects
  cch clean history          Clear ALL conversation history (use with caution!)
  cch clean help             Show this help message

OPTIONS:
  --execute, -e              Actually perform the cleanup (default is dry-run)
  --force                    Skip confirmation prompts
  --aggressive               More aggressive cleanup thresholds

EXAMPLES:
  # Preview what would be cleaned (safe, no changes made)
  cch clean                  
  
  # Execute general cleanup after reviewing dry-run
  cch clean --execute        
  
  # Remove empty projects
  cch clean projects         # Preview first
  cch clean projects -e      # Then execute
  
  # Clear all history (destructive!)
  cch clean history          # Preview what would be cleared
  cch clean history -e       # Execute after careful consideration

SAFETY:
  • All commands show a preview by default (dry-run)
  • Backups are automatically created before any changes
  • Use --execute or -e to actually perform cleanup
  
SMART RECOMMENDATIONS:
  The general 'cch clean' command will analyze your config and suggest:
  • 'cch clean projects' if empty projects are found
  • 'cch clean history' if config is very large (>5MB or 500+ entries)
`;
}

function generateHelpText(testMode: boolean = false): string {
  const baseCommandsPath = getBaseCommandsPath(testMode);
  const baseCommandsExist = fs.existsSync(baseCommandsPath);
  
  let helpText = `Claude Code Helper v${getVersion()} - AI-friendly CLI for Claude Code project management

QUICK START (for AI agents):
  cch -lp                    List current permissions
  cch --audit                Analyze config (security, bloat, performance)
  cch clean                  Smart config cleanup (dry-run by default)
  cch -add "docker"          Add permission (auto-expands to docker:*)
  cch -ap                    Apply permissions to all projects

AI AGENT EXAMPLES:
  # Check config health and size (includes secret detection)
  cch --audit --stats        # Quick stats: size, projects, issues, secrets
  
  # Secret detection and security
  cch --audit --show-secrets # Detailed report of detected secrets
  cch --mask-secrets-now     # EMERGENCY: Immediate secret masking (force)
  cch --clean-config --mask-secrets  # Auto-mask secrets with backup
  
  # Clean bloated config (dry-run by default, safe!)
  cch clean                  # Smart general cleanup preview
  cch clean -e               # Execute after reviewing
  cch clean projects         # Remove empty projects
  cch clean history          # Clear all history (careful!)
  
  # Backup before major changes
  cch -bc -n "pre-cleanup"   # Named backup before cleanup
  
  # Fix specific issues
  cch --clean-history --dry-run    # Preview large paste removal
  cch --clean-dangerous            # Remove risky permissions
  
  # Bulk operations across projects
  cch --add-perm "npm:*" --projects "work/*"    # Pattern matching
  cch --remove-perm --dangerous --all           # Remove all dangerous

`;

  if (!baseCommandsExist) {
    helpText += `🚀 NEW USER? START HERE:
  cch -dp                    Discover your common permissions
  cch --audit                Check config health and size

`;
  }
  
  helpText += `📋 CORE COMMANDS:
Setup:
  install                    Install CCH as MCP server in Claude Code
  uninstall                  Remove CCH MCP server from Claude Code

Permissions:
  -lp, --list-permissions    List your permissions
  -dp, --discover            Discover frequently used permissions  
  -add, --add-permission     Add permission (smart expansion: "docker" -> "docker:*")
  -rm, --remove-permission   Remove permission by number
  -ap, --apply-permissions   Apply permissions to all projects

Config Analysis & Cleanup:
  --audit                    Full analysis: security, secrets, bloat, performance
  --audit --fix              Interactive fix mode with confirmations
  --audit --stats            Quick size/project stats
  --audit --show-secrets     Display detailed secret detection report
  --clean-config             Preview cleanup (dry-run by default, safe!)
  --clean-config -e          Execute the cleanup after preview
  --clean-config -e --force  Execute without confirmation prompts
  --clean-config --mask-secrets  Include secret masking in cleanup
  --mask-secrets-now         🚨 EMERGENCY: Immediate secret masking (force mode)
  --clean-history            Remove large pastes (100+ lines) from history
  --clean-dangerous          Remove all dangerous permissions

MCP Tools:
  -dmc, --discover-mcp       Discover frequently used MCP tools
  -rmc, --reload-mcp         Reload MCP configuration from claude CLI

Backup & Restore:
  -bc, --backup-config       Create backup (auto-timestamped or named)
  -rc, --restore-config      Restore from backup
  -n, --name <name>          Name your backup/restore

Bulk Operations:
  --add-perm <perm>          Add permission to multiple projects
  --remove-perm <perm>       Remove permission from projects  
  --add-tool <tool>          Add MCP tool to multiple projects
  --remove-tool <tool>       Remove MCP tool from projects
  
  Target Selection:
  --projects <pattern>       Project patterns: "work/*", "api-*", "work/*,test/*"
  --all                      All projects
  --dangerous                Target dangerous permissions only

Utilities:
  -c, --config               View config paths and current state
  --changelog                Recent changes
  --doctor                   Diagnose and fix issues
  -dd, --delete-data         Delete all CCH data (with confirmation)

🛠️ OPTIONS:
  --test, --dry-run          Preview changes without applying
  -f, --force                Skip confirmation prompts
  --stats                    Show size/performance statistics
  -v, --version              Show version

📁 FILE LOCATIONS:
  Permissions:   ~/.cch/permissions.json
  Preferences:   ~/.cch/preferences.json  
  Claude Config: ~/.claude.json (managed by Claude)
  Backups:       ~/.cch/backups/

💡 INTELLIGENT EXAMPLES:
Config Health Check:
  cch --audit --stats        # "Config: 45MB, 12 projects, 3 issues, 🚨 Secrets: 2 high-confidence"
  
Secret Detection:
  cch --audit --show-secrets # Shows detailed list: "High confidence: AWS keys, GitHub tokens"
  cch --mask-secrets-now     # "🚨 EMERGENCY SECRET MASKING INITIATED... ✅ COMPLETED!"
  cch --clean-config --mask-secrets # "Masked 8 secrets, saved backup"
  
Config Cleanup Workflow:
  cch --clean-config         # Shows preview (dry-run by default)
  cch --clean-config -e      # Execute the cleanup (after reviewing dry-run)

Permission Management:
  cch -lp                    # See numbered list
  cch -add "pytest"          # Auto-expands to "pytest:*"
  cch -rm 3                  # Remove permission #3
  cch -ap --test            # Preview changes: "Will add to 5 projects"

Bulk Operations:
  cch --add-perm "npm:*" --projects "work/*"       # Add npm to work projects
  cch --remove-perm --dangerous --all              # Security cleanup
  cch --add-tool github --projects "*-api"         # Add GitHub to API projects

Emergency Cleanup:
  cch --mask-secrets-now                           # 🚨 CRITICAL: Immediate secret masking
  cch --clean-config --force                       # Auto-cleanup, no prompts
  cch --clean-dangerous --force                    # Remove all risky permissions

View Status:
  cch --changelog           # Recent activity log`;
  
  return helpText;
}

export async function handleCLI(args: string[]): Promise<void> {
  const { command, options } = parseArgs(args);
  
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
    
    // Audit and clean commands
    'audit': audit_,
    'clean-config': cleanConfig_,
    'mask-secrets-now': maskSecretsNow_,
    'clean-history': cleanHistory_,
    'clean-dangerous': cleanDangerous_,
    
    // Bulk operation commands
    'add-perm': addPerm_,
    'remove-perm': removePerm_,
    'add-tool': addTool_,
    'remove-tool': removeTool_,
    'projects': projects_,
    'all': all_,
    'dangerous': dangerous_,
    
    
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
                       !applyPermissions_ && !ap && !discoverMcp_ && !dmc && !reloadMcp_ && !rmc &&
                       !audit_ && !cleanConfig_ && !maskSecretsNow_ && !cleanHistory_ && !cleanDangerous_ &&
                       !addPerm_ && !removePerm_ && !addTool_ && !removeTool_ && 
                       command !== 'install' && command !== 'uninstall';
    
    // Only ensure base commands exist if we're not just showing help or deleting data
    const isDeletingData = deleteData_ || dd;
    if (!showingHelp && !isDeletingData) {
      await ensureBaseCommandsExist(testMode);
      // Check for dangerous permissions on startup
      if (!testMode) {
        await checkPermissionsOnStartup(testMode);
      }
    }

    // 🚨 CRITICAL: Always check for secrets on every command (except help and version)
    if (!showingHelp && !version_ && !v && !isDeletingData) {
      await secretWarningService.checkAndWarnSecrets(testMode);
    }

    const isBackup = backupConfig_ || bc;
    const isRestore = restoreConfig_ || rc;
    const isConfig = config_ || c;
    const isChangelog = changelog_;
    const isDoctor = doctor_;
    const isDeleteData = deleteData_ || dd;
    const backupNameValue = backupName || name;
    const isForce = force || f;
    const isInstall = command === 'install';
    const isUninstall = command === 'uninstall';
    
    // New unified clean command
    const isClean = command === 'clean';
    const cleanSubcommand = args[1]; // Get subcommand like 'projects' or 'history'
    
    // Legacy clean commands (for backward compatibility)
    const isAudit = audit_;
    const isCleanConfig = cleanConfig_;
    const isMaskSecretsNow = maskSecretsNow_;
    const isCleanHistory = cleanHistory_;
    const isCleanDangerous = cleanDangerous_;
    
    // Bulk operation commands
    const isAddPerm = addPerm_;
    const isRemovePerm = removePerm_;
    const isAddTool = addTool_;
    const isRemoveTool = removeTool_;
    const projectsPattern = projects_;
    const isAll = all_;
    const isDangerous = dangerous_;
    
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
        throw new ValidationError(
          'Permission required',
          'No permission was provided to add.',
          'Usage: cch -add "npm:*" or cch --add-permission "docker:*"'
        );
      }
      await addPermission(permission, testMode);
    } else if (isRemovePermission) {
      const indexStr = typeof isRemovePermission === 'string' ? isRemovePermission : 
                       typeof remove_ === 'string' ? remove_ : 
                       typeof rm === 'string' ? rm : '';
      const index = parseInt(indexStr, 10);
      if (isNaN(index)) {
        throw new ValidationError(
          'Invalid permission number',
          `"${indexStr}" is not a valid number.`,
          'Usage: cch -rm 1 (where 1 is the permission number from cch -lp)'
        );
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
    } else if (isAudit) {
      const fixMode = options.fix || false;
      const statsMode = options.stats || false;
      const showSecretsMode = options['show-secrets'] || false;
      const result = await audit({ fix: fixMode, stats: statsMode, showSecrets: showSecretsMode, testMode });
      console.log(result);
    } else if (isCleanConfig) {
      const aggressive = options.aggressive || false;
      const execute = options.execute || options.e || false;  // Support both --execute and -e
      const maskSecrets = options['mask-secrets'] || false;
      const showSecrets = options['show-secrets'] || false;
      const result = await cleanConfig({
        force: isForce,
        testMode,
        execute,  // Pass execute instead of dryRun
        aggressive,
        maskSecrets,
        showSecrets
      });
      
      if (execute && (result.pastesRemoved > 0 || result.permissionsRemoved > 0 || result.secretsMasked > 0)) {
        console.log(`\n✓ Cleanup completed successfully!`);
        if (result.pastesRemoved > 0) console.log(`  Pastes removed: ${result.pastesRemoved}`);
        if (result.permissionsRemoved > 0) console.log(`  Permissions removed: ${result.permissionsRemoved}`);
        if (result.secretsMasked > 0) console.log(`  Secrets masked: ${result.secretsMasked}`);
        console.log(`  Projects modified: ${result.projectsModified}`);
        console.log(`  Size saved: ${(result.sizeReduction / 1024 / 1024).toFixed(1)} MB`);
        if (result.backupPath) {
          console.log(`  Backup: ${result.backupPath}`);
        }
      }
    } else if (isMaskSecretsNow) {
      // Immediate secret masking with force - no confirmation needed
      console.log('🚨 IMMEDIATE SECRET MASKING INITIATED...');
      console.log('');
      
      const result = await cleanConfig({
        force: true,
        testMode,
        execute: true,  // Always execute for emergency masking
        aggressive: false,
        maskSecrets: true,
        showSecrets: false
      });
      
      if (result.secretsMasked > 0 || result.pastesRemoved > 0 || result.permissionsRemoved > 0) {
        console.log('✅ EMERGENCY SECRET CLEANUP COMPLETED!');
        console.log('');
        if (result.secretsMasked > 0) console.log(`🔒 Secrets masked: ${result.secretsMasked}`);
        if (result.pastesRemoved > 0) console.log(`📄 Pastes removed: ${result.pastesRemoved}`);
        if (result.permissionsRemoved > 0) console.log(`⚠️  Permissions removed: ${result.permissionsRemoved}`);
        console.log(`📁 Projects secured: ${result.projectsModified}`);
        console.log(`💾 Size saved: ${(result.sizeReduction / 1024 / 1024).toFixed(1)} MB`);
        if (result.backupPath) {
          console.log(`🔄 Backup: ${result.backupPath}`);
        }
        console.log('');
        console.log('🎉 Your configuration is now secure!');
      } else {
        console.log('✅ No secrets found or already secured.');
      }
    } else if (isCleanHistory) {
      const projects = options.projects as string | undefined;
      const dryRun = options['dry-run'] || false;
      const result = await cleanHistoryOld({
        projects: projects ? projects.split(',').map(p => p.trim()) : undefined,
        testMode,
        dryRun
      });
      
      if (!dryRun) {
        console.log(`✓ Cleaned ${result.pastesRemoved} pastes from ${result.projectsModified} projects`);
        console.log(`  Saved ${(result.sizeReduction / 1024 / 1024).toFixed(1)} MB`);
        if (result.backupPath) {
          console.log(`  Backup: ${result.backupPath}`);
        }
      } else {
        console.log(`[DRY RUN] Would clean ${result.pastesRemoved} pastes from ${result.projectsModified} projects`);
        console.log(`  Would save ${(result.sizeReduction / 1024 / 1024).toFixed(1)} MB`);
      }
    } else if (isCleanDangerous) {
      const dryRun = options['dry-run'] || false;
      const result = await cleanDangerous({ testMode, dryRun });
      
      if (!dryRun) {
        console.log(`✓ Removed ${result.permissionsRemoved} dangerous permissions from ${result.projectsModified} projects`);
        if (result.backupPath) {
          console.log(`  Backup: ${result.backupPath}`);
        }
      } else {
        console.log(`[DRY RUN] Would remove ${result.permissionsRemoved} dangerous permissions from ${result.projectsModified} projects`);
      }
    } else if (isAddPerm) {
      const permission = typeof isAddPerm === 'string' ? isAddPerm : '';
      if (!permission) {
        throw new ValidationError(
          'Permission required',
          'No permission was provided for bulk add.',
          'Usage: cch --add-perm "npm:*" --projects "work/*" or --all'
        );
      }
      
      const result = await bulkAddPermission({
        permission,
        projects: projectsPattern as string | string[] | undefined,
        all: isAll as boolean | undefined,
        testMode,
        dryRun: options['dry-run'] || false
      });
      
      console.log(`✓ Added "${permission}" to ${result.projectsModified} projects`);
      if (result.backupPath) {
        console.log(`  Backup: ${result.backupPath}`);
      }
    } else if (isRemovePerm) {
      const permission = typeof isRemovePerm === 'string' ? isRemovePerm : undefined;
      
      const result = await bulkRemovePermission({
        permission,
        dangerous: isDangerous as boolean | undefined,
        projects: projectsPattern as string | string[] | undefined,
        all: isAll as boolean | undefined,
        testMode,
        dryRun: options['dry-run'] || false
      });
      
      console.log(`✓ Removed ${result.itemsRemoved} permissions from ${result.projectsModified} projects`);
      if (result.backupPath) {
        console.log(`  Backup: ${result.backupPath}`);
      }
    } else if (isAddTool) {
      const tool = typeof isAddTool === 'string' ? isAddTool : '';
      if (!tool) {
        throw new Error('Please provide a tool name to add');
      }
      
      const result = await bulkAddTool({
        tool,
        projects: projectsPattern as string | string[] | undefined,
        all: isAll as boolean | undefined,
        testMode,
        dryRun: options['dry-run'] || false
      });
      
      console.log(`✓ Added MCP tool "${tool}" to ${result.projectsModified} projects`);
      if (result.backupPath) {
        console.log(`  Backup: ${result.backupPath}`);
      }
    } else if (isRemoveTool) {
      const tool = typeof isRemoveTool === 'string' ? isRemoveTool : '';
      if (!tool) {
        throw new Error('Please provide a tool name to remove');
      }
      
      const result = await bulkRemoveTool({
        tool,
        projects: projectsPattern as string | string[] | undefined,
        all: isAll as boolean | undefined,
        testMode,
        dryRun: options['dry-run'] || false
      });
      
      console.log(`✓ Removed MCP tool "${tool}" from ${result.projectsModified} projects`);
      if (result.backupPath) {
        console.log(`  Backup: ${result.backupPath}`);
      }
    } else if (isDeleteData) {
      await cleanup.deleteData(testMode);
    } else if (isClean) {
      // New unified clean command
      const execute = options.execute || options.e || false;
      const aggressive = options.aggressive || false;
      
      if (cleanSubcommand === 'projects') {
        await cleanProjects({ execute, force: isForce, testMode });
      } else if (cleanSubcommand === 'history') {
        await cleanHistory({ execute, force: isForce, testMode });
      } else if (cleanSubcommand === 'help' || cleanSubcommand === '--help') {
        console.log(generateCleanHelp());
      } else {
        // Default to general cleanup
        await cleanGeneral({ execute, force: isForce, testMode, aggressive });
      }
    } else if (isInstall) {
      await installToClaudeCode();
    } else if (isUninstall) {
      await uninstallFromClaudeCode();
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
      handleCLIError(err);
    } else {
      logger.error('Unknown error occurred');
      process.exit(1);
    }
  }
}