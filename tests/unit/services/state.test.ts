/**
 * Tests for State Service
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { StateService } from '../../../src/services/state';
import { LoggerService } from '../../../src/services/logger';
import { ConfigService } from '../../../src/services/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('StateService', () => {
  let state: StateService;
  let config: ConfigService;
  let logger: LoggerService;
  const testDir = path.join(__dirname, '../../data/.cch-test');

  beforeEach(async () => {
    // Clean slate for each test
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });

    // Use real services in test mode
    config = new ConfigService(true);
    config.set('dataDir', testDir);
    logger = new LoggerService(config);
    state = new StateService(logger, config);
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  test('should get and set values', async () => {
    await state.set('test.key', 'test value');
    const value = await state.get('test.key');
    expect(value).toBe('test value');
  });

  test('should return undefined for non-existent keys', async () => {
    const value = await state.get('nonexistent');
    expect(value).toBeUndefined();
  });

  test('should persist state to file', async () => {
    await state.set('persistent.key', 'persistent value');
    
    // Create new instance to test persistence
    const state2 = new StateService(logger, config);
    const value = await state2.get('persistent.key');
    expect(value).toBe('persistent value');
  });

  test('should delete keys', async () => {
    await state.set('delete.me', 'value');
    expect(await state.get('delete.me')).toBe('value');
    
    await state.delete('delete.me');
    expect(await state.get('delete.me')).toBeUndefined();
  });

  test('should get all state', async () => {
    await state.set('key1', 'value1');
    await state.set('key2', 'value2');
    await state.set('nested.key', 'nested value');
    
    const allState = await state.getAll();
    expect(allState.key1).toBe('value1');
    expect(allState.key2).toBe('value2');
    expect(allState['nested.key']).toBe('nested value');
  });

  test('should track MCP usage', async () => {
    await state.trackMcpUsage('test-mcp', 'test-tool');
    
    const usage = await state.get<any>('mcp.usage.test-mcp');
    expect(usage).toBeDefined();
    expect(usage.count).toBe(1);
    expect(usage.tools['test-tool']).toBe(1);
    expect(usage.lastUsed).toBeDefined();
    
    // Track again
    await state.trackMcpUsage('test-mcp', 'test-tool');
    const usage2 = await state.get<any>('mcp.usage.test-mcp');
    expect(usage2.count).toBe(2);
    expect(usage2.tools['test-tool']).toBe(2);
  });

  test('should get MCP stats', async () => {
    await state.trackMcpUsage('mcp1', 'tool1');
    await state.trackMcpUsage('mcp1', 'tool2');
    await state.trackMcpUsage('mcp2', 'tool1');
    
    const stats = await state.getMcpStats();
    expect(Object.keys(stats).length).toBe(2);
    expect(stats.mcp1.count).toBe(2);
    expect(stats.mcp1.tools.tool1).toBe(1);
    expect(stats.mcp1.tools.tool2).toBe(1);
    expect(stats.mcp2.count).toBe(1);
  });

  test('should handle multiple writes correctly', async () => {
    // Simple test - just verify multiple writes work
    await state.set('key1', 'value1');
    await state.set('key2', 'value2');
    await state.set('key3', 'value3');
    
    // Verify all values were saved
    expect(await state.get('key1')).toBe('value1');
    expect(await state.get('key2')).toBe('value2');
    expect(await state.get('key3')).toBe('value3');
  });
});