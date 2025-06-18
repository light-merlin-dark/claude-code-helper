/**
 * Project Scanner Service - Finds and analyzes Claude projects
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigService } from './config';
import { LoggerService } from './logger';

export interface ProjectInfo {
  path: string;
  name: string;
  hasClaudeConfig: boolean;
  configPath?: string;
  config?: any;
  lastModified?: Date;
  mcps?: string[];
  permissions?: string[];
}

export interface ScanOptions {
  paths?: string[];
  includeSubdirs?: boolean;
  maxDepth?: number;
  excludePatterns?: string[];
}

export class ProjectScannerService {
  private config: ConfigService;
  private logger: LoggerService;
  private cache: Map<string, ProjectInfo[]> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(config: ConfigService, logger: LoggerService) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Scan for Claude projects
   */
  async scanProjects(options: ScanOptions = {}): Promise<ProjectInfo[]> {
    const cacheKey = JSON.stringify(options);
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const projects: ProjectInfo[] = [];
    const scanPaths = options.paths || this.getDefaultScanPaths();
    const maxDepth = options.maxDepth || 3;
    const excludePatterns = options.excludePatterns || ['node_modules', '.git', 'dist', 'build'];

    for (const scanPath of scanPaths) {
      try {
        await this.scanDirectory(scanPath, projects, 0, maxDepth, excludePatterns);
      } catch (error) {
        this.logger.debug(`Failed to scan ${scanPath}`, { error });
      }
    }

    this.setCached(cacheKey, projects);
    return projects;
  }

  /**
   * Get detailed project information
   */
  async getProjectInfo(projectPath: string): Promise<ProjectInfo | null> {
    try {
      const stats = await fs.promises.stat(projectPath);
      if (!stats.isDirectory()) return null;

      const name = path.basename(projectPath);
      const configPath = path.join(projectPath, '.claude.json');
      
      const info: ProjectInfo = {
        path: projectPath,
        name,
        hasClaudeConfig: false
      };

      try {
        const configData = await fs.promises.readFile(configPath, 'utf8');
        const config = JSON.parse(configData);
        const configStats = await fs.promises.stat(configPath);
        
        info.hasClaudeConfig = true;
        info.configPath = configPath;
        info.config = config;
        info.lastModified = configStats.mtime;
        
        // Extract MCPs and permissions
        info.permissions = config.allowedTools || [];
        info.mcps = this.extractMcps(config);
      } catch {
        // No Claude config or invalid JSON
      }

      return info;
    } catch {
      return null;
    }
  }

  /**
   * Find projects using a specific MCP
   */
  async findProjectsUsingMcp(mcpName: string): Promise<ProjectInfo[]> {
    const allProjects = await this.scanProjects();
    return allProjects.filter(project => 
      project.mcps && project.mcps.includes(mcpName)
    );
  }

  /**
   * Find projects with specific permissions
   */
  async findProjectsWithPermission(permission: string): Promise<ProjectInfo[]> {
    const allProjects = await this.scanProjects();
    return allProjects.filter(project =>
      project.permissions && project.permissions.includes(permission)
    );
  }

  /**
   * Analyze MCP usage across projects
   */
  async analyzeMcpUsage(): Promise<Map<string, number>> {
    const projects = await this.scanProjects();
    const usage = new Map<string, number>();

    for (const project of projects) {
      if (project.mcps) {
        for (const mcp of project.mcps) {
          usage.set(mcp, (usage.get(mcp) || 0) + 1);
        }
      }
    }

    return usage;
  }

  /**
   * Analyze permission usage across projects
   */
  async analyzePermissionUsage(): Promise<Map<string, number>> {
    const projects = await this.scanProjects();
    const usage = new Map<string, number>();

    for (const project of projects) {
      if (project.permissions) {
        for (const perm of project.permissions) {
          usage.set(perm, (usage.get(perm) || 0) + 1);
        }
      }
    }

    return usage;
  }

  private async scanDirectory(
    dir: string,
    projects: ProjectInfo[],
    depth: number,
    maxDepth: number,
    excludePatterns: string[]
  ): Promise<void> {
    if (depth > maxDepth) return;

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      
      // Check if this directory has .claude.json
      const info = await this.getProjectInfo(dir);
      if (info && info.hasClaudeConfig) {
        projects.push(info);
      }

      // Scan subdirectories
      if (depth < maxDepth) {
        for (const entry of entries) {
          if (entry.isDirectory() && !excludePatterns.includes(entry.name)) {
            await this.scanDirectory(
              path.join(dir, entry.name),
              projects,
              depth + 1,
              maxDepth,
              excludePatterns
            );
          }
        }
      }
    } catch {
      // Directory not accessible
    }
  }

  private extractMcps(config: any): string[] {
    const mcps: string[] = [];
    
    if (config.allowedTools) {
      for (const tool of config.allowedTools) {
        if (tool.includes('mcp__')) {
          const mcpMatch = tool.match(/mcp__([^_]+)/);
          if (mcpMatch) {
            mcps.push(mcpMatch[1]);
          }
        }
      }
    }

    return [...new Set(mcps)]; // Remove duplicates
  }

  private getDefaultScanPaths(): string[] {
    const homeDir = os.homedir();
    return [
      path.join(homeDir, 'Projects'),
      path.join(homeDir, 'projects'),
      path.join(homeDir, 'Documents', 'Projects'),
      path.join(homeDir, 'dev'),
      path.join(homeDir, 'Development'),
      path.join(homeDir, 'workspace'),
      path.join(homeDir, 'code'),
      path.join(homeDir, 'repos')
    ];
  }

  private getCached(key: string): ProjectInfo[] | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    const [data, timestamp] = cached as any;
    if (Date.now() - timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }
    
    return data;
  }

  private setCached(key: string, data: ProjectInfo[]): void {
    this.cache.set(key, [data, Date.now()] as any);
  }
}