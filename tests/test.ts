import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';

// Test data directory
const TEST_DATA_DIR = path.join(__dirname, 'data');
const TEST_CONFIG_PATH = path.join(TEST_DATA_DIR, '.claude.json');
const TEST_BACKUPS_DIR = path.join(TEST_DATA_DIR, '.cch', 'backups');
const TEST_BASE_COMMANDS_PATH = path.join(TEST_DATA_DIR, '.cch', 'base-commands.json');
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
  
  const originalCommands = ["make:*", "Bash(npm run:*)", "npm test:*", "Bash(git status)", "git diff:*"];
  
  fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(originalConfig, null, 2));
  
  // Ensure the .cch directory exists before writing base commands
  const cchDir = path.dirname(TEST_BASE_COMMANDS_PATH);
  if (!fs.existsSync(cchDir)) {
    fs.mkdirSync(cchDir, { recursive: true });
  }
  fs.writeFileSync(TEST_BASE_COMMANDS_PATH, JSON.stringify(originalCommands, null, 2));
  
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

// Test: List commands
runner.test('Should list base commands', () => {
  const output = runCommand('-lc --test');
  if (!output.includes('Base Commands:') || !output.includes('make:*')) {
    throw new Error('Base commands not listed correctly');
  }
});

// Test: Normalize commands
runner.test('Should normalize base commands (remove Bash() wrapper)', () => {
  const output = runCommand('-nc --test');
  
  // Check that normalization ran (it may or may not show success message depending on if changes were made)
  const commands = readBaseCommands();
  const hasWrappedCommands = commands.some(cmd => cmd.startsWith('Bash('));
  if (hasWrappedCommands) {
    throw new Error('Commands still have Bash() wrapper after normalization');
  }
  
  // The original test data has 2 Bash() wrapped commands, so if normalization worked,
  // they should be unwrapped now
  if (!commands.includes('npm run:*') || !commands.includes('git status')) {
    throw new Error('Expected normalized commands not found');
  }
});

// Test: Add command
runner.test('Should add a new base command', () => {
  const output = runCommand('-ac "docker:*" --test');
  if (!output.includes('Added command: docker:*')) {
    throw new Error('Command not added');
  }
  
  const commands = readBaseCommands();
  if (!commands.includes('docker:*')) {
    throw new Error('Command not found in base commands file');
  }
});

// Test: Add command with auto-wildcard
runner.test('Should add wildcard to commands without it', () => {
  const output = runCommand('-ac "yarn" --test');
  if (!output.includes('Added command: yarn:*')) {
    throw new Error('Wildcard not added to command');
  }
  
  const commands = readBaseCommands();
  if (!commands.includes('yarn:*')) {
    throw new Error('Command with wildcard not found in base commands file');
  }
});

// Test: Remove command
runner.test('Should remove a base command', () => {
  // Verify we start with 5 commands
  const commandsBefore = readBaseCommands();
  if (commandsBefore.length !== 5) {
    throw new Error(`Started with wrong number of commands: ${commandsBefore.length}`);
  }
  
  const output = runCommand('-dc 2 -f --test');
  if (!output.includes('Removed command:')) {
    throw new Error('Command not removed');
  }
  
  const commands = readBaseCommands();
  // Each test resets data, so we start with 5 commands and remove 1, leaving 4
  if (commands.length !== 4) {
    throw new Error(`Command count incorrect after removal: expected 4, got ${commands.length}. Commands: ${JSON.stringify(commands)}`);
  }
});

// Test: Ensure commands with deduplication
runner.test('Should ensure commands and remove duplicates', () => {
  const output = runCommand('-ec --test');
  if (!output.includes('Updated') || !output.includes('project(s) with base commands')) {
    throw new Error('Ensure commands did not update projects');
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

// Test: Invalid command number
runner.test('Should handle invalid command number', () => {
  const output = runCommand('-dc 99 --test');
  if (!output.includes('Invalid command number')) {
    throw new Error('Invalid command number not handled correctly');
  }
});

// Test: Add duplicate command
runner.test('Should not add duplicate command', () => {
  const output = runCommand('-ac "make:*" --test');
  if (!output.includes('Command already exists')) {
    throw new Error('Duplicate command check failed');
  }
});

// Test: Force flag requirement
runner.test('Should require force flag for deletion', () => {
  const output = runCommand('-dc 1 --test');
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

// Test: Suggest commands with no projects
runner.test('Should handle suggest commands with no projects', () => {
  // Clear projects from config
  const config = readTestConfig();
  config.projects = {};
  fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config, null, 2));
  
  const output = runCommand('--suggest-commands --test');
  if (!output.includes('No projects found')) {
    throw new Error('Empty projects not handled correctly in suggest commands');
  }
});

// Test: Suggest commands with common commands
runner.test('Should find common commands across projects', () => {
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
  
  // Provide 'n' as input to skip adding commands
  const output = execSync(`echo n | ${CLI_CMD} --suggest-commands --test`, { encoding: 'utf8' });
  if (!output.includes('Looking for commonly used commands') || 
      !output.includes('docker:*') ||
      !output.includes('used in 3 projects')) {
    throw new Error('Common commands not detected correctly');
  }
});

// Test: View config command
runner.test('Should display configuration with -c/--config', () => {
  const output = runCommand('-c --test');
  if (!output.includes('Claude Code Helper Configuration') || 
      !output.includes('Base Commands:') ||
      !output.includes('Configuration Files:')) {
    throw new Error('Config display not working correctly');
  }
});

// Test: Changelog command
runner.test('Should display changelog with --changelog', () => {
  const output = runCommand('--changelog');
  if (!output.includes('Claude Code Helper - Recent Changes') || 
      !output.includes('v1.0.4')) {
    throw new Error('Changelog display not working correctly');
  }
});

// Test: Help text changes for new users
runner.test('Should show onboarding text for new users', () => {
  // Remove base commands file and its directory to simulate new user
  if (fs.existsSync(TEST_BASE_COMMANDS_PATH)) {
    fs.unlinkSync(TEST_BASE_COMMANDS_PATH);
  }
  const baseDir = path.dirname(TEST_BASE_COMMANDS_PATH);
  if (fs.existsSync(baseDir)) {
    fs.rmSync(baseDir, { recursive: true });
  }
  
  const output = runCommand('--test');
  if (!output.includes('New user?') || 
      !output.includes('Start by discovering your common commands')) {
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

// Run all tests
runner.run();