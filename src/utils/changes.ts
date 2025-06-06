import chalk from 'chalk';
import { comparePermissions, normalizePermission } from '../core/permissions';
import { logger } from './logger';

export interface ProjectChange {
  projectPath: string;
  added: string[];
  removed: string[];
  unchanged: boolean;
}

export interface ChangeSummary {
  totalProjects: number;
  updatedProjects: number;
  totalAdded: number;
  totalRemoved: number;
  projectChanges: ProjectChange[];
}

/**
 * Track changes made to a project's permissions
 */
export function trackProjectChange(
  projectPath: string,
  oldPermissions: string[],
  newPermissions: string[]
): ProjectChange {
  const diff = comparePermissions(oldPermissions, newPermissions);
  
  return {
    projectPath,
    added: diff.added,
    removed: diff.removed,
    unchanged: diff.added.length === 0 && diff.removed.length === 0
  };
}

/**
 * Create a summary of all changes
 */
export function createChangeSummary(projectChanges: ProjectChange[]): ChangeSummary {
  let totalAdded = 0;
  let totalRemoved = 0;
  let updatedProjects = 0;
  
  for (const change of projectChanges) {
    if (!change.unchanged) {
      updatedProjects++;
      totalAdded += change.added.length;
      totalRemoved += change.removed.length;
    }
  }
  
  return {
    totalProjects: projectChanges.length,
    updatedProjects,
    totalAdded,
    totalRemoved,
    projectChanges
  };
}

/**
 * Display a single project's changes
 */
export function displayProjectChange(change: ProjectChange, verbose: boolean = false): void {
  const projectName = change.projectPath.split('/').pop() || change.projectPath;
  
  if (change.unchanged) {
    if (verbose) {
      console.log(`${chalk.green('✓')} ${chalk.gray(projectName)}`);
      console.log(`  ${chalk.gray('(No changes - all permissions already present)')}`);
    }
    return;
  }
  
  console.log(`${chalk.green('✓')} ${chalk.cyan(projectName)}`);
  
  if (change.added.length > 0) {
    const addedStr = change.added.map(p => normalizePermission(p)).join(', ');
    console.log(`  ${chalk.green('+')} Added: ${addedStr}`);
  }
  
  if (change.removed.length > 0) {
    const removedStr = change.removed.map(p => normalizePermission(p)).join(', ');
    console.log(`  ${chalk.red('-')} Removed: ${removedStr}`);
  }
  
  console.log(''); // Empty line for spacing
}

/**
 * Display a full change summary
 */
export function displayChangeSummary(
  summary: ChangeSummary,
  showDetails: boolean = true
): void {
  if (summary.totalProjects === 0) {
    logger.warning('No projects found to update');
    return;
  }
  
  // Show header
  console.log(chalk.cyan(`\nApplying permissions to ${summary.totalProjects} project(s)...\n`));
  
  // Show details for each project if requested
  if (showDetails) {
    for (const change of summary.projectChanges) {
      displayProjectChange(change, true);
    }
  }
  
  // Show summary
  if (summary.updatedProjects === 0) {
    logger.success('All projects already have the required permissions');
  } else {
    const permissionWord = summary.totalAdded === 1 ? 'permission' : 'permissions';
    logger.success(
      `Updated ${summary.updatedProjects}/${summary.totalProjects} project(s) with ${summary.totalAdded} new ${permissionWord}`
    );
    
    if (summary.totalRemoved > 0) {
      logger.info(`Removed ${summary.totalRemoved} duplicate permission(s)`);
    }
  }
}

/**
 * Create a dry-run preview of changes
 */
export function displayDryRunPreview(summary: ChangeSummary): void {
  console.log(chalk.yellow('\n🔍 DRY RUN - No changes will be made\n'));
  
  if (summary.updatedProjects === 0) {
    console.log(chalk.gray('No changes would be made - all projects already have required permissions'));
    return;
  }
  
  console.log(chalk.cyan(`Would update ${summary.updatedProjects} project(s):\n`));
  
  for (const change of summary.projectChanges) {
    if (!change.unchanged) {
      const projectName = change.projectPath.split('/').pop() || change.projectPath;
      console.log(`  ${chalk.yellow('~')} ${projectName}`);
      
      if (change.added.length > 0) {
        const addedStr = change.added.map(p => normalizePermission(p)).join(', ');
        console.log(`    ${chalk.green('+')} Would add: ${addedStr}`);
      }
      
      if (change.removed.length > 0) {
        const removedStr = change.removed.map(p => normalizePermission(p)).join(', ');
        console.log(`    ${chalk.red('-')} Would remove: ${removedStr}`);
      }
    }
  }
  
  console.log('');
}