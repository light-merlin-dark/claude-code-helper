import chalk from 'chalk';
import { loadBaseCommands, saveBaseCommands } from '../../core/config';
import { logger } from '../../utils/logger';
import { InvalidCommandError } from '../../shared/errors';

/**
 * Permission management - add, remove, list base commands
 */

export async function listCommands(testMode: boolean = false): Promise<void> {
  const commands = await loadBaseCommands(testMode);

  if (commands.length === 0) {
    logger.warning('No permissions configured');
    logger.info('Use "cch -add <permission>" to add your first permission');
    return;
  }

  console.log(chalk.cyan('Your Permissions:'));
  commands.forEach((cmd, index) => {
    console.log(`  ${chalk.gray(`${index + 1}.`)} ${cmd}`);
  });
}

// Re-export from add.ts for backwards compatibility
export { addPermission as addCommand } from './add';

export async function removeCommand(index: number, force: boolean = false, testMode: boolean = false): Promise<void> {
  const commands = await loadBaseCommands(testMode);

  if (index < 1 || index > commands.length) {
    throw new InvalidCommandError(
      `Invalid permission number: ${index}. Use 'cch -lp' to see available permissions.`
    );
  }

  const permissionToRemove = commands[index - 1];

  if (!force) {
    logger.warning(`Remove permission: ${permissionToRemove}`);
    logger.info(chalk.gray('Use --force to confirm removal'));
    return;
  }

  commands.splice(index - 1, 1);
  await saveBaseCommands(commands, testMode);
  logger.success(`Removed permission: ${permissionToRemove}`);
}

export async function normalizeCommands(silent: boolean = false, testMode: boolean = false): Promise<boolean> {
  try {
    const commands = await loadBaseCommands(testMode);
    if (commands.length === 0) {
      return false;
    }

    let modified = false;
    const normalizedCommands = commands.map(cmd => {
      if (cmd.startsWith('Bash(') && cmd.endsWith(')')) {
        const innerCmd = cmd.slice(5, -1);
        modified = true;
        return innerCmd;
      }
      return cmd;
    });

    if (modified) {
      await saveBaseCommands(normalizedCommands, testMode);
      if (!silent) {
        logger.success('Normalized base commands');
      }
    }

    return true;
  } catch (error) {
    if (!silent) {
      logger.error('Error normalizing commands: ' + error);
    }
    return false;
  }
}