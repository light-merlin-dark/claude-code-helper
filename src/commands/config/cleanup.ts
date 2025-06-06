import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { logger } from '../../utils/logger';
import { promptUser } from '../../utils/prompt';

/**
 * Delete all Claude Code Helper data
 */

export async function deleteData(testMode: boolean = false): Promise<void> {
  const baseDir = testMode 
    ? path.join(__dirname, '../../../tests/data/.cch')
    : path.join(process.env.HOME || '', '.cch');
  
  // Check if directory exists
  if (!fs.existsSync(baseDir)) {
    logger.warning('No Claude Code Helper data found to delete');
    return;
  }
  
  // Show warning
  console.log('');
  console.log(chalk.red('⚠️  WARNING: This will delete all Claude Code Helper data'));
  console.log('');
  console.log('This includes:');
  console.log('  • Base commands configuration');
  console.log('  • All backup files');
  console.log('');
  console.log(chalk.green('Note: Your Claude config (~/.claude.json) will be preserved'));
  console.log('');
  
  // In test mode, don't require confirmation
  if (testMode) {
    await performDelete(baseDir);
    return;
  }
  
  // Require explicit confirmation
  const confirmation = await promptUser("Are you sure? Type 'yes' to confirm: ");
  
  if (confirmation !== 'yes') {
    logger.info('Delete operation cancelled');
    return;
  }
  
  await performDelete(baseDir);
}

async function performDelete(baseDir: string): Promise<void> {
  try {
    // Get stats before deletion for reporting
    let fileCount = 0;
    let backupCount = 0;
    
    const backupsDir = path.join(baseDir, 'backups');
    if (fs.existsSync(backupsDir)) {
      const backupFiles = fs.readdirSync(backupsDir);
      backupCount = backupFiles.filter(f => f.endsWith('.json')).length;
    }
    
    const baseCommandsPath = path.join(baseDir, 'base-commands.json');
    if (fs.existsSync(baseCommandsPath)) {
      fileCount++;
    }
    
    // Delete the entire directory
    fs.rmSync(baseDir, { recursive: true, force: true });
    
    logger.success('All Claude Code Helper data has been deleted');
    
    if (fileCount > 0 || backupCount > 0) {
      const items = [];
      if (fileCount > 0) items.push('base commands');
      if (backupCount > 0) items.push(`${backupCount} backup file(s)`);
      logger.info(`  Removed: ${items.join(' and ')}`);
    }
    
    console.log('');
    logger.info('To start fresh, just run any cch command');
  } catch (error) {
    logger.error('Failed to delete data: ' + error);
    throw error;
  }
}