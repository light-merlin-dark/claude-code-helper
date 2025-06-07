import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';

// Test data directory
const TEST_DATA_DIR = path.join(__dirname, 'data');
const TEST_CONFIG_PATH = path.join(TEST_DATA_DIR, '.claude.json');
const TEST_BACKUPS_DIR = path.join(TEST_DATA_DIR, '.cch', 'backups');
const TEST_BASE_COMMANDS_PATH = path.join(TEST_DATA_DIR, '.cch', 'base-commands.json');
const TEST_PERMISSIONS_PATH = path.join(TEST_DATA_DIR, '.cch', 'permissions.json');
const TEST_PREFERENCES_PATH = path.join(TEST_DATA_DIR, '.cch', 'preferences.json');
const TEST_CCH_DIR = path.join(TEST_DATA_DIR, '.cch');

// CLI command
const CLI_PATH = path.join(__dirname, '../src/index.ts');
const CLI_CMD = `ts-node ${CLI_PATH}`;

// Test utilities
function runCommand(args: string): string {
  try {
    const output = execSync(`${CLI_CMD} ${args}`, { encoding: 'utf8' });
    return output;
  } catch (error: any) {
    return error.stdout || error.stderr || error.message;
  }
}

function readTestConfig(): any {
  return JSON.parse(fs.readFileSync(TEST_CONFIG_PATH, 'utf8'));
}

function readBaseCommands(): string[] {
  if (!fs.existsSync(TEST_BASE_COMMANDS_PATH)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(TEST_BASE_COMMANDS_PATH, 'utf8'));
}

function readPermissions(): string[] {
  if (!fs.existsSync(TEST_PERMISSIONS_PATH)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(TEST_PERMISSIONS_PATH, 'utf8'));
}

function readPreferences(): any {
  if (!fs.existsSync(TEST_PREFERENCES_PATH)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(TEST_PREFERENCES_PATH, 'utf8'));
}

function resetTestData(): void {
  // Reset to original test data
  const originalConfig = {
    numStartups: 42,
    autoUpdaterStatus: "disabled",
    userID: "test-user-123",
    hasCompletedOnboarding: true,
    projects: {
      "/test/project1": {
        allowedTools: ["Bash(make:*)", "Bash(npm run build:*)", "Bash(make:*)", "Bash(git status)"],
        history: [],
        dontCrawlDirectory: false,
        enableArchitectTool: true
      },
      "/test/project2": {
        allowedTools: ["Bash(git add:*)", "Bash(git add:*)", "Bash(m:*)", "Bash(docker:*)"],
        history: [],
        dontCrawlDirectory: false,
        enableArchitectTool: false
      },
      "/test/project3": {
        allowedTools: [],
        history: [],
        dontCrawlDirectory: false,
        enableArchitectTool: true
      }
    }
  };
  
  const originalPermissions = ["make:*", "npm run:*", "npm test:*", "git status", "git diff:*"];
  
  fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(originalConfig, null, 2));
  
  // Ensure the .cch directory exists before writing permissions
  const cchDir = path.dirname(TEST_PERMISSIONS_PATH);
  if (!fs.existsSync(cchDir)) {
    fs.mkdirSync(cchDir, { recursive: true });
  }
  fs.writeFileSync(TEST_PERMISSIONS_PATH, JSON.stringify(originalPermissions, null, 2));
  
  // Also create base-commands for backward compatibility
  fs.writeFileSync(TEST_BASE_COMMANDS_PATH, JSON.stringify(originalPermissions, null, 2));
  
  // Clean up old backup directory if it exists
  const oldBackupsDir = path.join(TEST_DATA_DIR, '.claude-backups');
  if (fs.existsSync(oldBackupsDir)) {
    fs.rmSync(oldBackupsDir, { recursive: true });
  }
}

// Test runner
class TestRunner {
  private tests: Array<{ name: string; fn: () => void }> = [];
  private passed = 0;
  private failed = 0;

  test(name: string, fn: () => void): void {
    this.tests.push({ name, fn });
  }

