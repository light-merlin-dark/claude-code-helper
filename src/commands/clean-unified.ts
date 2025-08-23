/**
 * Unified clean command system with smart detection and recommendations
 */

import fs from 'fs';
import chalk from 'chalk';
import { loadClaudeConfig, saveClaudeConfig, ClaudeConfig } from '../core/config';
import { logger } from '../utils/logger';
import { promptConfirm } from '../utils/prompt';
import { createBackup } from '../services/backup';
import { Analyzer } from '../services/analyzer';
import { SecretDetector } from '../services/secret-detector';

export interface CleanOptions {
  execute?: boolean;
  force?: boolean;
  testMode?: boolean;
  aggressive?: boolean;
}

export interface CleanResult {
  itemsRemoved: number;
  projectsModified: number;
  sizeReduction: number;
  backupPath?: string;
  details?: any;
}

/**
 * Main clean command - smart general cleanup
 */
export async function cleanGeneral(options: CleanOptions = {}): Promise<CleanResult> {
  const { execute = false, force = false, testMode = false, aggressive = false } = options;
  const dryRun = !execute;
  
  console.log(chalk.blue('🔍 Analyzing configuration for cleanup opportunities...\n'));
  
  const config = await loadClaudeConfig(testMode) as ClaudeConfig;
  const originalSize = Buffer.byteLength(JSON.stringify(config), 'utf8');
  const originalSizeMB = originalSize / 1024 / 1024;
  
  // Analyze what can be cleaned
  const analysis = await analyzeForGeneralCleanup(config, aggressive);
  
  // Display analysis
  displayGeneralAnalysis(analysis, originalSizeMB);
  
  // Check if cleanup is needed
  if (analysis.totalSavings < 50000 && analysis.largePastes === 0) {
    console.log(chalk.green('✨ Your config is already clean!\n'));
    return {
      itemsRemoved: 0,
      projectsModified: 0,
      sizeReduction: 0
    };
  }
  
  // Show recommendations for other clean commands if applicable
  showOtherCleanRecommendations(config, originalSize);
  
  if (dryRun) {
    console.log(chalk.blue('\nTo execute cleanup: cch clean --execute'));
    return {
      itemsRemoved: 0,
      projectsModified: 0,
      sizeReduction: 0
    };
  }
  
  // Get confirmation if not forced
  if (!force) {
    const proceed = await promptConfirm(
      'Proceed with cleanup?',
      true
    );
    if (!proceed) {
      console.log(chalk.yellow('Cleanup cancelled.'));
      return { itemsRemoved: 0, projectsModified: 0, sizeReduction: 0 };
    }
  }
  
  // Create backup
  let backupPath: string | undefined;
  if (!testMode) {
    backupPath = await createBackup('pre-clean-general');
    console.log(chalk.green(`✓ Backup created: ${backupPath}\n`));
  }
  
  // Perform cleanup
  const result = await performGeneralCleanup(config, analysis, { testMode, aggressive });
  result.backupPath = backupPath;
  
  // Save config
  await saveClaudeConfig(config, testMode);
  
  // Display results
  displayCleanResults('General Cleanup', result, dryRun);
  
  return result;
}

/**
 * Clean projects command - remove empty/unused projects
 */
export async function cleanProjects(options: CleanOptions = {}): Promise<CleanResult> {
  const { execute = false, force = false, testMode = false } = options;
  const dryRun = !execute;
  
  console.log(chalk.blue('🔍 Analyzing projects for cleanup...\n'));
  
  const config = await loadClaudeConfig(testMode) as ClaudeConfig;
  const originalSize = Buffer.byteLength(JSON.stringify(config), 'utf8');
  
  // Find projects to clean
  const projectsToClean = findProjectsToClean(config);
  
  if (projectsToClean.length === 0) {
    console.log(chalk.green('✨ No empty or unused projects found!\n'));
    return {
      itemsRemoved: 0,
      projectsModified: 0,
      sizeReduction: 0
    };
  }
  
  // Display what will be cleaned
  displayProjectsToClean(projectsToClean, dryRun);
  
  if (dryRun) {
    console.log(chalk.blue('\nTo execute cleanup: cch clean projects --execute'));
    return {
      itemsRemoved: 0,
      projectsModified: 0,
      sizeReduction: 0
    };
  }
  
  // Get confirmation if not forced
  if (!force) {
    const proceed = await promptConfirm(
      `Remove ${projectsToClean.length} project(s)?`,
      true
    );
    if (!proceed) {
      console.log(chalk.yellow('Cleanup cancelled.'));
      return { itemsRemoved: 0, projectsModified: 0, sizeReduction: 0 };
    }
  }
  
  // Create backup
  let backupPath: string | undefined;
  if (!testMode) {
    backupPath = await createBackup('pre-clean-projects');
    console.log(chalk.green(`✓ Backup created: ${backupPath}\n`));
  }
  
  // Remove projects
  projectsToClean.forEach(({ path }) => {
    delete config.projects![path];
  });
  
  // Save config
  await saveClaudeConfig(config, testMode);
  
  const newSize = Buffer.byteLength(JSON.stringify(config), 'utf8');
  const result = {
    itemsRemoved: projectsToClean.length,
    projectsModified: 0,
    sizeReduction: originalSize - newSize,
    backupPath
  };
  
  displayCleanResults('Project Cleanup', result, dryRun);
  
  return result;
}

