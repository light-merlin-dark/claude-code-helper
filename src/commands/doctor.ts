import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { getConfigPath } from '../core/paths';
import { loadClaudeConfig, saveClaudeConfig } from '../core/config';
import { isBlockedCommand, isDangerousCommand } from '../core/guards';
import { promptUser } from '../utils/prompt';
import * as backup from './config/backup';

interface AnalysisResult {
  wrapping: WrappingIssue[];
  duplicates: DuplicateIssue[];
  dangerous: string[];
}

interface WrappingIssue {
  tool: string;
  isWrapped: boolean;
}

interface DuplicateIssue {
  tool: string;
  count: number;
  indices: number[];
}

export async function runDoctor(targetPath?: string, testMode: boolean = false): Promise<void> {
  try {
    logger.info('🩺 Running Claude Code Doctor...\n');
    
    // Find all Claude config files
    const configPaths = await findClaudeConfigs(targetPath);
    
    if (configPaths.length === 0) {
      logger.warning('No Claude configuration files found.');
      return;
    }
    
    logger.success(`✓ Found ${configPaths.length} configuration file${configPaths.length > 1 ? 's' : ''}`);
    
    let totalIssues = 0;
    let totalFixed = 0;
    
    for (const configPath of configPaths) {
      const relativePath = path.relative(process.cwd(), configPath);
      logger.info(`\nAnalyzing ${relativePath}...`);
      
      const result = await analyzeConfig(configPath, testMode);
      const issueCount = result.wrapping.filter(w => !w.isWrapped).length + 
                        result.duplicates.length + 
                        result.dangerous.length;
      
      if (issueCount === 0) {
        logger.success('✓ No issues found');
        continue;
      }
      
      totalIssues += issueCount;
      logger.warning(`⚠ Detected ${issueCount} issue${issueCount > 1 ? 's' : ''}:`);
      
      // Fix issues
      const fixed = await fixIssues(configPath, result, testMode);
      totalFixed += fixed;
    }
    
    if (totalIssues === 0) {
      logger.success('\n✅ All configurations are healthy!');
    } else {
      logger.info(`\n📊 Summary: Fixed ${totalFixed}/${totalIssues} issues`);
    }
    
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Doctor failed: ${error.message}`);
    }
    throw error;
  }
}

async function findClaudeConfigs(targetPath?: string): Promise<string[]> {
  const configs: string[] = [];
  
  if (targetPath) {
    // Check specific path
    const configPath = path.join(targetPath, '.claude.json');
    if (fs.existsSync(configPath)) {
      configs.push(configPath);
    }
  } else {
    // Check home directory
    const homeConfig = getConfigPath(false);
    if (fs.existsSync(homeConfig)) {
      configs.push(homeConfig);
    }
    
    // Could add logic to find project configs in subdirectories
  }
  
  return configs;
}

async function analyzeConfig(configPath: string, testMode: boolean): Promise<AnalysisResult> {
  const config = await loadClaudeConfig(testMode);
  
  // For home config
  if (!config.projects) {
    return { wrapping: [], duplicates: [], dangerous: [] };
  }
  
  // For simplicity, analyze the first project's tools
  const firstProject = Object.values(config.projects)[0];
  const tools = firstProject?.allowedTools || [];
  
  // Run all analyzers concurrently
  const [wrapping, duplicates, dangerous] = await Promise.all([
    analyzeWrapping(tools),
    analyzeDuplicates(tools),
    analyzeDangerous(tools)
  ]);
  
  return { wrapping, duplicates, dangerous };
}

function analyzeWrapping(tools: string[]): WrappingIssue[] {
  return tools.map(tool => ({
    tool,
    isWrapped: tool.startsWith('Bash(') && tool.endsWith(')')
  }));
}

function analyzeDuplicates(tools: string[]): DuplicateIssue[] {
  const toolCounts = new Map<string, number[]>();
  
  tools.forEach((tool, index) => {
    // Normalize tool for comparison (remove Bash wrapper if present)
    const normalized = tool.startsWith('Bash(') && tool.endsWith(')') 
      ? tool.slice(5, -1) 
      : tool;
    
    if (!toolCounts.has(normalized)) {
      toolCounts.set(normalized, []);
    }
    toolCounts.get(normalized)!.push(index);
  });
  
  const duplicates: DuplicateIssue[] = [];
  
  for (const [tool, indices] of toolCounts.entries()) {
    if (indices.length > 1) {
      duplicates.push({
        tool,
        count: indices.length,
        indices
      });
    }
  }
  
  // Also check for semantic duplicates (e.g., "make:*" and "make build")
  const wildcardTools = new Set<string>();
  const specificTools = new Map<string, number[]>();
  
  tools.forEach((tool, index) => {
    const normalized = tool.startsWith('Bash(') && tool.endsWith(')') 
      ? tool.slice(5, -1) 
      : tool;
    
    if (normalized.includes(':*')) {
      const base = normalized.split(':')[0];
      wildcardTools.add(base);
    } else if (normalized.includes(' ')) {
      const base = normalized.split(' ')[0];
      if (!specificTools.has(base)) {
        specificTools.set(base, []);
      }
      specificTools.get(base)!.push(index);
    }
  });
  
  // Find semantic duplicates
  for (const [base, indices] of specificTools.entries()) {
    if (wildcardTools.has(base)) {
      duplicates.push({
        tool: `${base} (specific commands covered by ${base}:*)`,
        count: indices.length,
        indices
      });
    }
  }
  
  return duplicates;
}

function analyzeDangerous(tools: string[]): string[] {
  const dangerous: string[] = [];
  
  for (const tool of tools) {
    const command = tool.startsWith('Bash(') && tool.endsWith(')') 
      ? tool.slice(5, -1) 
      : tool;
    
    if (isBlockedCommand(command) || isDangerousCommand(command)) {
      dangerous.push(command);
    }
  }
  
  return dangerous;
}

async function fixIssues(configPath: string, result: AnalysisResult, testMode: boolean): Promise<number> {
  let fixedCount = 0;
  const config = await loadClaudeConfig(testMode);
  
  // For simplicity, we'll work on the first project or home config tools
  let tools: string[] = [];
  if (config.projects) {
    const firstProject = Object.values(config.projects)[0];
    if (firstProject && firstProject.allowedTools) {
      tools = [...firstProject.allowedTools];
    }
  }
  
  let modified = false;
  
  // 1. Fix wrapping issues
  const unwrappedTools = result.wrapping.filter(w => !w.isWrapped);
  if (unwrappedTools.length > 0) {
    logger.info(`\n1. Inconsistent tool wrapping:`);
    logger.info(`   - ${result.wrapping.filter(w => w.isWrapped).length} tools properly wrapped with Bash()`);
    logger.warning(`   - ${unwrappedTools.length} tools missing wrapper`);
    
    if (!testMode) {
      const response = await promptUser('Fix all unwrapped tools? (y/n): ');
      const shouldFix = response === 'y' || response === 'yes';
      
      if (shouldFix) {
        tools = tools.map(tool => {
          if (!tool.startsWith('Bash(') || !tool.endsWith(')')) {
            return `Bash(${tool})`;
          }
          return tool;
        });
        modified = true;
        fixedCount += unwrappedTools.length;
        logger.success(`   ✓ Fixed ${unwrappedTools.length} tools`);
      }
    } else {
      logger.info('   [Test mode: would fix wrapping]');
      fixedCount += unwrappedTools.length;
    }
  }
  
  // 2. Remove duplicates
  if (result.duplicates.length > 0) {
    logger.info(`\n2. Duplicate tools found:`);
    let totalDuplicates = 0;
    
    for (const dup of result.duplicates) {
      logger.warning(`   - "${dup.tool}" appears ${dup.count} times`);
      totalDuplicates += dup.count - 1; // Keep one instance
    }
    
    if (!testMode) {
      const response = await promptUser('Remove all duplicates? (y/n): ');
      const shouldRemove = response === 'y' || response === 'yes';
      
      if (shouldRemove) {
        // Create a set to track unique tools
        const uniqueTools = new Set<string>();
        const newTools: string[] = [];
        
        for (const tool of tools) {
          const normalized = tool.startsWith('Bash(') && tool.endsWith(')') 
            ? tool.slice(5, -1) 
            : tool;
          
          if (!uniqueTools.has(normalized)) {
            uniqueTools.add(normalized);
            newTools.push(tool);
          }
        }
        
        tools = newTools;
        modified = true;
        fixedCount += totalDuplicates;
        logger.success(`   ✓ Removed ${totalDuplicates} duplicates`);
      }
    } else {
      logger.info('   [Test mode: would remove duplicates]');
      fixedCount += totalDuplicates;
    }
  }
  
  // 3. Remove dangerous commands
  if (result.dangerous.length > 0) {
    logger.info(`\n3. Dangerous commands detected:`);
    for (const cmd of result.dangerous) {
      logger.error(`   ⚠ ${cmd}`);
    }
    
    if (!testMode) {
      const response = await promptUser('Remove ALL dangerous commands? (y/n): ');
      const shouldRemove = response === 'y' || response === 'yes';
      
      if (shouldRemove) {
        tools = tools.filter(tool => {
          const command = tool.startsWith('Bash(') && tool.endsWith(')') 
            ? tool.slice(5, -1) 
            : tool;
          return !isBlockedCommand(command) && !isDangerousCommand(command);
        });
        modified = true;
        fixedCount += result.dangerous.length;
        logger.success(`   ✓ Removed ${result.dangerous.length} dangerous commands`);
      }
    } else {
      logger.info('   [Test mode: would remove dangerous commands]');
      fixedCount += result.dangerous.length;
    }
  }
  
  // Save changes if any were made
  if (modified && !testMode) {
    // Create backup first
    await backup.backupConfig(`doctor-${Date.now()}`, testMode);
    
    // Update the first project's tools
    if (config.projects) {
      const firstProjectKey = Object.keys(config.projects)[0];
      if (firstProjectKey) {
        config.projects[firstProjectKey].allowedTools = tools;
      }
    }
    
    await saveClaudeConfig(config, testMode);
    logger.success('\n✓ Configuration repaired successfully!');
  }
  
  return fixedCount;
}