/**
 * Cache cleanup command
 * Safely clean Claude Code cache with multiple strategies
 */

import chalk from 'chalk';
import { CacheCleaner, CleanupItem } from '../../services/cache-cleaner';
import { CacheAnalyzer } from '../../services/cache-analyzer';
import readline from 'readline';

export interface CleanCacheOptions {
  orphaned?: boolean;
  stale?: number;
  large?: boolean;
  threshold?: number;
  debug?: boolean;
  empty?: boolean;
  all?: boolean;
  execute?: boolean;
  force?: boolean;
  testMode?: boolean;
}

export async function cleanCache(options: CleanCacheOptions = {}): Promise<void> {
  try {
    const cleaner = new CacheCleaner(options.testMode);
    const analyzer = new CacheAnalyzer(options.testMode);

    console.log(chalk.bold.cyan('\n🧹 Claude Code Cache Cleanup\n'));

    // Build cleanup options
    const cleanOptions = {
      orphanedProjects: options.orphaned || options.all,
      staleDays: options.stale,
      largeSessions: options.large || options.all,
      sessionThresholdMB: options.threshold || 10,
      oldDebugLogs: options.debug || options.all,
      emptyFiles: options.empty || options.all,
      dryRun: !options.execute,
      force: options.force
    };

    // Get cleanup plan
    const result = await cleaner.cleanCache(cleanOptions);

    if (cleanOptions.dryRun) {
      // Display dry-run preview
      console.log(chalk.bold.yellow('🔍 DRY RUN - Preview of changes\n'));

      if (result.itemsRemoved.length === 0) {
        console.log(chalk.green('✅ No items found for cleanup!'));
        console.log('');
        return;
      }

      console.log(chalk.bold('Items to be removed:\n'));

      // Group by safety level
      const safeItems = result.itemsRemoved.filter((i: CleanupItem) => i.safety === 'safe');
      const cautionItems = result.itemsRemoved.filter((i: CleanupItem) => i.safety === 'caution');
      const riskyItems = result.itemsRemoved.filter((i: CleanupItem) => i.safety === 'risky');

      if (safeItems.length > 0) {
        console.log(chalk.green.bold(`✓ SAFE (${safeItems.length} items):`));
        safeItems.slice(0, 5).forEach((item: CleanupItem) => {
          console.log(`  ${item.type.padEnd(10)} ${analyzer.formatBytes(item.size).padStart(10)} - ${chalk.dim(item.reason)}`);
        });
        if (safeItems.length > 5) {
          console.log(chalk.dim(`  ... and ${safeItems.length - 5} more`));
        }
        console.log('');
      }

      if (cautionItems.length > 0) {
        console.log(chalk.yellow.bold(`⚠️  CAUTION (${cautionItems.length} items):`));
        cautionItems.slice(0, 5).forEach((item: CleanupItem) => {
          console.log(`  ${item.type.padEnd(10)} ${analyzer.formatBytes(item.size).padStart(10)} - ${chalk.dim(item.reason)}`);
        });
        if (cautionItems.length > 5) {
          console.log(chalk.dim(`  ... and ${cautionItems.length - 5} more`));
        }
        console.log('');
      }

      if (riskyItems.length > 0) {
        console.log(chalk.red.bold(`⚠️  RISKY (${riskyItems.length} items):`));
        riskyItems.slice(0, 5).forEach((item: CleanupItem) => {
          console.log(`  ${item.type.padEnd(10)} ${analyzer.formatBytes(item.size).padStart(10)} - ${chalk.dim(item.reason)}`);
        });
        if (riskyItems.length > 5) {
          console.log(chalk.dim(`  ... and ${riskyItems.length - 5} more`));
        }
        console.log('');
      }

      // Summary
      console.log(chalk.bold('━━━ SUMMARY ━━━'));
      console.log(`Projects to remove:      ${result.projectsRemoved}`);
      console.log(`Sessions to remove:      ${result.sessionsRemoved}`);
      if (result.debugLogsRemoved > 0) {
        console.log(`Debug logs to remove:    ${result.debugLogsRemoved}`);
      }
      if (result.emptyFilesRemoved > 0) {
        console.log(`Empty files to remove:   ${result.emptyFilesRemoved}`);
      }
      console.log(`Total space to free:     ${chalk.bold.green(analyzer.formatBytes(result.totalBytesFreed))}`);
      console.log('');

      console.log(chalk.yellow('⚠️  This is a DRY RUN - no changes have been made.'));
      console.log(chalk.dim('To execute cleanup, run with --execute or -e flag'));
      console.log('');

    } else {
      // Execute mode
      if (result.itemsRemoved.length === 0) {
        console.log(chalk.green('✅ No items found for cleanup!'));
        console.log('');
        return;
      }

      // Confirmation
      if (!options.force) {
        const confirmed = await confirmCleanup(result, analyzer);
        if (!confirmed) {
          console.log(chalk.yellow('\n❌ Cleanup cancelled.'));
          return;
        }
      }

      console.log(chalk.bold.green('\n✅ Cache cleanup completed!\n'));
      console.log(chalk.bold('━━━ RESULTS ━━━'));
      console.log(`Projects removed:        ${result.projectsRemoved}`);
      console.log(`Sessions removed:        ${result.sessionsRemoved}`);
      if (result.debugLogsRemoved > 0) {
        console.log(`Debug logs removed:      ${result.debugLogsRemoved}`);
      }
      if (result.emptyFilesRemoved > 0) {
        console.log(`Empty files removed:     ${result.emptyFilesRemoved}`);
      }
      console.log(`Total space freed:       ${chalk.bold.green(analyzer.formatBytes(result.totalBytesFreed))}`);
      console.log('');
      console.log(chalk.dim('💡 Removed items have been moved to ~/.claude/.trash'));
      console.log('');
    }

  } catch (error) {
    console.error(chalk.red('\n❌ Error during cache cleanup:'));
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    } else {
      console.error(chalk.red('Unknown error occurred'));
    }
    process.exit(1);
  }
}

/**
 * Confirm cleanup with user
 */
async function confirmCleanup(result: any, analyzer: CacheAnalyzer): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    console.log(chalk.bold.yellow('\n⚠️  CONFIRMATION REQUIRED\n'));
    console.log(`About to remove ${result.projectsRemoved + result.sessionsRemoved} items`);
    console.log(`Total space to free: ${chalk.bold(analyzer.formatBytes(result.totalBytesFreed))}`);
    console.log('');

    rl.question(chalk.bold('Do you want to proceed? (yes/no): '), (answer) => {
      rl.close();
      const confirmed = answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y';
      resolve(confirmed);
    });
  });
}
