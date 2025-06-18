/**
 * Logger Service - Structured logging for Claude Code Helper
 */

import chalk from 'chalk';
import { ConfigService } from './config';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface LogContext {
  [key: string]: any;
}

export class LoggerService {
  private config: ConfigService;
  private level: LogLevel;

  constructor(config: ConfigService) {
    this.config = config;
    this.level = this.parseLogLevel(config.get('logging.level', 'info'));
  }

  private parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'debug': return LogLevel.DEBUG;
      case 'info': return LogLevel.INFO;
      case 'warn': return LogLevel.WARN;
      case 'error': return LogLevel.ERROR;
      default: return LogLevel.INFO;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    
    if (this.config.get('logging.format') === 'json') {
      return JSON.stringify({
        timestamp,
        level,
        message,
        ...context
      });
    }

    // Pretty format for console
    let formatted = message;
    if (context && Object.keys(context).length > 0) {
      const contextStr = Object.entries(context)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ');
      formatted += ` ${chalk.gray(contextStr)}`;
    }
    
    return formatted;
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(chalk.gray(`[DEBUG] ${this.formatMessage('debug', message, context)}`));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(chalk.blue(`[INFO] ${this.formatMessage('info', message, context)}`));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(chalk.yellow(`[WARN] ${this.formatMessage('warn', message, context)}`));
    }
  }

  warning(message: string, context?: LogContext): void {
    this.warn(message, context); // Alias for compatibility
  }

  error(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(chalk.red(`[ERROR] ${this.formatMessage('error', message, context)}`));
    }
  }

  success(message: string, context?: LogContext): void {
    // Always log success messages
    console.log(chalk.green(`✓ ${this.formatMessage('info', message, context)}`));
  }

  /**
   * Audit log for security-sensitive operations
   */
  audit(action: string, details: any): void {
    const auditEntry = {
      type: 'AUDIT',
      action,
      timestamp: new Date().toISOString(),
      ...details
    };

    // Always log audit entries
    if (this.config.get('logging.format') === 'json') {
      console.log(JSON.stringify(auditEntry));
    } else {
      console.log(chalk.magenta(`[AUDIT] ${action} - ${JSON.stringify(details)}`));
    }
  }

  /**
   * Log a table (for list outputs)
   */
  table(headers: string[], rows: string[][]): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    // Calculate column widths
    const widths = headers.map((h, i) => {
      const maxRowWidth = Math.max(...rows.map(r => (r[i] || '').length));
      return Math.max(h.length, maxRowWidth) + 2;
    });

    // Print header
    console.log(chalk.bold(
      headers.map((h, i) => h.padEnd(widths[i])).join('')
    ));
    console.log(chalk.gray(
      widths.map(w => '-'.repeat(w - 1)).join(' ')
    ));

    // Print rows
    rows.forEach(row => {
      console.log(
        row.map((cell, i) => (cell || '').padEnd(widths[i])).join('')
      );
    });
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): LoggerService {
    const child = new LoggerService(this.config);
    const originalMethods = ['debug', 'info', 'warn', 'error', 'success', 'audit'] as const;
    
    originalMethods.forEach(method => {
      const original = child[method].bind(child);
      child[method] = (message: string, additionalContext?: LogContext) => {
        original(message, { ...context, ...additionalContext });
      };
    });

    return child;
  }
}