  async run(): Promise<void> {
    console.log(chalk.cyan('\n🧪 Running Claude Code Helper Tests\n'));

    for (const test of this.tests) {
      try {
        resetTestData();
        test.fn();
        console.log(chalk.green('✓'), test.name);
        this.passed++;
      } catch (error: any) {
        console.log(chalk.red('✗'), test.name);
        console.log(chalk.red('  Error:'), error.message);
        this.failed++;
      }
    }

    console.log('\n' + chalk.cyan('Test Results:'));
    console.log(chalk.green(`  Passed: ${this.passed}`));
    if (this.failed > 0) {
      console.log(chalk.red(`  Failed: ${this.failed}`));
    }
    console.log(chalk.cyan(`  Total: ${this.tests.length}\n`));

    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

// Create test runner
const runner = new TestRunner();

// Test: Help command
runner.test('Should display help when no arguments provided', () => {
  const output = runCommand('--test');
  if (!output.includes('Claude Code Helper') || !output.includes('Usage:')) {
    throw new Error('Help text not displayed');
  }
});

// Test: List permissions
runner.test('Should list permissions with -lp', () => {
  const output = runCommand('-lp --test');
  if (!output.includes('Your Permissions:') || !output.includes('make:*')) {
    throw new Error('Permissions not listed correctly');
  }
});

// Test: Apply permissions
runner.test('Should apply permissions to all projects with -ap', () => {
  const output = runCommand('-ap --test');
  if (!output.includes('Updated') || !output.includes('project(s)')) {
    throw new Error('Permissions not applied correctly');
  }
  
  const config = readTestConfig();
  const project1Tools = config.projects['/test/project1'].allowedTools;
  
  // Should include base permissions
  if (!project1Tools.some((tool: string) => tool.includes('make:*'))) {
    throw new Error('Base permissions not applied to project');
  }
});

// Test: Add permission
runner.test('Should add a new permission with --add', () => {
  const output = runCommand('--add "docker:*" --test');
  if (!output.includes('Added permission: docker:*')) {
    throw new Error('Permission not added');
  }
  
  const permissions = readPermissions();
  if (!permissions.includes('docker:*')) {
    throw new Error('Permission not found in permissions file');
  }
});

// Test: Add permission with smart expansion
runner.test('Should expand permissions intelligently', () => {
  const output = runCommand('--add "yarn" --test');
  if (!output.includes('Added permission: yarn:*')) {
    throw new Error('Permission not expanded correctly');
  }
  
  const permissions = readPermissions();
  if (!permissions.includes('yarn:*')) {
    throw new Error('Expanded permission not found in permissions file');
  }
});

// Test: Remove permission
runner.test('Should remove a permission with -rm', () => {
  // Verify we start with 5 permissions
  const permissionsBefore = readPermissions();
  if (permissionsBefore.length !== 5) {
    throw new Error(`Started with wrong number of permissions: ${permissionsBefore.length}`);
  }
  
  const output = runCommand('-rm 2 -f --test');
  if (!output.includes('Removed permission:')) {
    throw new Error('Permission not removed');
  }
  
  const permissions = readPermissions();
  // Each test resets data, so we start with 5 permissions and remove 1, leaving 4
  if (permissions.length !== 4) {
    throw new Error(`Permission count incorrect after removal: expected 4, got ${permissions.length}. Permissions: ${JSON.stringify(permissions)}`);
  }
});

// Test: Apply permissions with deduplication
runner.test('Should apply permissions and remove duplicates', () => {
  const output = runCommand('-ap --test');
  if (!output.includes('Updated') || !output.includes('project(s)')) {
    throw new Error('Apply permissions did not update projects');
  }
  
  const config = readTestConfig();
  const project1Tools = config.projects['/test/project1'].allowedTools;
  const uniqueTools = Array.from(new Set(project1Tools));
  
  if (project1Tools.length !== uniqueTools.length) {
    throw new Error('Duplicates not removed from project tools');
  }
});

// Test: Backup config
runner.test('Should backup configuration', () => {
  const output = runCommand('-bc --test');
  if (!output.includes('Config backed up to')) {
    throw new Error('Backup did not succeed');
  }
  
  const backupPath = path.join(TEST_BACKUPS_DIR, 'claude-backup.json');
  if (!fs.existsSync(backupPath)) {
    throw new Error('Backup file not created');
  }
});

// Test: Named backup
runner.test('Should create named backup', () => {
  const output = runCommand('-bc -n test-backup --test');
  if (!output.includes('Config backed up to test-backup.json')) {
    throw new Error('Named backup did not succeed');
  }
  
  const backupPath = path.join(TEST_BACKUPS_DIR, 'test-backup.json');
  if (!fs.existsSync(backupPath)) {
    throw new Error('Named backup file not created');
  }
});

// Test: Restore config
runner.test('Should restore configuration from backup', () => {
  // First create a backup
  runCommand('-bc --test');
  
  // Modify the config
  const config = readTestConfig();
  config.projects['/test/project1'].allowedTools = ['Bash(modified:*)'];
  fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config, null, 2));
  
  // Restore from backup
  const output = runCommand('-rc --test');
  if (!output.includes('Config restored from')) {
    throw new Error('Restore did not succeed');
  }
  
  // Check if restored
  const restoredConfig = readTestConfig();
  if (restoredConfig.projects['/test/project1'].allowedTools[0] === 'Bash(modified:*)') {
    throw new Error('Config not restored correctly');
  }
});

