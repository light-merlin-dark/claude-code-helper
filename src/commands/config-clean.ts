/**
 * Comprehensive config cleanup command with analysis and confirmation
 * Provides two-step process: analysis -> confirmation -> cleanup
 */

import fs from 'fs';
import chalk from 'chalk';
import { loadClaudeConfig, saveClaudeConfig, ClaudeConfig } from '../core/config';
import { logger } from '../utils/logger';
import { promptConfirm } from '../utils/prompt';
import { createBackup } from '../services/backup';
import { Analyzer } from '../services/analyzer';

export interface ConfigCleanOptions {
  force?: boolean;
  testMode?: boolean;
  dryRun?: boolean;
  aggressive?: boolean;
}

export interface CleanupAnalysis {
  currentSize: number;
  currentSizeMB: number;
  projectCount: number;
  totalPastes: number;
  largePastes: number;
  estimatedSizeAfter: number;
  estimatedSizeAfterMB: number;
  estimatedReduction: number;
  estimatedReductionPercent: number;
  dangerousPermissions: number;
  recommendations: string[];
}

export interface CleanupResult {
  pastesRemoved: number;
  permissionsRemoved: number;
  projectsModified: number;
  sizeReduction: number;
  backupPath?: string;
}

/**
 * Main config cleanup command with analysis and confirmation
 */
export async function cleanConfig(options: ConfigCleanOptions = {}): Promise<CleanupResult> {
  const { force = false, testMode = false, dryRun = false, aggressive = false } = options;
  
  console.log(chalk.blue('🔍 Analyzing Claude configuration...'));
  console.log('');
  
  // Step 1: Load and analyze config
  const config = await loadClaudeConfig(testMode) as ClaudeConfig;
  const analysis = await analyzeConfigForCleanup(config, aggressive);
  
  // Step 2: Show analysis results
  displayAnalysis(analysis);
  
  // Step 3: Get user confirmation (unless forced)
  if (!force && !dryRun) {
    const proceed = await promptConfirm(
      `Proceed with cleanup? This will ${analysis.estimatedReductionPercent >= 50 ? 'significantly' : 'moderately'} reduce your config size.`,
      true
    );
    
    if (!proceed) {
      console.log(chalk.yellow('Cleanup cancelled.'));
      return {
        pastesRemoved: 0,
        permissionsRemoved: 0,
        projectsModified: 0,
        sizeReduction: 0
      };
    }
  }
  
  // Step 4: Create backup (unless dry run or test mode)
  let backupPath: string | undefined;
  if (!dryRun && !testMode) {
    console.log(chalk.blue('📦 Creating backup...'));
    backupPath = await createBackup('pre-cleanup');
    console.log(chalk.green(`✓ Backup created: ${backupPath}`));
  }
  
  // Step 5: Perform cleanup
  console.log(chalk.blue('🧹 Performing cleanup...'));
  const result = await performCleanup(config, analysis, { dryRun, testMode, aggressive });
  result.backupPath = backupPath;
  
  // Step 6: Show results
  displayResults(analysis, result, dryRun);
  
  return result;
}

/**
 * Analyze config to determine cleanup potential
 */
