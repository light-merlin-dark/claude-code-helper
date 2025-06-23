import { execSync } from 'child_process';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../../utils/logger';

export async function installToClaudeCode(): Promise<void> {
  // Get version from package.json
  const packagePath = join(__dirname, '../../../package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  const version = packageJson.version;
  
  console.log(chalk.cyan('\n🚀 Installing Claude Code Helper...'));
  console.log(chalk.gray(`   v${version}\n`));
  
  console.log(chalk.gray('CCH is a powerful MCP server that gives AI agents direct access to:'));
  console.log(chalk.gray('• Manage configurations across ALL your Claude Code projects'));
  console.log(chalk.gray('• Discover and analyze MCP tools usage patterns'));
  console.log(chalk.gray('• Smart bash permission management with safety guards'));
  console.log(chalk.gray('• Real-time diagnostics and configuration healing\n'));

  try {
    // Check if claude CLI is available
    try {
      execSync('which claude', { stdio: 'ignore' });
    } catch {
      console.error(chalk.red('❌ Claude CLI not found!'));
      console.log(chalk.yellow('\nPlease install Claude Code first:'));
      console.log(chalk.gray('  https://docs.anthropic.com/en/docs/claude-code'));
      process.exit(1);
    }

    // Remove existing installation (if any)
    console.log(chalk.gray('• Removing any existing installation...'));
    try {
      execSync('claude mcp remove cch 2>/dev/null', { stdio: 'ignore' });
    } catch {
      // Ignore errors - it might not be installed
    }

    // Add the new MCP server
    console.log(chalk.gray('• Installing MCP server...'));
    const installCommand = `claude mcp add-json cch '{
      "type": "stdio",
      "command": "cch-mcp",
      "env": {"NODE_NO_WARNINGS": "1"}
    }'`;

    try {
      execSync(installCommand, { stdio: 'inherit' });
    } catch (error) {
      console.error(chalk.red('\n❌ Installation failed'));
      console.log(chalk.yellow('\nTry running manually:'));
      console.log(chalk.gray(installCommand));
      process.exit(1);
    }

    // Success message with clear next steps
    console.log(chalk.green('\n✅ Claude Code Helper installed successfully!\n'));
    
    console.log(chalk.cyan('🎯 What you can do now:'));
    console.log(chalk.white('   1. Restart Claude Code to activate CCH'));
    console.log(chalk.white('   2. Ask Claude: ') + chalk.gray('"Use CCH to analyze my setup"'));
    console.log(chalk.white('   3. Try: ') + chalk.gray('"Find MCP tools I use frequently"'));
    console.log(chalk.white('   4. Or: ') + chalk.gray('"Check my bash permissions for safety"'));
    
    console.log(chalk.cyan('\n⚡ AI-Accessible Tools:'));
    console.log(chalk.gray('   • Configuration management across all projects'));
    console.log(chalk.gray('   • MCP discovery and usage analytics'));
    console.log(chalk.gray('   • Intelligent permission management'));
    console.log(chalk.gray('   • Real-time diagnostics and log analysis'));
    console.log(chalk.gray('   • Safety validation and issue detection'));
    
    console.log(chalk.cyan('\n💡 Pro tip: ') + chalk.gray('CCH analyzes your global ~/.claude.json to understand'));
    console.log(chalk.gray('   ALL your Claude Code projects automatically.'));
    
  } catch (error) {
    logger.error(`Installation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

export async function uninstallFromClaudeCode(): Promise<void> {
  console.log(chalk.cyan('\n🗑️  Uninstalling Claude Code Helper MCP server...\n'));

  try {
    // Check if claude CLI is available
    try {
      execSync('which claude', { stdio: 'ignore' });
    } catch {
      console.error(chalk.red('❌ Claude CLI not found!'));
      process.exit(1);
    }

    // Remove the installation
    console.log(chalk.gray('• Removing CCH MCP server...'));
    try {
      execSync('claude mcp remove cch', { stdio: 'inherit' });
      console.log(chalk.green('\n✅ CCH MCP server uninstalled successfully!'));
    } catch {
      console.log(chalk.yellow('\n⚠️  CCH might not be installed or removal failed'));
    }
    
  } catch (error) {
    logger.error(`Uninstallation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}