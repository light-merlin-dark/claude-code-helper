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
    
    // Check if we should suppress warnings
    const suppressWarnings = await getPreference('permissions.suppressDangerWarnings', false, testMode);
    if (suppressWarnings) {
      return;
    }
    
    // Find dangerous and blocked commands
    const blockedCommands: string[] = [];
    const dangerousCommands: string[] = [];
    
    for (const permission of permissions) {
      if (isBlockedCommand(permission)) {
        blockedCommands.push(permission);
      } else if (isDangerousCommand(permission)) {
        dangerousCommands.push(permission);
      }
    }
    
    // Handle blocked commands (these are never allowed)
    if (blockedCommands.length > 0) {
      console.log('');
      console.log(chalk.red('⛔ DANGER: Your permissions file contains completely blocked commands:'));
      console.log('');
      
      for (const cmd of blockedCommands) {
        console.log(`  ${chalk.red('•')} ${cmd}`);
        console.log(`    ${chalk.gray(getDangerDescription(cmd))}`);
      }
      
      console.log('');
      console.log('These commands are blocked for your safety and will be removed.');
      console.log('');
      
      // Remove blocked commands
      const safePermissions = permissions.filter(p => !isBlockedCommand(p));
      await saveBaseCommands(safePermissions, testMode);
      
      logger.warning(`Removed ${blockedCommands.length} blocked command(s) from your permissions`);
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
      console.log('  2. Keep permissions and don\'t warn again');
      console.log('');
      
      const choice = await promptUser('Choice (1 or 2): ');
      
      if (choice === '1') {
        // Remove dangerous commands
        const safePermissions = permissions.filter(p => !isDangerousCommand(p));
        await saveBaseCommands(safePermissions, testMode);
        logger.success(`Removed ${dangerousCommands.length} dangerous permission(s)`);
      } else if (choice === '2') {
        // Suppress future warnings
        await updatePreference('permissions.suppressDangerWarnings', true, testMode);
        logger.info('Future warnings suppressed. You can re-enable them by editing ~/.cch/preferences.json');
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