import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { loadClaudeConfig, loadBaseCommands } from '../../core/config';
import { getConfigPath, getBaseCommandsPath, getBackupsDir } from '../../core/paths';
import { logger } from '../../utils/logger';
import { ConfigNotFoundError } from '../../shared/errors';

/**
 * View current configuration and file paths
 */

export async function showConfig(testMode: boolean = false): Promise<void> {
  const configPath = getConfigPath(testMode);
  const permissionsPath = getBaseCommandsPath(testMode);
  const backupsDir = getBackupsDir(testMode);
  
  try {
    const config = await loadClaudeConfig(testMode);
    const permissions = await loadBaseCommands(testMode);
    
    console.log(chalk.cyan('\nClaude Code Helper Configuration\n'));
    
    // Show permissions
    console.log(chalk.green('Permissions:'));
    if (permissions.length === 0) {
      console.log(chalk.gray('  (none configured)'));
    } else {
      permissions.forEach((perm, index) => {
        console.log(`  ${chalk.gray(`${index + 1}.`)} ${perm}`);
      });
    }
    
    // Show project count
    console.log('\n' + chalk.green('Projects:'));
    const projectCount = config.projects ? Object.keys(config.projects).length : 0;
    console.log(`  Total projects configured: ${chalk.yellow(projectCount)}`);
    
    // Show file paths
    console.log('\n' + chalk.green('Configuration Files:'));
    console.log(`  Permissions:   ${chalk.gray(permissionsPath)}`);
    console.log(`  Claude Config: ${chalk.gray(configPath)}`);
    console.log(`  Backups:       ${chalk.gray(backupsDir)}`);
    console.log(`  Preferences:   ${chalk.gray(path.join(path.dirname(permissionsPath), 'preferences.json'))}`);
    
    // Show backup files if any exist
    if (fs.existsSync(backupsDir)) {
      const backupFiles = fs.readdirSync(backupsDir).filter(f => f.endsWith('.json'));
      if (backupFiles.length > 0) {
        console.log('\n' + chalk.green('Available Backups:'));
        backupFiles.forEach(file => {
          const backupPath = path.join(backupsDir, file);
          const stats = fs.statSync(backupPath);
          const date = stats.mtime.toLocaleDateString();
          console.log(`  ${chalk.yellow(file)} ${chalk.gray(`(${date})`)}`);
          console.log(`    ${chalk.gray(backupPath)}`);
        });
      }
    }
  } catch (error) {
    if (error instanceof ConfigNotFoundError) {
      logger.warning('Claude config not found');
      console.log(`\nExpected location: ${chalk.gray(configPath)}`);
    } else {
      throw error;
    }
  }
}