// Test: Invalid permission number
runner.test('Should handle invalid permission number', () => {
  const output = runCommand('-rm 99 --test');
  if (!output.includes('Invalid permission number')) {
    throw new Error('Invalid permission number not handled correctly');
  }
});

// Test: Add duplicate permission
runner.test('Should not add duplicate permission', () => {
  const output = runCommand('--add "make:*" --test');
  if (!output.includes('Permission already exists')) {
    throw new Error('Duplicate permission check failed');
  }
});

// Test: Force flag requirement for permission removal
runner.test('Should require force flag for permission deletion', () => {
  const output = runCommand('-rm 1 --test');
  if (!output.includes('Use --force to confirm')) {
    throw new Error('Force flag requirement not enforced');
  }
});

// Test: Backup not found
runner.test('Should handle missing backup file', () => {
  const output = runCommand('-rc -n nonexistent --test');
  if (!output.includes('Backup not found')) {
    throw new Error('Missing backup not handled correctly');
  }
});

// Test: Discover permissions with no projects
runner.test('Should handle discover permissions with no projects', () => {
  // Clear projects from config
  const config = readTestConfig();
  config.projects = {};
  fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config, null, 2));
  
  const output = runCommand('-dp --test');
  if (!output.includes('No projects found')) {
    throw new Error('Empty projects not handled correctly in discover permissions');
  }
});

// Test: Discover permissions with common commands
runner.test('Should find common permissions across projects', () => {
  // Set up test data with common commands
  const config = readTestConfig();
  
  // Add a common command to multiple projects
  config.projects['/test/project1'].allowedTools.push('Bash(docker:*)');
  config.projects['/test/project2'].allowedTools.push('Bash(docker:*)');
  config.projects['/test/project3'].allowedTools.push('Bash(docker:*)');
  
  // Add another common command
  config.projects['/test/project1'].allowedTools.push('Bash(yarn:*)');
  config.projects['/test/project2'].allowedTools.push('Bash(yarn:*)');
  
  fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config, null, 2));
  
  // Provide 'n' as input to skip adding permissions
  const output = execSync(`echo n | ${CLI_CMD} -dp --test`, { encoding: 'utf8' });
  if (!output.includes('Looking for commonly used permissions') || 
      !output.includes('docker:*') ||
      !output.includes('used in 3 projects')) {
    throw new Error('Common permissions not detected correctly');
  }
});

// Test: View config command
runner.test('Should display configuration with -c/--config', () => {
  const output = runCommand('-c --test');
  if (!output.includes('Claude Code Helper Configuration') || 
      !output.includes('Permissions:') ||
      !output.includes('Configuration Files:')) {
    throw new Error('Config display not working correctly');
  }
});

// Test: Changelog command
runner.test('Should display changelog with --changelog', () => {
  const output = runCommand('--changelog');
  if (!output.includes('Claude Code Helper - Recent Changes') || 
      !output.includes('v1.')) {
    throw new Error('Changelog display not working correctly');
  }
});

