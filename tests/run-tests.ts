#!/usr/bin/env bun
/**
 * Test runner for Claude Code Helper
 * 
 * This runs all tests using Bun's built-in test runner
 */

import { spawn } from 'child_process';
import * as path from 'path';

// Test categories to run
const testSuites = [
  {
    name: 'Unit Tests - Services',
    pattern: 'tests/unit/services/**/*.test.ts'
  },
  {
    name: 'End-to-End Tests',
    pattern: 'tests/e2e/**/*.test.ts'
  },
  {
    name: 'Integration Tests',
    pattern: 'tests/integration/**/*.test.ts'
  }
];

async function runTests() {
  console.log('🧪 Running Claude Code Helper Tests with Bun\n');

  let totalPassed = 0;
  let totalFailed = 0;

  for (const suite of testSuites) {
    console.log(`\n📁 ${suite.name}`);
    console.log('─'.repeat(50));

    const result = await runTestSuite(suite.pattern);
    totalPassed += result.passed;
    totalFailed += result.failed;
  }

  console.log('\n' + '═'.repeat(50));
  console.log('📊 Test Summary');
  console.log('─'.repeat(50));
  console.log(`✅ Passed: ${totalPassed}`);
  if (totalFailed > 0) {
    console.log(`❌ Failed: ${totalFailed}`);
  }
  console.log(`📋 Total: ${totalPassed + totalFailed}`);
  console.log('═'.repeat(50) + '\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

function runTestSuite(pattern: string): Promise<{ passed: number; failed: number }> {
  return new Promise((resolve) => {
    let passed = 0;
    let failed = 0;

    const proc = spawn('bun', ['test', pattern, '--timeout', '30000'], {
      stdio: 'pipe',
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    let output = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });

    proc.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    proc.on('close', (code) => {
      // Parse test results from output
      const passMatch = output.match(/(\d+) pass/);
      const failMatch = output.match(/(\d+) fail/);
      
      if (passMatch) passed = parseInt(passMatch[1], 10);
      if (failMatch) failed = parseInt(failMatch[1], 10);

      resolve({ passed, failed });
    });
  });
}

// Run tests
runTests().catch(console.error);