/**
 * Clean history command - clear ALL history from all projects
 */
export async function cleanHistory(options: CleanOptions = {}): Promise<CleanResult> {
  const { execute = false, force = false, testMode = false } = options;
  const dryRun = !execute;
  
  console.log(chalk.blue('🔍 Analyzing history for cleanup...\n'));
  
  const config = await loadClaudeConfig(testMode) as ClaudeConfig;
  const originalSize = Buffer.byteLength(JSON.stringify(config), 'utf8');
  const originalSizeMB = originalSize / 1024 / 1024;
  
  // Analyze history
  const historyAnalysis = analyzeHistory(config);
  
  if (historyAnalysis.totalEntries === 0) {
    console.log(chalk.green('✨ No history found to clean!\n'));
    return {
      itemsRemoved: 0,
      projectsModified: 0,
      sizeReduction: 0
    };
  }
  
  // Display what will be cleaned
  displayHistoryAnalysis(historyAnalysis, originalSizeMB, dryRun);
  
  if (dryRun) {
    console.log(chalk.blue('\nTo execute cleanup: cch clean history --execute'));
    return {
      itemsRemoved: 0,
      projectsModified: 0,
      sizeReduction: 0
    };
  }
  
  // Get confirmation if not forced - this is a destructive operation
  if (!force) {
    console.log(chalk.yellow('\n⚠️  WARNING: This will permanently delete ALL conversation history!'));
    const proceed = await promptConfirm(
      'Are you absolutely sure you want to clear all history?',
      false // Default to NO for safety
    );
    if (!proceed) {
      console.log(chalk.yellow('History cleanup cancelled.'));
      return { itemsRemoved: 0, projectsModified: 0, sizeReduction: 0 };
    }
  }
  
  // Create backup
  let backupPath: string | undefined;
  if (!testMode) {
    backupPath = await createBackup('pre-clean-history-all');
    console.log(chalk.green(`✓ Backup created: ${backupPath}\n`));
  }
  
  // Clear all history
  let projectsModified = 0;
  Object.values(config.projects || {}).forEach(project => {
    if (project && project.history && project.history.length > 0) {
      project.history = [];
      projectsModified++;
    }
  });
  
  // Save config
  await saveClaudeConfig(config, testMode);
  
  const newSize = Buffer.byteLength(JSON.stringify(config), 'utf8');
  const result = {
    itemsRemoved: historyAnalysis.totalEntries,
    projectsModified,
    sizeReduction: originalSize - newSize,
    backupPath
  };
  
  displayCleanResults('History Cleanup', result, dryRun);
  
  return result;
}

// Helper functions

interface GeneralAnalysis {
  largePastes: number;
  largePastesSize: number;
  dangerousPermissions: number;
  totalSavings: number;
  secrets: {
    high: number;
    total: number;
  };
}

async function analyzeForGeneralCleanup(config: ClaudeConfig, aggressive: boolean): Promise<GeneralAnalysis> {
  const secretDetector = new SecretDetector();
  let largePastes = 0;
  let largePastesSize = 0;
  let dangerousPermissions = 0;
  
  // Check for large pastes
  Object.values(config.projects || {}).forEach(project => {
    if (project?.history) {
      project.history.forEach(entry => {
        if (entry.pastedContents) {
          Object.values(entry.pastedContents).forEach((paste: any) => {
            const size = Buffer.byteLength(paste.content || '', 'utf8');
            const threshold = aggressive ? 10240 : 51200; // 10KB or 50KB
            if (size >= threshold) {
              largePastes++;
              largePastesSize += size;
            }
          });
        }
      });
    }
    
    // Check for dangerous permissions
    if (project?.allowedCommands) {
      dangerousPermissions += project.allowedCommands.filter(cmd => 
        isDangerousCommand(cmd)
      ).length;
    }
  });
  
  // Quick secret scan
  const analyzer = new Analyzer();
  const report = await analyzer.analyzeConfig(config);
  
  return {
    largePastes,
    largePastesSize,
    dangerousPermissions,
    totalSavings: largePastesSize,
    secrets: {
      high: report.secrets.highConfidenceCount,
      total: report.secrets.totalCount
    }
  };
}

