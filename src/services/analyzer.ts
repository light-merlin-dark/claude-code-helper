/**
 * Configuration analyzer service for audit functionality
 * Analyzes Claude configurations for security issues, bloat, and optimization opportunities
 */

import fs from 'fs';
import path from 'path';
import { ClaudeConfig } from '../core/config';
import { memoize } from '../utils/performance';
import { SecretDetector, SecretScanResult } from './secret-detector';

// Dangerous permission patterns
export const DANGEROUS_PATTERNS = [
  'rm:*', 'rm -rf:*',      // File deletion
  'sudo:*',                 // Elevated privileges
  'eval:*', 'exec:*',       // Code execution
  'chmod 777:*',            // Permission changes
  'curl * | bash',          // Remote execution
  'dd:*', 'mkfs:*',         // Disk operations
  '> *', '>> *'             // File truncation/append
];

export interface SecurityIssue {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  permission: string;
  projects: string[];
  description: string;
}

export interface LargePaste {
  projectName: string;
  entryIndex: number;
  pasteId: string;
  lines: number;
  size: number;
  preview: string;
}

export interface ConfigBloat {
  totalPastes: number;
  totalSize: number;
  potentialReduction: number;
  largestPastes: LargePaste[];
  projectSummaries: Map<string, {
    pasteCount: number;
    totalSize: number;
    reduction: number;
  }>;
}

export interface ProjectTreeNode {
  name: string;
  type: 'directory' | 'project';
  children?: ProjectTreeNode[];
  projectCount?: number;
}

export interface AuditReport {
  overview: {
    totalProjects: number;
    totalConfigSize: number;
    mcpToolsInstalled: number;
    totalPermissions: number;
  };
  security: SecurityIssue[];
  secrets: SecretScanResult;
  bloat: ConfigBloat;
  tree: ProjectTreeNode;
  recommendations: string[];
}

export class Analyzer {
  private secretDetector = new SecretDetector();

  async analyzeConfig(config: ClaudeConfig): Promise<AuditReport> {
    const overview = this.analyzeOverview(config);
    const security = this.findDangerousPermissions(config);
    const secrets = this.secretDetector.scanConfig(config);
    const bloat = this.findConfigBloat(config);
    const tree = this.buildProjectTree(config);
    const recommendations = this.generateRecommendations(security, secrets, bloat);

    return {
      overview,
      security,
      secrets,
      bloat,
      tree,
      recommendations
    };
  }

  private analyzeOverview(config: ClaudeConfig): AuditReport['overview'] {
    const configStr = JSON.stringify(config);
    const totalProjects = Object.keys(config.projects || {}).length;
    const totalConfigSize = Buffer.byteLength(configStr, 'utf8');
    
    // Count unique MCP tools
    const mcpTools = new Set<string>();
    Object.values(config.projects || {}).forEach(project => {
      if (project.mcpServers) {
        Object.keys(project.mcpServers).forEach(mcp => mcpTools.add(mcp));
      }
    });

    // Count total permissions
    let totalPermissions = 0;
    Object.values(config.projects || {}).forEach(project => {
      totalPermissions += (project.allowedCommands || []).length;
    });

    return {
      totalProjects,
      totalConfigSize,
      mcpToolsInstalled: mcpTools.size,
      totalPermissions
    };
  }

  private findDangerousPermissions(config: ClaudeConfig): SecurityIssue[] {
    const issues: SecurityIssue[] = [];
    const permissionMap = new Map<string, string[]>();

    // Scan all projects for dangerous permissions
    Object.entries(config.projects || {}).forEach(([projectName, project]) => {
      const commands = project.allowedCommands || [];
      
      commands.forEach((command: string) => {
        // Check each dangerous pattern
        for (const pattern of DANGEROUS_PATTERNS) {
          if (this.matchesPattern(command, pattern)) {
            if (!permissionMap.has(pattern)) {
              permissionMap.set(pattern, []);
            }
            permissionMap.get(pattern)!.push(projectName);
          }
        }
      });
    });

    // Convert to issues
    permissionMap.forEach((projects, permission) => {
      issues.push({
        severity: 'HIGH',
        permission,
        projects,
        description: this.getPermissionDescription(permission)
      });
    });

    return issues.sort((a, b) => b.projects.length - a.projects.length);
  }

  private matchesPattern(command: string, pattern: string): boolean {
    // Convert pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(command);
  }

