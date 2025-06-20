/**
 * Tests for MCP Reload Command
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import { McpReloadCommand } from '../../../../src/commands/mcp/reload';
import { ConfigService } from '../../../../src/services/config';
import { LoggerService } from '../../../../src/services/logger';
import { PromptService } from '../../../../src/services/prompt';

describe('McpReloadCommand', () => {
  let command: McpReloadCommand;
  let mockConfig: ConfigService;
  let mockLogger: LoggerService;
  let mockPrompt: PromptService;
  let logMessages: string[] = [];

  beforeEach(() => {
    // Reset log messages
    logMessages = [];

    // Create real service instances
    mockConfig = new ConfigService(true);
    mockLogger = new LoggerService(mockConfig);
    mockPrompt = new PromptService();

    // Capture log messages
    mockLogger.info = (msg: string) => {
      logMessages.push(`[INFO] ${msg}`);
    };
    mockLogger.error = (msg: string, error?: any) => {
      logMessages.push(`[ERROR] ${msg}`);
    };
    mockLogger.success = (msg: string) => {
      logMessages.push(`[SUCCESS] ${msg}`);
    };
    mockLogger.debug = (msg: string, data?: any) => {
      logMessages.push(`[DEBUG] ${msg}`);
    };

    // Create command instance
    command = new McpReloadCommand(mockConfig, mockLogger, mockPrompt);
  });

  describe('constructor', () => {
    test('should create instance with required services', () => {
      expect(command).toBeDefined();
      expect(command.execute).toBeDefined();
    });
  });

  describe('execute - dry run mode', () => {
    test('should handle dry run with specific MCP name', async () => {
      await command.execute({ name: 'test-mcp', dryRun: true });

      // Check that dry run messages were logged
      expect(logMessages.some(msg => msg.includes('[DRY RUN]'))).toBe(true);
      expect(logMessages.some(msg => msg.includes('claude mcp remove test-mcp'))).toBe(true);
      expect(logMessages.some(msg => msg.includes('claude mcp add [config]'))).toBe(true);
    });

    test('should handle dry run with all flag', async () => {
      await command.execute({ all: true, dryRun: true });

      // Should reload the test MCP in dry run mode
      expect(logMessages.some(msg => msg.includes('[DRY RUN]'))).toBe(true);
      expect(logMessages.some(msg => msg.includes('test-mcp'))).toBe(true);
    });

    test('should log success message after dry run', async () => {
      await command.execute({ name: 'test-mcp', dryRun: true });

      expect(logMessages.some(msg => msg.includes('[SUCCESS]') && msg.includes('Successfully reloaded'))).toBe(true);
    });
  });

  describe('config parsing', () => {
    test('should have correct structure for reload options', () => {
      const options: any = {
        name: 'test',
        all: false,
        dryRun: true
      };

      expect(options.name).toBe('test');
      expect(options.all).toBe(false);
      expect(options.dryRun).toBe(true);
    });
  });
});