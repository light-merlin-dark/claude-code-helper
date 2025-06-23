import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { audit } from '../../src/commands/audit';
import { 
  setupTestConfig, 
  cleanupTestConfig, 
  TEST_CONFIGS 
} from '../test-data-utils';

describe('Audit Output Snapshots', () => {
  let testWorkspace: string;

  afterEach(async () => {
    if (testWorkspace) {
      await cleanupTestConfig(testWorkspace);
    }
  });

  test('clean config audit output', async () => {
    testWorkspace = await setupTestConfig(TEST_CONFIGS.CLEAN, 'snapshot-clean');
    
    const result = await audit({
      configPath: `${testWorkspace}/.claude.json`,
      testMode: true
    });

    expect(result).toMatchSnapshot();
  });

  test('dangerous config audit output', async () => {
    testWorkspace = await setupTestConfig(TEST_CONFIGS.DANGEROUS, 'snapshot-dangerous');
    
    const result = await audit({
      configPath: `${testWorkspace}/.claude.json`,
      testMode: true
    });

    expect(result).toMatchSnapshot();
  });

  test('bloated config audit output', async () => {
    testWorkspace = await setupTestConfig(TEST_CONFIGS.BLOATED, 'snapshot-bloated');
    
    const result = await audit({
      configPath: `${testWorkspace}/.claude.json`,
      testMode: true
    });

    expect(result).toMatchSnapshot();
  });
});