/**
 * Tests for Logger Service
 */

import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { LoggerService } from '../../../src/services/logger';
import { ConfigService } from '../../../src/services/config';

describe('LoggerService', () => {
  let logger: LoggerService;
  let mockConfig: ConfigService;
  let consoleLogSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Mock console methods
    consoleLogSpy = mock(() => {});
    consoleWarnSpy = mock(() => {});
    consoleErrorSpy = mock(() => {});
    
    global.console.log = consoleLogSpy;
    global.console.warn = consoleWarnSpy;
    global.console.error = consoleErrorSpy;

    // Create mock config
    mockConfig = {
      get: (key: string, defaultValue?: any) => {
        const config: any = {
          'logging.level': 'info',
          'logging.format': 'pretty'
        };
        return config[key] || defaultValue;
      }
    } as ConfigService;

    logger = new LoggerService(mockConfig);
  });

  test('should log info messages', () => {
    logger.info('Test message');
    expect(consoleLogSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls[0][0]).toContain('[INFO]');
    expect(consoleLogSpy.mock.calls[0][0]).toContain('Test message');
  });

  test('should log warn messages', () => {
    logger.warn('Warning message');
    expect(consoleWarnSpy).toHaveBeenCalled();
    expect(consoleWarnSpy.mock.calls[0][0]).toContain('[WARN]');
    expect(consoleWarnSpy.mock.calls[0][0]).toContain('Warning message');
  });

  test('should log error messages', () => {
    logger.error('Error message');
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('[ERROR]');
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('Error message');
  });

  test('should log success messages', () => {
    logger.success('Success message');
    expect(consoleLogSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls[0][0]).toContain('✓');
    expect(consoleLogSpy.mock.calls[0][0]).toContain('Success message');
  });

  test('should include context in log messages', () => {
    logger.info('Test with context', { user: 'test', id: 123 });
    expect(consoleLogSpy).toHaveBeenCalled();
    const output = consoleLogSpy.mock.calls[0][0];
    expect(output).toContain('user="test"');
    expect(output).toContain('id=123');
  });

  test('should respect log levels', () => {
    // Create logger with error level
    const errorConfig = {
      get: (key: string, defaultValue?: any) => {
        if (key === 'logging.level') return 'error';
        if (key === 'logging.format') return 'pretty';
        return defaultValue;
      }
    } as ConfigService;
    
    const errorLogger = new LoggerService(errorConfig);
    
    errorLogger.debug('Debug message');
    errorLogger.info('Info message');
    errorLogger.warn('Warn message');
    
    // Only error should be logged
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    
    errorLogger.error('Error message');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  test('should create child logger with context', () => {
    const child = logger.child({ service: 'test-service' });
    
    child.info('Child message', { action: 'test' });
    expect(consoleLogSpy).toHaveBeenCalled();
    const output = consoleLogSpy.mock.calls[0][0];
    expect(output).toContain('service="test-service"');
    expect(output).toContain('action="test"');
  });

  test('should log audit entries', () => {
    logger.audit('USER_LOGIN', { userId: '123', ip: '192.168.1.1' });
    expect(consoleLogSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls[0][0]).toContain('[AUDIT]');
    expect(consoleLogSpy.mock.calls[0][0]).toContain('USER_LOGIN');
  });

  test('should format JSON when configured', () => {
    const jsonConfig = {
      get: (key: string, defaultValue?: any) => {
        if (key === 'logging.level') return 'info';
        if (key === 'logging.format') return 'json';
        return defaultValue;
      }
    } as ConfigService;
    
    const jsonLogger = new LoggerService(jsonConfig);
    jsonLogger.info('Test message', { data: 'value' });
    
    expect(consoleLogSpy).toHaveBeenCalled();
    const output = consoleLogSpy.mock.calls[0][0];
    expect(output).toContain('[INFO]');
    
    // Check that the logged message contains JSON
    const jsonPart = output.substring(output.indexOf('{'));
    const parsed = JSON.parse(jsonPart);
    expect(parsed.message).toBe('Test message');
    expect(parsed.data).toBe('value');
  });
});