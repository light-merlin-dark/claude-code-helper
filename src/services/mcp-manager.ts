/**
 * MCP Manager Service - Manages MCP tools and configurations
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigService } from './config';
import { LoggerService } from './logger';
import { ProjectScannerService, ProjectInfo } from './project-scanner';
import { GlobalConfigReaderService } from './global-config-reader';

export interface McpInfo {
  name: string;
  tools: string[];
  projects: string[];
  usageCount: number;
  installedDate?: Date;
  lastUsed?: Date;
  config?: any;
}

export interface McpToolInfo {
  fullName: string;  // e.g., "mcp__example_tool"
  mcpName: string;   // e.g., "example"
  toolName: string;  // e.g., "tool"
  projects: string[];
  usageCount: number;
}

export class McpManagerService {
  private config: ConfigService;
  private logger: LoggerService;
  private projectScanner: ProjectScannerService;
  private globalConfigReader: GlobalConfigReaderService;

  constructor(
    config: ConfigService,
    logger: LoggerService,
    projectScanner: ProjectScannerService
  ) {
    this.config = config;
    this.logger = logger;
    this.projectScanner = projectScanner;
    this.globalConfigReader = new GlobalConfigReaderService(logger);
  }

  /**
   * List all MCPs found across projects
   */
  async listMcps(): Promise<McpInfo[]> {
    // Try global config first
    const hasGlobalConfig = await this.globalConfigReader.exists();
    if (hasGlobalConfig) {
      try {
        const mcpUsage = await this.globalConfigReader.getMcpUsage();
        const mcpInfos: McpInfo[] = [];

        for (const [mcpName, usage] of mcpUsage) {
          mcpInfos.push({
            name: mcpName,
            tools: Array.from(usage.tools),
            projects: Array.from(usage.projects),
            usageCount: usage.projects.size
          });
        }

        return mcpInfos;
      } catch (error) {
        this.logger.warn('Failed to read global config, falling back to project scan', { error });
      }
    }

    // Fallback to project scanning
    const projects = await this.projectScanner.scanProjects();
    const mcpMap = new Map<string, McpInfo>();

    for (const project of projects) {
      if (project.permissions) {
        for (const perm of project.permissions) {
          const mcpMatch = perm.match(/mcp__([^_]+)/);
          if (mcpMatch) {
            const mcpName = mcpMatch[1];
            
            if (!mcpMap.has(mcpName)) {
              mcpMap.set(mcpName, {
                name: mcpName,
                tools: [],
                projects: [],
                usageCount: 0
              });
            }

            const info = mcpMap.get(mcpName)!;
            
            // Add project if not already included
            if (!info.projects.includes(project.path)) {
              info.projects.push(project.path);
            }

            // Extract tool name
            const toolMatch = perm.match(/mcp__[^_]+__(.+)/);
            if (toolMatch && !info.tools.includes(toolMatch[1])) {
              info.tools.push(toolMatch[1]);
            }

            info.usageCount++;
          }
        }
      }
    }

    return Array.from(mcpMap.values());
  }

  /**
   * Get detailed MCP statistics
   */
  async getMcpStats(options: {
    timeRange?: { start?: Date; end?: Date };
    groupBy?: 'mcp' | 'tool' | 'project';
  } = {}): Promise<any> {
    const mcps = await this.listMcps();
    const tools = await this.listMcpTools();

    const stats = {
      summary: {
        totalMcps: mcps.length,
        totalTools: tools.length,
        totalUsage: mcps.reduce((sum, mcp) => sum + mcp.usageCount, 0)
      },
      topMcps: mcps
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, 10)
        .map(mcp => ({
          name: mcp.name,
          usageCount: mcp.usageCount,
          projectCount: mcp.projects.length,
          tools: mcp.tools
        })),
      topTools: tools
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, 10)
        .map(tool => ({
          toolName: tool.fullName,
          mcpName: tool.mcpName,
          usageCount: tool.usageCount,
          projectCount: tool.projects.length
        }))
    };

    return stats;
  }

  /**
   * List all MCP tools
   */
  async listMcpTools(): Promise<McpToolInfo[]> {
    // Try global config first
    const hasGlobalConfig = await this.globalConfigReader.exists();
    if (hasGlobalConfig) {
      try {
        const projects = await this.globalConfigReader.getAllProjects();
        const toolMap = new Map<string, McpToolInfo>();

        for (const project of projects) {
          if (project.allowedTools) {
            for (const perm of project.allowedTools) {
              // Handle both direct mcp__ format and Bash() wrapped format
              let fullName = perm;
              let mcpName = '';
              let toolName = '';
              
              if (perm.startsWith('mcp__')) {
                const parts = perm.split('__');
                if (parts.length >= 2) {
                  mcpName = parts[1];
                  toolName = parts.slice(2).join('__') || 'default';
                }
              } else if (perm.includes('mcp__')) {
                // Handle Bash() wrapped format
                const match = perm.match(/mcp__([^_]+)__([^:)]+)/);
                if (match) {
                  mcpName = match[1];
                  toolName = match[2];
                  fullName = `mcp__${mcpName}__${toolName}`;
                }
              }
              
              if (mcpName) {
                if (!toolMap.has(fullName)) {
                  toolMap.set(fullName, {
                    fullName,
                    mcpName,
                    toolName,
                    projects: [],
                    usageCount: 0
                  });
                }

                const info = toolMap.get(fullName)!;
                if (!info.projects.includes(project.path)) {
                  info.projects.push(project.path);
                }
                info.usageCount++;
              }
            }
          }
        }

        return Array.from(toolMap.values());
      } catch (error) {
        this.logger.warn('Failed to read global config, falling back to project scan', { error });
      }
    }

    // Fallback to project scanning
    const projects = await this.projectScanner.scanProjects();
    const toolMap = new Map<string, McpToolInfo>();

    for (const project of projects) {
      if (project.permissions) {
        for (const perm of project.permissions) {
          if (perm.startsWith('mcp__')) {
            const parts = perm.split('__');
            if (parts.length >= 2) {
              const mcpName = parts[1];
              const toolName = parts.slice(2).join('__') || 'default';
              const fullName = perm;

              if (!toolMap.has(fullName)) {
                toolMap.set(fullName, {
                  fullName,
                  mcpName,
                  toolName,
                  projects: [],
                  usageCount: 0
                });
              }

              const info = toolMap.get(fullName)!;
              if (!info.projects.includes(project.path)) {
                info.projects.push(project.path);
              }
              info.usageCount++;
            }
          }
        }
      }
    }

    return Array.from(toolMap.values());
  }

  /**
   * Discover frequently used MCP tools
   */
  async discoverFrequentTools(minProjectCount: number = 3): Promise<McpToolInfo[]> {
    const tools = await this.listMcpTools();
    return tools.filter(tool => tool.projects.length >= minProjectCount)
      .sort((a, b) => b.projects.length - a.projects.length);
  }

  /**
   * Add MCP to project(s)
   */
  async addMcpToProjects(
    mcpName: string,
    projectPaths: string[],
    tools?: string[]
  ): Promise<{
    successful: string[];
    failed: string[];
    errors: Map<string, string>;
  }> {
    const results = {
      successful: [] as string[],
      failed: [] as string[],
      errors: new Map<string, string>()
    };

    for (const projectPath of projectPaths) {
      try {
        await this.addMcpToProject(projectPath, mcpName, tools);
        results.successful.push(projectPath);
      } catch (error: any) {
        results.failed.push(projectPath);
        results.errors.set(projectPath, error.message);
      }
    }

    return results;
  }

  /**
   * Add MCP to a single project
   */
  private async addMcpToProject(
    projectPath: string,
    mcpName: string,
    tools?: string[]
  ): Promise<void> {
    const configPath = path.join(projectPath, '.claude.json');
    
    // Load existing config
    let config: any = {};
    try {
      const data = await fs.promises.readFile(configPath, 'utf8');
      config = JSON.parse(data);
    } catch {
      // Config doesn't exist yet
    }

    // Initialize allowedTools if not present
    if (!config.allowedTools) {
      config.allowedTools = [];
    }

    // Add MCP tools
    const toolsToAdd = tools || ['*']; // Default to all tools
    const permissionsToAdd: string[] = [];

    for (const tool of toolsToAdd) {
      const permission = tool === '*' 
        ? `mcp__${mcpName}__*`
        : `mcp__${mcpName}__${tool}`;
      
      if (!config.allowedTools.includes(permission)) {
        permissionsToAdd.push(permission);
      }
    }

    if (permissionsToAdd.length > 0) {
      config.allowedTools.push(...permissionsToAdd);
      
      // Write back
      await fs.promises.writeFile(
        configPath,
        JSON.stringify(config, null, 2),
        'utf8'
      );
      
      this.logger.info(`Added MCP "${mcpName}" to ${projectPath}`, {
        tools: permissionsToAdd
      });
    }
  }

  /**
   * Remove MCP from project(s)
   */
  async removeMcpFromProjects(
    mcpName: string,
    projectPaths: string[]
  ): Promise<{
    successful: string[];
    failed: string[];
    errors: Map<string, string>;
  }> {
    const results = {
      successful: [] as string[],
      failed: [] as string[],
      errors: new Map<string, string>()
    };

    for (const projectPath of projectPaths) {
      try {
        await this.removeMcpFromProject(projectPath, mcpName);
        results.successful.push(projectPath);
      } catch (error: any) {
        results.failed.push(projectPath);
        results.errors.set(projectPath, error.message);
      }
    }

    return results;
  }

  /**
   * Remove MCP from a single project
   */
  private async removeMcpFromProject(
    projectPath: string,
    mcpName: string
  ): Promise<void> {
    const configPath = path.join(projectPath, '.claude.json');
    
    // Load existing config
    const data = await fs.promises.readFile(configPath, 'utf8');
    const config = JSON.parse(data);

    if (!config.allowedTools) {
      return; // Nothing to remove
    }

    // Remove all permissions for this MCP
    const original = config.allowedTools.length;
    config.allowedTools = config.allowedTools.filter(
      (tool: string) => !tool.startsWith(`mcp__${mcpName}__`)
    );

    if (config.allowedTools.length < original) {
      // Write back
      await fs.promises.writeFile(
        configPath,
        JSON.stringify(config, null, 2),
        'utf8'
      );
      
      this.logger.info(`Removed MCP "${mcpName}" from ${projectPath}`);
    }
  }
}