/**
 * Cache cleaner service for safe Claude Code cache cleanup
 * Implements safe cleanup operations with multiple safety mechanisms
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { CacheAnalyzer, ProjectCache, SessionFile } from './cache-analyzer';

export interface CleanCacheOptions {
  orphanedProjects?: boolean;
  staleDays?: number;
  largeSessions?: boolean;
  sessionThresholdMB?: number;
  oldDebugLogs?: boolean;
  emptyFiles?: boolean;
  dryRun?: boolean;
  force?: boolean;
}

export interface CleanupItem {
  type: 'session' | 'project' | 'debug' | 'file-history' | 'empty';
  path: string;
  size: number;
  reason: string;
  safety: 'safe' | 'caution' | 'risky';
}

export interface CleanupPlan {
  items: CleanupItem[];
  totalSize: number;
}

export interface CacheCleanupResult {
  sessionsRemoved: number;
  projectsRemoved: number;
  debugLogsRemoved: number;
  emptyFilesRemoved: number;
  totalBytesFreed: number;
  backupPath?: string;
  itemsRemoved: CleanupItem[];
}

export class CacheCleaner {
  private analyzer: CacheAnalyzer;
  private claudeDir: string;

  constructor(testMode: boolean = false) {
    this.analyzer = new CacheAnalyzer(testMode);
    this.claudeDir = testMode
      ? path.join(__dirname, '../../tests/data/.claude')
      : path.join(os.homedir(), '.claude');
  }

  /**
   * Main cleanup entry point
   */
  async cleanCache(options: CleanCacheOptions): Promise<CacheCleanupResult> {
    const {
      orphanedProjects = false,
      staleDays,
      largeSessions = false,
      sessionThresholdMB = 10,
      oldDebugLogs = false,
      emptyFiles = false,
      dryRun = true,
      force = false
    } = options;

    // Always analyze first
    const analysis = await this.analyzer.analyzeCacheStructure();

    // Build cleanup plan
    const cleanupPlan = this.buildCleanupPlan(analysis, options);

    if (cleanupPlan.items.length === 0) {
      return {
        sessionsRemoved: 0,
        projectsRemoved: 0,
        debugLogsRemoved: 0,
        emptyFilesRemoved: 0,
        totalBytesFreed: 0,
        itemsRemoved: []
      };
    }

    if (dryRun) {
      return this.buildDryRunResult(cleanupPlan);
    }

    // Execute cleanup
    const result = await this.executeCleanup(cleanupPlan);

    return result;
  }

  /**
   * Build cleanup plan based on options
   */
  private buildCleanupPlan(
    analysis: any,
    options: CleanCacheOptions
  ): CleanupPlan {
    const items: CleanupItem[] = [];

    // Orphaned projects (SAFE)
    if (options.orphanedProjects) {
      analysis.orphanedProjects.forEach((project: ProjectCache) => {
        items.push({
          type: 'project',
          path: project.cachePath,
          size: project.totalSize,
          reason: `Orphaned project (${project.projectPath} no longer exists)`,
          safety: 'safe'
        });
      });
    }

    // Stale projects (CAUTION - may still be referenced)
    if (options.staleDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - options.staleDays);

      const staleProjects = analysis.projects.filter((p: ProjectCache) =>
        !p.isActive && p.lastAccessed < cutoffDate
      );

      staleProjects.forEach((project: ProjectCache) => {
        items.push({
          type: 'project',
          path: project.cachePath,
          size: project.totalSize,
          reason: `Not accessed in ${options.staleDays} days (last: ${this.analyzer.formatDate(project.lastAccessed)})`,
          safety: 'caution'
        });
      });
    }

    // Large sessions (CAUTION - may still be useful)
    if (options.largeSessions) {
      const threshold = options.sessionThresholdMB! * 1024 * 1024;
      const largeSessions = analysis.largestSessions.filter((s: SessionFile) =>
        s.size > threshold && !this.isActiveSession(s)
      );

      largeSessions.forEach((session: SessionFile) => {
        items.push({
          type: 'session',
          path: session.filePath,
          size: session.size,
          reason: `Large session file (${this.analyzer.formatBytes(session.size)})`,
          safety: 'caution'
        });
      });
    }

    // Empty files (SAFE)
    if (options.emptyFiles && analysis.sessionEnv.emptyFileCount > 0) {
      items.push({
        type: 'empty',
        path: analysis.sessionEnv.cachePath,
        size: 0,
        reason: `${analysis.sessionEnv.emptyFileCount} empty session-env files`,
        safety: 'safe'
      });
    }

    return {
      items,
      totalSize: items.reduce((sum, i) => sum + i.size, 0)
    };
  }

  /**
   * Check if session is currently active
   */
  private isActiveSession(session: SessionFile): boolean {
    // Check if modified in last 24 hours
    const dayAgo = new Date();
    dayAgo.setDate(dayAgo.getDate() - 1);
    return session.modified > dayAgo;
  }

  /**
   * Execute cleanup (moves to trash, not delete)
   */
  private async executeCleanup(plan: CleanupPlan): Promise<CacheCleanupResult> {
    const trashDir = path.join(this.claudeDir, '.trash');
    await fs.promises.mkdir(trashDir, { recursive: true });

    const result: CacheCleanupResult = {
      sessionsRemoved: 0,
      projectsRemoved: 0,
      debugLogsRemoved: 0,
      emptyFilesRemoved: 0,
      totalBytesFreed: 0,
      itemsRemoved: []
    };

    for (const item of plan.items) {
      try {
        // Safety check
        if (!this.isSafeToClean(item.path)) {
          console.warn(`Skipping ${item.path} - safety check failed`);
          continue;
        }

        if (item.type === 'empty') {
          // Handle empty files separately
          await this.cleanEmptyFiles(item.path);
          result.emptyFilesRemoved += parseInt(item.reason.match(/\d+/)?.[0] || '0');
        } else {
          // Move to trash instead of delete (safer)
          const itemName = path.basename(item.path);
          const timestamp = Date.now();
          const trashPath = path.join(trashDir, `${timestamp}-${itemName}`);

          await fs.promises.rename(item.path, trashPath);

          // Update result
          if (item.type === 'project') result.projectsRemoved++;
          else if (item.type === 'session') result.sessionsRemoved++;
          else if (item.type === 'debug') result.debugLogsRemoved++;

          result.totalBytesFreed += item.size;
          result.itemsRemoved.push(item);
        }

      } catch (error) {
        console.error(`Failed to remove ${item.path}:`, error instanceof Error ? error.message : 'unknown error');
      }
    }

    return result;
  }

  /**
   * Build dry-run result
   */
  private buildDryRunResult(plan: CleanupPlan): CacheCleanupResult {
    const result: CacheCleanupResult = {
      sessionsRemoved: 0,
      projectsRemoved: 0,
      debugLogsRemoved: 0,
      emptyFilesRemoved: 0,
      totalBytesFreed: plan.totalSize,
      itemsRemoved: plan.items
    };

    plan.items.forEach(item => {
      if (item.type === 'project') result.projectsRemoved++;
      else if (item.type === 'session') result.sessionsRemoved++;
      else if (item.type === 'debug') result.debugLogsRemoved++;
      else if (item.type === 'empty') {
        result.emptyFilesRemoved += parseInt(item.reason.match(/\d+/)?.[0] || '0');
      }
    });

    return result;
  }

  /**
   * Check if path is safe to delete
   */
  private isSafeToClean(itemPath: string): boolean {
    const cwd = process.cwd();
    const cwdCachePath = this.pathToCachePath(cwd);

    // Check 1: Not current project
    if (itemPath.includes(cwdCachePath)) {
      return false;
    }

    // Check 2: Not recently modified
    try {
      const stats = fs.statSync(itemPath);
      const dayAgo = new Date();
      dayAgo.setDate(dayAgo.getDate() - 1);

      if (stats.mtime > dayAgo) {
        return false;
      }
    } catch (error) {
      // If we can't stat the file, it might not exist or be accessible
      return false;
    }

    // Check 3: Not a config file
    const basename = path.basename(itemPath);
    const configFiles = ['settings.json', 'settings.local.json', 'CLAUDE.md'];
    if (configFiles.includes(basename)) {
      return false;
    }

    return true;
  }

  /**
   * Convert project path to cache path format
   */
  private pathToCachePath(projectPath: string): string {
    // "/Users/merlin/_dev/ldis" -> "-Users-merlin--dev-ldis"
    return projectPath
      .replace(/\//g, '-')
      .replace(/_/g, '--')
      .replace(/^-/, '');
  }

  /**
   * Clean empty files in a directory
   */
  private async cleanEmptyFiles(dirPath: string): Promise<number> {
    let count = 0;

    try {
      const files = await this.getFilesRecursive(dirPath);

      for (const file of files) {
        try {
          const stats = await fs.promises.stat(file);
          if (stats.size === 0) {
            await fs.promises.unlink(file);
            count++;
          }
        } catch (error) {
          // Skip files that can't be accessed
        }
      }
    } catch (error) {
      // Skip if directory doesn't exist
    }

    return count;
  }

  /**
   * Get all files recursively in a directory
   */
  private async getFilesRecursive(dir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...await this.getFilesRecursive(fullPath));
        } else {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories that can't be accessed
    }

    return files;
  }
}