async function analyzeConfigForCleanup(config: ClaudeConfig, aggressive: boolean): Promise<CleanupAnalysis> {
  const analyzer = new Analyzer();
  const report = await analyzer.analyzeConfig(config);
  
  const currentSizeBytes = Buffer.byteLength(JSON.stringify(config), 'utf8');
  const currentSizeMB = currentSizeBytes / 1024 / 1024;
  
  // Count items that would be cleaned
  let largePastesCount = 0;
  let estimatedPasteReduction = 0;
  
  Object.values(config.projects || {}).forEach(project => {
    if (project && project.history) {
      project.history.forEach(entry => {
        if (entry.pastedContents) {
          Object.values(entry.pastedContents).forEach((paste: any) => {
            const content = paste.content || '';
            const lines = content.split('\n').length;
            const size = Buffer.byteLength(content, 'utf8');
            
            // Conservative: 100+ lines, Aggressive: 50+ lines or 2KB+
            const threshold = aggressive ? { lines: 50, size: 2048 } : { lines: 100, size: 5120 };
            
            if (lines >= threshold.lines || size >= threshold.size) {
              largePastesCount++;
              estimatedPasteReduction += size;
            }
          });
        }
      });
    }
  });
  
  // Count dangerous permissions
  const dangerousPermissions = report.security.length;
  
  // Estimate size after cleanup
  const estimatedSizeAfter = Math.max(
    currentSizeBytes - estimatedPasteReduction,
    currentSizeBytes * 0.1 // Never estimate less than 10% of original
  );
  const estimatedReduction = currentSizeBytes - estimatedSizeAfter;
  const estimatedReductionPercent = Math.round((estimatedReduction / currentSizeBytes) * 100);
  
  // Generate recommendations
  const recommendations: string[] = [];
  if (largePastesCount > 0) {
    recommendations.push(`Remove ${largePastesCount} large pastes to save ~${(estimatedPasteReduction / 1024 / 1024).toFixed(1)}MB`);
  }
  if (dangerousPermissions > 0) {
    recommendations.push(`Remove ${dangerousPermissions} dangerous permissions for security`);
  }
  if (currentSizeMB > 50) {
    recommendations.push('Config is very large - cleanup recommended for performance');
  }
  if (estimatedReductionPercent > 70) {
    recommendations.push('Significant size reduction possible - high impact cleanup');
  }
  
  return {
    currentSize: currentSizeBytes,
    currentSizeMB,
    projectCount: Object.keys(config.projects || {}).length,
    totalPastes: report.bloat.totalPastes,
    largePastes: largePastesCount,
    estimatedSizeAfter,
    estimatedSizeAfterMB: estimatedSizeAfter / 1024 / 1024,
    estimatedReduction,
    estimatedReductionPercent,
    dangerousPermissions,
    recommendations
  };
}

/**
 * Display analysis results to user
 */
function displayAnalysis(analysis: CleanupAnalysis): void {
  console.log(chalk.bold('📊 Configuration Analysis'));
  console.log('');
  
  // Current state
  console.log(chalk.cyan('Current State:'));
  console.log(`  Size: ${chalk.yellow(analysis.currentSizeMB.toFixed(1))} MB`);
  console.log(`  Projects: ${chalk.yellow(analysis.projectCount.toString())}`);
  console.log(`  Total pastes: ${chalk.yellow(analysis.totalPastes.toString())}`);
  console.log(`  Large pastes: ${chalk.yellow(analysis.largePastes.toString())}`);
  if (analysis.dangerousPermissions > 0) {
    console.log(`  Dangerous permissions: ${chalk.red(analysis.dangerousPermissions.toString())}`);
  }
  console.log('');
  
  // Projected results
  console.log(chalk.cyan('After Cleanup:'));
  console.log(`  Size: ${chalk.green(analysis.estimatedSizeAfterMB.toFixed(1))} MB ${chalk.gray(`(-${analysis.estimatedReductionPercent}%)`)}`);
  console.log(`  Space saved: ${chalk.green((analysis.estimatedReduction / 1024 / 1024).toFixed(1))} MB`);
  console.log('');
  
  // Visual indicator
  const beforeBar = '█'.repeat(20);
  const afterLength = Math.max(1, Math.round(20 * (analysis.estimatedSizeAfter / analysis.currentSize)));
  const afterBar = '█'.repeat(afterLength) + '░'.repeat(20 - afterLength);
  
  console.log(chalk.cyan('Size Comparison:'));
  console.log(`  Before: ${chalk.yellow(beforeBar)} ${analysis.currentSizeMB.toFixed(1)}MB`);
  console.log(`  After:  ${chalk.green(afterBar)} ${analysis.estimatedSizeAfterMB.toFixed(1)}MB`);
  console.log('');
  
  // Recommendations
  if (analysis.recommendations.length > 0) {
    console.log(chalk.cyan('Recommendations:'));
    analysis.recommendations.forEach(rec => {
      console.log(`  • ${rec}`);
    });
    console.log('');
  }
}

/**
 * Perform the actual cleanup
 */
