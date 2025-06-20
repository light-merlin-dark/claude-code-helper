import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../utils/logger';
import { getConfigPath, getDataDir } from '../core/paths';
import { loadClaudeConfig, saveClaudeConfig } from '../core/config';
import { isBlockedCommand, isDangerousCommand } from '../core/guards';
import { promptUser } from '../utils/prompt';
import * as backup from './config/backup';
import { LoggerService } from '../services/logger';
import { ConfigService } from '../services/config';

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
    logger.info('🏥 Running Claude Code Helper Doctor...\n');
    
    // Run comprehensive system diagnostics first
    await runSystemDiagnostics(testMode);
    
    // Then analyze Claude config files
    logger.info('\n🔍 Analyzing Claude Configuration Files...\n');
    
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

async function runSystemDiagnostics(testMode: boolean): Promise<void> {
  const report: string[] = [];
  
  report.push('='.repeat(50));
  report.push('📊 System Information');
  report.push('-'.repeat(30));
  
  // System info
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
  report.push(`CCH Version: ${packageJson.version}`);
  report.push(`Platform: ${os.platform()} ${os.arch()}`);
  report.push(`Node Version: ${process.version}`);
  report.push(`OS Version: ${os.release()}`);
  report.push(`Home Directory: ${os.homedir()}`);
  report.push(`Current Directory: ${process.cwd()}`);
  report.push(`Date: ${new Date().toISOString()}`);
  
  // CCH Configuration
  report.push('\n⚙️  CCH Configuration');
  report.push('-'.repeat(30));
  
  try {
    const configService = new ConfigService();
    const dataDir = getDataDir();
    const configPath = path.join(dataDir, 'config.json');
    
    report.push(`CCH Data Directory: ${dataDir} ${fs.existsSync(dataDir) ? '✅' : '❌'}`);
    report.push(`CCH Config Path: ${configPath} ${fs.existsSync(configPath) ? '✅' : '❌'}`);
    
    if (fs.existsSync(configPath)) {
      const config = configService.getAll();
      report.push(`Log Level: ${config.logging?.level || 'info'}`);
      report.push(`Safety Enabled: ${config.safety?.enabled !== false ? '✅' : '❌'}`);
    }
  } catch (error) {
    report.push(`Config Status: ❌ ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // CCH Files Check
  report.push('\n📂 CCH Files Status');
  report.push('-'.repeat(30));
  
  const dataDir = getDataDir();
  const filesToCheck = [
    { name: 'Preferences', path: path.join(dataDir, 'preferences.json') },
    { name: 'Permissions', path: path.join(dataDir, 'permissions.json') },
    { name: 'State', path: path.join(dataDir, 'state.json') },
    { name: 'Backups Directory', path: path.join(dataDir, 'backups') }
  ];
  
  for (const file of filesToCheck) {
    const exists = fs.existsSync(file.path);
    report.push(`${file.name}: ${exists ? '✅' : '❌'} ${file.path}`);
  }
  
  // Log Analysis
  report.push('\n📋 Log Analysis');
  report.push('-'.repeat(30));
  
  try {
    const configService = new ConfigService();
    const loggerService = new LoggerService(configService);
    const logSummary = await loggerService.getLogSummary();
    const logFiles = await loggerService.listLogFiles();
    
    report.push(`Log Directory: ${loggerService.getLogDir()}`);
    report.push(`Log Files Found: ${logFiles.length}`);
    
    if (logFiles.length > 0) {
      report.push(`Latest Log: ${logFiles[0]}`);
      report.push(`Today's Log Summary:`);
      report.push(`  - Errors: ${logSummary.errors} ${logSummary.errors > 0 ? '⚠️' : '✅'}`);
      report.push(`  - Warnings: ${logSummary.warnings}`);
      report.push(`  - Info: ${logSummary.info}`);
      report.push(`  - Debug: ${logSummary.debug}`);
      report.push(`  - Total Entries: ${logSummary.total}`);
    }
  } catch (error) {
    report.push(`Log Analysis: ❌ ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Environment Variables
  report.push('\n🔧 Environment Variables');
  report.push('-'.repeat(30));
  
  const envVars = [
    'CCH_LOG_LEVEL',
    'CCH_VERBOSE',
    'CCH_SAFETY_ENABLED',
    'CCH_DATA_DIR',
    'NODE_ENV'
  ];
  
  for (const envVar of envVars) {
    const value = process.env[envVar];
    report.push(`${envVar}: ${value || '(not set)'}`);
  }
  
  // Dependencies Check (basic)
  report.push('\n📦 Dependencies Status');
  report.push('-'.repeat(30));
  
  try {
    const requiredDeps = ['@modelcontextprotocol/sdk', 'chalk', 'pino'];
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
    
    for (const dep of requiredDeps) {
      const installed = packageJson.dependencies[dep] || packageJson.devDependencies[dep];
      report.push(`${dep}: ${installed ? `✅ (${installed})` : '❌'}`);
    }
  } catch (error) {
    report.push(`Dependencies Check: ❌ Unable to verify`);
  }
  
  // MCP Server Status
  report.push('\n🔌 MCP Server Status');
  report.push('-'.repeat(30));
  
  try {
    const mcpServerPath = path.join(__dirname, '../../mcp-server.ts');
    const mcpExists = fs.existsSync(mcpServerPath);
    report.push(`MCP Server File: ${mcpExists ? '✅' : '❌'}`);
    
    // Check if MCP is registered in Claude config
    if (!testMode) {
      const claudeConfig = await loadClaudeConfig(false);
      const mcpServers = claudeConfig.mcpServers || {};
      const cchMcp = Object.keys(mcpServers).find(key => 
        mcpServers[key].command?.includes('claude-code-helper') ||
        mcpServers[key].command?.includes('cch')
      );
      
      report.push(`Registered in Claude: ${cchMcp ? `✅ (as ${cchMcp})` : '❌'}`);
    }
  } catch (error) {
    report.push(`MCP Status: ⚠️ Unable to verify`);
  }
  
  report.push('\n' + '='.repeat(50));
  
  // Print the report
  console.log(report.join('\n'));
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