import { execSync } from 'child_process';
import chalk from 'chalk';
import { logger } from '../../utils/logger';

export async function installToClaudeCode(): Promise<void> {
  console.log(chalk.cyan('\n🚀 Installing Claude Code Helper MCP server...\n'));

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
    console.log(chalk.gray('• Removing any existing CCH installation...'));
    try {
      execSync('claude mcp remove cch 2>/dev/null', { stdio: 'ignore' });
    } catch {
      // Ignore errors - it might not be installed
    }

    // Add the new MCP server
    console.log(chalk.gray('• Installing CCH MCP server...'));
    const installCommand = `claude mcp add-json cch '{
      "type": "stdio",
      "command": "cch-mcp",
      "env": {"NODE_NO_WARNINGS": "1"}
    }'`;

    try {
      execSync(installCommand, { stdio: 'inherit' });
    } catch (error) {
      console.error(chalk.red('\n❌ Failed to install MCP server'));
      console.log(chalk.yellow('\nTry running manually:'));
      console.log(chalk.gray(installCommand));
      process.exit(1);
    }

    // Success message
    console.log(chalk.green('\n✅ CCH MCP server installed successfully!'));
    console.log(chalk.cyan('\n📝 Next steps:'));
    console.log(chalk.white('   1. Restart Claude Code to activate the MCP server'));
    console.log(chalk.white('   2. Test by asking Claude: "Use CCH to run diagnostics"'));
    console.log(chalk.gray('\n💡 Available MCP tools:'));
    console.log(chalk.gray('   • mcp__cch__doctor - Run diagnostics'));
    console.log(chalk.gray('   • mcp__cch__reload-mcp - Reload MCP configurations'));
    console.log(chalk.gray('   • mcp__cch__view-logs - View logs with filtering'));
    console.log(chalk.gray('   • mcp__cch__discover-mcp-tools - Find MCP tools across projects'));
    console.log(chalk.gray('   • mcp__cch__list-mcps - List all MCPs in your workspace'));
    console.log(chalk.gray('   • mcp__cch__get-mcp-stats - Get MCP usage statistics'));
    
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