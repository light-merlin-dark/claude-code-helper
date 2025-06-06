import { loadBaseCommands, loadClaudeConfig, saveClaudeConfig } from '../../core/config';
import { logger } from '../../utils/logger';
import { 
  formatForConfig, 
  mergePermissions,
  deduplicatePermissions 
} from '../../core/permissions';
import { 
  trackProjectChange, 
  createChangeSummary, 
  displayChangeSummary,
  ProjectChange
} from '../../utils/changes';
import { getPreference } from '../../core/preferences';

/**
 * Apply permissions to all projects
 */
export async function applyPermissions(testMode: boolean = false, dryRun: boolean = false): Promise<void> {
  const basePermissions = await loadBaseCommands(testMode);
  if (basePermissions.length === 0) {
    logger.warning('No permissions configured');
    logger.info('Use "cch -add <permission>" to add your first permission');
    return;
  }

  const config = await loadClaudeConfig(testMode);

  if (!config.projects) {
    logger.warning('No projects found in Claude config');
    return;
  }

  // Get preferences
  const showChangeSummary = await getPreference('permissions.showChangeSummary', true, testMode);
  const verboseLogging = await getPreference('permissions.verboseLogging', false, testMode);

  // Track changes for all projects
  const projectChanges: ProjectChange[] = [];
  
  // Format base permissions for Claude config
  const formattedBasePermissions = formatForConfig(basePermissions);

  for (const [projectPath, project] of Object.entries(config.projects)) {
    if (!project.allowedTools) {
      project.allowedTools = [];
    }

    const oldPermissions = [...project.allowedTools];
    
    // Deduplicate existing permissions first
    const deduplicatedExisting = deduplicatePermissions(project.allowedTools);
    
    // Merge base permissions with existing ones
    const newPermissions = mergePermissions(formattedBasePermissions, deduplicatedExisting);
    
    // Track the change
    const change = trackProjectChange(projectPath, oldPermissions, newPermissions);
    projectChanges.push(change);
    
    // Update the project if there were changes
    if (!change.unchanged && !dryRun) {
      project.allowedTools = newPermissions;
    }
  }

  // Create and display summary
  const summary = createChangeSummary(projectChanges);
  
  if (showChangeSummary || dryRun) {
    displayChangeSummary(summary, verboseLogging || dryRun);
  }

  // Save changes if not a dry run and there were updates
  if (!dryRun && summary.updatedProjects > 0) {
    await saveClaudeConfig(config, testMode);
  }
}

// Keep the old function name for backwards compatibility, but have it call the new one
export async function ensureCommands(testMode: boolean = false): Promise<void> {
  return applyPermissions(testMode, false);
}