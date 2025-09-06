import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { logger } from '../utils/logger';

interface SettingsFile {
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
  [key: string]: any;
}

interface Fix {
  file: string;
  field: 'allow' | 'deny';
  oldRule: string;
  newRule: string;
  reason: string;
}

export async function fixSettings(options: { execute?: boolean; verbose?: boolean } = {}): Promise<void> {
  const { execute = false, verbose = false } = options;
  
  logger.info('🔧 Claude Settings Fixer');
  logger.info(execute ? '✅ EXECUTE MODE' : '🔎 DRY-RUN MODE (use --execute to apply)');
  logger.info('');
  
  // Find all settings files
  logger.info('🔍 Searching for Claude settings files...\n');
  const files = await findSettingsFiles();
  
  if (files.length === 0) {
    logger.warning('No Claude settings files found.');
    return;
  }
  
  logger.info(`Found ${files.length} settings file(s):`);
  for (const file of files) {
    const relative = path.relative(process.cwd(), file);
    logger.info(`  • ${relative.startsWith('..') ? file : relative}`);
  }
  logger.info('');
  
  // Analyze all files
  const allFixes: Fix[] = [];
  for (const file of files) {
    const fixes = await analyzeFile(file);
    allFixes.push(...fixes);
  }
  
  if (allFixes.length === 0) {
    logger.success('✨ All settings files are valid!');
    return;
  }
  
  // Display fixes
  logger.info(`📋 Found ${allFixes.length} issue(s) to fix:\n`);
  
  // Group by file for display
  const fixesByFile = new Map<string, Fix[]>();
  for (const fix of allFixes) {
    if (!fixesByFile.has(fix.file)) {
      fixesByFile.set(fix.file, []);
    }
    fixesByFile.get(fix.file)!.push(fix);
  }
  
  for (const [filePath, fixes] of fixesByFile) {
    const relative = path.relative(process.cwd(), filePath);
    logger.info(`📄 ${relative.startsWith('..') ? filePath : relative}`);
    for (const fix of fixes) {
      logger.info(`  [${fix.field}] "${fix.oldRule}" → "${fix.newRule}"`);
      if (verbose) {
        logger.debug(`    Reason: ${fix.reason}`);
      }
    }
    logger.info('');
  }
  
  // Apply fixes if requested
  if (execute) {
    logger.info('🔧 Applying fixes...\n');
    await applyFixes(allFixes);
    logger.success(`\n✅ Fixed ${allFixes.length} issue(s) in ${fixesByFile.size} file(s)`);
  } else {
    logger.info('👉 Run with --execute to apply these fixes');
  }
}

async function findSettingsFiles(): Promise<string[]> {
  const files: string[] = [];
  
  // Global settings
  const globalSettings = path.join(process.env.HOME!, '.claude', 'settings.json');
  if (fs.existsSync(globalSettings)) {
    files.push(globalSettings);
  }
  
  // Find all .claude/settings*.json files, excluding node_modules
  const pattern = '**/.claude/settings*.json';
  const foundFiles = await glob(pattern, {
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    absolute: true,
    cwd: process.cwd()
  });
  
  files.push(...foundFiles);
  
  // Remove duplicates
  return [...new Set(files)];
}

