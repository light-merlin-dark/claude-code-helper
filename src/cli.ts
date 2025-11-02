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

// Cache commands
import { analyzeCache } from './commands/cache/analyze';
import { cacheStats } from './commands/cache/stats';
import { cleanCache } from './commands/cache/clean-cache';
import { analyzeBlobs } from './commands/cache/analyze-blobs';
import { cleanBlobs } from './commands/cache/clean-blobs';

// Bulk operation commands
import { bulkAddPermission, bulkRemovePermission, bulkAddTool, bulkRemoveTool } from './commands/bulk';

// Fix settings command
import { fixSettings } from './commands/fix-settings';

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
  
  let helpText = `Claude Code Helper v${getVersion()}

COMMANDS:
  cch -lp                    List permissions
  cch -add <permission>      Add permission (e.g., "docker" → docker:*)
  cch -rm <number>           Remove permission by number
  cch -ap                    Apply permissions to all projects
  cch -dp                    Discover common permissions
  
  cch clean                  Clean config (preview mode)
  cch clean -e               Execute cleanup
  cch clean projects         Remove empty projects
  cch clean history          Clear all history

  cch cache                  Cache quick stats
  cch cache analyze          Analyze cache usage
  cch cache stats            Quick cache statistics

  cch blob analyze           Analyze session blobs
  cch blob clean             Clean blobs from sessions

  cch --audit                Analyze config health
  cch --audit --stats        Quick stats
  cch --mask-secrets-now     Emergency secret masking
  
  cch -bc                    Backup config
  cch -rc                    Restore from backup
  cch fix-settings           Fix Claude settings
  
  cch install                Install as MCP server
  cch uninstall              Remove MCP server
  cch help                   Show this help
  cch help examples          Show detailed examples

OPTIONS:
  -e, --execute              Execute (not dry-run)
  -f, --force                Skip confirmations
  --projects <pattern>       Target specific projects
  --all                      Target all projects

`;

  if (!baseCommandsExist) {
    helpText += `NEW USER? Start with:
  cch -dp                    Discover your common permissions
  cch --audit                Check config health

`;
  }
  
  helpText += `EXAMPLES:
  # Add permission
  cch -add "npm"             # Adds npm:* permission
  
  # Clean config (always previews first)
  cch clean                  # Preview what would be cleaned
  cch clean -e               # Execute after reviewing
  
  # Audit and fix
  cch --audit --stats        # Quick config health check
  cch --mask-secrets-now     # Emergency secret removal
  
  # Backup before changes
  cch -bc                    # Create timestamped backup
  cch clean -e               # Then clean with confidence

For more examples: cch help examples`;
  
  return helpText;
}

