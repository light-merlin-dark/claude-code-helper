/**
 * Doctor tool for MCP - provides system diagnostics
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { getDataDir } from '../core/paths';
import { loadClaudeConfig } from '../core/config';
import { ConfigService } from '../services/config';
import { LoggerService } from '../services/logger';
import { GlobalConfigReaderService } from '../services/global-config-reader';

export async function runSystemDiagnostics(): Promise<string> {
  const report: string[] = [];
  
  report.push('🏥 Claude Code Helper Diagnostics Report');
  report.push('=' .repeat(50));
  
  // System Information
  report.push('\n📊 System Information');
  report.push('-'.repeat(30));
  
  try {
    const packageJsonPath = path.join(__dirname, '../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    report.push(`CCH Version: ${packageJson.version}`);
  } catch {
    report.push(`CCH Version: Unknown`);
  }
  
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
  
  // CCH Files Status
  report.push('\n📂 CCH Files Status');
  report.push('-'.repeat(30));
  
  const dataDir = getDataDir();
  const filesToCheck = [
    { name: 'Preferences', path: path.join(dataDir, 'preferences.json') },
    { name: 'Permissions', path: path.join(dataDir, 'permissions.json') },
    { name: 'State', path: path.join(dataDir, 'state.json') },
    { name: 'Backups Directory', path: path.join(dataDir, 'backups') },
    { name: 'Logs Directory', path: path.join(dataDir, 'logs') }
  ];
  
  for (const file of filesToCheck) {
    const exists = fs.existsSync(file.path);
    report.push(`${file.name}: ${exists ? '✅' : '❌'}`);
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
  
  // Dependencies Check
  report.push('\n📦 Dependencies Status');
  report.push('-'.repeat(30));
  
  try {
    const packageJsonPath = path.join(__dirname, '../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const requiredDeps = ['@modelcontextprotocol/sdk', 'chalk', 'pino'];
    
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
    
    // Check if MCP is registered in Claude config (safely)
    try {
      const claudeConfig = await loadClaudeConfig(false);
      const mcpServers = claudeConfig.mcpServers || {};
      const cchMcp = Object.keys(mcpServers).find(key => 
        mcpServers[key].command?.includes('claude-code-helper') ||
        mcpServers[key].command?.includes('cch')
      );
      
      report.push(`Registered in Claude: ${cchMcp ? `✅ (as ${cchMcp})` : '❌'}`);
    } catch {
      report.push(`Registered in Claude: Unable to check`);
    }
  } catch (error) {
    report.push(`MCP Status: ⚠️ Unable to verify`);
  }
  
  // Global Claude Config Analysis
  report.push('\n🌍 Global Claude Config');
  report.push('-'.repeat(30));
  
  try {
    const loggerService = new LoggerService(new ConfigService());
    const globalReader = new GlobalConfigReaderService(loggerService);
    const globalConfigPath = path.join(os.homedir(), '.claude.json');
    
    if (await globalReader.exists()) {
      const stats = await globalReader.getStats();
      report.push(`Global Config Path: ${globalConfigPath} ✅`);
      report.push(`Config Size: ${(stats.configSize / 1024 / 1024).toFixed(2)} MB`);
      report.push(`Total Projects: ${stats.totalProjects}`);
      report.push(`Projects with MCPs: ${stats.projectsWithMcps}`);
      report.push(`Total Unique MCPs: ${stats.totalMcps}`);
      report.push(`Total MCP Tools: ${stats.totalMcpTools}`);
    } else {
      report.push(`Global Config Path: ${globalConfigPath} ❌`);
    }
  } catch (error) {
    report.push(`Global Config: ❌ ${error instanceof Error ? error.message : 'Unable to analyze'}`);
  }
  
  // Recent Activity
  report.push('\n📈 Recent Activity');
  report.push('-'.repeat(30));
  
  try {
    const statePath = path.join(dataDir, 'state.json');
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      const mcpUsage = state.mcpUsage || {};
      
      let totalUsage = 0;
      let recentMcp = '';
      let recentTime = 0;
      
      for (const [mcp, data] of Object.entries(mcpUsage)) {
        totalUsage += (data as any).usageCount || 0;
        const lastUsed = (data as any).lastUsed || 0;
        if (lastUsed > recentTime) {
          recentTime = lastUsed;
          recentMcp = mcp;
        }
      }
      
      report.push(`Total MCP Tool Calls: ${totalUsage}`);
      if (recentMcp && recentTime) {
        const date = new Date(recentTime);
        report.push(`Most Recent: ${recentMcp} (${date.toLocaleString()})`);
      }
    }
  } catch {
    report.push(`Recent Activity: Unable to load`);
  }
  
  report.push('\n' + '='.repeat(50));
  
  return report.join('\n');
}