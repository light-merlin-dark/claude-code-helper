/**
 * MCP Reload Command - Reload MCP configurations from ~/.claude.json
 */

import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigService } from '../../services/config';
import { LoggerService } from '../../services/logger';
import { PromptService } from '../../services/prompt';
import { loadClaudeConfig } from '../../core/config';

export interface ReloadOptions {
  name?: string;
  all?: boolean;
  dryRun?: boolean;
}

export class McpReloadCommand {
  constructor(
    private config: ConfigService,
    private logger: LoggerService,
    private prompt: PromptService
  ) {}

  async execute(options: ReloadOptions = {}): Promise<void> {
    try {
      const claudeJsonPath = path.join(os.homedir(), '.claude.json');
      
      // Check if claude CLI is available (skip in dry run for testing)
      if (!options.dryRun) {
        const claudeCheck = spawnSync('which', ['claude'], { shell: true });
        if (claudeCheck.status !== 0) {
          this.logger.error('Claude CLI not found');
          this.logger.info('\nTo install Claude CLI:');
          this.logger.info('  1. Visit: https://claude.ai/code');
          this.logger.info('  2. Install the desktop app');
          this.logger.info('  3. Ensure claude CLI is in your PATH');
          throw new Error('Claude CLI not found. Please install Claude Desktop first.');
        }
      }

      // Get list of installed MCPs
      this.logger.info('Fetching installed MCPs...');
      const mcpList = options.dryRun ? ['test-mcp'] : await this.getInstalledMcps();
      
      if (mcpList.length === 0) {
        this.logger.warning('No MCPs found in Claude configuration');
        this.logger.info('\nTo add MCPs:');
        this.logger.info('  1. Open Claude Desktop');
        this.logger.info('  2. Go to Settings > Developer > Model Context Protocol');
        this.logger.info('  3. Add your MCP servers');
        return;
      }

      let mcpsToReload: string[] = [];

      if (options.name) {
        // Reload specific MCP
        if (!mcpList.includes(options.name)) {
          throw new Error(`MCP "${options.name}" not found`);
        }
        mcpsToReload = [options.name];
      } else if (options.all) {
        // Reload all MCPs
        mcpsToReload = mcpList;
      } else {
        // Interactive selection
        const selectedIndex = await this.prompt.select(
          'Select MCP to reload:',
          mcpList
        );
        mcpsToReload = [mcpList[selectedIndex]];
      }

      // Reload each MCP
      for (const mcpName of mcpsToReload) {
        await this.reloadMcp(mcpName, options.dryRun);
      }

      this.logger.success(`Successfully reloaded ${mcpsToReload.length} MCP(s)`);
    } catch (error: any) {
      this.logger.error('Failed to reload MCP', error);
      throw error;
    }
  }

  private async getInstalledMcps(): Promise<string[]> {
    try {
      // First try claude CLI
      const cliResult = spawnSync('claude', ['mcp', 'list'], { 
        encoding: 'utf8',
        timeout: 5000
      });
      
      if (cliResult.status === 0 && cliResult.stdout) {
        const lines = cliResult.stdout.trim().split('\n');
        const mcps = lines
          .map(line => {
            const match = line.match(/^(\S+):/);
            return match ? match[1] : null;
          })
          .filter((name): name is string => name !== null);
        
        if (mcps.length > 0) {
          return mcps;
        }
      }
      
      // Fallback: read from Claude config file
      this.logger.debug('Falling back to reading Claude config file');
      const claudeConfig = await loadClaudeConfig(false);
      
      if (claudeConfig.mcpServers) {
        return Object.keys(claudeConfig.mcpServers);
      }
      
      return [];
    } catch (error) {
      this.logger.debug('Error getting MCP list:', { error });
      return [];
    }
  }