async function performCleanup(
  config: ClaudeConfig, 
  analysis: CleanupAnalysis, 
  options: { dryRun: boolean; testMode: boolean; aggressive: boolean }
): Promise<CleanupResult> {
  const { dryRun, testMode, aggressive } = options;
  
  let pastesRemoved = 0;
  let permissionsRemoved = 0;
  let projectsModified = 0;
  
  // Clean large pastes and dangerous permissions
  Object.entries(config.projects || {}).forEach(([projectName, project]) => {
    let projectModified = false;
    
    // Clean history pastes
    if (project && project.history) {
      project.history = project.history.map(entry => {
        if (entry.pastedContents) {
          const newPastedContents: any = {};
          let entryModified = false;
          
          Object.entries(entry.pastedContents).forEach(([id, paste]: [string, any]) => {
            const content = paste.content || '';
            const lines = content.split('\n').length;
            const size = Buffer.byteLength(content, 'utf8');
            
            // Conservative: 100+ lines, Aggressive: 50+ lines or 2KB+
            const threshold = aggressive ? { lines: 50, size: 2048 } : { lines: 100, size: 5120 };
            
            if (lines >= threshold.lines || size >= threshold.size) {
              if (!dryRun) {
                // Remove the paste
                entryModified = true;
                projectModified = true;
              }
              pastesRemoved++;
            } else {
              newPastedContents[id] = paste;
            }
          });
          
          if (entryModified && !dryRun) {
            if (Object.keys(newPastedContents).length === 0) {
              delete entry.pastedContents;
              // Clean up display text
              if (entry.display) {
                entry.display = entry.display.replace(/\[Pasted text[^\]]+\]/g, '[Pasted content removed]');
              }
            } else {
              entry.pastedContents = newPastedContents;
            }
          }
        }
        return entry;
      });
    }
    
    // Clean dangerous permissions
    if (project && project.allowedCommands) {
      const dangerous = project.allowedCommands.filter(command => isDangerousCommand(command));
      const removed = dangerous.length;
      
      if (!dryRun && removed > 0) {
        project.allowedCommands = project.allowedCommands.filter(command => !isDangerousCommand(command));
        projectModified = true;
      }
      
      if (removed > 0) {
        permissionsRemoved += removed;
      }
    }
    
    if (projectModified) {
      projectsModified++;
    }
  });
  
  // Save config if not dry run
  if (!dryRun && (pastesRemoved > 0 || permissionsRemoved > 0)) {
    await saveClaudeConfig(config, testMode);
  }
  
  const finalSize = Buffer.byteLength(JSON.stringify(config), 'utf8');
  const sizeReduction = analysis.currentSize - finalSize;
  
  return {
    pastesRemoved,
    permissionsRemoved,
    projectsModified,
    sizeReduction
  };
}

/**
 * Display cleanup results
 */
function displayResults(analysis: CleanupAnalysis, result: CleanupResult, dryRun: boolean): void {
  console.log('');
  console.log(chalk.bold(dryRun ? '🔍 Cleanup Preview' : '✅ Cleanup Complete'));
  console.log('');
  
  if (result.pastesRemoved > 0) {
    console.log(`${dryRun ? 'Would remove' : 'Removed'} ${chalk.yellow(result.pastesRemoved.toString())} large pastes`);
  }
  
  if (result.permissionsRemoved > 0) {
    console.log(`${dryRun ? 'Would remove' : 'Removed'} ${chalk.yellow(result.permissionsRemoved.toString())} dangerous permissions`);
  }
  
  if (result.projectsModified > 0) {
    console.log(`${dryRun ? 'Would modify' : 'Modified'} ${chalk.yellow(result.projectsModified.toString())} projects`);
  }
  
  if (result.sizeReduction > 0) {
    const reductionMB = (result.sizeReduction / 1024 / 1024).toFixed(1);
    const reductionPercent = Math.round((result.sizeReduction / analysis.currentSize) * 100);
    console.log(`${dryRun ? 'Would save' : 'Saved'} ${chalk.green(reductionMB)} MB ${chalk.gray(`(-${reductionPercent}%)`)}`);
  }
  
  if (result.backupPath) {
    console.log(`Backup: ${chalk.blue(result.backupPath)}`);
  }
  
  if (!dryRun && (result.pastesRemoved > 0 || result.permissionsRemoved > 0)) {
    console.log('');
    console.log(chalk.green('🎉 Config cleanup successful! Claude Code should feel snappier.'));
  } else if (dryRun) {
    console.log('');
    console.log(chalk.blue('Run without --dry-run to perform actual cleanup.'));
  } else {
    console.log('');
    console.log(chalk.green('✨ Config is already clean!'));
  }
}

// Import from existing clean.ts
import { DANGEROUS_PATTERNS } from '../services/analyzer';

function isDangerousCommand(command: string): boolean {
  return DANGEROUS_PATTERNS.some(pattern => {
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(command);
  });
}