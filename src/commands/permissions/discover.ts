import path from 'path';
import chalk from 'chalk';
import { loadClaudeConfig, loadBaseCommands, saveBaseCommands } from '../../core/config';
import { logger } from '../../utils/logger';
import { promptUser } from '../../utils/prompt';
import { applyPermissions } from './apply';

interface PermissionFrequency {
  permission: string;
  count: number;
  projects: string[];
}

/**
 * Discover and suggest commonly used permissions across projects
 */

export async function suggestCommands(testMode: boolean = false): Promise<void> {
  const config = await loadClaudeConfig(testMode);
  const basePermissions = await loadBaseCommands(testMode);

  if (!config.projects || Object.keys(config.projects).length === 0) {
    logger.warning('No projects found in Claude config');
    return;
  }

  // Count frequency of each permission across projects
  const permissionMap = new Map<string, PermissionFrequency>();
  let totalProjects = 0;

  for (const [projectPath, project] of Object.entries(config.projects)) {
    totalProjects++;
    const seenInProject = new Set<string>();

    for (const cmd of project.allowedTools || []) {
      // Normalize command (remove Bash() wrapper)
      const normalizedCmd = cmd.startsWith('Bash(') && cmd.endsWith(')') 
        ? cmd.slice(5, -1) 
        : cmd;
      
      // Skip if already in base permissions
      if (basePermissions.includes(normalizedCmd)) continue;
      
      // Skip if we've already seen this command in this project
      if (seenInProject.has(normalizedCmd)) continue;
      seenInProject.add(normalizedCmd);

      // Update frequency map
      if (!permissionMap.has(normalizedCmd)) {
        permissionMap.set(normalizedCmd, { 
          permission: normalizedCmd, 
          count: 0, 
          projects: [] 
        });
      }
      const freq = permissionMap.get(normalizedCmd)!;
      freq.count++;
      freq.projects.push(path.basename(projectPath));
    }
  }

  // Sort by frequency and filter
  const suggestions = Array.from(permissionMap.values())
    .filter(f => f.count >= 2) // Only suggest if used in 2+ projects
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Limit to top 10 suggestions

  if (suggestions.length === 0) {
    logger.info(`Analyzed ${totalProjects} project(s)`);
    logger.success('No frequently used permissions found that aren\'t already in your base set');
    return;
  }

  // Display suggestions
  console.log(chalk.cyan(`\nLooking for commonly used permissions across ${totalProjects} projects...\n`));
  console.log(chalk.green(`Found ${suggestions.length} permission(s) you use frequently:\n`));

  suggestions.forEach((cmd, idx) => {
    const projectList = cmd.projects.slice(0, 3).join(', ');
    const moreProjects = cmd.projects.length > 3 ? ` (+${cmd.projects.length - 3} more)` : '';
    console.log(`  ${chalk.yellow(`${idx + 1}.`)} ${chalk.white(cmd.permission)} ${chalk.gray(`(used in ${cmd.count} projects)`)} ${chalk.gray(`${projectList}${moreProjects}`)}`);
  });

  console.log('\n' + chalk.cyan('Select permissions to add:'));
  console.log(`  ${chalk.gray('[a]')} Add all`);
  console.log(`  ${chalk.gray('[1-' + suggestions.length + ']')} Add specific (comma-separated)`);
  console.log(`  ${chalk.gray('[n]')} Skip\n`);

  const answer = await promptUser('Your choice: ');

  if (answer === 'n' || answer === 'skip' || answer === '') {
    logger.info('Skipped adding permissions');
    return;
  }

  let permissionsToAdd: PermissionFrequency[] = [];

  if (answer === 'a' || answer === 'all') {
    permissionsToAdd = suggestions;
  } else {
    // Parse comma-separated numbers
    const indices = answer.split(',')
      .map(s => parseInt(s.trim(), 10) - 1)
      .filter(i => i >= 0 && i < suggestions.length);
    
    if (indices.length === 0) {
      logger.warning('No valid selections made');
      return;
    }

    permissionsToAdd = indices.map(i => suggestions[i]);
  }

  // Add selected permissions
  const permissions = await loadBaseCommands(testMode);
  let addedCount = 0;

  for (const perm of permissionsToAdd) {
    if (!permissions.includes(perm.permission)) {
      permissions.push(perm.permission);
      logger.success(`Added: ${perm.permission}`);
      addedCount++;
    }
  }

  if (addedCount > 0) {
    await saveBaseCommands(permissions, testMode);
    console.log('');
    logger.success(`Added ${addedCount} permission(s) to your base set`);
    
    // Ask if they want to apply to all projects now
    const applyNow = await promptUser('Apply these permissions to all projects now? (y/n): ');
    if (applyNow === 'y' || applyNow === 'yes') {
      await applyPermissions(testMode);
    } else {
      logger.info('Run ' + chalk.cyan('cch -ap') + ' to apply these to all projects');
    }
  }
}