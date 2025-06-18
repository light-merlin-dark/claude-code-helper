/**
 * Safety Service - Validates commands and permissions for safety
 */

import { ConfigService } from './config';
import { LoggerService } from './logger';
import { RuntimeContext } from '../shared/core';
import { PermissionSafety } from '../core/guards';

export interface SafetyCheckResult {
  isBlocked: boolean;
  isDangerous: boolean;
  needsConfirmation?: boolean;
  reasons: string[];
  rule?: string;
}

export class SafetyService {
  private config: ConfigService;
  private logger: LoggerService;

  constructor(config: ConfigService, logger: LoggerService) {
    this.config = config;
    this.logger = logger;
  }

  private dangerousPatterns = [
    { pattern: /rm\s+-rf\s+\/(?:\s|$)/, reason: "Dangerous recursive deletion of root", block: true },
    { pattern: /:(){ :|:& };:/, reason: "Fork bomb detected", block: true },
    { pattern: /mkfs/, reason: "File system formatting", block: true },
    { pattern: /dd\s+.*of=\/dev\//, reason: "Direct disk write", block: true }
  ];

  private confirmPatterns = [
    { pattern: /rm\s+-rf/, reason: "Recursive deletion" },
    { pattern: /truncate.*--size\s*0/, reason: "File truncation" },
    { pattern: />\s*\//, reason: "Overwriting system file" }
  ];

  /**
   * Check if a command is safe to execute
   */
  async checkCommand(command: string, ctx: RuntimeContext): Promise<SafetyCheckResult> {
    const reasons: string[] = [];
    let blockedRule: string | undefined;
    let needsConfirmation = false;
    let isDangerous = false;

    if (!this.config.get('safety.enabled', true)) {
      return {
        isBlocked: false,
        isDangerous: false,
        reasons: []
      };
    }

    // Check blocklist
    for (const rule of this.dangerousPatterns) {
      if (rule.pattern.test(command)) {
        if (rule.block) {
          this.logger.warn('Blocked dangerous command', {
            command,
            rule: rule.reason,
            isAgent: ctx.isViaAgent
          });
          return {
            isBlocked: true,
            isDangerous: true,
            reasons: [rule.reason],
            rule: rule.pattern.toString()
          };
        }
      }
    }

    // Check confirmation patterns (only for human CLI users)
    if (!ctx.isViaAgent && !ctx.isDryRun) {
      for (const rule of this.confirmPatterns) {
        if (rule.pattern.test(command)) {
          needsConfirmation = true;
          isDangerous = true;
          reasons.push(rule.reason);
        }
      }
    }

    // Check custom rules from config
    const customRules = this.config.get<any[]>('safety.customRules', []);
    for (const rule of customRules) {
      const pattern = new RegExp(rule.pattern);
      if (pattern.test(command)) {
        if (rule.block) {
          return {
            isBlocked: true,
            isDangerous: true,
            reasons: [rule.reason],
            rule: pattern.toString()
          };
        } else if (!ctx.isViaAgent) {
          needsConfirmation = true;
          isDangerous = true;
          reasons.push(rule.reason);
        }
      }
    }

    return {
      isBlocked: false,
      isDangerous,
      needsConfirmation,
      reasons
    };
  }

  /**
   * Check if a permission is safe
   */
  checkPermissionSafety(permission: string): {
    safety: PermissionSafety;
    reason?: string;
  } {
    // Import the logic from core/guards.ts
    const blockedCommands = [
      'rm -rf /',
      'mkfs',
      'dd if=/dev/zero',
      'format',
      ':(){:|:&};:'
    ];
    
    const dangerousPatterns = [
      /rm\s+-rf/,
      /sudo/,
      /chmod\s+777/,
      /curl.*\|\s*sh/,
      /wget.*\|\s*sh/
    ];

    // Check if blocked
    for (const blocked of blockedCommands) {
      if (permission.includes(blocked)) {
        return {
          safety: PermissionSafety.BLOCKED,
          reason: `Contains blocked command: ${blocked}`
        };
      }
    }

    // Check if dangerous
    for (const pattern of dangerousPatterns) {
      if (pattern.test(permission)) {
        return {
          safety: PermissionSafety.DANGEROUS,
          reason: 'Contains potentially dangerous pattern'
        };
      }
    }

    return { safety: PermissionSafety.SAFE };
  }

  /**
   * Get danger description for a permission
   */
  getDangerDescription(permission: string): string {
    if (permission.includes('rm -rf')) {
      return 'This permission allows recursive deletion of files and directories.';
    }
    if (permission.includes('sudo')) {
      return 'This permission allows running commands with elevated privileges.';
    }
    if (permission.includes('chmod 777')) {
      return 'This permission allows making files world-writable, which is a security risk.';
    }
    if (/curl.*\|\s*sh/.test(permission) || /wget.*\|\s*sh/.test(permission)) {
      return 'This permission allows downloading and executing scripts from the internet.';
    }
    
    return 'This permission contains potentially dangerous operations.';
  }
}