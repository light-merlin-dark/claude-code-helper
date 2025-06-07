import chalk from 'chalk';
import { loadBaseCommands, saveBaseCommands } from '../../core/config';
import { 
  isBlockedCommand, 
  isDangerousCommand,
  getDangerDescription 
} from '../../core/guards';
import { getPreference, updatePreference } from '../../core/preferences';
import { promptUser } from '../../utils/prompt';
import { logger } from '../../utils/logger';

/**
 * Check permissions for dangerous commands and handle them
 */
export async function checkPermissionsOnStartup(testMode: boolean = false): Promise<void> {
  try {
    const permissions = await loadBaseCommands(testMode);
    if (permissions.length === 0) {
      return; // No permissions to check
    }
    
    // Check if we should suppress all warnings
    const suppressAllWarnings = await getPreference('permissions.suppressDangerWarnings', false, testMode);
    if (suppressAllWarnings) {
      return;
    }
    
    // Get list of suppressed commands
    const suppressedCommands = await getPreference('permissions.suppressedDangerousCommands', [], testMode) as string[];
    
    // Find dangerous and blocked commands
    const blockedCommands: string[] = [];
    const dangerousCommands: string[] = [];
    
    for (const permission of permissions) {
      if (isBlockedCommand(permission)) {
        blockedCommands.push(permission);
      } else if (isDangerousCommand(permission) && !suppressedCommands.includes(permission)) {
        dangerousCommands.push(permission);
      }
    }
    
    // Handle blocked commands (these are never allowed)
    if (blockedCommands.length > 0) {
      console.log('');
      console.log(chalk.red('⛔ CRITICAL: Your permissions file contains BLOCKED commands:'));
      console.log('');
      
      for (const cmd of blockedCommands) {
        console.log(`  ${chalk.red('•')} ${cmd}`);
        console.log(`    ${chalk.gray(getDangerDescription(cmd))}`);
        
        // Special explanation for wildcard commands
        if (cmd.includes(':*')) {
          const base = cmd.split(':')[0];
          console.log(`    ${chalk.red('→')} This wildcard would allow dangerous commands like: ${chalk.red(base + 'kfs')}`);
        }
      }
      
      console.log('');
      console.log(chalk.red('These commands could cause IRREVERSIBLE damage to your system.'));
      console.log('');
      console.log('Options:');
      console.log('  1. Remove these blocked permissions (STRONGLY recommended)');
      console.log('  2. Exit without changes');
      console.log('');
      
      const choice = await promptUser('Choice (1 or 2): ');
      
      if (choice === '1') {
        // Remove blocked commands
        const safePermissions = permissions.filter(p => !isBlockedCommand(p));
        await saveBaseCommands(safePermissions, testMode);
        logger.success(`Removed ${blockedCommands.length} blocked command(s) from your permissions`);
      } else {
        console.log('');
        logger.error('Cannot continue with blocked commands in permissions file');
        logger.info('Please manually remove these commands from your permissions');
        process.exit(1);
      }
    }
    
    // Handle dangerous commands (require confirmation)
    if (dangerousCommands.length > 0) {
      console.log('');
      console.log(chalk.yellow('⚠️  WARNING: Your permissions file contains potentially dangerous commands:'));
      console.log('');
      
      for (const cmd of dangerousCommands) {
        console.log(`  ${chalk.yellow('•')} ${cmd}`);
        console.log(`    ${chalk.gray(getDangerDescription(cmd))}`);
      }
      
      console.log('');
      console.log('These commands could cause serious damage to your system.');
      console.log('');
      console.log('Options:');
      console.log('  1. Remove these dangerous permissions (recommended)');
      console.log('  2. Keep and don\'t warn again for THESE specific commands');
      console.log('  3. Keep and NEVER warn again for ANY dangerous commands');
      console.log('');
      
      const choice = await promptUser('Choice (1, 2, or 3): ');
      
      if (choice === '1') {
        // Remove dangerous commands
        const safePermissions = permissions.filter(p => !isDangerousCommand(p));
        await saveBaseCommands(safePermissions, testMode);
        logger.success(`Removed ${dangerousCommands.length} dangerous permission(s)`);
      } else if (choice === '2') {
        // Suppress warnings for these specific commands
        const updatedSuppressed = [...suppressedCommands, ...dangerousCommands];
        await updatePreference('permissions.suppressedDangerousCommands', updatedSuppressed, testMode);
        logger.info(`Will no longer warn about: ${dangerousCommands.join(', ')}`);
        logger.info('You can re-enable warnings by editing ~/.cch/preferences.json');
      } else if (choice === '3') {
        // Show strong warning before suppressing all
        console.log('');
        console.log(chalk.red('⚠️  WARNING: This will disable ALL safety warnings!'));
        console.log(chalk.red('You will NOT be warned about ANY dangerous commands in the future.'));
        console.log('');
        const confirm = await promptUser('Are you SURE you want to disable all safety warnings? (yes/no): ');
        
        if (confirm.toLowerCase() === 'yes') {
          await updatePreference('permissions.suppressDangerWarnings', true, testMode);
          logger.warning('ALL future safety warnings disabled. You\'re on your own!');
          logger.info('You can re-enable warnings by editing ~/.cch/preferences.json');
        } else {
          logger.info('Safety warnings remain enabled');
        }
      } else {
        logger.info('No changes made. You will be warned again next time.');
      }
      
      console.log('');
    }
  } catch (error) {
    // Don't fail the entire CLI if permission checking fails
    logger.debug('Error checking permissions: ' + error);
  }
}