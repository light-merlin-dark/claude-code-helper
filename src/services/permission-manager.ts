/**
 * Permission Manager Service - Manages permissions across projects
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigService } from './config';
import { LoggerService } from './logger';
import { SafetyService } from './safety';
import { normalizePermission } from '../core/permissions';
import { smartExpand } from '../utils/expansion';
import { PermissionSafety } from '../core/guards';

export interface Permission {
  value: string;
  addedAt?: Date;
  usageCount?: number;
  lastUsed?: Date;
}

export class PermissionManagerService {
  private config: ConfigService;
  private logger: LoggerService;
  private safety: SafetyService;
  private permissionsPath: string;

  constructor(config: ConfigService, logger: LoggerService, safety: SafetyService) {
    this.config = config;
    this.logger = logger;
    this.safety = safety;
    this.permissionsPath = path.join(config.get('dataDir'), 'permissions.json');
  }

  /**
   * Load permissions from file
   */
  async loadPermissions(): Promise<string[]> {
    try {
      const data = await fs.promises.readFile(this.permissionsPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // Return empty array if file doesn't exist
      return [];
    }
  }

  /**
   * Save permissions to file
   */
  async savePermissions(permissions: string[]): Promise<void> {
    const dir = path.dirname(this.permissionsPath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(
      this.permissionsPath,
      JSON.stringify(permissions, null, 2),
      'utf8'
    );
  }

  /**
   * Add a permission with safety checks
   */
  async addPermission(permission: string): Promise<{
    success: boolean;
    expanded?: string;
    wasExpanded?: boolean;
    error?: string;
  }> {
    const permissions = await this.loadPermissions();
    
    // Normalize and expand
    const normalized = normalizePermission(permission);
    const { expanded, wasExpanded } = smartExpand(normalized);
    
    // Check if already exists
    if (permissions.includes(expanded)) {
      return {
        success: false,
        error: 'Permission already exists'
      };
    }
    
    // Safety check
    const safety = this.safety.checkPermissionSafety(expanded);
    
    if (safety.safety === PermissionSafety.BLOCKED) {
      return {
        success: false,
        error: `Blocked: ${safety.reason || 'This command is not allowed for safety reasons'}`
      };
    }
    
    // Add the permission
    permissions.push(expanded);
    await this.savePermissions(permissions);
    
    this.logger.success(`Added permission: ${expanded}`);
    
    return {
      success: true,
      expanded,
      wasExpanded
    };
  }

  /**
   * Remove a permission by index
   */
  async removePermission(index: number): Promise<boolean> {
    const permissions = await this.loadPermissions();
    
    if (index < 0 || index >= permissions.length) {
      return false;
    }
    
    const removed = permissions.splice(index, 1)[0];
    await this.savePermissions(permissions);
    
    this.logger.success(`Removed permission: ${removed}`);
    return true;
  }

  /**
   * Apply permissions to a project
   */
  async applyToProject(projectPath: string, permissions?: string[]): Promise<{
    success: boolean;
    changesApplied: boolean;
    error?: string;
  }> {
    try {
      const configPath = path.join(projectPath, '.claude.json');
      
      // Load existing config
      let config: any = {};
      try {
        const data = await fs.promises.readFile(configPath, 'utf8');
        config = JSON.parse(data);
      } catch {
        // Config doesn't exist yet
      }
      
      // Get permissions to apply
      const permsToApply = permissions || await this.loadPermissions();
      
      // Initialize allowedTools if not present
      if (!config.allowedTools) {
        config.allowedTools = [];
      }
      
      // Check if changes are needed
      const existingSet = new Set(config.allowedTools);
      const toAdd = permsToApply.filter(p => !existingSet.has(p));
      
      if (toAdd.length === 0) {
        return { success: true, changesApplied: false };
      }
      
      // Apply changes
      config.allowedTools.push(...toAdd);
      
      // Write back
      await fs.promises.writeFile(
        configPath,
        JSON.stringify(config, null, 2),
        'utf8'
      );
      
      return { success: true, changesApplied: true };
    } catch (error: any) {
      return {
        success: false,
        changesApplied: false,
        error: error.message
      };
    }
  }

  /**
   * Apply permissions to all projects
   */
  async applyToAllProjects(): Promise<{
    total: number;
    successful: number;
    failed: number;
    errors: string[];
  }> {
    const projects = await this.findProjects();
    const results = {
      total: projects.length,
      successful: 0,
      failed: 0,
      errors: [] as string[]
    };
    
    for (const project of projects) {
      const result = await this.applyToProject(project);
      if (result.success) {
        results.successful++;
      } else {
        results.failed++;
        if (result.error) {
          results.errors.push(`${project}: ${result.error}`);
        }
      }
    }
    
    return results;
  }

  /**
   * Find all Claude projects
   */
  private async findProjects(): Promise<string[]> {
    const projects: string[] = [];
    const homeDir = os.homedir();
    
    // Common project directories
    const searchDirs = [
      path.join(homeDir, 'Projects'),
      path.join(homeDir, 'projects'),
      path.join(homeDir, 'Documents', 'Projects'),
      path.join(homeDir, 'dev'),
      path.join(homeDir, 'Development'),
      path.join(homeDir, 'workspace'),
      path.join(homeDir, 'code')
    ];
    
    for (const dir of searchDirs) {
      try {
        const subdirs = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const subdir of subdirs) {
          if (subdir.isDirectory()) {
            const projectPath = path.join(dir, subdir.name);
            const configPath = path.join(projectPath, '.claude.json');
            try {
              await fs.promises.access(configPath);
              projects.push(projectPath);
            } catch {
              // No .claude.json in this directory
            }
          }
        }
      } catch {
        // Directory doesn't exist
      }
    }
    
    return projects;
  }
}