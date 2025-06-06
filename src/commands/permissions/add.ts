import chalk from 'chalk';
import { loadBaseCommands, saveBaseCommands } from '../../core/config';
import { logger } from '../../utils/logger';
import { promptUser } from '../../utils/prompt';
import { normalizePermission } from '../../core/permissions';
import { smartExpand, getExpansionMessage } from '../../utils/expansion';
import { checkCommandSafety, PermissionSafety, getDangerDescription } from '../../core/guards';
import { getPreference } from '../../core/preferences';
import { applyPermissions } from './apply';

/**
 * Add a new permission with safety checks and smart expansion
 */
export async function addPermission(
  permission: string, 
  testMode: boolean = false,
  skipApply: boolean = false
): Promise<void> {
  const permissions = await loadBaseCommands(testMode);
  
  // Normalize the input (remove Bash wrapper if present)
  const normalized = normalizePermission(permission);
  
  // Apply smart expansion
  const { expanded, wasExpanded } = smartExpand(normalized);
  
  // Check if it already exists
  if (permissions.includes(expanded)) {
    logger.warning(`Permission already exists: ${expanded}`);
    return;
  }
  
  // Safety check
  const safety = checkCommandSafety(expanded);
  
  if (safety.safety === PermissionSafety.BLOCKED) {
    logger.error(`⛔ BLOCKED: "${expanded}"`);
    logger.error(safety.reason || 'This command is not allowed for safety reasons');
    return;
  }
  
  if (safety.safety === PermissionSafety.DANGEROUS) {
    console.log('');
    console.log(chalk.yellow(`⚠️  WARNING: "${expanded}" is a potentially dangerous permission`));
    console.log('');
    console.log(getDangerDescription(expanded));
    console.log('');
    console.log('Are you sure you want to grant Claude permission to use this command?');
    
    const answer = await promptUser('Type "yes" to confirm, or press Enter to cancel: ');
    
    if (answer.toLowerCase() !== 'yes') {
      logger.info('Permission not added');
      return;
    }
  }
  
  // Add the permission
  permissions.push(expanded);
  await saveBaseCommands(permissions, testMode);
  
  // Show expansion message if applicable
  if (wasExpanded) {
    logger.info(getExpansionMessage(normalized, expanded) || '');
  }
  
  logger.success(`Added permission: ${expanded}`);
  
  // Check if we should auto-apply
  if (!skipApply) {
    const autoApply = await getPreference('permissions.autoApply', true, testMode);
    
    if (autoApply) {
      console.log('');
      logger.info('Applying permission to all projects...');
      await applyPermissions(testMode, false);
    } else {
      logger.info(`Run ${chalk.cyan('cch -ap')} to apply this permission to all projects`);
    }
  }
}