import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { logger } from '../../utils/logger';

/**
 * Show version history and changelog
 */

export async function showChangelog(): Promise<void> {
  // In production, CHANGELOG.md is at the package root
  // In development, it's at the project root
  let changelogPath = path.join(__dirname, '../../../CHANGELOG.md');
  
  // If not found in development location, try production location
  if (!fs.existsSync(changelogPath)) {
    // Go up from dist/commands/config to package root
    changelogPath = path.join(__dirname, '../../CHANGELOG.md');
  }
  
  if (!fs.existsSync(changelogPath)) {
    logger.warning('Changelog file not found');
    return;
  }
  
  const content = fs.readFileSync(changelogPath, 'utf8');
  const lines = content.split('\n');
  
  console.log(chalk.cyan('\nClaude Code Helper - Recent Changes\n'));
  
  // Parse and display changelog entries (show first 3 versions)
  let versionCount = 0;
  let inVersion = false;
  
  for (const line of lines) {
    if (line.startsWith('## [')) {
      versionCount++;
      if (versionCount > 3) break;
      inVersion = true;
      const versionMatch = line.match(/## \[([^\]]+)\] - (.+)/);
      if (versionMatch) {
        console.log(chalk.yellow(`v${versionMatch[1]}`) + chalk.gray(` (${versionMatch[2]})`));
      }
    } else if (inVersion && line.startsWith('### ')) {
      console.log('\n' + chalk.green(line.substring(4)));
    } else if (inVersion && line.startsWith('- ')) {
      console.log('  ' + line);
    } else if (inVersion && line.trim() === '') {
      console.log('');
    }
  }
  
  console.log('\n' + chalk.gray('View full changelog at: https://github.com/light-merlin-dark/claude-code-helper/releases'));
}