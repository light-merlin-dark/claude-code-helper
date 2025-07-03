/**
 * Always-on secret warning service
 * Shows critical secret exposure warnings on every CLI command execution
 */

import chalk from 'chalk';
import { SecretDetector, DetectedSecret } from './secret-detector';
import { loadClaudeConfig, ClaudeConfig } from '../core/config';

export interface SecretWarning {
  totalSecrets: number;
  highConfidenceSecrets: number;
  criticalSecrets: DetectedSecret[];
  immediateCleanupCommand: string;
}

export class SecretWarningService {
  private secretDetector = new SecretDetector();

  /**
   * Check for secrets and display warnings if found
   * This runs on EVERY command execution
   */
  async checkAndWarnSecrets(testMode: boolean = false): Promise<SecretWarning | null> {
    try {
      // Quick config load and scan
      const config = await loadClaudeConfig(testMode) as ClaudeConfig;
      const scanResult = this.secretDetector.scanConfig(config);
      
      if (scanResult.totalCount === 0) {
        return null; // No secrets found
      }
      
      // Filter high-confidence secrets for immediate display
      const criticalSecrets = scanResult.secrets.filter(s => s.confidence === 'high');
      
      const warning: SecretWarning = {
        totalSecrets: scanResult.totalCount,
        highConfidenceSecrets: scanResult.highConfidenceCount,
        criticalSecrets,
        immediateCleanupCommand: 'cch --mask-secrets-now'
      };
      
      this.displaySecretWarning(warning);
      return warning;
      
    } catch (error) {
      // Silently fail - don't block other commands
      return null;
    }
  }

  /**
   * Display prominent secret warning that agents cannot miss
   */
  private displaySecretWarning(warning: SecretWarning): void {
    const { totalSecrets, highConfidenceSecrets, criticalSecrets } = warning;
    
    console.log('');
    console.log(chalk.red.bold('🚨🚨🚨 CRITICAL SECURITY ALERT 🚨🚨🚨'));
    console.log(chalk.red.bold('═══════════════════════════════════════'));
    console.log('');
    
    if (highConfidenceSecrets > 0) {
      console.log(chalk.red.bold(`🔴 ${highConfidenceSecrets} HIGH-CONFIDENCE SECRETS DETECTED IN CONFIG`));
      console.log(chalk.yellow(`📊 Total potential secrets: ${totalSecrets}`));
    } else {
      console.log(chalk.yellow.bold(`⚠️  ${totalSecrets} POTENTIAL SECRETS DETECTED IN CONFIG`));
    }
    
    console.log('');
    console.log(chalk.cyan.bold('🔍 EXPOSED SECRETS:'));
    console.log(chalk.cyan('────────────────────'));
    
    // Show critical secrets with masked values
    if (criticalSecrets.length > 0) {
      criticalSecrets.slice(0, 5).forEach((secret, index) => {
        console.log(`${index + 1}. ${chalk.red.bold(secret.type)}`);
        console.log(`   🏷️  Value: ${chalk.yellow(secret.maskedValue)}`);
        console.log(`   📍 Location: ${chalk.gray(secret.location)}`);
        console.log('');
      });
      
      if (criticalSecrets.length > 5) {
        console.log(chalk.gray(`   ... and ${criticalSecrets.length - 5} more high-confidence secrets`));
        console.log('');
      }
    } else {
      // Show summary for medium/low confidence
      const secretsByType = this.groupSecretsByType(warning);
      Object.entries(secretsByType).slice(0, 3).forEach(([type, count]) => {
        console.log(`• ${chalk.yellow(type)}: ${count} instances`);
      });
      console.log('');
    }
    
    console.log(chalk.red.bold('⚡ IMMEDIATE ACTION REQUIRED:'));
    console.log(chalk.white.bold(`   ${warning.immediateCleanupCommand}`));
    console.log('');
    console.log(chalk.gray('This command will:'));
    console.log(chalk.gray('• Create automatic backup'));
    console.log(chalk.gray('• Mask all detected secrets'));
    console.log(chalk.gray('• Continue with your original command'));
    console.log('');
    console.log(chalk.red.bold('🚨🚨🚨 END SECURITY ALERT 🚨🚨🚨'));
    console.log('');
  }

  /**
   * Display compact warning for subsequent commands
   */
  displayCompactWarning(warning: SecretWarning): void {
    if (warning.highConfidenceSecrets > 0) {
      console.log(chalk.red.bold(`🚨 ${warning.highConfidenceSecrets} secrets exposed! Run: ${warning.immediateCleanupCommand}`));
    } else {
      console.log(chalk.yellow.bold(`⚠️  ${warning.totalSecrets} potential secrets detected! Run: ${warning.immediateCleanupCommand}`));
    }
    console.log('');
  }

  /**
   * Quick check for secrets without displaying warnings
   * Used for conditional logic in commands
   */
  async hasSecrets(testMode: boolean = false): Promise<boolean> {
    try {
      const config = await loadClaudeConfig(testMode) as ClaudeConfig;
      const scanResult = this.secretDetector.scanConfig(config);
      return scanResult.totalCount > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get quick secret stats for one-line summaries
   */
  async getSecretStats(testMode: boolean = false): Promise<string> {
    try {
      const config = await loadClaudeConfig(testMode) as ClaudeConfig;
      const scanResult = this.secretDetector.scanConfig(config);
      
      if (scanResult.totalCount === 0) {
        return 'No secrets detected';
      }
      
      if (scanResult.highConfidenceCount > 0) {
        return `🚨 ${scanResult.highConfidenceCount} high-confidence secrets, ${scanResult.totalCount - scanResult.highConfidenceCount} potential`;
      }
      
      return `⚠️  ${scanResult.totalCount} potential secrets`;
    } catch (error) {
      return 'Secret scan failed';
    }
  }

  private groupSecretsByType(warning: SecretWarning): Record<string, number> {
    const grouped: Record<string, number> = {};
    
    // Group all secrets by type
    warning.criticalSecrets.forEach(secret => {
      grouped[secret.type] = (grouped[secret.type] || 0) + 1;
    });
    
    return grouped;
  }
}

// Singleton instance for use across CLI
export const secretWarningService = new SecretWarningService();