import { copyFileSync, existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import path from 'path';
import os from 'os';

/**
 * Utilities for managing test configuration data
 */

export const TEST_DATA_DIR = path.join(__dirname, 'data');
export const TEST_CONFIGS_DIR = path.join(TEST_DATA_DIR, 'configs');
export const TEST_TEMP_DIR = path.join(TEST_DATA_DIR, 'temp');

/**
 * Available test configuration files
 */
export const TEST_CONFIGS = {
  CLEAN: 'claude-config-clean.json',
  BLOATED: 'claude-config-bloated.json', 
  DANGEROUS: 'claude-config-dangerous.json',
  MULTI_PROJECT: 'claude-config-multi-project.json',
  COMPLEX: 'claude-config-complex.json'
} as const;

/**
 * Create a temporary test workspace with a specific config
 */
export async function setupTestConfig(configName: string, testId: string = 'default'): Promise<string> {
  const testWorkspace = path.join(TEST_TEMP_DIR, `test-${testId}-${Date.now()}`);
  
  // Create test workspace directory
  mkdirSync(testWorkspace, { recursive: true });
  
  // Copy the test config as .claude.json
  const sourceConfig = path.join(TEST_CONFIGS_DIR, configName);
  const targetConfig = path.join(testWorkspace, '.claude.json');
  
  if (!existsSync(sourceConfig)) {
    throw new Error(`Test config not found: ${sourceConfig}`);
  }
  
  copyFileSync(sourceConfig, targetConfig);
  
  return testWorkspace;
}

/**
 * Clean up a specific test workspace
 */
export async function cleanupTestConfig(testWorkspace: string): Promise<void> {
  if (existsSync(testWorkspace) && testWorkspace.includes(TEST_TEMP_DIR)) {
    rmSync(testWorkspace, { recursive: true, force: true });
  }
}

/**
 * Clean up all temporary test files
 */
export async function cleanupAllTemp(): Promise<void> {
  if (existsSync(TEST_TEMP_DIR)) {
    const entries = require('fs').readdirSync(TEST_TEMP_DIR);
    for (const entry of entries) {
      if (entry !== '.gitignore') {
        const fullPath = path.join(TEST_TEMP_DIR, entry);
        rmSync(fullPath, { recursive: true, force: true });
      }
    }
  }
}

/**
 * Copy a test config to the temp directory and return the path
 * This is useful for tests that need to modify the config
 */
export async function copyTestConfig(configName: string, targetName: string = '.claude.json'): Promise<string> {
  const testWorkspace = path.join(TEST_TEMP_DIR, `workspace-${Date.now()}`);
  mkdirSync(testWorkspace, { recursive: true });
  
  const sourceConfig = path.join(TEST_CONFIGS_DIR, configName);
  const targetConfig = path.join(testWorkspace, targetName);
  
  copyFileSync(sourceConfig, targetConfig);
  
  return targetConfig;
}

/**
 * Read a test config and return parsed JSON
 */
export function readTestConfig(configName: string): any {
  const configPath = path.join(TEST_CONFIGS_DIR, configName);
  const content = readFileSync(configPath, 'utf8');
  return JSON.parse(content);
}

/**
 * Create a test config with specific properties for custom scenarios
 */
export async function createCustomTestConfig(
  testId: string,
  configData: any
): Promise<string> {
  const testWorkspace = path.join(TEST_TEMP_DIR, `custom-${testId}-${Date.now()}`);
  mkdirSync(testWorkspace, { recursive: true });
  
  const configPath = path.join(testWorkspace, '.claude.json');
  require('fs').writeFileSync(configPath, JSON.stringify(configData, null, 2));
  
  return testWorkspace;
}

/**
 * Get stats about test configurations for documentation
 */
export function getTestConfigStats(): Record<string, any> {
  const stats: Record<string, any> = {};
  
  for (const [key, filename] of Object.entries(TEST_CONFIGS)) {
    const config = readTestConfig(filename);
    const projectCount = Object.keys(config.projects || {}).length;
    
    let totalPerms = 0;
    let totalMcps = 0;
    let totalHistoryItems = 0;
    let dangerousPerms = 0;
    
    for (const project of Object.values(config.projects || {})) {
      const proj = project as any;
      totalPerms += (proj.bashCommands || []).length;
      totalMcps += Object.keys(proj.mcpServers || {}).length;
      totalHistoryItems += (proj.history || []).length;
      
      // Count dangerous permissions
      for (const perm of proj.bashCommands || []) {
        if (perm.includes('rm:*') || perm.includes('sudo:*') || 
            perm.includes('eval:*') || perm.includes('curl * | bash')) {
          dangerousPerms++;
        }
      }
    }
    
    stats[key] = {
      filename,
      projectCount,
      totalPerms,
      totalMcps,
      totalHistoryItems,
      dangerousPerms,
      fileSize: readFileSync(path.join(TEST_CONFIGS_DIR, filename), 'utf8').length
    };
  }
  
  return stats;
}

/**
 * Verify test data integrity
 */
export function verifyTestData(): boolean {
  console.log('🔍 Verifying test data integrity...\n');
  
  let allValid = true;
  
  // Check that all test config files exist
  for (const [key, filename] of Object.entries(TEST_CONFIGS)) {
    const configPath = path.join(TEST_CONFIGS_DIR, filename);
    
    if (!existsSync(configPath)) {
      console.error(`❌ Missing test config: ${filename}`);
      allValid = false;
      continue;
    }
    
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      
      // Basic structure validation
      if (!config.version || !config.projects) {
        console.error(`❌ Invalid structure in ${filename}`);
        allValid = false;
        continue;
      }
      
      console.log(`✓ ${filename.padEnd(35)} Valid`);
      
    } catch (error) {
      console.error(`❌ Invalid JSON in ${filename}: ${error}`);
      allValid = false;
    }
  }
  
  // Check temp directory
  if (!existsSync(TEST_TEMP_DIR)) {
    console.error(`❌ Missing temp directory: ${TEST_TEMP_DIR}`);
    allValid = false;
  } else {
    console.log(`✓ Temp directory exists`);
  }
  
  if (allValid) {
    console.log(`\n🎯 All test data is valid and ready for testing`);
  } else {
    console.log(`\n❌ Test data integrity check failed`);
  }
  
  return allValid;
}