  private async reloadMcp(name: string, dryRun?: boolean): Promise<void> {
    this.logger.info(`🔄 Reloading MCP: ${name}`);

    if (dryRun) {
      this.logger.info('[DRY RUN] Would execute:');
      this.logger.info(`  claude mcp remove ${name}`);
      this.logger.info(`  claude mcp add [config]`);
      return;
    }

    let retries = 0;
    const maxRetries = 2;
    
    while (retries <= maxRetries) {
      try {
        // Get current MCP config
        this.logger.debug('Getting MCP configuration...');
        const mcpConfig = await this.getMcpConfig(name);
        
        if (!mcpConfig) {
          throw new Error(`Configuration for MCP "${name}" not found`);
        }

        // Validate config before proceeding
        if (!mcpConfig.command && !mcpConfig.type) {
          throw new Error(`Invalid configuration for MCP "${name}"`);
        }

        // Remove MCP
        this.logger.info(`  ➖ Removing ${name}...`);
        const removeResult = spawnSync('claude', ['mcp', 'remove', name], {
          encoding: 'utf8',
          timeout: 10000
        });
        
        if (removeResult.status !== 0) {
          const error = removeResult.stderr || removeResult.stdout || 'Unknown error';
          throw new Error(`Failed to remove MCP: ${error}`);
        }

        // Wait a moment for Claude to process
        await new Promise(resolve => setTimeout(resolve, 500));

        // Re-add MCP
        this.logger.info(`  ➕ Re-adding ${name}...`);
        const configJson = JSON.stringify(mcpConfig);
        const addResult = spawnSync('claude', ['mcp', 'add-json', name, configJson], {
          encoding: 'utf8',
          timeout: 10000
        });
        
        if (addResult.status !== 0) {
          const error = addResult.stderr || addResult.stdout || 'Unknown error';
          throw new Error(`Failed to add MCP: ${error}`);
        }

        this.logger.success(`✅ Successfully reloaded ${name}`);
        return;
      } catch (error: any) {
        retries++;
        if (retries > maxRetries) {
          this.logger.error(`Failed after ${maxRetries} retries`);
          throw new Error(`Failed to reload MCP "${name}": ${error.message}`);
        }
        
        this.logger.warning(`Attempt ${retries} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * retries));
      }
    }
  }

  private async getMcpConfig(name: string): Promise<any> {
    try {
      // First try to get from Claude config file for accuracy
      const claudeConfig = await loadClaudeConfig(false);
      
      if (claudeConfig.mcpServers && claudeConfig.mcpServers[name]) {
        const config = claudeConfig.mcpServers[name];
        
        // Ensure proper format
        if (typeof config === 'object' && config.command) {
          return {
            type: 'stdio',
            ...config
          };
        }
      }
      
      // Fallback: Try to parse from claude mcp list output
      const listResult = spawnSync('claude', ['mcp', 'list'], {
        encoding: 'utf8',
        timeout: 5000
      });
      
      if (listResult.status === 0 && listResult.stdout) {
        const lines = listResult.stdout.trim().split('\n');
        
        for (const line of lines) {
          if (line.startsWith(`${name}:`)) {
            // Extract config from the line
            const configPart = line.substring(name.length + 1).trim();
            
            // Common patterns
            if (configPart.includes('npx')) {
              const match = configPart.match(/npx\s+(@?\S+)/);
              if (match) {
                return {
                  type: 'stdio',
                  command: 'npx',
                  args: [match[1]],
                  env: { NODE_NO_WARNINGS: '1' }
                };
              }
            } else if (configPart.includes('bun')) {
              const match = configPart.match(/bun\s+run\s+(.+)/);
              if (match) {
                return {
                  type: 'stdio',
                  command: 'bun',
                  args: ['run', ...match[1].split(/\s+/)],
                  env: { NODE_NO_WARNINGS: '1' }
                };
              }
            } else if (configPart.includes('node')) {
              const match = configPart.match(/node\s+(.+)/);
              if (match) {
                return {
                  type: 'stdio',
                  command: 'node',
                  args: match[1].split(/\s+/),
                  env: { NODE_NO_WARNINGS: '1' }
                };
              }
            } else {
              // Try to parse as command
              const parts = configPart.split(/\s+/);
              if (parts.length > 0) {
                return {
                  type: 'stdio',
                  command: parts[0],
                  args: parts.slice(1),
                  env: { NODE_NO_WARNINGS: '1' }
                };
              }
            }
          }
        }
      }
    } catch (error) {
      this.logger.debug('Error getting MCP config:', { error });
    }

    // Default config for known MCPs
    const defaultConfigs: Record<string, any> = {
      aia: {
        type: 'stdio',
        command: 'aia-mcp',
        env: { NODE_NO_WARNINGS: '1' }
      },
      cch: {
        type: 'stdio',
        command: 'npx',
        args: ['@light-merlin-dark/claude-code-helper', '--mcp'],
        env: { NODE_NO_WARNINGS: '1' }
      },
      'claude-code-helper': {
        type: 'stdio',
        command: 'bun',
        args: ['run', path.join(__dirname, '../../../mcp-server.ts')],
        env: { NODE_NO_WARNINGS: '1' }
      }
    };

    return defaultConfigs[name];
  }
}