/**
 * Bulk operation commands for efficient management across many projects
 * Supports pattern matching and --all flag for project selection
 */

import { loadClaudeConfig, saveClaudeConfig, ClaudeConfig } from '../core/config';
import { logger } from '../utils/logger';
import { promptConfirm } from '../utils/prompt';
import { matchProjects, projectMatchesPatterns } from '../utils/patterns';
import { createBackup } from '../services/backup';
import { DANGEROUS_PATTERNS } from '../services/analyzer';
import { ProgressBar, withProgress } from '../utils/progress';

export interface BulkAddPermissionOptions {
  permission: string;
  projects?: string | string[];
  all?: boolean;
  testMode?: boolean;
  dryRun?: boolean;
}

export interface BulkRemovePermissionOptions {
  permission?: string;
  dangerous?: boolean;
  projects?: string | string[];
  all?: boolean;
  testMode?: boolean;
  dryRun?: boolean;
}

export interface BulkAddToolOptions {
  tool: string;
  projects?: string | string[];
  all?: boolean;
  testMode?: boolean;
  dryRun?: boolean;
}

export interface BulkRemoveToolOptions {
  tool: string;
  projects?: string | string[];
  all?: boolean;
  testMode?: boolean;
  dryRun?: boolean;
}

export interface BulkOperationResult {
  projectsModified: number;
  itemsAdded?: number;
  itemsRemoved?: number;
  backupPath?: string;
}

/**
 * Add permission to multiple projects
 */
export async function bulkAddPermission(options: BulkAddPermissionOptions): Promise<BulkOperationResult> {
  const { permission, projects, all, testMode = false, dryRun = false } = options;
  
  if (!permission) {
    throw new Error('Permission is required');
  }
  
  // Create backup first
  let backupPath: string | undefined;
  if (!dryRun && !testMode) {
    backupPath = await createBackup('pre-bulk-add-perm');
  }
  
  const config = await loadClaudeConfig(testMode) as ClaudeConfig;
  
  // Get projects to modify
  const projectsToModify = getProjectsToModify(config, projects, all);
  
  if (projectsToModify.length === 0) {
    throw new Error('No projects matched the criteria');
  }
  
  // Show what will be modified
  if (!dryRun) {
    console.log(`\nAdding permission "${permission}" to ${projectsToModify.length} projects:`);
    projectsToModify.slice(0, 5).forEach(([name]) => console.log(`  - ${name}`));
    if (projectsToModify.length > 5) {
      console.log(`  ... and ${projectsToModify.length - 5} more`);
    }
    
    const confirmed = await promptConfirm('Continue?', true);
    if (!confirmed) {
      throw new Error('Operation cancelled');
    }
  }
  
  let itemsAdded = 0;
  let projectsModified = 0;
  
  // Use progress bar for large operations
  const useProgress = projectsToModify.length > 10 && !dryRun;
  const progress = useProgress ? new ProgressBar(projectsToModify.length, 'Adding permission') : null;
  
  projectsToModify.forEach(([projectName, project], index) => {
    if (!project.allowedCommands) {
      project.allowedCommands = [];
    }
    
    // Check if permission already exists
    if (!project.allowedCommands.includes(permission)) {
      if (!dryRun) {
        project.allowedCommands.push(permission);
      }
      itemsAdded++;
      projectsModified++;
      
      if (!useProgress) {
        logger.info(`${dryRun ? '[DRY RUN] Would add' : 'Added'} "${permission}" to ${projectName}`);
      }
    }
    
    if (progress) {
      progress.increment();
    }
  });
  
  if (!dryRun && itemsAdded > 0) {
    await saveClaudeConfig(config, testMode);
  }
  
  return {
    projectsModified,
    itemsAdded,
    backupPath
  };
}

/**
 * Remove permission from multiple projects
 */
export async function bulkRemovePermission(options: BulkRemovePermissionOptions): Promise<BulkOperationResult> {
  const { permission, dangerous, projects, all, testMode = false, dryRun = false } = options;
  
  if (!permission && !dangerous) {
    throw new Error('Either permission or --dangerous flag is required');
  }
  
  // Create backup first
  let backupPath: string | undefined;
  if (!dryRun && !testMode) {
    backupPath = await createBackup('pre-bulk-remove-perm');
  }
  
  const config = await loadClaudeConfig(testMode) as ClaudeConfig;
  
  // Get projects to modify
  const projectsToModify = getProjectsToModify(config, projects, all);
  
  if (projectsToModify.length === 0) {
    throw new Error('No projects matched the criteria');
  }
  
  let itemsRemoved = 0;
  let projectsModified = 0;
  
  if (dangerous) {
    // Remove all dangerous permissions
    console.log('\nScanning for dangerous permissions...');
    
    const dangerousFound = new Map<string, string[]>();
    
    projectsToModify.forEach(([projectName, project]) => {
      if (project.allowedCommands) {
        const dangerousPerms = project.allowedCommands.filter((cmd: string) =>
          isDangerousCommand(cmd)
        );
        
        if (dangerousPerms.length > 0) {
          dangerousFound.set(projectName, dangerousPerms);
        }
      }
    });
    
    if (dangerousFound.size === 0) {
      console.log('No dangerous permissions found');
      return { projectsModified: 0, itemsRemoved: 0 };
    }
    
    // Show what will be removed
    console.log(`\nFound dangerous permissions in ${dangerousFound.size} projects:`);
    let count = 0;
    dangerousFound.forEach((perms, projectName) => {
      if (count < 5) {
        console.log(`  ${projectName}:`);
        perms.forEach(perm => console.log(`    - ${perm}`));
      }
      count++;
    });
    if (dangerousFound.size > 5) {
      console.log(`  ... and ${dangerousFound.size - 5} more projects`);
    }
    
    if (!dryRun) {
      const confirmed = await promptConfirm('Remove all dangerous permissions?', true);
      if (!confirmed) {
        throw new Error('Operation cancelled');
      }
    }
    
    // Remove dangerous permissions
    dangerousFound.forEach((perms, projectName) => {
      const project = config.projects![projectName];
      if (!dryRun && project.allowedCommands) {
        project.allowedCommands = project.allowedCommands.filter((cmd: string) =>
          !isDangerousCommand(cmd)
        );
      }
      itemsRemoved += perms.length;
      projectsModified++;
    });
  } else if (permission) {
    // Remove specific permission
    console.log(`\nRemoving permission "${permission}" from matching projects...`);
    
    projectsToModify.forEach(([projectName, project]) => {
      if (project.allowedCommands && project.allowedCommands.includes(permission)) {
        if (!dryRun) {
          project.allowedCommands = project.allowedCommands.filter((cmd: string) => cmd !== permission);
        }
        itemsRemoved++;
        projectsModified++;
        
        logger.info(`${dryRun ? '[DRY RUN] Would remove' : 'Removed'} "${permission}" from ${projectName}`);
      }
    });
  }
  
  if (!dryRun && itemsRemoved > 0) {
    await saveClaudeConfig(config, testMode);
  }
  
  return {
    projectsModified,
    itemsRemoved,
    backupPath
  };
}