function displayGeneralAnalysis(analysis: GeneralAnalysis, currentSizeMB: number): void {
  console.log(chalk.bold('📊 General Cleanup Analysis\n'));
  
  console.log(chalk.cyan('Current state:'));
  console.log(`  Config size: ${chalk.yellow(currentSizeMB.toFixed(1))} MB`);
  
  if (analysis.secrets.high > 0) {
    console.log(`  🚨 High-confidence secrets: ${chalk.red(analysis.secrets.high.toString())}`);
  }
  
  console.log(chalk.cyan('\nWhat will be cleaned:'));
  if (analysis.largePastes > 0) {
    console.log(`  • ${chalk.yellow(analysis.largePastes.toString())} large pastes (${(analysis.largePastesSize / 1024 / 1024).toFixed(1)} MB)`);
  }
  if (analysis.dangerousPermissions > 0) {
    console.log(`  • ${chalk.yellow(analysis.dangerousPermissions.toString())} dangerous permissions`);
  }
  
  if (analysis.totalSavings > 0) {
    const savingsMB = analysis.totalSavings / 1024 / 1024;
    const reductionPercent = Math.round((analysis.totalSavings / (currentSizeMB * 1024 * 1024)) * 100);
    console.log(chalk.cyan('\nEstimated savings:'));
    console.log(`  • ${chalk.green(savingsMB.toFixed(1))} MB (${reductionPercent}% reduction)`);
  }
}

function showOtherCleanRecommendations(config: ClaudeConfig, configSize: number): void {
  const recommendations: string[] = [];
  
  // Check for empty projects
  const emptyProjects = Object.entries(config.projects || {}).filter(([_, project]) => 
    !project?.history || project.history.length === 0
  ).length;
  
  if (emptyProjects > 0) {
    recommendations.push(`• Found ${chalk.yellow(emptyProjects.toString())} empty projects → Run: ${chalk.blue('cch clean projects')}`);
  }
  
  // Check if history is taking up significant space
  const historyEntries = Object.values(config.projects || {})
    .reduce((sum, p) => sum + (p?.history?.length || 0), 0);
  
  if (historyEntries > 500 || configSize > 5000000) { // 500+ entries or > 5MB
    recommendations.push(`• History has ${chalk.yellow(historyEntries.toString())} entries → Consider: ${chalk.blue('cch clean history')}`);
  }
  
  if (recommendations.length > 0) {
    console.log(chalk.cyan('\n💡 Additional cleanup options:'));
    recommendations.forEach(rec => console.log(rec));
  }
}

interface ProjectToClean {
  path: string;
  reason: string;
  historyCount: number;
}

function findProjectsToClean(config: ClaudeConfig): ProjectToClean[] {
  const projectsToClean: ProjectToClean[] = [];
  
  Object.entries(config.projects || {}).forEach(([path, project]) => {
    // Empty projects (no history)
    if (!project?.history || project.history.length === 0) {
      projectsToClean.push({
        path,
        reason: 'empty (no history)',
        historyCount: 0
      });
    }
    // Very minimal projects (1-2 entries) in non-standard locations
    else if (project.history.length <= 2 && !path.includes('_dev')) {
      projectsToClean.push({
        path,
        reason: 'minimal activity',
        historyCount: project.history.length
      });
    }
  });
  
  return projectsToClean;
}

function displayProjectsToClean(projects: ProjectToClean[], dryRun: boolean): void {
  console.log(chalk.bold(`📊 Project Cleanup Analysis\n`));
  
  console.log(chalk.cyan(`Found ${projects.length} project(s) to clean:\n`));
  
  // Group by reason
  const byReason = projects.reduce((acc, p) => {
    if (!acc[p.reason]) acc[p.reason] = [];
    acc[p.reason].push(p);
    return acc;
  }, {} as Record<string, ProjectToClean[]>);
  
  Object.entries(byReason).forEach(([reason, projectList]) => {
    console.log(chalk.yellow(`  ${reason} (${projectList.length}):`));
    projectList.forEach(p => {
      console.log(`    • ${p.path}`);
    });
  });
}

interface HistoryAnalysis {
  totalEntries: number;
  totalProjects: number;
  largestProject: {
    path: string;
    entries: number;
  };
  estimatedSize: number;
}

