/**
 * Global Config Reader Service - Efficiently reads and parses ~/.claude.json
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { LoggerService } from './logger';

const execAsync = promisify(exec);

export interface GlobalProjectInfo {
  path: string;
  allowedTools: string[];
  mcpServers?: any;
  hasCompletedProjectOnboarding?: boolean;
  lastUsed?: Date;
}

export interface McpUsageInfo {
  mcpName: string;
  tools: Set<string>;
  projects: Set<string>;
}

export class GlobalConfigReaderService {
  private logger: LoggerService;
  private configPath: string;
  private cache: {
    projects?: Map<string, GlobalProjectInfo>;
    mcpUsage?: Map<string, McpUsageInfo>;
    timestamp?: number;
  } = {};
  private cacheTimeout = 60000; // 1 minute cache

  constructor(logger: LoggerService, testMode: boolean = false) {
    this.logger = logger;
    // In test mode, read from test data directory
    if (testMode || process.env.TEST_MODE === 'true') {
      // When running tests, cwd is already set to tests/data
      this.configPath = path.join(process.cwd(), '.claude.json');
    } else {
      this.configPath = path.join(os.homedir(), '.claude.json');
    }
    this.logger.debug('GlobalConfigReaderService initialized', { 
      configPath: this.configPath,
      pid: process.pid,
      cwd: process.cwd()
    });
  }

  /**
   * Check if global config exists
   */
  async exists(): Promise<boolean> {
    try {
      await fs.promises.access(this.configPath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all projects from global config
   */
  async getAllProjects(): Promise<GlobalProjectInfo[]> {
    this.logger.debug('getAllProjects called', { 
      cacheValid: this.isCacheValid(),
      hasCachedProjects: !!this.cache.projects,
      configExists: fs.existsSync(this.configPath),
      pid: process.pid
    });
    
    if (this.isCacheValid() && this.cache.projects) {
      return Array.from(this.cache.projects.values());
    }

    try {
      // Use jq to extract projects efficiently
      const jqCommand = `jq -r '.projects | to_entries[] | {path: .key, allowedTools: .value.allowedTools, mcpServers: .value.mcpServers, hasCompletedProjectOnboarding: .value.hasCompletedProjectOnboarding} | @json' "${this.configPath}"`;
      this.logger.debug('Executing jq command', { command: jqCommand });
      
      const { stdout } = await execAsync(jqCommand);

      const projects = new Map<string, GlobalProjectInfo>();
      const lines = stdout.trim().split('\n').filter(line => line);

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.path) {
            projects.set(data.path, {
              path: data.path,
              allowedTools: data.allowedTools || [],
              mcpServers: data.mcpServers,
              hasCompletedProjectOnboarding: data.hasCompletedProjectOnboarding
            });
          }
        } catch (err) {
          this.logger.debug('Failed to parse project line', { line, error: err });
        }
      }

      this.cache.projects = projects;
      this.cache.timestamp = Date.now();

      this.logger.debug('Projects loaded from config', { 
        projectCount: projects.size,
        pid: process.pid
      });

      return Array.from(projects.values());
    } catch (error) {
      this.logger.error('Failed to read global config', { 
        error: error instanceof Error ? error.message : String(error),
        configPath: this.configPath,
        configExists: fs.existsSync(this.configPath),
        pid: process.pid
      });
      throw error;
    }
  }

  /**
   * Get MCP usage information across all projects
   */
  async getMcpUsage(): Promise<Map<string, McpUsageInfo>> {
    this.logger.debug('getMcpUsage called', { 
      cacheValid: this.isCacheValid(),
      hasCachedData: !!this.cache.mcpUsage,
      pid: process.pid
    });
    
    if (this.isCacheValid() && this.cache.mcpUsage) {
      this.logger.debug('Returning cached MCP usage', { 
        mcpCount: this.cache.mcpUsage.size 
      });
      return this.cache.mcpUsage;
    }

    this.logger.debug('Cache miss, reading projects');
    const projects = await this.getAllProjects();
    const mcpUsage = new Map<string, McpUsageInfo>();

    for (const project of projects) {
      if (!project.allowedTools) continue;

      for (const tool of project.allowedTools) {
        // Match MCP tools pattern: mcp__<name>__<tool>
        // Handle both direct format and Bash() wrapped format
        let mcpMatch = tool.match(/^mcp__([^_]+)__(.+)$/);
        
        // Check for Bash() wrapped format
        if (!mcpMatch) {
          const bashMatch = tool.match(/^Bash\(mcp__([^_]+)__([^:)]+)/);
          if (bashMatch) {
            mcpMatch = ['', bashMatch[1], bashMatch[2]];
          }
        }
        
        // Also check for tools that contain mcp__ anywhere
        if (!mcpMatch && tool.includes('mcp__')) {
          const innerMatch = tool.match(/mcp__([^_]+)__([^:)]+)/);
          if (innerMatch) {
            mcpMatch = ['', innerMatch[1], innerMatch[2]];
          }
        }
        
        if (mcpMatch) {
          const [, mcpName, toolName] = mcpMatch;
          
          if (!mcpUsage.has(mcpName)) {
            mcpUsage.set(mcpName, {
              mcpName,
              tools: new Set(),
              projects: new Set()
            });
          }

          const usage = mcpUsage.get(mcpName)!;
          usage.tools.add(toolName);
          usage.projects.add(project.path);
        }
      }
    }

    this.cache.mcpUsage = mcpUsage;
    
    this.logger.debug('MCP usage calculated', { 
      mcpCount: mcpUsage.size,
      mcps: Array.from(mcpUsage.keys()),
      pid: process.pid
    });
    
    return mcpUsage;
  }

  /**
   * Search for specific MCP usage
   */
  async searchMcp(mcpName: string): Promise<GlobalProjectInfo[]> {
    try {
      // Use grep + jq for efficient search in large files
      const { stdout } = await execAsync(
        `grep -n "mcp__${mcpName}__" "${this.configPath}" | head -100 | cut -d: -f1 | xargs -I {} jq -r 'to_entries | .[] | select(.key | startswith(".projects")) | .value | to_entries | .[] | select(.value.allowedTools[]? | contains("mcp__${mcpName}__")) | .key' "${this.configPath}" | sort -u`
      );

      const projectPaths = stdout.trim().split('\n').filter(line => line);
      const allProjects = await this.getAllProjects();
      
      return projectPaths
        .map(path => allProjects.find(p => p.path === path))
        .filter(p => p !== undefined) as GlobalProjectInfo[];
    } catch (error) {
      // Fallback to full scan if grep/jq fails
      this.logger.debug('Fast search failed, falling back to full scan', { error });
      const projects = await this.getAllProjects();
      return projects.filter(p => 
        p.allowedTools?.some(tool => tool.includes(`mcp__${mcpName}__`))
      );
    }
  }

  /**
   * Get project by path
   */
  async getProject(projectPath: string): Promise<GlobalProjectInfo | null> {
    try {
      const { stdout } = await execAsync(
        `jq -r '.projects["${projectPath}"] // empty | {path: "${projectPath}", allowedTools: .allowedTools, mcpServers: .mcpServers} | @json' "${this.configPath}"`
      );

      if (!stdout.trim()) return null;

      const data = JSON.parse(stdout.trim());
      return {
        path: data.path,
        allowedTools: data.allowedTools || [],
        mcpServers: data.mcpServers
      };
    } catch {
      return null;
    }
  }

  /**
   * Get statistics about global config
   */
  async getStats(): Promise<{
    totalProjects: number;
    projectsWithMcps: number;
    totalMcps: number;
    totalMcpTools: number;
    configSize: number;
  }> {
    const [projects, mcpUsage, stats] = await Promise.all([
      this.getAllProjects(),
      this.getMcpUsage(),
      fs.promises.stat(this.configPath)
    ]);

    const projectsWithMcps = projects.filter(p => 
      p.allowedTools?.some(tool => tool.includes('mcp__'))
    ).length;

    let totalMcpTools = 0;
    mcpUsage.forEach(usage => {
      totalMcpTools += usage.tools.size;
    });

    return {
      totalProjects: projects.length,
      projectsWithMcps,
      totalMcps: mcpUsage.size,
      totalMcpTools,
      configSize: stats.size
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache = {};
  }

  private isCacheValid(): boolean {
    return !!(
      this.cache.timestamp && 
      Date.now() - this.cache.timestamp < this.cacheTimeout
    );
  }
}