import path from 'path';
import chalk from 'chalk';
import { loadClaudeConfig, loadBaseCommands, saveBaseCommands } from '../../core/config';
import { logger } from '../../utils/logger';
import { promptUser } from '../../utils/prompt';
import { ensureCommands } from './apply';

interface CommandFrequency {
  command: string;
  count: number;
  projects: string[];
}

/**
 * Discover and suggest commonly used commands across projects
 */

export async function suggestCommands(testMode: boolean = false): Promise<void> {
  const config = await loadClaudeConfig(testMode);
  const baseCommands = await loadBaseCommands(testMode);

  if (!config.projects || Object.keys(config.projects).length === 0) {
    logger.warning('No projects found in Claude config');
    return;
  }

  // Count frequency of each command across projects
  const commandMap = new Map<string, CommandFrequency>();
  let totalProjects = 0;

  for (const [projectPath, project] of Object.entries(config.projects)) {
    totalProjects++;
    const seenInProject = new Set<string>();

    for (const cmd of project.allowedTools || []) {
      // Normalize command (remove Bash() wrapper)
      const normalizedCmd = cmd.startsWith('Bash(') && cmd.endsWith(')') 
        ? cmd.slice(5, -1) 
        : cmd;
      
      // Skip if already in base commands
      if (baseCommands.includes(normalizedCmd)) continue;
      
      // Skip if we've already seen this command in this project
      if (seenInProject.has(normalizedCmd)) continue;
      seenInProject.add(normalizedCmd);

      // Update frequency map
      if (!commandMap.has(normalizedCmd)) {
        commandMap.set(normalizedCmd, { 
          command: normalizedCmd, 
          count: 0, 
          projects: [] 
        });
      }
      const freq = commandMap.get(normalizedCmd)!;
      freq.count++;
      freq.projects.push(path.basename(projectPath));
    }
  }

  // Sort by frequency and filter
  const suggestions = Array.from(commandMap.values())
    .filter(f => f.count >= 2) // Only suggest if used in 2+ projects
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Limit to top 10 suggestions

  if (suggestions.length === 0) {
    logger.info(`Analyzed ${totalProjects} project(s)`);
    logger.success('No frequently used commands found that aren\'t already in your base set');
    return;
  }

  // Display suggestions
  console.log(chalk.cyan(`\nLooking for commonly used commands across ${totalProjects} projects...\n`));
  console.log(chalk.green(`Found ${suggestions.length} command(s) you use frequently:\n`));

  suggestions.forEach((cmd, idx) => {
    const projectList = cmd.projects.slice(0, 3).join(', ');
    const moreProjects = cmd.projects.length > 3 ? ` (+${cmd.projects.length - 3} more)` : '';
    console.log(`  ${chalk.yellow(`${idx + 1}.`)} ${chalk.white(cmd.command)} ${chalk.gray(`(used in ${cmd.count} projects)`)} ${chalk.gray(`${projectList}${moreProjects}`)}`);
  });

  console.log('\n' + chalk.cyan('Select commands to add:'));
  console.log(`  ${chalk.gray('[a]')} Add all`);
  console.log(`  ${chalk.gray('[1-' + suggestions.length + ']')} Add specific (comma-separated)`);
  console.log(`  ${chalk.gray('[n]')} Skip\n`);

  const answer = await promptUser('Your choice: ');

  if (answer === 'n' || answer === 'skip' || answer === '') {
    logger.info('Skipped adding commands');
    return;
  }

  let commandsToAdd: CommandFrequency[] = [];

  if (answer === 'a' || answer === 'all') {
    commandsToAdd = suggestions;
  } else {
    // Parse comma-separated numbers
    const indices = answer.split(',')
      .map(s => parseInt(s.trim(), 10) - 1)
      .filter(i => i >= 0 && i < suggestions.length);
    
    if (indices.length === 0) {
      logger.warning('No valid selections made');
      return;
    }

    commandsToAdd = indices.map(i => suggestions[i]);
  }

  // Add selected commands
  const commands = await loadBaseCommands(testMode);
  let addedCount = 0;

  for (const cmd of commandsToAdd) {
    if (!commands.includes(cmd.command)) {
      commands.push(cmd.command);
      logger.success(`Added: ${cmd.command}`);
      addedCount++;
    }
  }

  if (addedCount > 0) {
    await saveBaseCommands(commands, testMode);
    console.log('');
    logger.success(`Added ${addedCount} command(s) to your base set`);
    
    // Ask if they want to apply to all projects now
    const applyNow = await promptUser('Apply these commands to all projects now? (y/n): ');
    if (applyNow === 'y' || applyNow === 'yes') {
      await ensureCommands(testMode);
    } else {
      logger.info('Run ' + chalk.cyan('cch -ec') + ' to apply these to all projects');
    }
  }
}