  private getPermissionDescription(permission: string): string {
    const descriptions: Record<string, string> = {
      'rm:*': 'Can delete any file',
      'rm -rf:*': 'Can forcefully delete directories',
      'sudo:*': 'Has elevated system privileges',
      'eval:*': 'Can execute arbitrary code',
      'exec:*': 'Can execute system commands',
      'chmod 777:*': 'Can make files world-writable',
      'curl * | bash': 'Can execute remote scripts',
      'dd:*': 'Can write directly to disk devices',
      'mkfs:*': 'Can format disk partitions',
      '> *': 'Can truncate any file',
      '>> *': 'Can append to any file'
    };

    return descriptions[permission] || 'Potentially dangerous operation';
  }

  private findConfigBloat(config: ClaudeConfig): ConfigBloat {
    const largePastes: LargePaste[] = [];
    const projectSummaries = new Map<string, {
      pasteCount: number;
      totalSize: number;
      reduction: number;
    }>();

    let totalPastes = 0;
    let totalSize = 0;

    // Scan all projects for large pastes
    Object.entries(config.projects || {}).forEach(([projectName, project]) => {
      const history = project.history || [];
      let projectPasteCount = 0;
      let projectSize = 0;

      history.forEach((entry: any, entryIndex: number) => {
        if (entry.pastedContents) {
          Object.entries(entry.pastedContents).forEach(([pasteId, paste]: [string, any]) => {
            const content = paste.content || '';
            const lines = content.split('\n').length;
            const size = Buffer.byteLength(content, 'utf8');

            if (lines > 100) { // Large paste threshold
              totalPastes++;
              totalSize += size;
              projectPasteCount++;
              projectSize += size;

              largePastes.push({
                projectName,
                entryIndex,
                pasteId,
                lines,
                size,
                preview: content.substring(0, 80).replace(/\n/g, ' ') + '...'
              });
            }
          });
        }
      });

      if (projectPasteCount > 0) {
        projectSummaries.set(projectName, {
          pasteCount: projectPasteCount,
          totalSize: projectSize,
          reduction: projectSize // Potential reduction is the full size
        });
      }
    });

    // Sort largest pastes by size
    largePastes.sort((a, b) => b.size - a.size);

    return {
      totalPastes,
      totalSize,
      potentialReduction: totalSize,
      largestPastes: largePastes.slice(0, 10), // Top 10 largest
      projectSummaries
    };
  }

  private buildProjectTree(config: ClaudeConfig): ProjectTreeNode {
    const root: ProjectTreeNode = {
      name: 'claude-code',
      type: 'directory',
      children: []
    };

    const projectNames = Object.keys(config.projects || {});
    
    // Build tree structure from project paths
    projectNames.forEach(projectPath => {
      const parts = projectPath.split('/').filter(p => p);
      let current = root;

      parts.forEach((part, index) => {
        const isLast = index === parts.length - 1;
        
        if (!current.children) {
          current.children = [];
        }

        let child = current.children.find(c => c.name === part);
        
        if (!child) {
          child = {
            name: part,
            type: isLast ? 'project' : 'directory',
            children: isLast ? undefined : []
          };
          current.children.push(child);
        }

        if (!isLast) {
          current = child;
        }
      });
    });

    // Calculate project counts for directories
    this.calculateProjectCounts(root);

    return root;
  }

  private calculateProjectCounts(node: ProjectTreeNode): number {
    if (node.type === 'project') {
      return 1;
    }

    let count = 0;
    if (node.children) {
      node.children.forEach(child => {
        count += this.calculateProjectCounts(child);
      });
    }

    node.projectCount = count;
    return count;
  }

  private generateRecommendations(security: SecurityIssue[], secrets: SecretScanResult, bloat: ConfigBloat): string[] {
    const recommendations: string[] = [];

    if (secrets.totalCount > 0) {
      if (secrets.highConfidenceCount > 0) {
        recommendations.push(`🚨 URGENT: Mask ${secrets.highConfidenceCount} high-confidence secrets: cch --clean-config --mask-secrets`);
      } else {
        recommendations.push(`🔒 Review ${secrets.totalCount} potential secrets: cch --audit --show-secrets`);
      }
    }

    if (security.length > 0) {
      recommendations.push(`Remove dangerous permissions: cch --clean-dangerous`);
    }

    if (bloat.totalPastes > 0) {
      const sizeInMB = (bloat.totalSize / 1024 / 1024).toFixed(1);
      const topProjects = Array.from(bloat.projectSummaries.keys()).slice(0, 3).join(',');
      recommendations.push(`Clean bloated history (${sizeInMB} MB): cch --clean-history --projects ${topProjects}`);
    }

    if (secrets.totalCount > 0 || security.length > 0 || bloat.totalPastes > 5) {
      recommendations.push(`Comprehensive cleanup: cch --clean-config`);
    }

    recommendations.push(`Backup before changes: cch --backup-config`);

    return recommendations;
  }

