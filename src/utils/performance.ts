/**
 * Performance optimization utilities for handling large configurations
 */

import fs from 'fs';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';

/**
 * Memory-efficient project counter for large configs
 */
export async function countProjectsStream(configPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let count = 0;
    let inProjects = false;
    let depth = 0;
    
    const stream = fs.createReadStream(configPath, { encoding: 'utf8' });
    let buffer = '';
    
    stream.on('data', (chunk) => {
      buffer += chunk;
      
      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        if (trimmed.includes('"projects"') && trimmed.includes('{')) {
          inProjects = true;
          depth = 0;
        }
        
        if (inProjects) {
          if (trimmed.includes('{')) depth++;
          if (trimmed.includes('}')) depth--;
          
          // Count project entries (looking for quoted strings followed by :)
          if (depth === 1 && trimmed.match(/^"[^"]+"\s*:/)) {
            count++;
          }
          
          if (depth === 0 && trimmed.includes('}')) {
            inProjects = false;
          }
        }
      }
    });
    
    stream.on('end', () => {
      resolve(count);
    });
    
    stream.on('error', reject);
  });
}

/**
 * Stream processor for large history cleaning
 */
export class HistoryCleanerStream extends Transform {
  private buffer = '';
  private inHistory = false;
  private inPastedContents = false;
  private currentPaste = '';
  private lineCount = 0;
  private skipCurrentPaste = false;
  
  constructor(private threshold: number = 100) {
    super({ encoding: 'utf8' });
  }
  
  _transform(chunk: any, encoding: string, callback: Function): void {
    this.buffer += chunk;
    
    // Process complete lines
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Detect history section
      if (trimmed.includes('"history"') && trimmed.includes('[')) {
        this.inHistory = true;
      }
      
      // Detect pastedContents
      if (this.inHistory && trimmed.includes('"pastedContents"')) {
        this.inPastedContents = true;
        this.push(line + '\n');
        continue;
      }
      
      // Process paste content
      if (this.inPastedContents) {
        if (trimmed.includes('"content"') && trimmed.includes(':')) {
          this.currentPaste = line;
          this.lineCount = 0;
          this.skipCurrentPaste = false;
          continue;
        }
        
        // Count lines in current paste
        if (this.currentPaste && !this.skipCurrentPaste) {
          this.lineCount++;
          
          // Check if we should skip this paste
          if (this.lineCount > this.threshold) {
            this.skipCurrentPaste = true;
            // Output a cleaned version
            this.push(`${this.currentPaste.split(':')[0]}: "[Content removed - ${this.lineCount}+ lines]",\n`);
            this.currentPaste = '';
          } else if (trimmed.endsWith('",') || trimmed.endsWith('"')) {
            // End of paste content
            this.push(this.currentPaste + '\n');
            for (let i = 0; i < this.lineCount - 1; i++) {
              this.push(lines[lines.indexOf(line) - this.lineCount + i + 1] + '\n');
            }
            this.push(line + '\n');
            this.currentPaste = '';
            this.lineCount = 0;
          }
        } else if (!this.skipCurrentPaste) {
          this.push(line + '\n');
        }
        
        // Detect end of pastedContents
        if (trimmed === '}') {
          this.inPastedContents = false;
        }
      } else {
        this.push(line + '\n');
      }
      
      // Detect end of history
      if (this.inHistory && trimmed === ']') {
        this.inHistory = false;
      }
    }
    
    callback();
  }
  
  _flush(callback: Function): void {
    if (this.buffer) {
      this.push(this.buffer);
    }
    callback();
  }
}

/**
 * Batch processor for multiple operations
 */
export async function batchProcess<T, R>(
  items: T[],
  processor: (batch: T[]) => Promise<R[]>,
  batchSize: number = 50
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * Lazy config loader that only loads necessary sections
 */
export class LazyConfigLoader {
  constructor(private configPath: string) {}
  
  async getProjectNames(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const projects: string[] = [];
      let inProjects = false;
      let depth = 0;
      
      const stream = fs.createReadStream(this.configPath, { encoding: 'utf8' });
      let buffer = '';
      
      stream.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          const trimmed = line.trim();
          
          if (trimmed.includes('"projects"') && trimmed.includes('{')) {
            inProjects = true;
            depth = 0;
          }
          
          if (inProjects) {
            if (trimmed.includes('{')) depth++;
            if (trimmed.includes('}')) depth--;
            
            const match = trimmed.match(/^"([^"]+)"\s*:/);
            if (depth === 1 && match) {
              projects.push(match[1]);
            }
            
            if (depth === 0 && trimmed.includes('}')) {
              inProjects = false;
              stream.destroy();
              resolve(projects);
            }
          }
        }
      });
      
      stream.on('end', () => resolve(projects));
      stream.on('error', reject);
    });
  }
  
  async getProject(projectName: string): Promise<any> {
    // This would implement streaming search for a specific project
    // For now, we'll use the standard approach
    const content = await fs.promises.readFile(this.configPath, 'utf8');
    const config = JSON.parse(content);
    return config.projects?.[projectName];
  }
}

/**
 * Memoization decorator for expensive operations
 */
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  keyGenerator?: (...args: Parameters<T>) => string
): T {
  const cache = new Map<string, ReturnType<T>>();
  
  return ((...args: Parameters<T>) => {
    const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key);
    }
    
    const result = fn(...args);
    cache.set(key, result);
    
    // Clear cache if it gets too large
    if (cache.size > 1000) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) {
        cache.delete(firstKey);
      }
    }
    
    return result;
  }) as T;
}