/**
 * Cache stats command
 * Quick cache statistics summary
 */

import chalk from 'chalk';
import { CacheAnalyzer } from '../../services/cache-analyzer';

export interface CacheStatsOptions {
  testMode?: boolean;
}

export async function cacheStats(options: CacheStatsOptions = {}): Promise<void> {
  try {
    const analyzer = new CacheAnalyzer(options.testMode);
    const analysis = await analyzer.analyzeCacheStructure();

    console.log(chalk.bold.cyan('\n📊 Cache Quick Stats\n'));

    // Total size
    const totalSizeFormatted = analyzer.formatBytes(analysis.overview.totalSize);
    console.log(`${chalk.bold('Total Cache Size:')} ${chalk.cyan(totalSizeFormatted)}`);

    // Projects and sessions
    console.log(`${chalk.bold('Projects:')} ${analysis.overview.totalProjects}`);
    console.log(`${chalk.bold('Sessions:')} ${analysis.overview.totalSessions}`);

    // Top components
    const components = [
      { name: 'Projects', size: analysis.projects.reduce((sum, p) => sum + p.totalSize, 0) },
      { name: 'File History', size: analysis.fileHistory.totalSize },
      { name: 'Debug Logs', size: analysis.debug.totalSize },
      { name: 'Shell Snapshots', size: analysis.shellSnapshots.totalSize }
    ].filter(c => c.size > 0).sort((a, b) => b.size - a.size);

    if (components.length > 0) {
      console.log('');
      console.log(chalk.bold('Top Components:'));
      components.slice(0, 3).forEach((component, index) => {
        console.log(`  ${index + 1}. ${component.name}: ${analyzer.formatBytes(component.size)}`);
      });
    }

    // Issues summary
    const issueCount = analysis.orphanedProjects.length + analysis.staleProjects.length +
                       (analysis.sessionEnv.emptyFileCount > 0 ? 1 : 0);

    if (issueCount > 0) {
      console.log('');
      console.log(chalk.yellow.bold(`⚠️  ${issueCount} issue(s) found`));
      if (analysis.orphanedProjects.length > 0) {
        console.log(chalk.yellow(`   • ${analysis.orphanedProjects.length} orphaned projects`));
      }
      if (analysis.staleProjects.length > 0) {
        console.log(chalk.yellow(`   • ${analysis.staleProjects.length} stale projects (60+ days)`));
      }
      if (analysis.sessionEnv.emptyFileCount > 0) {
        console.log(chalk.yellow(`   • ${analysis.sessionEnv.emptyFileCount} empty files`));
      }
    } else {
      console.log('');
      console.log(chalk.green('✅ No issues found'));
    }

    // Potential savings
    if (analysis.potentialSavings > 0) {
      console.log('');
      console.log(chalk.bold(`Potential Savings: ${chalk.green(analyzer.formatBytes(analysis.potentialSavings))}`));
      console.log(chalk.dim('Run `cch cache analyze` for detailed analysis'));
    }

    console.log('');

  } catch (error) {
    console.error(chalk.red('\n❌ Error getting cache stats:'));
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    } else {
      console.error(chalk.red('Unknown error occurred'));
    }
    process.exit(1);
  }
}
