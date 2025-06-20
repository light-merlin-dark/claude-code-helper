/**
 * Log viewer tool for MCP - provides filtered log access
 */

import { ConfigService } from '../services/config';
import { LoggerService } from '../services/logger';

export interface LogFilterOptions {
  lines?: number;
  level?: string;
  search?: string;
  date?: string;
}

export async function getFilteredLogs(options: LogFilterOptions = {}): Promise<string> {
  try {
    const configService = new ConfigService();
    const loggerService = new LoggerService(configService);
    
    // Get filtered logs
    const result = await loggerService.getFilteredLogs({
      lines: options.lines || 50,
      level: options.level,
      search: options.search,
      date: options.date
    });
    
    const output: string[] = [];
    
    // Header
    output.push('📋 Claude Code Helper Logs');
    output.push('=' .repeat(50));
    output.push(`Log File: ${result.file}`);
    output.push(`Showing ${result.lines.length} of ${result.totalMatches} filtered lines`);
    
    if (options.level) {
      output.push(`Filtered by level: ${options.level}`);
    }
    if (options.search) {
      output.push(`Searched for: "${options.search}"`);
    }
    if (options.date) {
      output.push(`Date: ${options.date}`);
    }
    
    output.push('-'.repeat(50));
    
    // Log entries
    if (result.lines.length === 0) {
      output.push('No log entries found matching the criteria.');
    } else {
      // Format log entries for better readability
      for (const line of result.lines) {
        try {
          // Try to parse as JSON for better formatting
          const parsed = JSON.parse(line);
          const timestamp = parsed.time || parsed.timestamp || '';
          const level = parsed.level || '';
          const msg = parsed.msg || parsed.message || '';
          
          // Convert numeric levels to text
          const levelText = getLevelText(level);
          const levelEmoji = getLevelEmoji(levelText);
          
          output.push(`${levelEmoji} [${timestamp}] ${levelText}: ${msg}`);
          
          // Include additional context if present
          const contextKeys = Object.keys(parsed).filter(
            k => !['time', 'timestamp', 'level', 'msg', 'message', 'pid', 'hostname'].includes(k)
          );
          
          if (contextKeys.length > 0) {
            const context = contextKeys.map(k => `${k}=${JSON.stringify(parsed[k])}`).join(' ');
            output.push(`  ${context}`);
          }
        } catch {
          // If not JSON, display as-is
          output.push(line);
        }
      }
    }
    
    output.push('-'.repeat(50));
    
    // Summary
    const logSummary = await loggerService.getLogSummary(options.date);
    output.push('Summary:');
    output.push(`  Total: ${logSummary.total} entries`);
    output.push(`  Errors: ${logSummary.errors} ${logSummary.errors > 0 ? '❌' : '✅'}`);
    output.push(`  Warnings: ${logSummary.warnings}`);
    output.push(`  Info: ${logSummary.info}`);
    output.push(`  Debug: ${logSummary.debug}`);
    
    // Available log files
    const logFiles = await loggerService.listLogFiles();
    if (logFiles.length > 1) {
      output.push('\nAvailable log files:');
      for (const file of logFiles.slice(0, 5)) {
        output.push(`  - ${file}`);
      }
      if (logFiles.length > 5) {
        output.push(`  ... and ${logFiles.length - 5} more`);
      }
    }
    
    return output.join('\n');
  } catch (error) {
    return `Error retrieving logs: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

function getLevelText(level: number | string): string {
  if (typeof level === 'string') {
    return level.toUpperCase();
  }
  
  const levels: Record<number, string> = {
    10: 'TRACE',
    20: 'DEBUG',
    30: 'INFO',
    40: 'WARN',
    50: 'ERROR',
    60: 'FATAL'
  };
  
  return levels[level] || 'UNKNOWN';
}

function getLevelEmoji(level: string): string {
  const emojis: Record<string, string> = {
    'TRACE': '🔍',
    'DEBUG': '🐛',
    'INFO': 'ℹ️',
    'WARN': '⚠️',
    'ERROR': '❌',
    'FATAL': '💀',
    'UNKNOWN': '❓'
  };
  
  return emojis[level.toUpperCase()] || '📝';
}