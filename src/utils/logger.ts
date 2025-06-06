import chalk from 'chalk';

/**
 * Logger utility for consistent console output
 */
export const logger = {
  info: (message: string) => console.log(chalk.blue('ℹ'), message),
  success: (message: string) => console.log(chalk.green('✓'), message),
  warning: (message: string) => console.log(chalk.yellow('⚠'), message),
  error: (message: string) => console.log(chalk.red('✗'), message),
  debug: (message: string) => console.log(chalk.gray('⋯'), message)
};