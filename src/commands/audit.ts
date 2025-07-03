/**
 * Audit command - comprehensive configuration analysis
 * Provides security analysis, bloat detection, and optimization recommendations
 */

import { Analyzer } from '../services/analyzer';
import { loadClaudeConfig } from '../core/config';
import { logger } from '../utils/logger';
import { promptConfirm } from '../utils/prompt';
import { backupConfig } from './config/backup';
import { cleanHistory, cleanDangerous } from './clean';
import { withProgress } from '../utils/progress';

export interface AuditOptions {
  fix?: boolean;
  stats?: boolean;
  showSecrets?: boolean;
  testMode?: boolean;
}

export async function audit(options: AuditOptions = {}): Promise<string> {
  const { fix = false, stats = false, showSecrets = false, testMode = false } = options;

  try {
    // Read Claude configuration
    const config = await withProgress(
      'Loading configuration',
      () => loadClaudeConfig(testMode)
    );
    
    // Run analysis
    const analyzer = new Analyzer();
    const report = await withProgress(
      'Analyzing configuration',
      () => analyzer.analyzeConfig(config)
    );
    
    if (fix) {
      // Interactive fix mode
      return await interactiveFix(report, testMode);
    }
    
    if (stats) {
      // Quick stats mode for AI agents
      return formatQuickStats(config, report);
    }
    
    if (showSecrets) {
      // Show detailed secret information
      return formatSecretDetails(report);
    }
    
    // Return formatted report
    return analyzer.formatReport(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Audit failed: ${message}`);
    throw error;
  }
}

async function interactiveFix(report: any, testMode: boolean): Promise<string> {
  const results: string[] = [];
  
  console.log('\n🔧 Interactive Fix Mode\n');
  
  // First, create a backup
  const shouldBackup = await promptConfirm(
    'Create a backup before making changes?',
    true
  );
  
  if (shouldBackup) {
    console.log('Creating backup...');
    await backupConfig('pre-audit-fix', testMode);
    results.push('✓ Backup created');
  }
  
  // Fix dangerous permissions
  if (report.security.length > 0) {
    console.log(`\n⚠️  Found ${report.security.length} dangerous permissions`);
    const shouldClean = await promptConfirm(
      'Remove all dangerous permissions?',
      true
    );
    
    if (shouldClean) {
      const cleanResult = await cleanDangerous({ testMode });
      results.push(`✓ Removed dangerous permissions from ${cleanResult.projectsModified} projects`);
    }
  }
  
  // Fix config bloat
  if (report.bloat.totalPastes > 0) {
    const sizeInMB = (report.bloat.totalSize / 1024 / 1024).toFixed(1);
    console.log(`\n📦 Found ${report.bloat.totalPastes} large pastes (${sizeInMB} MB)`);
    
    // Get projects with bloat
    const bloatedProjects = Array.from(report.bloat.projectSummaries.keys()) as string[];
    
    const shouldCleanHistory = await promptConfirm(
      `Clean history for ${bloatedProjects.length} projects?`,
      true
    );
    
    if (shouldCleanHistory) {
      const cleanResult = await cleanHistory({
        projects: bloatedProjects,
        testMode
      });
      
      const reductionMB = (cleanResult.sizeReduction / 1024 / 1024).toFixed(1);
      results.push(`✓ Cleaned ${cleanResult.pastesRemoved} pastes, saved ${reductionMB} MB`);
    }
  }
  
  // Summary
  console.log('\n✅ Audit fixes completed:');
  results.forEach(result => console.log(`  ${result}`));
  
  return results.join('\n');
}

function formatQuickStats(config: any, report: any): string {
  const configSize = Buffer.byteLength(JSON.stringify(config), 'utf8');
  const sizeMB = (configSize / 1024 / 1024).toFixed(1);
  const projectCount = Object.keys(config.projects || {}).length;
  
  // Count issues
  const securityIssues = report.security.length;
  const secretsFound = report.secrets.totalCount;
  const highConfidenceSecrets = report.secrets.highConfidenceCount;
  const bloatIssues = report.bloat.totalPastes;
  const totalIssues = securityIssues + (secretsFound > 0 ? 1 : 0) + (bloatIssues > 10 ? 1 : 0) + (configSize > 50 * 1024 * 1024 ? 1 : 0);
  
  // Performance assessment
  let performanceStatus = 'Good';
  if (configSize > 100 * 1024 * 1024) {
    performanceStatus = 'Poor';
  } else if (configSize > 50 * 1024 * 1024) {
    performanceStatus = 'Degraded';
  }
  
  const stats = [
    `Config: ${sizeMB}MB`,
    `Projects: ${projectCount}`,
    `Issues: ${totalIssues}`,
    `Performance: ${performanceStatus}`
  ];
  
  // Priority: secrets first (most critical)
  if (secretsFound > 0) {
    if (highConfidenceSecrets > 0) {
      stats.push(`🚨 Secrets: ${highConfidenceSecrets} high-confidence`);
    } else {
      stats.push(`🔍 Secrets: ${secretsFound} potential`);
    }
  }
  
  if (securityIssues > 0) {
    stats.push(`Security: ${securityIssues} dangerous permissions`);
  }
  
  if (bloatIssues > 10) {
    stats.push(`Bloat: ${bloatIssues} large pastes`);
  }
  
  // Prioritized recommendations
  let recommendation = 'Config is healthy';
  if (highConfidenceSecrets > 0) {
    recommendation = '🚨 URGENT: Run "cch --clean-config --mask-secrets" to secure secrets';
  } else if (secretsFound > 0) {
    recommendation = 'Run "cch --audit --show-secrets" to review potential secrets';
  } else if (totalIssues > 0) {
    recommendation = 'Run "cch --clean-config" to optimize';
  }
  
  return `${stats.join(', ')} - ${recommendation}`;
}

function formatSecretDetails(report: any): string {
  const lines: string[] = [];
  
  if (report.secrets.totalCount === 0) {
    return '✅ No secrets detected in configuration';
  }
  
  lines.push('🔐 DETECTED SECRETS REPORT');
  lines.push('===============================');
  lines.push('');
  lines.push(`Total secrets found: ${report.secrets.totalCount}`);
  lines.push(`High confidence: ${report.secrets.highConfidenceCount}`);
  lines.push(`Medium/Low confidence: ${report.secrets.totalCount - report.secrets.highConfidenceCount}`);
  lines.push('');
  
  // Group secrets by confidence level
  const highConfidence = report.secrets.secrets.filter((s: any) => s.confidence === 'high');
  const mediumConfidence = report.secrets.secrets.filter((s: any) => s.confidence === 'medium');
  const lowConfidence = report.secrets.secrets.filter((s: any) => s.confidence === 'low');
  
  if (highConfidence.length > 0) {
    lines.push('🚨 HIGH CONFIDENCE SECRETS (Immediate Action Required):');
    lines.push('───────────────────────────────────────────────────────');
    highConfidence.forEach((secret: any, index: number) => {
      lines.push(`${index + 1}. ${secret.type}`);
      lines.push(`   Location: ${secret.location}`);
      lines.push(`   Value: ${secret.maskedValue}`);
      lines.push(`   Context: ${secret.context.substring(0, 100)}...`);
      lines.push('');
    });
  }
  
  if (mediumConfidence.length > 0) {
    lines.push('⚠️  MEDIUM CONFIDENCE SECRETS (Review Recommended):');
    lines.push('──────────────────────────────────────────────────');
    mediumConfidence.slice(0, 5).forEach((secret: any, index: number) => {
      lines.push(`${index + 1}. ${secret.type} in ${secret.location}`);
      lines.push(`   Value: ${secret.maskedValue}`);
      lines.push('');
    });
    if (mediumConfidence.length > 5) {
      lines.push(`   ... and ${mediumConfidence.length - 5} more medium confidence secrets`);
      lines.push('');
    }
  }
  
  if (lowConfidence.length > 0) {
    lines.push('ℹ️  LOW CONFIDENCE SECRETS (May be false positives):');
    lines.push('────────────────────────────────────────────────────');
    const grouped = lowConfidence.reduce((acc: any, secret: any) => {
      acc[secret.type] = (acc[secret.type] || 0) + 1;
      return acc;
    }, {});
    
    Object.entries(grouped).forEach(([type, count]) => {
      lines.push(`   ${type}: ${count} instances`);
    });
    lines.push('');
  }
  
  lines.push('RECOMMENDED ACTIONS:');
  lines.push('──────────────────────');
  if (highConfidence.length > 0) {
    lines.push('• URGENT: Run "cch --clean-config --mask-secrets" to mask high-confidence secrets');
  }
  if (report.secrets.totalCount > 0) {
    lines.push('• Create backup: "cch --backup-config -n pre-secret-cleanup"');
    lines.push('• Review and manually verify any false positives');
  }
  lines.push('• Consider using environment variables for sensitive configuration');
  
  return lines.join('\n');
}