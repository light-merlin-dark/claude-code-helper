/**
 * Error handling utilities for Claude Code Helper
 */

import { CommandError } from './core';

export enum ErrorCode {
  // General errors
  UNKNOWN = 'UNKNOWN',
  COMMAND_NOT_FOUND = 'COMMAND_NOT_FOUND',
  INVALID_ARGUMENT = 'INVALID_ARGUMENT',
  INVALID_COMMAND = 'INVALID_COMMAND',
  
  // Permission errors
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  PERMISSION_BLOCKED = 'PERMISSION_BLOCKED',
  PERMISSION_DANGEROUS = 'PERMISSION_DANGEROUS',
  
  // Configuration errors
  CONFIG_ERROR = 'CONFIG_ERROR',
  CONFIG_NOT_FOUND = 'CONFIG_NOT_FOUND',
  CONFIG_INVALID = 'CONFIG_INVALID',
  
  // Backup errors
  BACKUP_NOT_FOUND = 'BACKUP_NOT_FOUND',
  
  // MCP errors
  MCP_NOT_FOUND = 'MCP_NOT_FOUND',
  MCP_ALREADY_EXISTS = 'MCP_ALREADY_EXISTS',
  MCP_INVALID_CONFIG = 'MCP_INVALID_CONFIG',
  
  // File system errors
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_ACCESS_ERROR = 'FILE_ACCESS_ERROR',
  DIRECTORY_NOT_FOUND = 'DIRECTORY_NOT_FOUND',
  
  // Process errors
  TIMEOUT = 'TIMEOUT',
  PROCESS_ERROR = 'PROCESS_ERROR',
  
  // Safety errors
  SAFETY_VIOLATION = 'SAFETY_VIOLATION',
  
  // Other
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CANCELLED = 'CANCELLED'
}

/**
 * Create a command error with consistent structure
 */
export function createCommandError(
  code: ErrorCode,
  message: string,
  details?: any
): CommandError {
  const error: CommandError = {
    code,
    message,
    userMessage: getUserFriendlyMessage(code, message),
    details,
    suggestions: getErrorSuggestions(code)
  };
  
  return error;
}

/**
 * Get user-friendly error messages
 */
function getUserFriendlyMessage(code: ErrorCode, defaultMessage: string): string {
  const messages: Partial<Record<ErrorCode, string>> = {
    [ErrorCode.COMMAND_NOT_FOUND]: 'Command not found. Run "cch --help" to see available commands.',
    [ErrorCode.INVALID_ARGUMENT]: 'Invalid argument provided.',
    [ErrorCode.PERMISSION_DENIED]: 'Permission denied. You may need to run with appropriate permissions.',
    [ErrorCode.CONFIG_NOT_FOUND]: 'Configuration file not found.',
    [ErrorCode.MCP_NOT_FOUND]: 'MCP tool not found.',
    [ErrorCode.FILE_NOT_FOUND]: 'File not found.',
    [ErrorCode.TIMEOUT]: 'Operation timed out.',
    [ErrorCode.SAFETY_VIOLATION]: 'Operation blocked for safety reasons.'
  };
  
  return messages[code] || defaultMessage;
}

/**
 * Get helpful suggestions for common errors
 */
function getErrorSuggestions(code: ErrorCode): string[] {
  const suggestions: Partial<Record<ErrorCode, string[]>> = {
    [ErrorCode.COMMAND_NOT_FOUND]: [
      'Use "cch --help" to see available commands',
      'Check command spelling'
    ],
    [ErrorCode.CONFIG_NOT_FOUND]: [
      'Run "cch --doctor" to diagnose configuration issues',
      'Check if Claude is installed correctly'
    ],
    [ErrorCode.MCP_NOT_FOUND]: [
      'Use "cch mcp-list" to see available MCPs',
      'Run "cch mcp-discover" to find MCPs in your projects'
    ],
    [ErrorCode.PERMISSION_DENIED]: [
      'Check file permissions',
      'Run with appropriate user privileges'
    ],
    [ErrorCode.SAFETY_VIOLATION]: [
      'Review the safety rules with "cch config-view"',
      'Use --dry-run to preview the operation'
    ]
  };
  
  return suggestions[code] || [];
}

/**
 * Check if an error is recoverable
 */
export function isRecoverableError(code: ErrorCode): boolean {
  const nonRecoverable = [
    ErrorCode.PERMISSION_BLOCKED,
    ErrorCode.SAFETY_VIOLATION,
    ErrorCode.CANCELLED
  ];
  
  return !nonRecoverable.includes(code);
}

/**
 * Format error for display
 */
export function formatError(error: CommandError | Error | string): string {
  if (typeof error === 'string') {
    return error;
  }
  
  if ('code' in error && 'userMessage' in error) {
    // CommandError
    let formatted = error.userMessage || error.message;
    
    if (error.suggestions && error.suggestions.length > 0) {
      formatted += '\n\nSuggestions:';
      error.suggestions.forEach(s => {
        formatted += `\n  • ${s}`;
      });
    }
    
    return formatted;
  }
  
  // Regular Error
  return error.message;
}

/**
 * Legacy error classes for backward compatibility
 */
export class ConfigNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigNotFoundError';
  }
}

export class BackupNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupNotFoundError';
  }
}

export class InvalidCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCommandError';
  }
}