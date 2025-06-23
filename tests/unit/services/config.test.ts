/**
 * Tests for Config Service
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { ConfigService } from '../../../src/services/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ConfigService', () => {
  let config: ConfigService;

  beforeEach(async () => {
    config = new ConfigService(true);
    await config.load();
  });

  test('should load default configuration', async () => {
    await config.load();
    
    expect(config.get('toolName')).toBe('claude-code-helper');
    expect(config.get('logging.level')).toBe('info');
    expect(config.get('safety.enabled')).toBe(true);
  });

  test('should get nested config values', () => {
    expect(config.get('logging.level')).toBe('info');
    expect(config.get('mcp.timeout')).toBe(30000);
    expect(config.get('permissions.autoApply')).toBe(true);
  });

  test('should return default value for missing config', () => {
    expect(config.get('nonexistent', 'default')).toBe('default');
    expect(config.get('nested.missing.value', 42)).toBe(42);
  });

  test('should set config values', () => {
    config.set('custom.value', 'test');
    expect(config.get('custom.value')).toBe('test');
    
    config.set('logging.level', 'debug');
    expect(config.get('logging.level')).toBe('debug');
  });

  test('should override config from environment variables', async () => {
    process.env.CCH_LOG_LEVEL = 'error';
    process.env.CCH_VERBOSE = 'true';
    process.env.CCH_SAFETY_ENABLED = 'false';
    process.env.CCH_MCP_TIMEOUT = '60000';
    
    await config.load();
    
    expect(config.get('logging.level')).toBe('error');
    expect(config.get('verbose')).toBe(true);
    expect(config.get('safety.enabled')).toBe(false);
    expect(config.get('mcp.timeout')).toBe(60000);
    
    // Clean up env vars
    delete process.env.CCH_LOG_LEVEL;
    delete process.env.CCH_VERBOSE;
    delete process.env.CCH_SAFETY_ENABLED;
    delete process.env.CCH_MCP_TIMEOUT;
  });

  test('should get all config paths', () => {
    const paths = config.getConfigPaths();
    
    expect(paths.userConfig).toContain('config.json');
    expect(paths.permissions).toContain('permissions.json');
    expect(paths.preferences).toContain('preferences.json');
    expect(paths.state).toContain('state.json');
    expect(paths.backups).toContain('backups');
    expect(paths.claudeConfig).toContain('.claude.json');
  });

  test('should save user configuration', async () => {
    // Set custom values
    config.set('custom.setting', 'value');
    
    await config.save();
    
    // Verify custom value persists
    expect(config.get('custom.setting')).toBe('value');
  });

  test('should handle custom values correctly', async () => {
    config.set('custom.value', 'test');
    
    // Verify custom value is set
    expect(config.get('custom.value')).toBe('test');
    
    // Should still have defaults
    expect(config.get('toolName')).toBe('claude-code-helper');
  });
});