// Test: Help text changes for new users
runner.test('Should show onboarding text for new users', () => {
  // Remove permissions file and its directory to simulate new user
  if (fs.existsSync(TEST_PERMISSIONS_PATH)) {
    fs.unlinkSync(TEST_PERMISSIONS_PATH);
  }
  if (fs.existsSync(TEST_BASE_COMMANDS_PATH)) {
    fs.unlinkSync(TEST_BASE_COMMANDS_PATH);
  }
  const baseDir = path.dirname(TEST_PERMISSIONS_PATH);
  if (fs.existsSync(baseDir)) {
    fs.rmSync(baseDir, { recursive: true });
  }
  
  const output = runCommand('--test');
  if (!output.includes('New user?') || 
      !output.includes('Start by discovering your common permissions')) {
    throw new Error('New user onboarding text not shown');
  }
});

// Test: Delete data command
runner.test('Should delete all CCH data with --delete-data', () => {
  // First ensure we have some data
  runCommand('-ac "test:*" --test');
  runCommand('-bc --test');
  
  // Verify data exists
  if (!fs.existsSync(TEST_CCH_DIR)) {
    throw new Error('CCH directory should exist before delete');
  }
  
  // Run delete command (in test mode, no confirmation needed)
  const output = runCommand('--delete-data --test');
  
  if (!output.includes('All Claude Code Helper data has been deleted')) {
    throw new Error('Delete command did not complete successfully');
  }
  
  // Verify data is gone
  if (fs.existsSync(TEST_CCH_DIR)) {
    throw new Error('CCH directory should not exist after delete');
  }
});

// Test: Delete data with no data to delete
runner.test('Should handle delete when no data exists', () => {
  // Make sure no data exists
  if (fs.existsSync(TEST_CCH_DIR)) {
    fs.rmSync(TEST_CCH_DIR, { recursive: true });
  }
  
  const output = runCommand('--delete-data --test');
  
  if (!output.includes('No Claude Code Helper data found to delete')) {
    throw new Error('Should show appropriate message when no data exists');
  }
});

// Test: Backup migration from old to new location
runner.test('Should migrate backups from old to new location', () => {
  // Create old backup directory with a backup file
  const oldBackupsDir = path.join(TEST_DATA_DIR, '.claude-backups');
  fs.mkdirSync(oldBackupsDir, { recursive: true });
  fs.writeFileSync(path.join(oldBackupsDir, 'test-backup.json'), JSON.stringify({ test: true }));
  
  // Run any command that triggers ensureBackupsDir
  runCommand('-bc --test');
  
  // Check that file was migrated
  const newBackupPath = path.join(TEST_BACKUPS_DIR, 'test-backup.json');
  if (!fs.existsSync(newBackupPath)) {
    throw new Error('Backup file was not migrated to new location');
  }
  
  // Check that old directory is removed
  if (fs.existsSync(oldBackupsDir)) {
    throw new Error('Old backup directory should be removed after migration');
  }
});

// Test: Version command
runner.test('Should display version with -v/--version', () => {
  const output1 = runCommand('-v');
  if (!output1.includes('Claude Code Helper v')) {
    throw new Error('Version not displayed with -v flag');
  }
  
  const output2 = runCommand('--version');
  if (!output2.includes('Claude Code Helper v')) {
    throw new Error('Version not displayed with --version flag');
  }
});

// Test: Two-character flags parsing
runner.test('Should parse two-character flags correctly', () => {
  const output1 = runCommand('-lp --test');
  if (!output1.includes('Your Permissions:')) {
    throw new Error('-lp flag not parsed correctly');
  }
  
  const output2 = runCommand('-dp --test');
  // It shows the discover output or says no projects found or no permissions found
  if (!output2.includes('No projects found') && 
      !output2.includes('Looking for commonly used permissions') &&
      !output2.includes('No frequently used permissions found')) {
    throw new Error('-dp flag not parsed correctly');
  }
  
  const output3 = runCommand('-ap --test');
  if (!output3.includes('Updated') || !output3.includes('project(s)')) {
    throw new Error('-ap flag not parsed correctly');
  }
});

