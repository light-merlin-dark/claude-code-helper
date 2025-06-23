#!/usr/bin/env bun

/**
 * Simple test runner for core tests
 */

import { $ } from 'bun';

console.log('🧪 Running simplified CCH tests...\n');

// Build first
console.log('📦 Building project...');
await $`bun run build`;

// Run core tests
console.log('\n🎯 Running core workflow tests...');
await $`bun test tests/e2e/core-workflow.test.ts`;

// Run unit tests for critical services
console.log('\n🔧 Running service tests...');
await $`bun test tests/unit/services/state.test.ts tests/unit/services/config.test.ts`;

// Run CLI tests
console.log('\n💻 Running CLI tests...');
await $`bun test tests/e2e/cli.test.ts`;

console.log('\n✅ Test run complete!');