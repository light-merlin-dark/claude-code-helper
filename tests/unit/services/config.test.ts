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
  let testDir: string;

  beforeEach(() => {
    // Create a test directory
    testDir = path.join(os.tmpdir(), `cch-config-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    
    // Set env to use test directory
    process.env.CCH_TEST_DIR = testDir;
    
    config = new ConfigService(true);
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    delete process.env.CCH_TEST_DIR;
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
    
    expect(paths.userConfig).toContain('.cch/config.json');
    expect(paths.permissions).toContain('.cch/permissions.json');
    expect(paths.preferences).toContain('.cch/preferences.json');
    expect(paths.state).toContain('.cch/state.json');
    expect(paths.backups).toContain('.cch/backups');
    expect(paths.claudeConfig).toContain('.claude.json');
  });

  test('should save user configuration', async () => {
    await config.load();
    
    // Modify some values
    config.set('logging.level', 'debug');
    config.set('custom.setting', 'value');
    
    await config.save();
    
    // Load in a new instance to verify save
    const config2 = new ConfigService(true);
    await config2.load();
    
    expect(config2.get('logging.level')).toBe('debug');
    expect(config2.get('custom.setting')).toBe('value');
  });

  test('should only save non-default values', async () => {
    await config.load();
    config.set('custom.value', 'test');
    await config.save();
    
    const savedFile = path.join(testDir, 'config.json');
    const savedContent = JSON.parse(fs.readFileSync(savedFile, 'utf8'));
    
    // Should not contain default values
    expect(savedContent.toolName).toBeUndefined();
    expect(savedContent.version).toBeUndefined();
    
    // Should contain custom value
    expect(savedContent.custom?.value).toBe('test');
  });
});