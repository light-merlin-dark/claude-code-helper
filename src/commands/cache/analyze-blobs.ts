/**
 * Blob analysis command
 * Analyzes Claude Code session files for blobs (images, large text)
 */

import chalk from 'chalk';
import path from 'path';
import { SessionParser } from '../../services/session-parser';
import { CacheAnalyzer } from '../../services/cache-analyzer';

export interface AnalyzeBlobsOptions {
  session?: string;
  project?: string;
  minSize?: number;
  testMode?: boolean;
}

export async function analyzeBlobs(options: AnalyzeBlobsOptions = {}): Promise<void> {
  try {
    const parser = new SessionParser();
    const analyzer = new CacheAnalyzer(options.testMode);

    console.log(chalk.bold.cyan('\n🔍 Claude Code Blob Analysis\n'));

    // Get sessions to analyze
    let sessionsToAnalyze: string[] = [];

    if (options.session) {
      // Analyze specific session
      console.log(`Analyzing session: ${chalk.dim(options.session)}\n`);
      const sessionPath = await findSessionPath(options.session, options.testMode);
      if (!sessionPath) {
        console.error(chalk.red(`❌ Session not found: ${options.session}`));
        process.exit(1);
      }
      sessionsToAnalyze.push(sessionPath);

    } else if (options.project) {
      // Analyze all large sessions in project
      console.log(`Analyzing project: ${chalk.dim(options.project)}\n`);
      const projectPath = await findProjectCachePath(options.project, options.testMode);
      if (!projectPath) {
        console.error(chalk.red(`❌ Project not found: ${options.project}`));
        process.exit(1);
      }
      sessionsToAnalyze = await parser.findLargeSessionsInProject(projectPath, (options.minSize || 5) / 1024);

    } else {
      // Analyze all sessions >minSize across all projects
      console.log(`Analyzing all large sessions (>${(options.minSize || 5)}MB)...\n`);
      const analysis = await analyzer.analyzeCacheStructure();
      const threshold = (options.minSize || 5) * 1024 * 1024;
      sessionsToAnalyze = analysis.largestSessions
        .filter(s => s.size > threshold)
        .map(s => s.filePath);
    }

    if (sessionsToAnalyze.length === 0) {
      console.log(chalk.green('✅ No large sessions found!'));
      console.log('');
      return;
    }

    console.log(`Found ${sessionsToAnalyze.length} session(s) to analyze...\n`);

    // Analyze each session
    const results = [];
    for (const sessionPath of sessionsToAnalyze) {
      try {
        console.log(chalk.dim(`Analyzing ${path.basename(sessionPath)}...`));
        const result = await parser.analyzeSessionBlobs(sessionPath);
        results.push(result);
      } catch (error) {
        console.warn(chalk.yellow(`  ⚠️  Failed: ${error instanceof Error ? error.message : 'unknown error'}`));
      }
    }

    console.log('');

    // Display results
    if (results.length === 0) {
      console.log(chalk.yellow('⚠️  No sessions could be analyzed'));
      return;
    }

    // Sort by blob percentage (highest first)
    results.sort((a, b) => b.blobPercentage - a.blobPercentage);

    console.log(chalk.bold('━━━ BLOB ANALYSIS RESULTS ━━━\n'));

    let totalSavings = 0;
    let sessionsWithBlobs = 0;

    results.forEach((result, index) => {
      const sessionName = path.basename(result.sessionFilePath).replace('.jsonl', '');
      const hasBlobs = result.messagesWithBlobs.length > 0;

      if (hasBlobs) {
        sessionsWithBlobs++;
        totalSavings += result.potentialSavings;

        console.log(chalk.bold(`${index + 1}. ${sessionName.slice(0, 36)}...`));
        console.log(`   Total Size:          ${analyzer.formatBytes(result.totalSize)}`);
        console.log(`   Messages:            ${result.totalMessages}`);
        console.log(`   Messages with blobs: ${result.messagesWithBlobs.length}`);
        console.log(`   Blob content:        ${analyzer.formatBytes(result.potentialSavings)} (${result.blobPercentage.toFixed(1)}%)`);

        // Show blob breakdown
        if (result.messagesWithBlobs.length > 0) {
          const imageBlobs = result.messagesWithBlobs.filter(b => b.blobType === 'image');
          const textBlobs = result.messagesWithBlobs.filter(b => b.blobType === 'large-text');

          if (imageBlobs.length > 0) {
            const totalImageSize = imageBlobs.reduce((sum, b) => sum + b.blobSize, 0);
            const totalImages = imageBlobs.reduce((sum, b) => b.blobCount, 0);
            console.log(`   └─ Images:           ${totalImages} image(s) in ${imageBlobs.length} message(s) - ${analyzer.formatBytes(totalImageSize)}`);
          }

          if (textBlobs.length > 0) {
            const totalTextSize = textBlobs.reduce((sum, b) => sum + b.blobSize, 0);
            console.log(`   └─ Large text:       ${textBlobs.length} message(s) - ${analyzer.formatBytes(totalTextSize)}`);
          }

          // Show safety
          const safeBlobs = result.messagesWithBlobs.filter(b => b.safetyLevel === 'safe');
          const cautionBlobs = result.messagesWithBlobs.filter(b => b.safetyLevel === 'caution');

          if (safeBlobs.length > 0) {
            console.log(`   └─ ${chalk.green('Safe to remove:')}   ${safeBlobs.length} message(s) (>7 days old)`);
          }
          if (cautionBlobs.length > 0) {
            console.log(`   └─ ${chalk.yellow('Caution:')}          ${cautionBlobs.length} message(s) (recent or no timestamp)`);
          }
        }

        console.log('');
      }
    });

    // Summary
    console.log(chalk.bold('━━━ SUMMARY ━━━'));
    console.log(`Sessions analyzed:        ${results.length}`);
    console.log(`Sessions with blobs:      ${sessionsWithBlobs}`);
    console.log(`Total potential savings:  ${chalk.bold.green(analyzer.formatBytes(totalSavings))}`);
    console.log('');

    if (sessionsWithBlobs > 0) {
      console.log(chalk.dim('Next steps:'));
      console.log(chalk.dim('  • Run `cch blob clean` to preview blob removal'));
      console.log(chalk.dim('  • Run `cch blob clean --execute` to remove blobs'));
      console.log(chalk.dim('  • Use `--sanitize` to replace blobs with placeholders'));
    }
    console.log('');

  } catch (error) {
    console.error(chalk.red('\n❌ Error analyzing blobs:'));
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    } else {
      console.error(chalk.red('Unknown error occurred'));
    }
    process.exit(1);
  }
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
