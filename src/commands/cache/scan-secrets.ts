/**
 * Cache secret scanning command
 * Scans Claude Code cache for exposed secrets
 */

import chalk from 'chalk';
import * as os from 'os';
import { SecretDetector } from '../../services/secret-detector';

export interface ScanSecretsOptions {
  testMode?: boolean;
}

export async function scanCacheSecrets(options: ScanSecretsOptions = {}): Promise<void> {
  try {
    console.log(chalk.cyan.bold('\n🔐 Claude Code Cache Secret Scan\n'));

    const detector = new SecretDetector();

    const result = await detector.scanCache({
      progressCallback: (p) => {
        // Create progress bar
        const barWidth = 20;
        const filled = Math.floor((p.percentage / 100) * barWidth);
        const empty = barWidth - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);

        // Format: [████████░░] Sessions: 1234/2358 (52%)
        const progressMsg = `[${bar}] ${p.stage}: ${p.current}/${p.total} (${p.percentage}%)`;

        // Overwrite current line
        process.stdout.write(`\r${progressMsg}`);

        // Add newline when stage completes
        if (p.current === p.total) {
          process.stdout.write('\n');
        }
      }
    });

    // Display results
    if (result.totalSecrets === 0) {
      console.log(chalk.green.bold('✅ No secrets found in cache!\n'));
      return;
    }

    console.log(chalk.red.bold('⚠️  SECRETS DETECTED\n'));
    console.log(`Total secrets found: ${chalk.red.bold(result.totalSecrets)}`);
    console.log(`High confidence: ${chalk.red.bold(result.highConfidenceCount)}`);
    console.log('');

    // Breakdown by location
    console.log(chalk.cyan('Breakdown by location:'));
    if (result.locationBreakdown.sessions > 0) {
      console.log(`  💬 Session files: ${result.locationBreakdown.sessions}`);
    }
    if (result.locationBreakdown.shellSnapshots > 0) {
      console.log(`  🐚 Shell snapshots: ${result.locationBreakdown.shellSnapshots}`);
    }
    if (result.locationBreakdown.debugLogs > 0) {
      console.log(`  🐛 Debug logs: ${result.locationBreakdown.debugLogs}`);
    }
    if (result.locationBreakdown.fileHistory > 0) {
      console.log(`  📝 File history: ${result.locationBreakdown.fileHistory}`);
    }
    console.log('');

    // Show top 10 secret locations
    console.log(chalk.cyan.bold('Top secret locations:\n'));
    result.results
      .sort((a, b) => b.secrets.length - a.secrets.length)
      .slice(0, 10)
      .forEach((r, i) => {
        const locationShort = r.location.replace(os.homedir(), '~');
        console.log(`${i + 1}. ${chalk.yellow(locationShort)}`);
        console.log(`   ${r.secrets.length} secret(s) - ${r.type}`);

        // Show first secret as example
        if (r.secrets[0]) {
          console.log(`   Example: ${chalk.red(r.secrets[0].type)} - ${r.secrets[0].maskedValue}`);
        }
        console.log('');
      });

    console.log(chalk.red.bold('📋 RECOMMENDATIONS\n'));
    console.log('To mask these secrets:');
    console.log(chalk.white.bold('  cch cache mask-secrets --execute\n'));
    console.log('To remove sessions containing secrets:');
    console.log(chalk.white.bold('  cch cache clean --sessions-with-secrets --execute\n'));

  } catch (error) {
    console.error(chalk.red('\n❌ Error scanning cache for secrets:'));
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
      if (options.testMode) {
        console.error(error.stack);
      }
    } else {
      console.error(chalk.red('Unknown error occurred'));
    }
    process.exit(1);
  }
}
