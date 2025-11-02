/**
 * Cache analysis command
 * Analyzes Claude Code cache usage and identifies cleanup opportunities
 */

import chalk from 'chalk';
import { CacheAnalyzer } from '../../services/cache-analyzer';

export interface AnalyzeCacheOptions {
  project?: string;
  detailed?: boolean;
  testMode?: boolean;
}

export async function analyzeCache(options: AnalyzeCacheOptions = {}): Promise<void> {
  try {
    console.log(chalk.bold.cyan('\n📊 Claude Code Cache Analysis\n'));
    console.log('Analyzing cache structure...\n');

    const analyzer = new CacheAnalyzer(options.testMode);
    const analysis = await analyzer.analyzeCacheStructure();

    // Display Overview
    console.log(chalk.bold('━━━ OVERVIEW ━━━'));
    console.log(`Cache Directory: ${chalk.dim(analysis.overview.cacheDir)}`);
    console.log(`Total Size:      ${chalk.bold(analyzer.formatBytes(analysis.overview.totalSize))}`);
    console.log(`Projects:        ${analysis.overview.totalProjects}`);
    console.log(`Sessions:        ${analysis.overview.totalSessions}`);
    if (analysis.overview.oldestSession && analysis.overview.newestSession) {
      console.log(`Age Range:       ${analyzer.formatDate(analysis.overview.oldestSession)} → ${analyzer.formatDate(analysis.overview.newestSession)}`);
    }
    console.log('');

    // Display Cache Breakdown
    console.log(chalk.bold('━━━ CACHE BREAKDOWN ━━━'));
    const components = [
      { name: 'Project Sessions', size: analysis.projects.reduce((sum, p) => sum + p.totalSize, 0), count: `${analysis.overview.totalSessions} sessions` },
      { name: 'File History', size: analysis.fileHistory.totalSize, count: `${analysis.fileHistory.fileCount} files` },
      { name: 'Debug Logs', size: analysis.debug.totalSize, count: `${analysis.debug.logCount} logs` },
      { name: 'Shell Snapshots', size: analysis.shellSnapshots.totalSize, count: `${analysis.shellSnapshots.fileCount} files` },
      { name: 'Todos', size: analysis.todos.totalSize, count: `${analysis.todos.fileCount} files` },
      { name: 'Session Env', size: analysis.sessionEnv.totalSize, count: `${analysis.sessionEnv.fileCount} files` },
      { name: 'History', size: analysis.history?.size || 0, count: analysis.history ? `${analysis.history.lineCount} lines` : 'N/A' }
    ];

    // Sort by size
    components.sort((a, b) => b.size - a.size);

    components.forEach(component => {
      const percentage = ((component.size / analysis.overview.totalSize) * 100).toFixed(1);
      const bar = createBar(component.size, analysis.overview.totalSize, 30);
      console.log(`${component.name.padEnd(20)} ${bar} ${analyzer.formatBytes(component.size).padStart(10)} (${percentage}%) - ${chalk.dim(component.count)}`);
    });
    console.log('');

    // Display Top Projects by Size
    console.log(chalk.bold('━━━ TOP 10 PROJECTS BY SIZE ━━━'));
    analysis.projects.slice(0, 10).forEach((project, index) => {
      const status = project.isActive ? chalk.green('[ACTIVE]') :
                     project.isOrphaned ? chalk.red('[ORPHANED]') : '';
      const percentage = ((project.totalSize / analysis.overview.totalSize) * 100).toFixed(1);
      console.log(`${(index + 1).toString().padStart(2)}. ${project.projectName.padEnd(30)} ${analyzer.formatBytes(project.totalSize).padStart(10)} (${percentage}%) - ${project.sessions.length} sessions ${status}`);
    });
    console.log('');

    // Display Largest Sessions
    if (analysis.largestSessions.length > 0) {
      console.log(chalk.bold('━━━ LARGEST SESSION FILES ━━━'));
      analysis.largestSessions.slice(0, 5).forEach((session, index) => {
        const age = getAge(session.modified);
        console.log(`${(index + 1).toString().padStart(2)}. ${session.project}/${session.sessionId.slice(0, 8)}... - ${analyzer.formatBytes(session.size).padStart(10)} ${chalk.dim(`(${age})`)}`);
      });
      console.log('');
    }

    // Display Issues
    if (analysis.orphanedProjects.length > 0 || analysis.staleProjects.length > 0) {
      console.log(chalk.bold.yellow('━━━ ISSUES FOUND ━━━'));

      if (analysis.orphanedProjects.length > 0) {
        const totalSize = analysis.orphanedProjects.reduce((sum, p) => sum + p.totalSize, 0);
        console.log(chalk.yellow(`⚠️  ${analysis.orphanedProjects.length} orphaned projects (${analyzer.formatBytes(totalSize)})`));
        if (options.detailed) {
          analysis.orphanedProjects.forEach(project => {
            console.log(`    ${project.projectName} - ${chalk.dim(project.projectPath)}`);
          });
        }
      }

      if (analysis.staleProjects.length > 0) {
        const totalSize = analysis.staleProjects.reduce((sum, p) => sum + p.totalSize, 0);
        console.log(chalk.yellow(`⚠️  ${analysis.staleProjects.length} stale projects (not accessed in 60+ days, ${analyzer.formatBytes(totalSize)})`));
        if (options.detailed) {
          analysis.staleProjects.forEach(project => {
            console.log(`    ${project.projectName} - last accessed ${analyzer.formatDate(project.lastAccessed)}`);
          });
        }
      }

      if (analysis.sessionEnv.emptyFileCount > 0) {
        console.log(chalk.yellow(`⚠️  ${analysis.sessionEnv.emptyFileCount} empty session-env files`));
      }

      console.log('');
    }

    // Display Recommendations
    if (analysis.recommendations.length > 0) {
      console.log(chalk.bold.green('━━━ RECOMMENDATIONS ━━━\n'));
      analysis.recommendations.forEach((rec, index) => {
        const icon = rec.severity === 'high' ? chalk.red('❗') :
                     rec.severity === 'medium' ? chalk.yellow('⚠️ ') :
                     chalk.blue('ℹ️ ');
        const safety = rec.safetyLevel === 'safe' ? chalk.green('[SAFE]') :
                       rec.safetyLevel === 'caution' ? chalk.yellow('[CAUTION]') :
                       chalk.red('[RISKY]');

        console.log(`${icon} ${rec.description}`);
        console.log(`   Potential savings: ${chalk.bold(analyzer.formatBytes(rec.sizeImpact))} ${safety}`);
        console.log('');
      });

      console.log(chalk.bold.green(`💡 Total potential savings: ${analyzer.formatBytes(analysis.potentialSavings)}\n`));
      console.log(chalk.dim('Next steps:'));
      console.log(chalk.dim('  • Run `cch cache clean --orphaned` to clean orphaned projects (safest)'));
      console.log(chalk.dim('  • Run `cch cache clean --stale 60` to clean old projects'));
      console.log(chalk.dim('  • Run `cch cache clean --all` for comprehensive cleanup'));
      console.log(chalk.dim('  • All commands default to preview mode (--execute to apply changes)'));
    } else {
      console.log(chalk.bold.green('✅ Cache is in good shape! No major issues found.\n'));
    }

  } catch (error) {
    console.error(chalk.red('\n❌ Error analyzing cache:'));
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    } else {
      console.error(chalk.red('Unknown error occurred'));
    }
    process.exit(1);
  }
}

/**
 * Create a visual bar chart
 */
function createBar(value: number, max: number, width: number): string {
  const percentage = max === 0 ? 0 : value / max;
  const filledWidth = Math.round(percentage * width);
  const emptyWidth = width - filledWidth;
  return chalk.cyan('█'.repeat(filledWidth)) + chalk.dim('░'.repeat(emptyWidth));
}

/**
 * Get human-readable age from date
 */
function getAge(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}
