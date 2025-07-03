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
  testMode?: boolean;
}

export async function audit(options: AuditOptions = {}): Promise<string> {
  const { fix = false, stats = false, testMode = false } = options;

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
  const bloatIssues = report.bloat.totalPastes;
  const totalIssues = securityIssues + (bloatIssues > 10 ? 1 : 0) + (configSize > 50 * 1024 * 1024 ? 1 : 0);
  
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
  
  if (securityIssues > 0) {
    stats.push(`Security: ${securityIssues} dangerous permissions`);
  }
  
  if (bloatIssues > 10) {
    stats.push(`Bloat: ${bloatIssues} large pastes`);
  }
  
  const recommendation = totalIssues > 0 ? 'Run "cch --clean-config" to optimize' : 'Config is healthy';
  
  return `${stats.join(', ')} - ${recommendation}`;
}