function generateExamplesText(): string {
  return `Claude Code Helper - Detailed Examples

PERMISSION MANAGEMENT:
  # List current permissions
  cch -lp
  
  # Add a single permission
  cch -add "docker"          # Auto-expands to docker:*
  cch -add "npm run"         # Auto-expands to npm run:*
  
  # Remove permission by number
  cch -lp                    # First, see numbered list
  cch -rm 3                  # Remove permission #3
  
  # Apply permissions to all projects
  cch -ap                    # Apply your saved permissions
  cch -ap --test             # Preview what would be applied
  
  # Discover frequently used commands
  cch -dp                    # Analyze your config for patterns

CONFIG CLEANUP:
  # General cleanup (always previews first)
  cch clean                  # See what would be cleaned
  cch clean -e               # Execute after reviewing
  cch clean -e --force       # Skip confirmation

  # Clean specific aspects
  cch clean projects         # Remove empty projects
  cch clean projects -e      # Execute removal

  cch clean history          # Clear ALL conversation history
  cch clean history -e       # Execute (destructive!)

  # Aggressive cleanup
  cch clean --aggressive     # More aggressive thresholds
  cch clean --aggressive -e  # Execute aggressive cleanup

CACHE MANAGEMENT:
  # Analyze cache usage
  cch cache                  # Quick cache statistics
  cch cache stats            # Same as above
  cch cache analyze          # Detailed cache analysis
  cch cache analyze --detailed # Show all details

  # Clean cache (always previews first)
  cch cache clean            # Preview all available cleanup
  cch cache clean --orphaned # Clean orphaned projects (safest)
  cch cache clean --stale 60 # Clean projects not accessed in 60 days
  cch cache clean --large    # Clean sessions >10MB
  cch cache clean --threshold 5  # Set size threshold in MB
  cch cache clean --empty    # Remove empty files
  cch cache clean --all      # Clean all safe + caution items
  cch cache clean -e         # Execute cleanup (after preview)

BLOB DETECTION & CLEANUP:
  # Analyze sessions for blobs (images, large data)
  cch blob analyze           # Analyze all large sessions (>5MB)
  cch blob analyze --project ldis  # Analyze specific project
  cch blob analyze --session <id>  # Analyze specific session
  cch blob analyze --min-size 10   # Only sessions >10MB

  # Clean blobs from sessions (always previews first)
  cch blob clean             # Preview blob removal from all large sessions
  cch blob clean --project ldis    # Clean specific project
  cch blob clean --session <id>    # Clean specific session
  cch blob clean --sanitize  # Replace blobs with placeholders (safer)
  cch blob clean --min-size 100    # Only remove blobs >100KB
  cch blob clean --no-images # Keep images, only remove large text
  cch blob clean -e          # Execute cleanup (after preview)

SECURITY & SECRETS:
  # Full security audit
  cch --audit                # Complete analysis
  cch --audit --stats        # Quick summary only
  cch --audit --show-secrets # Show detected secrets
  
  # Emergency secret masking
  cch --mask-secrets-now     # Immediate action
  
  # Clean with secret masking
  cch --clean-config --mask-secrets     # Preview
  cch --clean-config --mask-secrets -e  # Execute

BACKUP & RESTORE:
  # Create backups
  cch -bc                    # Auto-timestamped backup
  cch -bc -n "pre-cleanup"   # Named backup
  
  # List available backups
  cch -rc                    # Shows backup list
  
  # Restore from backup
  cch -rc                    # Interactive selection
  cch -rc -n "pre-cleanup"   # Restore specific backup

BULK OPERATIONS:
  # Add permission to multiple projects
  cch --add-perm "npm:*" --projects "work/*"
  cch --add-perm "docker:*" --all
  
  # Remove dangerous permissions
  cch --remove-perm --dangerous --all
  
  # Pattern matching for projects
  cch --add-perm "git:*" --projects "api-*"
  cch --add-perm "npm:*" --projects "frontend/*,backend/*"

MCP TOOLS:
  # Discover frequently used MCP tools
  cch -dmc
  
  # Add MCP tools to projects
  cch --add-tool github --projects "*-api"
  cch --add-tool filesystem --all
  
  # Reload MCP configuration
  cch -rmc

SETTINGS MAINTENANCE:
  # Fix Claude settings formatting
  cch fix-settings           # Preview fixes
  cch fix-settings -e        # Apply fixes

TROUBLESHOOTING:
  # Diagnose issues
  cch --doctor               # Run diagnostics
  
  # View configuration
  cch -c                     # Show config paths and info
  cch --changelog            # Recent changes
  
  # Emergency cleanup
  cch --clean-dangerous      # Remove risky permissions
  cch --clean-history        # Remove large pastes

AI AGENT WORKFLOW:
  # Typical AI agent commands
  cch -lp                    # Check current permissions
  cch --audit --stats        # Quick health check
  cch clean                  # Preview cleanup
  cch clean -e               # Execute if needed
  cch -add "docker"          # Add new permission
  cch -ap                    # Apply to projects`;
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

    // Cache commands
    const isCacheCommand = command === 'cache';
    const cacheSubcommand = args[1]; // Get subcommand like 'analyze' or 'stats'

    // Blob commands
    const isBlobCommand = command === 'blob';
    const blobSubcommand = args[1]; // Get subcommand like 'analyze' or 'clean'
    
    // Fix settings command
    const isFixSettings = command === 'fix-settings';
    const fixSettingsExecute = options.execute || options.e || false;
    const fixSettingsVerbose = options.verbose || options.v || false;
    
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
    } else if (isFixSettings) {
      await fixSettings({ execute: fixSettingsExecute, verbose: fixSettingsVerbose });
    } else if (isBlobCommand) {
      // Blob management commands
      if (blobSubcommand === 'analyze') {
        await analyzeBlobs({
          session: options.session as string | undefined,
          project: options.project as string | undefined,
          minSize: options['min-size'] ? parseInt(options['min-size'] as string) : 5,
          testMode
        });
      } else if (blobSubcommand === 'clean') {
        const execute = options.execute || options.e || false;
        await cleanBlobs({
          session: options.session as string | undefined,
          project: options.project as string | undefined,
          images: options.images !== false,  // Default true
          largeText: options['large-text'] !== false,  // Default true
          minSize: options['min-size'] ? parseInt(options['min-size'] as string) * 1024 : undefined,  // Convert KB to bytes
          sanitize: options.sanitize || false,
          execute,
          force: isForce,
          testMode
        });
      } else {
        // Default to analyze
        await analyzeBlobs({ testMode });
      }
    } else if (isCacheCommand) {
      // Cache management commands
      if (cacheSubcommand === 'analyze') {
        const detailed = options.detailed || false;
        await analyzeCache({ detailed, testMode });
      } else if (cacheSubcommand === 'stats') {
        await cacheStats({ testMode });
      } else if (cacheSubcommand === 'clean') {
        const execute = options.execute || options.e || false;
        await cleanCache({
          orphaned: options.orphaned || false,
          stale: options.stale ? parseInt(options.stale as string) : undefined,
          large: options.large || false,
          threshold: options.threshold ? parseInt(options.threshold as string) : undefined,
          debug: options.debug || false,
          empty: options.empty || false,
          all: options.all || false,
          execute,
          force: isForce,
          testMode
        });
      } else {
        // Default to showing cache stats
        await cacheStats({ testMode });
      }
    } else if (isInstall) {
      await installToClaudeCode();
    } else if (isUninstall) {
      await uninstallFromClaudeCode();
    } else if (command === 'help') {
      // Handle help command with optional subcommands
      const subcommand = args[1];
      if (subcommand === 'examples' || subcommand === '--examples') {
        console.log(generateExamplesText());
      } else {
        console.log(generateHelpText(testMode));
      }
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