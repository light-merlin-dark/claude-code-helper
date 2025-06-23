/**
 * Clean commands for removing bloat and dangerous permissions
 */

import fs from 'fs';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { loadClaudeConfig, saveClaudeConfig, ClaudeConfig } from '../core/config';
import { getBackupsDir } from '../core/paths';
import { logger } from '../utils/logger';
import { DANGEROUS_PATTERNS } from '../services/analyzer';
import { matchProjects } from '../utils/patterns';

export interface CleanHistoryOptions {
  projects?: string[];
  testMode?: boolean;
  dryRun?: boolean;
}

export interface CleanHistoryResult {
  pastesRemoved: number;
  sizeReduction: number;
  projectsModified: number;
  backupPath?: string;
}

export interface CleanDangerousOptions {
  testMode?: boolean;
  dryRun?: boolean;
}

export interface CleanDangerousResult {
  permissionsRemoved: number;
  projectsModified: number;
  backupPath?: string;
}

/**
 * Clean large pastes from conversation history
 */
export async function cleanHistory(options: CleanHistoryOptions = {}): Promise<CleanHistoryResult> {
  const { projects = [], testMode = false, dryRun = false } = options;
  
  // Create backup first
  let backupPath: string | undefined;
  if (!dryRun && !testMode) {
    backupPath = await createBackup('pre-clean');
  }
  
  const config = await loadClaudeConfig(testMode) as ClaudeConfig;
  const originalSize = Buffer.byteLength(JSON.stringify(config), 'utf8');
  
  let pastesRemoved = 0;
  let projectsModified = 0;
  
  // Get projects to clean
  const projectsToClean = projects.length > 0 
    ? matchProjects(projects, config)
    : Object.entries(config.projects || {});
  
  for (const [projectName, project] of projectsToClean) {
    if (project) {
      const largePastes = findLargePastes(project.history || []);
      
      if (largePastes.length > 0) {
        if (!dryRun) {
          project.history = removePastes(project.history || [], largePastes);
        }
        pastesRemoved += largePastes.length;
        projectsModified++;
        
        logger.info(`${dryRun ? '[DRY RUN] Would clean' : 'Cleaned'} ${largePastes.length} pastes from ${projectName}`);
      }
    }
  }
  
  if (!dryRun && pastesRemoved > 0) {
    await saveClaudeConfig(config, testMode);
  }
  
  const newSize = Buffer.byteLength(JSON.stringify(config), 'utf8');
  const sizeReduction = originalSize - newSize;
  
  return {
    pastesRemoved,
    sizeReduction,
    projectsModified,
    backupPath
  };
}

/**
 * Remove dangerous permissions from all projects
 */
export async function cleanDangerous(options: CleanDangerousOptions = {}): Promise<CleanDangerousResult> {
  const { testMode = false, dryRun = false } = options;
  
  // Create backup first
  let backupPath: string | undefined;
  if (!dryRun && !testMode) {
    backupPath = await createBackup('pre-clean-dangerous');
  }
  
  const config = await loadClaudeConfig(testMode) as ClaudeConfig;
  
  let permissionsRemoved = 0;
  let projectsModified = 0;
  
  Object.entries(config.projects || {}).forEach(([projectName, project]) => {
    if (project && project.allowedCommands) {
      const originalCount = project.allowedCommands.length;
      
      if (!dryRun) {
        project.allowedCommands = project.allowedCommands.filter(command => {
          return !isDangerousCommand(command);
        });
      } else {
        // Count dangerous commands for dry run
        const dangerousCount = project.allowedCommands.filter(command => 
          isDangerousCommand(command)
        ).length;
        
        if (dangerousCount > 0) {
          permissionsRemoved += dangerousCount;
          projectsModified++;
        }
      }
      
      if (!dryRun && project.allowedCommands.length < originalCount) {
        const removed = originalCount - project.allowedCommands.length;
        permissionsRemoved += removed;
        projectsModified++;
        
        logger.info(`Removed ${removed} dangerous permissions from ${projectName}`);
      }
    }
  });
  
  if (!dryRun && permissionsRemoved > 0) {
    await saveClaudeConfig(config, testMode);
  }
  
  return {
    permissionsRemoved,
    projectsModified,
    backupPath
  };
}

interface PasteInfo {
  entryIndex: number;
  pasteId: string;
  lines: number;
  size: number;
}

function findLargePastes(history: any[]): PasteInfo[] {
  const largePastes: PasteInfo[] = [];
  
  history.forEach((entry, entryIndex) => {
    if (entry.pastedContents) {
      Object.entries(entry.pastedContents).forEach(([pasteId, paste]: [string, any]) => {
        const content = paste.content || '';
        const lines = content.split('\n').length;
        const size = Buffer.byteLength(content, 'utf8');
        
        if (lines > 100) { // Threshold for large pastes
          largePastes.push({
            entryIndex,
            pasteId,
            lines,
            size
          });
        }
      });
    }
  });
  
  return largePastes;
}

function removePastes(history: any[], pastesToRemove: PasteInfo[]): any[] {
  // Group pastes by entry index
  const pastesByEntry = new Map<number, Set<string>>();
  pastesToRemove.forEach(paste => {
    if (!pastesByEntry.has(paste.entryIndex)) {
      pastesByEntry.set(paste.entryIndex, new Set());
    }
    pastesByEntry.get(paste.entryIndex)!.add(paste.pasteId);
  });
  
  // Create a new history with pastes removed
  return history.map((entry, index) => {
    if (!pastesByEntry.has(index) || !entry.pastedContents) {
      return entry;
    }
    
    const pastesToRemoveFromEntry = pastesByEntry.get(index)!;
    const newEntry = { ...entry };
    
    // Remove specific pastes
    const newPastedContents: any = {};
    Object.entries(entry.pastedContents).forEach(([id, content]) => {
      if (!pastesToRemoveFromEntry.has(id)) {
        newPastedContents[id] = content;
      }
    });
    
    // Update display text if needed
    if (Object.keys(newPastedContents).length === 0) {
      // All pastes removed, clean up display text
      delete newEntry.pastedContents;
      if (newEntry.display) {
        newEntry.display = newEntry.display.replace(/\[Pasted text[^\]]+\]/g, '[Pasted content removed]');
      }
    } else {
      newEntry.pastedContents = newPastedContents;
    }
    
    return newEntry;
  });
}

function isDangerousCommand(command: string): boolean {
  return DANGEROUS_PATTERNS.some(pattern => {
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(command);
  });
}

async function createBackup(prefix: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const backupDir = getBackupsDir();
  const backupPath = `${backupDir}/${prefix}-${timestamp}.json.gz`;
  
  // Ensure backup directory exists
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  // Read config and compress
  const config = await loadClaudeConfig() as ClaudeConfig;
  const configStr = JSON.stringify(config, null, 2);
  
  // Create gzip stream and write compressed data
  const gzip = createGzip({ level: 9 });
  const destination = fs.createWriteStream(backupPath);
  
  // Create a promise to handle the compression
  await new Promise<void>((resolve, reject) => {
    destination.on('finish', resolve);
    destination.on('error', reject);
    gzip.on('error', reject);
    
    // Pipe gzip output to file
    gzip.pipe(destination);
    
    // Write config to gzip and end the stream
    gzip.write(configStr);
    gzip.end();
  });
  
  logger.info(`Backup created: ${backupPath}`);
  return backupPath;
}