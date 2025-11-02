/**
 * Cache analyzer service for Claude Code cache analysis
 * Analyzes ~/.claude/ cache structure for cleanup opportunities
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// Data models

export interface SessionFile {
  sessionId: string;
  filePath: string;
  size: number;
  created: Date;
  modified: Date;
  isAgent: boolean;
  project: string;
}

export interface ProjectCache {
  projectName: string;
  projectPath: string;
  cachePath: string;
  totalSize: number;
  sessions: SessionFile[];
  lastAccessed: Date;
  isOrphaned: boolean;
  isActive: boolean;
}

export interface FileHistoryCache {
  totalSize: number;
  fileCount: number;
  cachePath: string;
}

export interface DebugCache {
  totalSize: number;
  logCount: number;
  cachePath: string;
}

export interface TodoCache {
  totalSize: number;
  fileCount: number;
  cachePath: string;
}

export interface SessionEnvCache {
  totalSize: number;
  fileCount: number;
  emptyFileCount: number;
  cachePath: string;
}

export interface ShellSnapshotCache {
  totalSize: number;
  fileCount: number;
  cachePath: string;
}

export interface HistoryFile {
  size: number;
  lineCount: number;
  filePath: string;
}

export interface CacheAnalysis {
  overview: {
    totalSize: number;
    totalProjects: number;
    totalSessions: number;
    oldestSession: Date | null;
    newestSession: Date | null;
    cacheDir: string;
  };
  projects: ProjectCache[];
  fileHistory: FileHistoryCache;
  debug: DebugCache;
  todos: TodoCache;
  sessionEnv: SessionEnvCache;
  shellSnapshots: ShellSnapshotCache;
  history: HistoryFile | null;
  largestSessions: SessionFile[];
  orphanedProjects: ProjectCache[];
  staleProjects: ProjectCache[];
  recommendations: CacheRecommendation[];
  potentialSavings: number;
}

export interface CacheRecommendation {
  type: 'orphaned' | 'stale' | 'large-session' | 'old-debug' | 'empty-files';
  severity: 'high' | 'medium' | 'low';
  description: string;
  targetPath: string;
  sizeImpact: number;
  safetyLevel: 'safe' | 'caution' | 'risky';
}

export class CacheAnalyzer {
  private claudeDir: string;

  constructor(testMode: boolean = false) {
    this.claudeDir = testMode
      ? path.join(__dirname, '../../tests/data/.claude')
      : path.join(os.homedir(), '.claude');
  }

  /**
   * Main analysis entry point
   */
  async analyzeCacheStructure(): Promise<CacheAnalysis> {
    // Check if cache directory exists
    if (!fs.existsSync(this.claudeDir)) {
      throw new Error(`Claude cache directory not found: ${this.claudeDir}`);
    }

    const [projects, fileHistory, debug, todos, sessionEnv, shellSnapshots, history] = await Promise.all([
      this.analyzeProjects(),
      this.analyzeFileHistory(),
      this.analyzeDebugLogs(),
      this.analyzeTodos(),
      this.analyzeSessionEnv(),
      this.analyzeShellSnapshots(),
      this.analyzeHistory()
    ]);

    // Calculate totals
    const totalSize = projects.reduce((sum, p) => sum + p.totalSize, 0) +
      fileHistory.totalSize + debug.totalSize + todos.totalSize +
      sessionEnv.totalSize + shellSnapshots.totalSize + (history?.size || 0);

    const allSessions = projects.flatMap(p => p.sessions);
    const totalSessions = allSessions.length;

    // Find oldest and newest sessions
    let oldestSession: Date | null = null;
    let newestSession: Date | null = null;
    if (allSessions.length > 0) {
      oldestSession = allSessions.reduce((oldest, s) =>
        s.created < oldest ? s.created : oldest, allSessions[0].created);
      newestSession = allSessions.reduce((newest, s) =>
        s.modified > newest ? s.modified : newest, allSessions[0].modified);
    }

    // Find largest sessions
    const largestSessions = allSessions
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);

    // Find orphaned and stale projects
    const orphanedProjects = projects.filter(p => p.isOrphaned);
    const staleProjects = this.findStaleProjects(projects, 60);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      orphanedProjects,
      staleProjects,
      largestSessions,
      sessionEnv
    );

    // Calculate potential savings
    const potentialSavings = recommendations.reduce((sum, rec) => sum + rec.sizeImpact, 0);

    return {
      overview: {
        totalSize,
        totalProjects: projects.length,
        totalSessions,
        oldestSession,
        newestSession,
        cacheDir: this.claudeDir
      },
      projects: projects.sort((a, b) => b.totalSize - a.totalSize),
      fileHistory,
      debug,
      todos,
      sessionEnv,
      shellSnapshots,
      history,
      largestSessions,
      orphanedProjects,
      staleProjects,
      recommendations,
      potentialSavings
    };
  }

  /**
   * Analyze project sessions
   */
  private async analyzeProjects(): Promise<ProjectCache[]> {
    const projectsDir = path.join(this.claudeDir, 'projects');

    if (!fs.existsSync(projectsDir)) {
      return [];
    }

    const projectDirs = await fs.promises.readdir(projectsDir);

    const projects = await Promise.all(
      projectDirs.map(dir => this.analyzeProjectDir(dir))
    );

    return projects.filter(p => p !== null) as ProjectCache[];
  }

  /**
   * Analyze individual project directory
   */
  private async analyzeProjectDir(dirName: string): Promise<ProjectCache | null> {
    const cachePath = path.join(this.claudeDir, 'projects', dirName);

    // Check if it's a directory
    const stats = await fs.promises.stat(cachePath);
    if (!stats.isDirectory()) {
      return null;
    }

    // Get all session files first
    const files = await fs.promises.readdir(cachePath);
    const sessionFiles = files.filter(f => f.endsWith('.jsonl'));

    // Get actual project path from first session file (more reliable than decoding)
    let projectPath = this.decodeProjectPath(dirName); // Fallback
    if (sessionFiles.length > 0) {
      const realPath = await this.getProjectPathFromSession(path.join(cachePath, sessionFiles[0]));
      if (realPath) {
        projectPath = realPath;
      }
    }

    // Check if project still exists
    const isOrphaned = !fs.existsSync(projectPath);
    const isActive = process.cwd() === projectPath;

    const sessions = await Promise.all(
      sessionFiles.map(f => this.analyzeSessionFile(cachePath, f, this.getProjectName(dirName)))
    );

    // Filter out any null sessions
    const validSessions = sessions.filter(s => s !== null) as SessionFile[];

    // Calculate totals
    const totalSize = validSessions.reduce((sum, s) => sum + s.size, 0);
    const lastAccessed = validSessions.length > 0
      ? validSessions.reduce((latest, s) =>
          s.modified > latest ? s.modified : latest, validSessions[0].modified)
      : new Date(0);

    return {
      projectName: this.getProjectName(dirName),
      projectPath,
      cachePath,
      totalSize,
      sessions: validSessions.sort((a, b) => b.size - a.size),
      lastAccessed,
      isOrphaned,
      isActive
    };
  }

  /**
   * Analyze individual session file
   */
  private async analyzeSessionFile(
    projectDir: string,
    filename: string,
    projectName: string
  ): Promise<SessionFile | null> {
    try {
      const filePath = path.join(projectDir, filename);
      const stats = await fs.promises.stat(filePath);
      const sessionId = filename.replace('.jsonl', '');

      return {
        sessionId,
        filePath,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        isAgent: filename.startsWith('agent-'),
        project: projectName
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Analyze file-history cache
   */
  private async analyzeFileHistory(): Promise<FileHistoryCache> {
    const fileHistoryDir = path.join(this.claudeDir, 'file-history');

    if (!fs.existsSync(fileHistoryDir)) {
      return { totalSize: 0, fileCount: 0, cachePath: fileHistoryDir };
    }

    let totalSize = 0;
    let fileCount = 0;

    const files = await this.getFilesRecursive(fileHistoryDir);

    for (const file of files) {
      try {
        const stats = await fs.promises.stat(file);
        if (stats.isFile()) {
          totalSize += stats.size;
          fileCount++;
        }
      } catch (error) {
        // Skip files that can't be accessed
      }
    }

    return { totalSize, fileCount, cachePath: fileHistoryDir };
  }

  /**
   * Analyze debug logs cache
   */
  private async analyzeDebugLogs(): Promise<DebugCache> {
    const debugDir = path.join(this.claudeDir, 'debug');

    if (!fs.existsSync(debugDir)) {
      return { totalSize: 0, logCount: 0, cachePath: debugDir };
    }

    let totalSize = 0;
    let logCount = 0;

    const files = await fs.promises.readdir(debugDir);

    for (const file of files) {
      try {
        const filePath = path.join(debugDir, file);
        const stats = await fs.promises.stat(filePath);
        if (stats.isFile()) {
          totalSize += stats.size;
          logCount++;
        }
      } catch (error) {
        // Skip files that can't be accessed
      }
    }

    return { totalSize, logCount, cachePath: debugDir };
  }

  /**
   * Analyze todos cache
   */
  private async analyzeTodos(): Promise<TodoCache> {
    const todosDir = path.join(this.claudeDir, 'todos');

    if (!fs.existsSync(todosDir)) {
      return { totalSize: 0, fileCount: 0, cachePath: todosDir };
    }

    let totalSize = 0;
    let fileCount = 0;

    const files = await this.getFilesRecursive(todosDir);

    for (const file of files) {
      try {
        const stats = await fs.promises.stat(file);
        if (stats.isFile()) {
          totalSize += stats.size;
          fileCount++;
        }
      } catch (error) {
        // Skip files that can't be accessed
      }
    }

    return { totalSize, fileCount, cachePath: todosDir };
  }

  /**
   * Analyze session-env cache
   */
  private async analyzeSessionEnv(): Promise<SessionEnvCache> {
    const sessionEnvDir = path.join(this.claudeDir, 'session-env');

    if (!fs.existsSync(sessionEnvDir)) {
      return { totalSize: 0, fileCount: 0, emptyFileCount: 0, cachePath: sessionEnvDir };
    }

    let totalSize = 0;
    let fileCount = 0;
    let emptyFileCount = 0;

    const files = await this.getFilesRecursive(sessionEnvDir);

    for (const file of files) {
      try {
        const stats = await fs.promises.stat(file);
        if (stats.isFile()) {
          totalSize += stats.size;
          fileCount++;
          if (stats.size === 0) {
            emptyFileCount++;
          }
        }
      } catch (error) {
        // Skip files that can't be accessed
      }
    }

    return { totalSize, fileCount, emptyFileCount, cachePath: sessionEnvDir };
  }

  /**
   * Analyze shell-snapshots cache
   */
  private async analyzeShellSnapshots(): Promise<ShellSnapshotCache> {
    const shellSnapshotsDir = path.join(this.claudeDir, 'shell-snapshots');

    if (!fs.existsSync(shellSnapshotsDir)) {
      return { totalSize: 0, fileCount: 0, cachePath: shellSnapshotsDir };
    }

    let totalSize = 0;
    let fileCount = 0;

    const files = await this.getFilesRecursive(shellSnapshotsDir);

    for (const file of files) {
      try {
        const stats = await fs.promises.stat(file);
        if (stats.isFile()) {
          totalSize += stats.size;
          fileCount++;
        }
      } catch (error) {
        // Skip files that can't be accessed
      }
    }

    return { totalSize, fileCount, cachePath: shellSnapshotsDir };
  }

  /**
   * Analyze history.jsonl file
   */
  private async analyzeHistory(): Promise<HistoryFile | null> {
    const historyPath = path.join(this.claudeDir, 'history.jsonl');

    if (!fs.existsSync(historyPath)) {
      return null;
    }

    try {
      const stats = await fs.promises.stat(historyPath);
      const content = await fs.promises.readFile(historyPath, 'utf-8');
      const lineCount = content.split('\n').filter(line => line.trim()).length;

      return {
        size: stats.size,
        lineCount,
        filePath: historyPath
      };
    } catch (error) {
      return null;
    }
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

  /**
   * Find stale projects (not accessed in X days)
   */
  private findStaleProjects(projects: ProjectCache[], daysOld: number): ProjectCache[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    return projects.filter(p => !p.isActive && p.lastAccessed < cutoffDate);
  }

  /**
   * Decode project path from cache directory name
   */
  /**
   * Get the actual project path from a session file
   * This is more reliable than decoding the directory name,
   * especially for projects with hyphens in their names.
   */
  private async getProjectPathFromSession(sessionFilePath: string): Promise<string | null> {
    try {
      const content = await fs.promises.readFile(sessionFilePath, 'utf-8');
      const lines = content.split('\n').slice(0, 10); // Check first 10 lines

      for (const line of lines) {
        if (!line) continue;
        try {
          const json = JSON.parse(line);
          const projectPath = json.projectPath || json.project_path || json.cwd;
          if (projectPath) {
            return projectPath;
          }
        } catch (e) {
          // Skip malformed lines
          continue;
        }
      }

      return null;
    } catch (error) {
      // If we can't read/parse, return null to fall back to decoding
      return null;
    }
  }

  private decodeProjectPath(encodedName: string): string {
    // "-Users-merlin--dev-ldis" -> "/Users/merlin/_dev/ldis"
    // NOTE: This has issues with hyphens in project names (e.g., "ai-engine" becomes "ai/engine")
    // We try to read from session files first (see getProjectPathFromSession)
    return encodedName
      .replace(/^-/, '/')
      .replace(/--/g, '/_')
      .replace(/-/g, '/');
  }

  /**
   * Get friendly project name
   */
  private getProjectName(encodedName: string): string {
    const fullPath = this.decodeProjectPath(encodedName);
    return path.basename(fullPath);
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(
    orphanedProjects: ProjectCache[],
    staleProjects: ProjectCache[],
    largestSessions: SessionFile[],
    sessionEnv: SessionEnvCache
  ): CacheRecommendation[] {
    const recommendations: CacheRecommendation[] = [];

    // Check for orphaned projects
    if (orphanedProjects.length > 0) {
      const totalSize = orphanedProjects.reduce((sum, p) => sum + p.totalSize, 0);
      recommendations.push({
        type: 'orphaned',
        severity: 'high',
        description: `${orphanedProjects.length} orphaned projects (path no longer exists)`,
        targetPath: '~/.claude/projects/',
        sizeImpact: totalSize,
        safetyLevel: 'safe'
      });
    }

    // Check for stale projects
    if (staleProjects.length > 0) {
      const totalSize = staleProjects.reduce((sum, p) => sum + p.totalSize, 0);
      recommendations.push({
        type: 'stale',
        severity: 'medium',
        description: `${staleProjects.length} projects not accessed in 60+ days`,
        targetPath: '~/.claude/projects/',
        sizeImpact: totalSize,
        safetyLevel: 'caution'
      });
    }

    // Check for large sessions
    const largeSessions = largestSessions.filter(s => s.size > 10 * 1024 * 1024);
    if (largeSessions.length > 0) {
      const totalSize = largeSessions.reduce((sum, s) => sum + s.size, 0);
      recommendations.push({
        type: 'large-session',
        severity: 'medium',
        description: `${largeSessions.length} sessions >10MB (largest: ${this.formatBytes(largeSessions[0].size)})`,
        targetPath: '~/.claude/projects/',
        sizeImpact: totalSize,
        safetyLevel: 'caution'
      });
    }

    // Check for empty files in session-env
    if (sessionEnv.emptyFileCount > 0) {
      recommendations.push({
        type: 'empty-files',
        severity: 'low',
        description: `${sessionEnv.emptyFileCount} empty session-env files`,
        targetPath: '~/.claude/session-env/',
        sizeImpact: 0,
        safetyLevel: 'safe'
      });
    }

    return recommendations;
  }

  /**
   * Format bytes to human-readable size
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  /**
   * Format date to human-readable string
   */
  formatDate(date: Date | null): string {
    if (!date) return 'N/A';
    return date.toLocaleDateString();
  }
}