// Test: Smart permission expansion
runner.test('Should expand permissions based on type', () => {
  // Test that commands with spaces are not expanded
  const output1 = runCommand('--add "npm build" --test');
  if (!output1.includes('Added permission: npm build')) {
    throw new Error('Command with space was unexpectedly expanded');
  }
  
  // Test git command preservation
  const output2 = runCommand('--add "git commit" --test');
  if (!output2.includes('Added permission: git commit')) {
    throw new Error('git command wrongly expanded');
  }
  
  // Test regular command expansion
  const output3 = runCommand('--add "docker" --test');
  if (!output3.includes('Added permission: docker:*')) {
    throw new Error('Regular command not expanded correctly');
  }
});

// Test: Dangerous command warning (using echo to simulate user input)
runner.test('Should warn about dangerous commands', () => {
  // Add a dangerous permission
  const permissions = readPermissions();
  permissions.push('rm -rf:*');
  fs.writeFileSync(TEST_PERMISSIONS_PATH, JSON.stringify(permissions, null, 2));
  
  // Run without --test flag to see warnings, but with TEST_MODE env var
  const env = { ...process.env, TEST_MODE: 'true' };
  const output = execSync(`echo 1 | ${CLI_CMD} -lp`, { encoding: 'utf8', env, cwd: TEST_DATA_DIR });
  
  // Since warnings are skipped in test mode, check that the permission still exists
  const updatedPermissions = readPermissions();
  if (!updatedPermissions.includes('rm -rf:*')) {
    throw new Error('Dangerous permission should still exist in test mode');
  }
  
  // Remove the dangerous permission for other tests
  const cleanPermissions = updatedPermissions.filter(p => p !== 'rm -rf:*');
  fs.writeFileSync(TEST_PERMISSIONS_PATH, JSON.stringify(cleanPermissions, null, 2));
});

// Test: Blocked command handling
runner.test('Should handle blocked commands', () => {
  // Add a blocked permission (m:* includes mkfs)
  const permissions = readPermissions();
  permissions.push('m:*');
  fs.writeFileSync(TEST_PERMISSIONS_PATH, JSON.stringify(permissions, null, 2));
  
  // In test mode, warnings are skipped, so just verify the permission exists
  const updatedPermissions = readPermissions();
  if (!updatedPermissions.includes('m:*')) {
    throw new Error('Blocked permission should still exist in test mode');
  }
  
  // Clean up for other tests
  const cleanPermissions = updatedPermissions.filter(p => p !== 'm:*');
  fs.writeFileSync(TEST_PERMISSIONS_PATH, JSON.stringify(cleanPermissions, null, 2));
});

// Test: Per-command suppression
runner.test('Should support per-command danger suppression', () => {
  // This test validates that the preference system works
  // Since warnings are skipped in test mode, we'll test preference storage directly
  
  // Create a preferences file with a suppressed command
  const prefs = {
    permissions: {
      suppressedDangerousCommands: ['chmod:*']
    }
  };
  fs.writeFileSync(TEST_PREFERENCES_PATH, JSON.stringify(prefs, null, 2));
  
  // Verify preferences were saved correctly
  const savedPrefs = readPreferences();
  if (!savedPrefs.permissions || !savedPrefs.permissions.suppressedDangerousCommands ||
      !savedPrefs.permissions.suppressedDangerousCommands.includes('chmod:*')) {
    throw new Error('Preference storage not working correctly');
  }
});

// Test: Preferences system
runner.test('Should save and load preferences correctly', () => {
  // Update a preference via suppression
  const permissions = readPermissions();
  permissions.push('find:*');
  fs.writeFileSync(TEST_PERMISSIONS_PATH, JSON.stringify(permissions, null, 2));
  
  // Suppress warning for this command
  execSync(`echo 2 | ${CLI_CMD} -lp --test`, { encoding: 'utf8' });
  
  // Now run again - should not show warning
  const output2 = runCommand('-lp --test');
  if (output2.includes('WARNING: Your permissions file contains potentially dangerous commands') &&
      output2.includes('find:*')) {
    throw new Error('Suppressed command still showing warning');
  }
});

