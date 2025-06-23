/**
 * Enhanced error handling utilities with user-friendly messages
 */

import { logger } from './logger';

export class CCHError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: string,
    public suggestion?: string
  ) {
    super(message);
    this.name = 'CCHError';
  }
}

export class ConfigError extends CCHError {
  constructor(message: string, details?: string, suggestion?: string) {
    super(message, 'CONFIG_ERROR', details, suggestion);
    this.name = 'ConfigError';
  }
}

export class PermissionError extends CCHError {
  constructor(message: string, details?: string, suggestion?: string) {
    super(message, 'PERMISSION_ERROR', details, suggestion);
    this.name = 'PermissionError';
  }
}

export class ValidationError extends CCHError {
  constructor(message: string, details?: string, suggestion?: string) {
    super(message, 'VALIDATION_ERROR', details, suggestion);
    this.name = 'ValidationError';
  }
}

export class FileSystemError extends CCHError {
  constructor(message: string, details?: string, suggestion?: string) {
    super(message, 'FILESYSTEM_ERROR', details, suggestion);
    this.name = 'FileSystemError';
  }
}

/**
 * Format error for user display
 */
export function formatError(error: Error | CCHError): string {
  const lines: string[] = [];
  
  // Error icon and main message
  lines.push(`❌ ${error.message}`);
  
  // Additional details for CCH errors
  if (error instanceof CCHError) {
    if (error.details) {
      lines.push(`   ${error.details}`);
    }
    
    if (error.suggestion) {
      lines.push('');
      lines.push(`💡 ${error.suggestion}`);
    }
  }
  
  // For verbose mode, show stack trace
  if (process.env.VERBOSE === 'true' && error.stack) {
    lines.push('');
    lines.push('Stack trace:');
    lines.push(error.stack);
  }
  
  return lines.join('\n');
}

/**
 * Handle common file system errors with better messages
 */
export function handleFileSystemError(error: any, filePath: string): never {
  if (error.code === 'ENOENT') {
    throw new FileSystemError(
      `File not found: ${filePath}`,
      'The specified file or directory does not exist.',
      'Check the path and ensure the file exists.'
    );
  }
  
  if (error.code === 'EACCES') {
    throw new FileSystemError(
      `Permission denied: ${filePath}`,
      'You do not have permission to access this file.',
      'Check file permissions or run with appropriate privileges.'
    );
  }
  
  if (error.code === 'EISDIR') {
    throw new FileSystemError(
      `Path is a directory: ${filePath}`,
      'Expected a file but found a directory.',
      'Provide a path to a file, not a directory.'
    );
  }
  
  if (error.code === 'ENOTDIR') {
    throw new FileSystemError(
      `Path is not a directory: ${filePath}`,
      'Expected a directory but found a file.',
      'Provide a path to a directory, not a file.'
    );
  }
  
  // Generic file system error
  throw new FileSystemError(
    `File system error: ${error.message}`,
    `Error code: ${error.code}`,
    'Check the file path and permissions.'
  );
}

/**
 * Handle JSON parsing errors with better messages
 */
export function handleJSONError(error: any, filePath: string): never {
  if (error instanceof SyntaxError) {
    const match = error.message.match(/position (\d+)/);
    const position = match ? match[1] : 'unknown';
    
    throw new ConfigError(
      `Invalid JSON in ${filePath}`,
      `JSON syntax error at position ${position}: ${error.message}`,
      'Check for missing commas, quotes, or brackets in the JSON file.'
    );
  }
  
  throw error;
}

/**
 * Validate required parameters with helpful messages
 */
export function validateRequired(value: any, name: string, type?: string): void {
  if (value === undefined || value === null || value === '') {
    throw new ValidationError(
      `Missing required parameter: ${name}`,
      type ? `Expected ${type} value for ${name}` : undefined,
      `Please provide a value for ${name}`
    );
  }
}

/**
 * Validate pattern with helpful messages
 */
export function validatePattern(value: string, pattern: RegExp, name: string, example?: string): void {
  if (!pattern.test(value)) {
    throw new ValidationError(
      `Invalid format for ${name}: ${value}`,
      `Value must match pattern: ${pattern}`,
      example ? `Example: ${example}` : undefined
    );
  }
}

/**
 * User-friendly error handler for CLI
 */
export function handleCLIError(error: Error | CCHError): void {
  console.error(formatError(error));
  
  // Log full error in verbose mode
  if (process.env.VERBOSE === 'true') {
    logger.error(`Full error details: ${error}`);
  }
  
  process.exit(1);
}