/**
 * Blob cleanup command
 * Removes or sanitizes blobs (images, large text) from Claude Code session files
 */

import chalk from 'chalk';
import path from 'path';
import readline from 'readline';
import { BlobRemover, BlobRemovalOptions } from '../../services/blob-remover';
import { SessionParser } from '../../services/session-parser';
import { CacheAnalyzer } from '../../services/cache-analyzer';

export interface CleanBlobsOptions {
  session?: string;
  project?: string;
  images?: boolean;
  largeText?: boolean;
  minSize?: number;
  sanitize?: boolean;
  execute?: boolean;
  force?: boolean;
  testMode?: boolean;
}

export async function cleanBlobs(options: CleanBlobsOptions = {}): Promise<void> {
  try {
    const remover = new BlobRemover();
    const parser = new SessionParser();
    const analyzer = new CacheAnalyzer(options.testMode);

    console.log(chalk.bold.cyan('\n🧹 Claude Code Blob Cleanup\n'));

    // Get sessions to clean
    let sessionsToClean: string[] = [];

    if (options.session) {
      // Clean specific session
      console.log(`Target: Session ${chalk.dim(options.session)}\n`);
      const sessionPath = await findSessionPath(options.session, options.testMode);
      if (!sessionPath) {
        console.error(chalk.red(`❌ Session not found: ${options.session}`));
        process.exit(1);
      }
      sessionsToClean.push(sessionPath);

    } else if (options.project) {
      // Clean all large sessions in project
      console.log(`Target: Project ${chalk.dim(options.project)}\n`);
      const projectPath = await findProjectCachePath(options.project, options.testMode);
      if (!projectPath) {
        console.error(chalk.red(`❌ Project not found: ${options.project}`));
        process.exit(1);
      }
      sessionsToClean = await parser.findLargeSessionsInProject(projectPath, 5);

    } else {
      // Clean all large sessions across all projects
      console.log(`Target: All large sessions (>5MB)\n`);
      const analysis = await analyzer.analyzeCacheStructure();
      const threshold = 5 * 1024 * 1024;
      sessionsToClean = analysis.largestSessions
        .filter(s => s.size > threshold)
        .map(s => s.filePath);
    }

    if (sessionsToClean.length === 0) {
      console.log(chalk.green('✅ No sessions found that need cleanup!'));
      console.log('');
      return;
    }

    // Build removal options
    const removalOptions: BlobRemovalOptions = {
      removeImages: options.images !== false,  // Default true
      removeLargeText: options.largeText !== false,  // Default true
      minBlobSize: options.minSize || 100 * 1024,  // Default 100KB
      sanitize: options.sanitize || false,
      dryRun: !options.execute
    };

    // Show what will be cleaned
    console.log(chalk.bold('━━━ CLEANUP CONFIGURATION ━━━'));
    console.log(`Mode:              ${removalOptions.sanitize ? chalk.yellow('Sanitize (replace with placeholders)') : chalk.red('Remove (delete messages)')}`);
    console.log(`Remove images:     ${removalOptions.removeImages ? chalk.green('Yes') : chalk.dim('No')}`);
    console.log(`Remove large text: ${removalOptions.removeLargeText ? chalk.green('Yes') : chalk.dim('No')}`);
    console.log(`Min blob size:     ${formatBytes(removalOptions.minBlobSize)}`);
    console.log(`Sessions to clean: ${sessionsToClean.length}`);
    console.log(`Dry run:           ${removalOptions.dryRun ? chalk.yellow('Yes (preview only)') : chalk.red('No (will modify files)')}`);
    console.log('');

    // Confirm with user (unless --force)
    if (!removalOptions.dryRun && !options.force) {
      const confirmed = await confirmCleanup(sessionsToClean.length, removalOptions.sanitize);
      if (!confirmed) {
        console.log('Cleanup cancelled.');
        process.exit(0);
      }
    }

    // Clean each session
    console.log(chalk.bold('━━━ CLEANING SESSIONS ━━━\n'));

    const results = [];
    let totalOriginalSize = 0;
    let totalNewSize = 0;
    let totalMessagesRemoved = 0;
    let totalMessagesSanitized = 0;

    for (const sessionPath of sessionsToClean) {
      const sessionName = path.basename(sessionPath).replace('.jsonl', '');
      console.log(chalk.dim(`Processing ${sessionName.slice(0, 36)}...`));

      const result = await remover.removeBlobsFromSession(sessionPath, removalOptions);
      results.push(result);

      if (result.success) {
        totalOriginalSize += result.originalSize;
        totalNewSize += result.newSize;
        totalMessagesRemoved += result.messagesRemoved;
        totalMessagesSanitized += result.messagesSanitized;

        const savings = result.originalSize - result.newSize;
        const savingsPercent = result.originalSize > 0
          ? ((savings / result.originalSize) * 100).toFixed(1)
          : '0.0';

        if (removalOptions.dryRun) {
          console.log(`  ${chalk.yellow('[DRY RUN]')} Would save ${chalk.green(formatBytes(savings))} (${savingsPercent}%)`);
          console.log(`  Messages to ${removalOptions.sanitize ? 'sanitize' : 'remove'}: ${result.messagesRemoved}`);
        } else {
          console.log(`  ${chalk.green('✓')} Saved ${chalk.green(formatBytes(savings))} (${savingsPercent}%)`);
          if (removalOptions.sanitize) {
            console.log(`  Messages sanitized: ${result.messagesSanitized}`);
          } else {
            console.log(`  Messages removed: ${result.messagesRemoved}`);
          }
          if (result.backupPath) {
            console.log(`  Backup: ${chalk.dim(path.basename(result.backupPath))}`);
          }
        }
      } else {
        console.log(`  ${chalk.red('✗')} Failed: ${result.error}`);
      }

      console.log('');
    }

    // Summary
    const successfulResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);
    const totalSavings = totalOriginalSize - totalNewSize;
    const totalSavingsPercent = totalOriginalSize > 0
      ? ((totalSavings / totalOriginalSize) * 100).toFixed(1)
      : '0.0';

    console.log(chalk.bold('━━━ SUMMARY ━━━'));
    console.log(`Sessions processed:       ${results.length}`);
    console.log(`Successful:               ${chalk.green(successfulResults.length.toString())}`);
    if (failedResults.length > 0) {
      console.log(`Failed:                   ${chalk.red(failedResults.length.toString())}`);
    }

    if (removalOptions.sanitize) {
      console.log(`Messages sanitized:       ${totalMessagesSanitized}`);
    } else {
      console.log(`Messages removed:         ${totalMessagesRemoved}`);
    }

    console.log(`Original size:            ${formatBytes(totalOriginalSize)}`);
    console.log(`New size:                 ${formatBytes(totalNewSize)}`);
    console.log(`Space ${removalOptions.dryRun ? 'would be' : ''} saved:         ${chalk.bold.green(formatBytes(totalSavings))} (${totalSavingsPercent}%)`);
    console.log('');

    if (removalOptions.dryRun) {
      console.log(chalk.yellow('💡 This was a dry run. No files were modified.'));
      console.log(chalk.dim('   Run with --execute to apply changes'));
      console.log('');
    } else {
      console.log(chalk.green('✅ Cleanup completed!'));
      console.log(chalk.dim('   Backups created in .backups/ directories'));
      console.log('');
    }

  } catch (error) {
    console.error(chalk.red('\n❌ Error cleaning blobs:'));
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
async function confirmCleanup(sessionCount: number, sanitize: boolean): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    const action = sanitize ? 'sanitize' : 'remove blobs from';
    const question = chalk.yellow(`\n⚠️  About to ${action} ${sessionCount} session file(s). Continue? (y/N): `);

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Find session file path by session ID
 */
async function findSessionPath(sessionId: string, testMode: boolean = false): Promise<string | null> {
  const analyzer = new CacheAnalyzer(testMode);
  const analysis = await analyzer.analyzeCacheStructure();

  for (const project of analysis.projects) {
    for (const session of project.sessions) {
      if (session.sessionId === sessionId || session.sessionId.startsWith(sessionId)) {
        return session.filePath;
      }
    }
  }

  return null;
}

/**
 * Find project cache path by project name
 */
async function findProjectCachePath(projectName: string, testMode: boolean = false): Promise<string | null> {
  const analyzer = new CacheAnalyzer(testMode);
  const analysis = await analyzer.analyzeCacheStructure();

  const project = analysis.projects.find(p =>
    p.projectName === projectName ||
    p.projectName.toLowerCase() === projectName.toLowerCase()
  );

  return project ? project.cachePath : null;
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
