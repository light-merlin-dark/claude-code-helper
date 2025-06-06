import { loadBaseCommands, loadClaudeConfig, saveClaudeConfig } from '../../core/config';
import { logger } from '../../utils/logger';

/**
 * Apply permissions to all projects
 */

export async function ensureCommands(testMode: boolean = false): Promise<void> {
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