/**
 * Add MCP tool to multiple projects
 */
export async function bulkAddTool(options: BulkAddToolOptions): Promise<BulkOperationResult> {
  const { tool, projects, all, testMode = false, dryRun = false } = options;
  
  if (!tool) {
    throw new Error('Tool name is required');
  }
  
  // Create backup first
  let backupPath: string | undefined;
  if (!dryRun && !testMode) {
    backupPath = await createBackup('pre-bulk-add-tool');
  }
  
  const config = await loadClaudeConfig(testMode) as ClaudeConfig;
  
  // Get projects to modify
  const projectsToModify = getProjectsToModify(config, projects, all);
  
  if (projectsToModify.length === 0) {
    throw new Error('No projects matched the criteria');
  }
  
  // Parse MCP tool format (e.g., "github" or "mcp__github")
  const mcpName = tool.startsWith('mcp__') ? tool.split('__')[1] : tool;
  
  console.log(`\nAdding MCP tool "${mcpName}" to ${projectsToModify.length} projects`);
  
  if (!dryRun) {
    const confirmed = await promptConfirm('Continue?', true);
    if (!confirmed) {
      throw new Error('Operation cancelled');
    }
  }
  
  let itemsAdded = 0;
  let projectsModified = 0;
  
  projectsToModify.forEach(([projectName, project]) => {
    if (!project.mcpServers) {
      project.mcpServers = {};
    }
    
    if (!project.mcpServers[mcpName]) {
      if (!dryRun) {
        // Add with empty config - user can configure later
        project.mcpServers[mcpName] = {};
      }
      itemsAdded++;
      projectsModified++;
      
      logger.info(`${dryRun ? '[DRY RUN] Would add' : 'Added'} MCP "${mcpName}" to ${projectName}`);
    }
  });
  
  if (!dryRun && itemsAdded > 0) {
    await saveClaudeConfig(config, testMode);
  }
  
  return {
    projectsModified,
    itemsAdded,
    backupPath
  };
}

/**
 * Remove MCP tool from multiple projects
 */
export async function bulkRemoveTool(options: BulkRemoveToolOptions): Promise<BulkOperationResult> {
  const { tool, projects, all, testMode = false, dryRun = false } = options;
  
  if (!tool) {
    throw new Error('Tool name is required');
  }
  
  // Create backup first
  let backupPath: string | undefined;
  if (!dryRun && !testMode) {
    backupPath = await createBackup('pre-bulk-remove-tool');
  }
  
  const config = await loadClaudeConfig(testMode) as ClaudeConfig;
  
  // Get projects to modify
  const projectsToModify = getProjectsToModify(config, projects, all);
  
  if (projectsToModify.length === 0) {
    throw new Error('No projects matched the criteria');
  }
  
  // Parse MCP tool format
  const mcpName = tool.startsWith('mcp__') ? tool.split('__')[1] : tool;
  
  console.log(`\nRemoving MCP tool "${mcpName}" from matching projects...`);
  
  let itemsRemoved = 0;
  let projectsModified = 0;
  
  projectsToModify.forEach(([projectName, project]) => {
    if (project.mcpServers && project.mcpServers[mcpName]) {
      if (!dryRun) {
        delete project.mcpServers[mcpName];
      }
      itemsRemoved++;
      projectsModified++;
      
      logger.info(`${dryRun ? '[DRY RUN] Would remove' : 'Removed'} MCP "${mcpName}" from ${projectName}`);
    }
  });
  
  if (!dryRun && itemsRemoved > 0) {
    await saveClaudeConfig(config, testMode);
  }
  
  return {
    projectsModified,
    itemsRemoved,
    backupPath
  };
}

/**
 * Get projects to modify based on patterns or --all flag
 */
function getProjectsToModify(
  config: ClaudeConfig,
  patterns?: string | string[],
  all?: boolean
): Array<[string, any]> {
  if (all) {
    return Object.entries(config.projects || {});
  }
  
  if (patterns) {
    return matchProjects(patterns, config);
  }
  
  // No patterns and no --all flag
  throw new Error('Please specify project patterns or use --all flag');
}

/**
 * Check if a command is dangerous
 */
function isDangerousCommand(command: string): boolean {
  return DANGEROUS_PATTERNS.some(pattern => {
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(command);
  });
}