  formatReport(report: AuditReport): string {
    const lines: string[] = [];
    
    lines.push('===========================================');
    lines.push('Claude Code Configuration Audit Report');
    lines.push('===========================================');
    lines.push('');
    
    // Overview
    lines.push('OVERVIEW:');
    lines.push(`- Total projects: ${report.overview.totalProjects}`);
    lines.push(`- Total config size: ${this.formatSize(report.overview.totalConfigSize)}`);
    lines.push(`- MCP tools installed: ${report.overview.mcpToolsInstalled}`);
    lines.push(`- Total permissions: ${report.overview.totalPermissions}`);
    lines.push('');

    // Secrets Detection
    if (report.secrets.totalCount > 0) {
      lines.push('🔐 SECRETS DETECTED:');
      if (report.secrets.highConfidenceCount > 0) {
        lines.push(`[CRITICAL] ${report.secrets.highConfidenceCount} high-confidence secrets found!`);
      }
      lines.push(`Total potential secrets: ${report.secrets.totalCount}`);
      
      Object.entries(report.secrets.categoryCounts).forEach(([category, count]) => {
        const emoji = this.getCategoryEmoji(category);
        lines.push(`  ${emoji} ${this.capitalizeCategory(category)}: ${count}`);
      });
      
      if (report.secrets.highConfidenceCount > 0) {
        lines.push('');
        lines.push('⚠️  Immediate action recommended:');
        lines.push('   Run "cch --clean-config --mask-secrets" to automatically mask secrets');
        lines.push('   Or run "cch --audit --show-secrets" to review secrets manually');
      }
      lines.push('');
    }

    // Security Issues
    if (report.security.length > 0) {
      lines.push('SECURITY ISSUES:');
      lines.push('[HIGH] Dangerous permissions found:');
      
      const permissionGroups = new Map<string, string[]>();
      report.security.forEach(issue => {
        if (!permissionGroups.has(issue.permission)) {
          permissionGroups.set(issue.permission, []);
        }
        permissionGroups.get(issue.permission)!.push(...issue.projects);
      });

      permissionGroups.forEach((projects, permission) => {
        const projectList = projects.length > 3 
          ? `${projects.slice(0, 3).join(', ')}, +${projects.length - 3} more`
          : projects.join(', ');
        lines.push(`  • ${permission} (in ${projects.length} projects: ${projectList})`);
      });
      lines.push('');
    }

    // Config Bloat
    if (report.bloat.totalPastes > 0) {
      lines.push('CONFIG BLOAT:');
      lines.push('[WARN] Large conversation history detected:');
      
      report.bloat.projectSummaries.forEach((summary, projectName) => {
        lines.push(`  • Project: ${projectName}`);
        lines.push(`    - ${summary.pasteCount} large pastes (>100 lines each)`);
        lines.push(`    - Total history size: ${this.formatSize(summary.totalSize)}`);
        lines.push(`    - Potential reduction: ${Math.round(summary.reduction / summary.totalSize * 100)}% (${this.formatSize(summary.reduction)})`);
        lines.push('');
      });
    }

    // Project Tree
    lines.push('PROJECT TREE:');
    lines.push(...this.formatTree(report.tree, '', true));
    lines.push('');

    // Recommendations
    if (report.recommendations.length > 0) {
      lines.push('RECOMMENDATIONS:');
      report.recommendations.forEach((rec, idx) => {
        lines.push(`${idx + 1}. ${rec}`);
      });
      lines.push('');
      lines.push("Run 'cch audit --fix' to interactively resolve issues.");
    }

    return lines.join('\n');
  }

  private formatTree(node: ProjectTreeNode, prefix: string = '', isLast: boolean = true): string[] {
    const lines: string[] = [];
    const connector = isLast ? '└── ' : '├── ';
    const displayName = node.projectCount ? `${node.name}/ (${node.projectCount} projects)` : node.name;
    
    if (node.name !== 'claude-code') { // Skip root node in display
      lines.push(prefix + connector + displayName);
    }

    if (node.children) {
      const childPrefix = node.name === 'claude-code' ? '' : prefix + (isLast ? '    ' : '│   ');
      node.children.forEach((child, index) => {
        const isLastChild = index === node.children!.length - 1;
        lines.push(...this.formatTree(child, childPrefix, isLastChild));
      });
    }

    return lines;
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  private getCategoryEmoji(category: string): string {
    const emojis: Record<string, string> = {
      'api-key': '🔑',
      'token': '🎫',
      'password': '🔒',
      'credential': '🔐',
      'personal': '👤',
      'crypto': '🔑'
    };
    return emojis[category] || '🔍';
  }

  private capitalizeCategory(category: string): string {
    return category
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}