function fixRule(rule: string): { fixed: string; changes: string[] } {
  let fixed = rule;
  const changes: string[] = [];
  
  // Fix 1: Tool names must start with uppercase
  // Pattern: "tool:*" or "tool arg" where tool is lowercase
  if (/^[a-z]/.test(rule)) {
    // Check if it's a plain command or has arguments/wildcards
    const match = rule.match(/^([a-z][a-zA-Z0-9_-]*)([\s:].*)$/);
    if (match) {
      const [, toolName, rest] = match;
      const capitalizedTool = toolName.charAt(0).toUpperCase() + toolName.slice(1);
      fixed = capitalizedTool + rest;
      changes.push(`Capitalize tool name: ${toolName} → ${capitalizedTool}`);
    } else {
      // Simple command without arguments
      const capitalizedTool = rule.charAt(0).toUpperCase() + rule.slice(1);
      fixed = capitalizedTool;
      changes.push(`Capitalize tool name: ${rule} → ${capitalizedTool}`);
    }
  }
  
  // Fix 2: Wildcard syntax - "Bash(command *)" should be "Bash(command :*)"
  if (fixed.match(/^([A-Z][a-zA-Z]*)\((.+)\s+\*\)$/)) {
    fixed = fixed.replace(/\s+\*\)$/, ' :*)');
    changes.push('Fix wildcard syntax: " *)" → " :*)"');
  }
  
  // Fix 3: Check for Bash wrapper pattern issues
  // "Bash(command:*)" is valid, "Bash(command *)" needs " :*"
  const bashMatch = fixed.match(/^Bash\((.+)\)$/);
  if (bashMatch) {
    const innerCommand = bashMatch[1];
    // If it ends with " *" (space star), fix it to " :*"
    if (innerCommand.endsWith(' *')) {
      const fixedInner = innerCommand.slice(0, -2) + ' :*';
      fixed = `Bash(${fixedInner})`;
      changes.push('Fix Bash wildcard: " *" → " :*"');
    }
  }
  
  return { fixed, changes };
}

async function analyzeFile(filePath: string): Promise<Fix[]> {
  const fixes: Fix[] = [];
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const settings: SettingsFile = JSON.parse(content);
    
    if (!settings.permissions) {
      return fixes;
    }
    
    // Check allow rules
    if (settings.permissions.allow) {
      for (const rule of settings.permissions.allow) {
        const { fixed, changes } = fixRule(rule);
        if (fixed !== rule && changes.length > 0) {
          fixes.push({
            file: filePath,
            field: 'allow',
            oldRule: rule,
            newRule: fixed,
            reason: changes.join('; ')
          });
        }
      }
    }
    
    // Check deny rules
    if (settings.permissions.deny) {
      for (const rule of settings.permissions.deny) {
        const { fixed, changes } = fixRule(rule);
        if (fixed !== rule && changes.length > 0) {
          fixes.push({
            file: filePath,
            field: 'deny',
            oldRule: rule,
            newRule: fixed,
            reason: changes.join('; ')
          });
        }
      }
    }
  } catch (error) {
    logger.error(`Error analyzing ${filePath}: ${error}`);
  }
  
  return fixes;
}

async function applyFixes(fixes: Fix[]): Promise<void> {
  // Group fixes by file
  const fixesByFile = new Map<string, Fix[]>();
  for (const fix of fixes) {
    if (!fixesByFile.has(fix.file)) {
      fixesByFile.set(fix.file, []);
    }
    fixesByFile.get(fix.file)!.push(fix);
  }
  
  for (const [filePath, fileFixes] of fixesByFile) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const settings: SettingsFile = JSON.parse(content);
      
      if (!settings.permissions) continue;
      
      // Apply fixes to allow rules
      const allowFixes = fileFixes.filter(f => f.field === 'allow');
      if (allowFixes.length > 0 && settings.permissions.allow) {
        settings.permissions.allow = settings.permissions.allow.map(rule => {
          const fix = allowFixes.find(f => f.oldRule === rule);
          return fix ? fix.newRule : rule;
        });
      }
      
      // Apply fixes to deny rules
      const denyFixes = fileFixes.filter(f => f.field === 'deny');
      if (denyFixes.length > 0 && settings.permissions.deny) {
        settings.permissions.deny = settings.permissions.deny.map(rule => {
          const fix = denyFixes.find(f => f.oldRule === rule);
          return fix ? fix.newRule : rule;
        });
      }
      
      // Write back
      fs.writeFileSync(filePath, JSON.stringify(settings, null, 2) + '\n');
      logger.success(`  ✅ Fixed ${filePath}`);
    } catch (error) {
      logger.error(`  ❌ Failed to fix ${filePath}: ${error}`);
    }
  }
}