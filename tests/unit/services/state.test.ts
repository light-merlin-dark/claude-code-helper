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
  let mockLogger: LoggerService;
  let mockConfig: ConfigService;
  let testDir: string;

  beforeEach(() => {
    // Create test directory
    testDir = path.join(os.tmpdir(), `cch-state-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    // Mock logger
    mockLogger = {
      debug: () => {},
      error: () => {}
    } as any;

    // Mock config
    mockConfig = {
      get: (key: string, defaultValue?: any) => {
        if (key === 'dataDir') return testDir;
        return defaultValue;
      }
    } as ConfigService;

    state = new StateService(mockLogger, mockConfig);
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
    const state2 = new StateService(mockLogger, mockConfig);
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

  test('should handle concurrent writes atomically', async () => {
    // Write multiple values concurrently
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(state.set(`concurrent.key${i}`, `value${i}`));
    }
    
    await Promise.all(promises);
    
    // Verify all values were saved
    for (let i = 0; i < 10; i++) {
      const value = await state.get(`concurrent.key${i}`);
      expect(value).toBe(`value${i}`);
    }
  });
});