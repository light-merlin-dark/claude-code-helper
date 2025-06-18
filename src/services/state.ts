/**
 * State Management Service - Persists state between runs
 */

import * as fs from 'fs';
import * as path from 'path';
import { LoggerService } from './logger';
import { ConfigService } from './config';

export class StateService {
  private statePath: string;
  private state: Record<string, any> = {};
  private logger: LoggerService;

  constructor(logger: LoggerService, config: ConfigService) {
    this.logger = logger;
    this.statePath = path.join(config.get('dataDir', '.cch'), 'state.json');
  }

  async load(): Promise<void> {
    try {
      const data = await fs.promises.readFile(this.statePath, 'utf-8');
      this.state = JSON.parse(data);
      this.logger.debug('State loaded', { keys: Object.keys(this.state) });
    } catch (error) {
      // State file doesn't exist yet
      this.state = {};
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    await this.ensureLoaded();
    return this.state[key] as T;
  }

  async set(key: string, value: any): Promise<void> {
    await this.ensureLoaded();
    this.state[key] = value;
    await this.save();
  }

  async delete(key: string): Promise<void> {
    await this.ensureLoaded();
    delete this.state[key];
    await this.save();
  }

  async getAll(): Promise<Record<string, any>> {
    await this.ensureLoaded();
    return { ...this.state };
  }

  private async save(): Promise<void> {
    try {
      const dir = path.dirname(this.statePath);
      await fs.promises.mkdir(dir, { recursive: true });

      // Write atomically
      const tempFile = `${this.statePath}.tmp`;
      await fs.promises.writeFile(tempFile, JSON.stringify(this.state, null, 2));
      await fs.promises.rename(tempFile, this.statePath);

      this.logger.debug('State saved');
    } catch (error) {
      this.logger.error('Failed to save state', { error });
      throw error;
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (Object.keys(this.state).length === 0) {
      await this.load();
    }
  }

  /**
   * Track MCP usage
   */
  async trackMcpUsage(mcpName: string, toolName?: string): Promise<void> {
    const usageKey = `mcp.usage.${mcpName}`;
    const usage = await this.get<any>(usageKey) || {
      count: 0,
      lastUsed: null,
      tools: {}
    };

    usage.count++;
    usage.lastUsed = new Date().toISOString();
    
    if (toolName) {
      usage.tools[toolName] = (usage.tools[toolName] || 0) + 1;
    }

    await this.set(usageKey, usage);
  }

  /**
   * Get MCP usage statistics
   */
  async getMcpStats(): Promise<Record<string, any>> {
    await this.ensureLoaded();
    const stats: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(this.state)) {
      if (key.startsWith('mcp.usage.')) {
        const mcpName = key.replace('mcp.usage.', '');
        stats[mcpName] = value;
      }
    }
    
    return stats;
  }
}