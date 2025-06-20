/**
 * Logger Service - Structured logging for Claude Code Helper
 */

import chalk from 'chalk';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import os from 'os';
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
  private pinoLogger: pino.Logger;
  private logDir: string;

  constructor(config: ConfigService) {
    this.config = config;
    this.level = this.parseLogLevel(config.get('logging.level', 'info'));
    this.logDir = path.join(os.homedir(), '.cch', 'logs');
    this.ensureLogDir();
    this.pinoLogger = this.createPinoLogger();
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private createPinoLogger(): pino.Logger {
    // Use date-based log file naming
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(this.logDir, `cch-${today}.log`);
    
    return pino({
      level: this.config.get('logging.level', 'info'),
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label })
      }
    }, pino.destination({
      dest: logFile,
      sync: false,
      mkdir: true
    }));
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
    this.pinoLogger.debug(context || {}, message);
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(chalk.gray(`[DEBUG] ${this.formatMessage('debug', message, context)}`));
    }
  }

  info(message: string, context?: LogContext): void {
    this.pinoLogger.info(context || {}, message);
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(chalk.blue(`[INFO] ${this.formatMessage('info', message, context)}`));
    }
  }

  warn(message: string, context?: LogContext): void {
    this.pinoLogger.warn(context || {}, message);
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(chalk.yellow(`[WARN] ${this.formatMessage('warn', message, context)}`));
    }
  }

  warning(message: string, context?: LogContext): void {
    this.warn(message, context); // Alias for compatibility
  }

  error(message: string, context?: LogContext): void {
    this.pinoLogger.error(context || {}, message);
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(chalk.red(`[ERROR] ${this.formatMessage('error', message, context)}`));
    }
  }

  success(message: string, context?: LogContext): void {
    this.pinoLogger.info(context || {}, `SUCCESS: ${message}`);
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

    this.pinoLogger.warn(auditEntry, `AUDIT: ${action}`);
    
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
   * Get the last N lines from the log file
   */
  async getLastLogLines(lineCount: number = 100): Promise<string[]> {
    // Get today's log file
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(this.logDir, `cch-${today}.log`);
    
    try {
      if (!fs.existsSync(logFile)) {
        return [];
      }
      
      const content = await fs.promises.readFile(logFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      return lines.slice(-lineCount);
    } catch (error) {
      console.error('Failed to read log file:', error);
      return [];
    }
  }

  /**
   * Get filtered logs with advanced options
   */
  async getFilteredLogs(options: {
    lines?: number;
    level?: string;
    search?: string;
    date?: string; // YYYY-MM-DD format
  } = {}): Promise<{ file: string; lines: string[]; totalMatches: number }> {
    const { lines = 50, level, search, date } = options;
    
    // Determine which log file to read
    const targetDate = date || new Date().toISOString().split('T')[0];
    const logFile = path.join(this.logDir, `cch-${targetDate}.log`);
    
    try {
      if (!fs.existsSync(logFile)) {
        return { file: logFile, lines: [], totalMatches: 0 };
      }
      
      const content = await fs.promises.readFile(logFile, 'utf8');
      let logLines = content.split('\n').filter(line => line.trim());
      
      // Filter by level if specified
      if (level) {
        const levelUpper = level.toUpperCase();
        logLines = logLines.filter(line => {
          try {
            const parsed = JSON.parse(line);
            return parsed.level?.toUpperCase() === levelUpper || 
                   parsed.level === this.getLevelNumber(levelUpper);
          } catch {
            // Fallback for non-JSON logs
            return line.includes(`[${levelUpper}]`);
          }
        });
      }
      
      // Filter by search text if specified
      if (search) {
        const searchLower = search.toLowerCase();
        logLines = logLines.filter(line => 
          line.toLowerCase().includes(searchLower)
        );
      }
      
      const totalMatches = logLines.length;
      const resultLines = logLines.slice(-lines);
      
      return { file: logFile, lines: resultLines, totalMatches };
    } catch (error) {
      console.error('Failed to read log file:', error);
      return { file: logFile, lines: [], totalMatches: 0 };
    }
  }

  private getLevelNumber(level: string): number {
    const levels: Record<string, number> = {
      'TRACE': 10,
      'DEBUG': 20,
      'INFO': 30,
      'WARN': 40,
      'ERROR': 50,
      'FATAL': 60
    };
    return levels[level] || 30;
  }

  /**
   * Get log summary for diagnostics
   */
  async getLogSummary(date?: string): Promise<{
    errors: number;
    warnings: number;
    info: number;
    debug: number;
    total: number;
    file: string;
  }> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const logFile = path.join(this.logDir, `cch-${targetDate}.log`);
    
    const summary = {
      errors: 0,
      warnings: 0,
      info: 0,
      debug: 0,
      total: 0,
      file: logFile
    };
    
    try {
      if (!fs.existsSync(logFile)) {
        return summary;
      }
      
      const content = await fs.promises.readFile(logFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      lines.forEach(line => {
        try {
          const parsed = JSON.parse(line);
          const level = parsed.level;
          
          if (level === 50 || level === 'error') summary.errors++;
          else if (level === 40 || level === 'warn') summary.warnings++;
          else if (level === 30 || level === 'info') summary.info++;
          else if (level === 20 || level === 'debug') summary.debug++;
          
          summary.total++;
        } catch {
          // Skip non-JSON lines
        }
      });
      
      return summary;
    } catch (error) {
      console.error('Failed to get log summary:', error);
      return summary;
    }
  }

  /**
   * List available log files
   */
  async listLogFiles(): Promise<string[]> {
    try {
      const files = await fs.promises.readdir(this.logDir);
      return files
        .filter(file => file.startsWith('cch-') && file.endsWith('.log'))
        .sort()
        .reverse(); // Most recent first
    } catch (error) {
      console.error('Failed to list log files:', error);
      return [];
    }
  }

  /**
   * Get the log directory path
   */
  getLogDir(): string {
    return this.logDir;
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