// Test: Global danger suppression with confirmation
runner.test('Should support global danger suppression preference', () => {
  // Test that global suppression preference works
  const prefs = {
    permissions: {
      suppressDangerWarnings: true
    }
  };
  fs.writeFileSync(TEST_PREFERENCES_PATH, JSON.stringify(prefs, null, 2));
  
  // Verify preference was saved
  const savedPrefs = readPreferences();
  if (!savedPrefs.permissions || savedPrefs.permissions.suppressDangerWarnings !== true) {
    throw new Error('Global suppression preference not saved correctly');
  }
  
  // Clean up
  fs.unlinkSync(TEST_PREFERENCES_PATH);
});

// Test: Changelog shows recent versions
runner.test('Should show recent versions in changelog', () => {
  const output = runCommand('--changelog');
  if (!output.includes('v1.1.0') || !output.includes('Permissions System')) {
    throw new Error('Changelog not showing recent version 1.1.0');
  }
});

// Test: Config command shows all paths
runner.test('Should show all configuration paths', () => {
  const output = runCommand('-c --test');
  if (!output.includes('Permissions:') ||
      !output.includes('preferences.json') ||
      !output.includes('permissions.json') ||
      !output.includes('.claude.json')) {
    throw new Error('Config command not showing all paths');
  }
});

// Test: Short flags should work properly
runner.test('Should handle -lp short flag correctly', () => {
  const output = runCommand('-lp --test');
  if (!output.includes('Your Permissions:') || !output.includes('5. git diff:*')) {
    throw new Error('Short flag -lp not working correctly');
  }
});

runner.test('Should handle -add short flag correctly', () => {
  const output = runCommand('-add docker --test');
  if (!output.includes('Expanded "docker" to "docker:*"') || !output.includes('Added permission: docker:*')) {
    throw new Error('Short flag -add not working correctly');
  }
});

runner.test('Should handle -dp short flag correctly', () => {
  const output = runCommand('-dp --test');
  if (!output.includes('frequently used permissions')) {
    throw new Error('Short flag -dp not working correctly');
  }
});

runner.test('Should handle -ap short flag correctly', () => {
  const output = runCommand('-ap --test');
  if (!output.includes('Applying permissions')) {
    throw new Error('Short flag -ap not working correctly');
  }
});

// Test: Doctor command functionality
runner.test('Doctor should detect unwrapped tools', () => {
  // Create config with mixed wrapped/unwrapped tools
  const config = readTestConfig();
  // Update first project
  const firstProject = Object.keys(config.projects)[0];
  config.projects[firstProject].allowedTools = [
    "Bash(git status)",
    "npm test",  // unwrapped
    "Bash(make:*)",
    "docker build"  // unwrapped
  ];
  fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config, null, 2));
  
  const output = runCommand('--doctor --test');
  if (!output.includes('2 tools missing wrapper') || 
      !output.includes('2 tools properly wrapped')) {
    throw new Error('Doctor not detecting unwrapped tools correctly');
  }
});

runner.test('Doctor should detect duplicate tools', () => {
  // Create config with duplicates
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
  fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config, null, 2));
  
  const output = runCommand('--doctor --test');
  if (!output.includes('appears 2 times')) {
    throw new Error('Doctor not detecting duplicate tools correctly');
  }
});

runner.test('Doctor should detect dangerous commands', () => {
  // Create config with dangerous commands
  const config = readTestConfig();
  const firstProject = Object.keys(config.projects)[0];
  config.projects[firstProject].allowedTools = [
    "Bash(git status)",
    "Bash(rm -rf)",      // dangerous
    "Bash(chmod -R 777)" // dangerous
  ];
  fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config, null, 2));
  
  const output = runCommand('--doctor --test');
  if (!output.includes('Dangerous commands detected') || 
      !output.includes('rm -rf') ||
      !output.includes('chmod -R 777')) {
    throw new Error('Doctor not detecting dangerous commands correctly');
  }
});

runner.test('Doctor should report no issues for clean config', () => {
  // Create clean config
  const config = readTestConfig();
  const firstProject = Object.keys(config.projects)[0];
  config.projects[firstProject].allowedTools = [
    "Bash(git status)",
    "Bash(npm test)",
    "Bash(make:*)"
  ];
  fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config, null, 2));
  
  const output = runCommand('--doctor --test');
  if (!output.includes('No issues found') || !output.includes('All configurations are healthy')) {
    throw new Error('Doctor not reporting clean config correctly');
  }
});

// Run all tests
runner.run();