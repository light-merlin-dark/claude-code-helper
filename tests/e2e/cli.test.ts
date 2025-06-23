/**
 * End-to-end tests for CLI commands
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import { 
  runCommand, 
  readTestConfig, 
  readPermissions,
  readPreferences,
  setupTest,
  TEST_CCH_DIR,
  TEST_BACKUPS_DIR,
  TEST_PERMISSIONS_PATH,
  TEST_BASE_COMMANDS_PATH
} from '../setup';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

describe('CLI Basic Commands', () => {
  beforeEach(() => {
    setupTest();
  });

  test('should display help when no arguments provided', async () => {
    const output = await runCommand('--test');
    expect(output).toContain('Claude Code Helper');
    expect(output).toContain('Usage:');
  });

  test('should display version with -v/--version', async () => {
    const output1 = await runCommand('-v');
    expect(output1).toContain('Claude Code Helper v');
    
    const output2 = await runCommand('--version');
    expect(output2).toContain('Claude Code Helper v');
  });
});

describe('Permission Management', () => {
  beforeEach(() => {
    setupTest();
  });

  test('should list permissions with -lp', async () => {
    const output = await runCommand('-lp --test');
    expect(output).toContain('Your Permissions:');
    expect(output).toContain('make:*');
    expect(output).toContain('npm run:*');
    expect(output).toContain('git status');
  });

  test('should add a new permission with --add', async () => {
    const output = await runCommand('--add "docker:*" --test');
    expect(output).toContain('Added permission: docker:*');
    
    const permissions = readPermissions();
    expect(permissions).toContain('docker:*');
  });

  test('should expand permissions intelligently', async () => {
    const output = await runCommand('--add "yarn" --test');
    expect(output).toContain('Added permission: yarn:*');
    expect(output).toContain('Expanded "yarn" to "yarn:*"');
    
    const permissions = readPermissions();
    expect(permissions).toContain('yarn:*');
  });

  test('should not add duplicate permission', async () => {
    const output = await runCommand('--add "make:*" --test');
    expect(output).toContain('Permission already exists');
  });

  test('should remove permission with -rm', async () => {
    const permissionsBefore = readPermissions();
    expect(permissionsBefore.length).toBe(5);
    
    const output = await runCommand('-rm 2 -f --test');
    expect(output).toContain('Removed permission:');
    
    const permissions = readPermissions();
    expect(permissions.length).toBe(4);
  });

  test('should require force flag for permission deletion', async () => {
    const output = await runCommand('-rm 1 --test');
    expect(output).toContain('Use --force to confirm');
  });

  test('should handle invalid permission number', async () => {
    const output = await runCommand('-rm 99 --test');
    expect(output).toContain('Invalid permission number');
  });
});

describe('Apply Permissions', () => {
  beforeEach(() => {
    setupTest();
  });

  test('should apply permissions to all projects', async () => {
    const output = await runCommand('-ap --test');
    expect(output).toContain('Updated');
    expect(output).toContain('project(s)');
    
    const config = readTestConfig();
    const project1Tools = config.projects['/test/project1'].allowedTools;
    
    // Should include base permissions
    expect(project1Tools.some((tool: string) => tool.includes('make:*'))).toBe(true);
  });

  test('should remove duplicates when applying', async () => {
    const output = await runCommand('-ap --test');
    expect(output).toContain('Updated');
    
    const config = readTestConfig();
    const project1Tools = config.projects['/test/project1'].allowedTools;
    const uniqueTools = Array.from(new Set(project1Tools));
    
    expect(project1Tools.length).toBe(uniqueTools.length);
  });
});

describe('Backup and Restore', () => {
  beforeEach(() => {
    setupTest();
  });

  test('should backup configuration', async () => {
    const output = await runCommand('-bc --test');
    expect(output).toContain('Config backed up to');
    
    const backupPath = path.join(TEST_BACKUPS_DIR, 'claude-backup.json');
    expect(fs.existsSync(backupPath)).toBe(true);
  });

  test('should create named backup', async () => {
    const output = await runCommand('-bc -n test-backup --test');
    expect(output).toContain('Config backed up to test-backup.json');
    
    const backupPath = path.join(TEST_BACKUPS_DIR, 'test-backup.json');
    expect(fs.existsSync(backupPath)).toBe(true);
  });

  test('should restore configuration from backup', async () => {
    // First create a backup
    await runCommand('-bc --test');
    
    // Modify the config
    const config = readTestConfig();
    config.projects['/test/project1'].allowedTools = ['Bash(modified:*)'];
    fs.writeFileSync(path.join(__dirname, '../data/.claude.json'), JSON.stringify(config, null, 2));
    
    // Restore from backup
    const output = await runCommand('-rc --test');
    expect(output).toContain('Config restored from');
    
    // Check if restored
    const restoredConfig = readTestConfig();
    expect(restoredConfig.projects['/test/project1'].allowedTools[0]).not.toBe('Bash(modified:*)');
  });

  test('should handle missing backup file', async () => {
    const output = await runCommand('-rc -n nonexistent --test');
    expect(output).toContain('Backup not found');
  });
});

describe('Configuration Commands', () => {
  beforeEach(() => {
    setupTest();
  });

  test('should display configuration with -c', async () => {
    const output = await runCommand('-c --test');
    expect(output).toContain('Claude Code Helper Configuration');
    expect(output).toContain('Permissions:');
    expect(output).toContain('Configuration Files:');
    expect(output).toContain('permissions.json');
    expect(output).toContain('preferences.json');
  });

  test('should display changelog', async () => {
    const output = await runCommand('--changelog');
    expect(output).toContain('Claude Code Helper - Recent Changes');
    expect(output).toContain('v2.');
  });

  test('should delete all CCH data', async () => {
    // First ensure we have some data
    await runCommand('-add "test:*" --test');
    await runCommand('-bc --test');
    
    // Verify data exists
    expect(fs.existsSync(TEST_CCH_DIR)).toBe(true);
    
    // Run delete command
    const output = await runCommand('--delete-data --test');
    expect(output).toContain('All Claude Code Helper data has been deleted');
    
    // Verify data is gone
    expect(fs.existsSync(TEST_CCH_DIR)).toBe(false);
  });

  test('should handle delete when no data exists', async () => {
    // Make sure no data exists
    if (fs.existsSync(TEST_CCH_DIR)) {
      fs.rmSync(TEST_CCH_DIR, { recursive: true });
    }
    
    const output = await runCommand('--delete-data --test');
    expect(output).toContain('No Claude Code Helper data found to delete');
  });
});

describe('Permission Discovery', () => {
  beforeEach(() => {
    setupTest();
  });

  test('should discover common permissions across projects', async () => {
    // Set up test data with common commands
    const config = readTestConfig();
    
    // Add common commands to multiple projects
    config.projects['/test/project1'].allowedTools.push('Bash(docker:*)');
    config.projects['/test/project2'].allowedTools.push('Bash(docker:*)');
    config.projects['/test/project3'].allowedTools.push('Bash(docker:*)');
    
    fs.writeFileSync(path.join(__dirname, '../data/.claude.json'), JSON.stringify(config, null, 2));
    
    // Provide 'n' as input to skip adding permissions
    const output = execSync(`echo n | bun run ${path.join(__dirname, '../../src/index.ts')} -dp --test`, { 
      encoding: 'utf8',
      cwd: path.join(__dirname, '../data')
    });
    
    expect(output).toContain('Looking for commonly used permissions');
    expect(output).toContain('docker:*');
    expect(output).toContain('used in 3 projects');
  });

  test('should handle discover with no projects', async () => {
    // Clear projects from config
    const config = readTestConfig();
    config.projects = {};
    fs.writeFileSync(path.join(__dirname, '../data/.claude.json'), JSON.stringify(config, null, 2));
    
    const output = await runCommand('-dp --test');
    expect(output).toContain('No projects found');
  });
});

describe('MCP Tool Discovery', () => {
  beforeEach(() => {
    setupTest();
  });

  test('should discover frequently used MCP tools', async () => {
    // Run discover MCP command (provide 'n' to skip adding)
    const output = execSync(`echo n | bun run ${path.join(__dirname, '../../src/index.ts')} --discover-mcp --test`, { 
      encoding: 'utf8',
      cwd: path.join(__dirname, '../data')
    });
    
    expect(output).toContain('Looking for commonly used MCP tools');
    expect(output).toContain('mcp__vssh__run_command');
    expect(output).toContain('used in 3 projects');
  });

  test('should handle no MCP tools gracefully', async () => {
    // Create config without MCP tools
    const config = readTestConfig();
    Object.values(config.projects).forEach((project: any) => {
      project.allowedTools = project.allowedTools.filter((tool: string) => !tool.includes('mcp__'));
    });
    fs.writeFileSync(path.join(__dirname, '../data/.claude.json'), JSON.stringify(config, null, 2));
    
    const output = await runCommand('--discover-mcp --test');
    expect(output).toContain('No frequently used MCP tools found');
  });

  test('should only suggest MCP tools used in 3+ projects', async () => {
    // Add another project with mcp__github__search_code to make it appear in 3 projects
    const config = readTestConfig();
    config.projects['/test/project6'] = {
      allowedTools: ['Bash(mcp__github__search_code:*)'],
      history: [],
      dontCrawlDirectory: false,
      enableArchitectTool: true
    };
    fs.writeFileSync(path.join(__dirname, '../data/.claude.json'), JSON.stringify(config, null, 2));
    
    const output = execSync(`echo n | bun run ${path.join(__dirname, '../../src/index.ts')} --discover-mcp --test`, { 
      encoding: 'utf8',
      cwd: path.join(__dirname, '../data')
    });
    
    // Should show mcp__vssh__run_command (3 projects) and mcp__github__search_code (now 3 projects)
    expect(output).toContain('mcp__vssh__run_command');
    expect(output).toContain('mcp__github__search_code');
    
    // Should NOT show tools used in only 2 projects
    expect(output).not.toContain('mcp__slack__send_message:*');
    expect(output).not.toContain('mcp__jira__create_ticket:*');
  });
});

describe('Doctor Command', () => {
  beforeEach(() => {
    setupTest();
  });

  test('should detect unwrapped tools', async () => {
    const config = readTestConfig();
    const firstProject = Object.keys(config.projects)[0];
    config.projects[firstProject].allowedTools = [
      "Bash(git status)",
      "npm test",  // unwrapped
      "Bash(make:*)",
      "docker build"  // unwrapped
    ];
    fs.writeFileSync(path.join(__dirname, '../data/.claude.json'), JSON.stringify(config, null, 2));
    
    const output = await runCommand('--doctor --test');
    expect(output).toContain('2 tools missing wrapper');
    expect(output).toContain('2 tools properly wrapped');
  });

  test('should detect duplicate tools', async () => {
    const config = readTestConfig();
    const firstProject = Object.keys(config.projects)[0];
    config.projects[firstProject].allowedTools = [
      "Bash(git status)",
      "Bash(git status)",  // exact duplicate
      "Bash(npm test)",
      "Bash(npm test)",    // exact duplicate
      "Bash(make:*)",
      "Bash(make build)"   // semantic duplicate
    ];
    fs.writeFileSync(path.join(__dirname, '../data/.claude.json'), JSON.stringify(config, null, 2));
    
    const output = await runCommand('--doctor --test');
    expect(output).toContain('appears 2 times');
  });

  test('should detect dangerous commands', async () => {
    const config = readTestConfig();
    const firstProject = Object.keys(config.projects)[0];
    config.projects[firstProject].allowedTools = [
      "Bash(git status)",
      "Bash(rm -rf)",      // dangerous
      "Bash(chmod -R 777)" // dangerous
    ];
    fs.writeFileSync(path.join(__dirname, '../data/.claude.json'), JSON.stringify(config, null, 2));
    
    const output = await runCommand('--doctor --test');
    expect(output).toContain('Dangerous commands detected');
    expect(output).toContain('rm -rf');
    expect(output).toContain('chmod -R 777');
  });

  test('should report no issues for clean config', async () => {
    const config = readTestConfig();
    const firstProject = Object.keys(config.projects)[0];
    config.projects[firstProject].allowedTools = [
      "Bash(git status)",
      "Bash(npm test)",
      "Bash(make:*)"
    ];
    fs.writeFileSync(path.join(__dirname, '../data/.claude.json'), JSON.stringify(config, null, 2));
    
    const output = await runCommand('--doctor --test');
    expect(output).toContain('No issues found');
    expect(output).toContain('All configurations are healthy');
  });
});

describe('Short Flags', () => {
  beforeEach(() => {
    setupTest();
  });

  test('should handle two-character flags correctly', async () => {
    const output1 = await runCommand('-lp --test');
    expect(output1).toContain('Your Permissions:');
    
    const output2 = await runCommand('-ap --test');
    expect(output2).toContain('Updated');
    expect(output2).toContain('project(s)');
  });

  test('should handle -add short flag', async () => {
    const output = await runCommand('-add docker --test');
    expect(output).toContain('Expanded "docker" to "docker:*"');
    expect(output).toContain('Added permission: docker:*');
  });

  test('should handle -dmc short flag for discover MCP', async () => {
    const output = execSync(`echo n | bun run ${path.join(__dirname, '../../src/index.ts')} -dmc --test`, { 
      encoding: 'utf8',
      cwd: path.join(__dirname, '../data')
    });
    expect(output).toContain('Looking for commonly used MCP tools');
  });
});

describe('Smart Permission Expansion', () => {
  beforeEach(() => {
    setupTest();
  });

  test('should expand permissions based on type', async () => {
    // Test that commands with spaces are not expanded
    const output1 = await runCommand('--add "npm build" --test');
    expect(output1).toContain('Added permission: npm build');
    
    // Test git command preservation
    const output2 = await runCommand('--add "git commit" --test');
    expect(output2).toContain('Added permission: git commit');
    
    // Test regular command expansion
    const output3 = await runCommand('--add "docker" --test');
    expect(output3).toContain('Added permission: docker:*');
  });
});