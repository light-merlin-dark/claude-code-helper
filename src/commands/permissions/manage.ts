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
    logger.warning('No base commands configured');
    return;
  }

  console.log(chalk.cyan('Base Commands:'));
  commands.forEach((cmd, index) => {
    console.log(`  ${chalk.gray(`${index + 1}.`)} ${cmd}`);
  });
}

export async function addCommand(command: string, testMode: boolean = false): Promise<void> {
  const commands = await loadBaseCommands(testMode);

  let normalizedCommand = command;
  if (command.startsWith('Bash(') && command.endsWith(')')) {
    normalizedCommand = command.slice(5, -1);
  }

  let formattedCommand = normalizedCommand;
  if (!normalizedCommand.includes(':') && !normalizedCommand.includes(' ')) {
    formattedCommand = `${normalizedCommand}:*`;
  }

  if (commands.includes(formattedCommand)) {
    logger.warning(`Command already exists: ${formattedCommand}`);
    return;
  }

  commands.push(formattedCommand);
  await saveBaseCommands(commands, testMode);
  logger.success(`Added command: ${formattedCommand}`);
}

export async function removeCommand(index: number, force: boolean = false, testMode: boolean = false): Promise<void> {
  const commands = await loadBaseCommands(testMode);

  if (index < 1 || index > commands.length) {
    throw new InvalidCommandError(
      `Invalid command number: ${index}. Use 'cch -lc' to see available commands.`
    );
  }

  const commandToRemove = commands[index - 1];

  if (!force) {
    logger.warning(`Remove command: ${commandToRemove}`);
    logger.info(chalk.gray('Use --force to confirm removal'));
    return;
  }

  commands.splice(index - 1, 1);
  await saveBaseCommands(commands, testMode);
  logger.success(`Removed command: ${commandToRemove}`);
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