function analyzeHistory(config: ClaudeConfig): HistoryAnalysis {
  let totalEntries = 0;
  let totalProjects = 0;
  let largestProject = { path: '', entries: 0 };
  
  Object.entries(config.projects || {}).forEach(([path, project]) => {
    if (project?.history && project.history.length > 0) {
      totalEntries += project.history.length;
      totalProjects++;
      
      if (project.history.length > largestProject.entries) {
        largestProject = { path, entries: project.history.length };
      }
    }
  });
  
  // Estimate size of history
  const historyOnly = JSON.parse(JSON.stringify(config));
  Object.values(historyOnly.projects || {}).forEach((project: any) => {
    if (project) {
      delete project.allowedCommands;
      delete project.customInstructions;
    }
  });
  const estimatedSize = Buffer.byteLength(JSON.stringify(historyOnly), 'utf8');
  
  return {
    totalEntries,
    totalProjects,
    largestProject,
    estimatedSize
  };
}

function displayHistoryAnalysis(analysis: HistoryAnalysis, currentSizeMB: number, dryRun: boolean): void {
  console.log(chalk.bold('📊 History Cleanup Analysis\n'));
  
  console.log(chalk.cyan('Current history:'));
  console.log(`  • ${chalk.yellow(analysis.totalEntries.toString())} total entries`);
  console.log(`  • ${chalk.yellow(analysis.totalProjects.toString())} projects with history`);
  console.log(`  • Largest: ${analysis.largestProject.path} (${analysis.largestProject.entries} entries)`);
  console.log(`  • Estimated size: ${chalk.yellow((analysis.estimatedSize / 1024 / 1024).toFixed(1))} MB`);
  
  console.log(chalk.cyan('\nWhat will happen:'));
  console.log(`  • ${chalk.red('ALL')} conversation history will be ${chalk.red('permanently deleted')}`);
  console.log(`  • Projects will remain but with empty history`);
  console.log(`  • Permissions and settings will be preserved`);
  
  const savingsMB = analysis.estimatedSize / 1024 / 1024;
  const reductionPercent = Math.round((analysis.estimatedSize / (currentSizeMB * 1024 * 1024)) * 100);
  console.log(chalk.cyan('\nEstimated savings:'));
  console.log(`  • ${chalk.green(savingsMB.toFixed(1))} MB (${reductionPercent}% reduction)`);
}

async function performGeneralCleanup(
  config: ClaudeConfig,
  analysis: GeneralAnalysis,
  options: { testMode: boolean; aggressive: boolean }
): Promise<CleanResult> {
  let itemsRemoved = 0;
  let projectsModified = 0;
  
  Object.values(config.projects || {}).forEach(project => {
    let modified = false;
    
    if (project?.history) {
      project.history = project.history.map(entry => {
        if (entry.pastedContents) {
          const newPastedContents: any = {};
          
          Object.entries(entry.pastedContents).forEach(([id, paste]: [string, any]) => {
            const size = Buffer.byteLength(paste.content || '', 'utf8');
            const threshold = options.aggressive ? 10240 : 51200;
            
            if (size < threshold) {
              newPastedContents[id] = paste;
            } else {
              itemsRemoved++;
              modified = true;
            }
          });
          
          if (Object.keys(newPastedContents).length === 0) {
            delete entry.pastedContents;
          } else {
            entry.pastedContents = newPastedContents;
          }
        }
        
        return entry;
      });
    }
    
    if (modified) projectsModified++;
  });
  
  return {
    itemsRemoved,
    projectsModified,
    sizeReduction: analysis.largePastesSize,
  };
}

function displayCleanResults(title: string, result: CleanResult, dryRun: boolean): void {
  console.log('');
  console.log(chalk.bold(dryRun ? `🔍 ${title} Preview` : `✅ ${title} Complete`));
  console.log('');
  
  if (result.itemsRemoved > 0) {
    console.log(`${dryRun ? 'Would remove' : 'Removed'}: ${chalk.yellow(result.itemsRemoved.toString())} items`);
  }
  
  if (result.projectsModified > 0) {
    console.log(`${dryRun ? 'Would modify' : 'Modified'}: ${chalk.yellow(result.projectsModified.toString())} projects`);
  }
  
  if (result.sizeReduction > 0) {
    const reductionMB = (result.sizeReduction / 1024 / 1024).toFixed(1);
    console.log(`${dryRun ? 'Would save' : 'Saved'}: ${chalk.green(reductionMB)} MB`);
  }
  
  if (result.backupPath && !dryRun) {
    console.log(`Backup: ${chalk.blue(result.backupPath)}`);
  }
}

// Import dangerous patterns check
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