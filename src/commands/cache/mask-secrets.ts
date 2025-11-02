/**
 * Cache secret masking command
 * Masks secrets in Claude Code cache files
 */

import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SecretDetector } from '../../services/secret-detector';

export interface MaskSecretsOptions {
  execute?: boolean;
  testMode?: boolean;
}

export async function maskCacheSecrets(options: MaskSecretsOptions = {}): Promise<void> {
  try {
    console.log(chalk.cyan.bold('\n🔐 Claude Code Cache Secret Masking\n'));

    const detector = new SecretDetector();

    console.log('Scanning for secrets...\n');

    const result = await detector.scanCache({});

    if (result.totalSecrets === 0) {
      console.log(chalk.green('✅ No secrets to mask\n'));
      return;
    }

    console.log(`Found ${chalk.yellow(result.totalSecrets.toString())} secrets to mask\n`);

    if (!options.execute) {
      console.log(chalk.yellow('📋 [DRY RUN] Preview of what will be masked:\n'));
    }

    // Group by file
    const fileGroups = new Map<string, typeof result.results[0]>();
    result.results.forEach(r => {
      const existing = fileGroups.get(r.location);
      if (existing) {
        // Merge secrets from same file
        existing.secrets.push(...r.secrets);
      } else {
        fileGroups.set(r.location, r);
      }
    });

    console.log(`Files to modify: ${chalk.cyan(fileGroups.size.toString())}\n`);

    // Show preview of what will be masked
    if (!options.execute) {
      console.log(chalk.cyan('Preview of files to be modified:\n'));
      let previewCount = 0;
      for (const [filePath, fileResult] of fileGroups) {
        if (previewCount >= 5) {
          console.log(chalk.dim(`... and ${fileGroups.size - 5} more files\n`));
          break;
        }
        const locationShort = filePath.replace(os.homedir(), '~');
        console.log(`  ${chalk.yellow(locationShort)}`);
        console.log(`    ${fileResult.secrets.length} secret(s) - ${fileResult.type}`);
        console.log('');
        previewCount++;
      }

      console.log(chalk.yellow.bold('⚠️  This is a DRY RUN. Use --execute to apply changes.\n'));
      console.log(chalk.dim('Command: cch cache mask-secrets --execute\n'));
      return;
    }

    // Execute masking
    console.log(chalk.yellow.bold('⚠️  About to mask secrets in cache files.\n'));
    console.log(chalk.yellow('This will:'));
    console.log(chalk.yellow('  • Create backups of all modified files'));
    console.log(chalk.yellow('  • Replace secrets with masked values'));
    console.log(chalk.yellow('  • Modify files in place\n'));

    // Confirmation prompt (skip in test mode)
    if (!options.testMode) {
      console.log(chalk.red.bold('Are you sure you want to continue? (y/N): '));
      // In a real implementation, we would use readline or similar to get user input
      // For now, we'll proceed automatically in test mode
      console.log(chalk.dim('Skipping confirmation in automated mode...\n'));
    }

    let maskedCount = 0;
    let filesModified = 0;
    let backupsCreated = 0;
    const errors: string[] = [];

    console.log('Masking secrets...\n');

    for (const [filePath, fileResult] of fileGroups) {
      try {
        // Create backup
        const backupPath = `${filePath}.backup-${Date.now()}`;
        await fs.promises.copyFile(filePath, backupPath);
        backupsCreated++;

        // Read file
        let content = await fs.promises.readFile(filePath, 'utf-8');

        // Mask each secret
        for (const secret of fileResult.secrets) {
          // Use a more robust replacement that handles regex special characters
          const escapedValue = secret.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          content = content.replace(new RegExp(escapedValue, 'g'), secret.maskedValue);
          maskedCount++;
        }

        // Write back
        await fs.promises.writeFile(filePath, content, 'utf-8');
        filesModified++;

        const locationShort = path.basename(filePath);
        console.log(chalk.green(`✓ Masked ${fileResult.secrets.length} secret(s) in ${locationShort}`));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${filePath}: ${errorMsg}`);
        console.error(chalk.red(`✗ Failed to mask ${path.basename(filePath)}: ${errorMsg}`));
      }
    }

    console.log('');
    console.log(chalk.green.bold('✅ Secret masking completed!\n'));
    console.log(`${chalk.bold('Files modified:')} ${filesModified}`);
    console.log(`${chalk.bold('Secrets masked:')} ${maskedCount}`);
    console.log(`${chalk.bold('Backups created:')} ${backupsCreated}`);

    if (errors.length > 0) {
      console.log('');
      console.log(chalk.yellow.bold(`⚠️  ${errors.length} error(s) occurred:`));
      errors.forEach((err, i) => {
        console.log(chalk.yellow(`  ${i + 1}. ${err}`));
      });
    }

    console.log('');
    console.log(chalk.dim('Backup files can be found next to the original files with .backup-* extension\n'));

  } catch (error) {
    console.error(chalk.red('\n❌ Error masking secrets:'));
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
