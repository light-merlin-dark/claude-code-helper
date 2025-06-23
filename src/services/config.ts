/**
 * Configuration Service - Manages configuration for Claude Code Helper
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface AppConfig {
  toolName: string;
  version: string;
  description: string;
  dataDir: string;
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format?: 'pretty' | 'json';
  };
  safety: {
    enabled: boolean;
    customRules?: Array<{
      pattern: string;
      reason: string;
      block: boolean;
    }>;
  };
  mcp: {
    timeout: number;
    maxConcurrent: number;
  };
  permissions: {
    autoApply: boolean;
    warnOnDangerous: boolean;
  };
  verbose?: boolean;
}

export class ConfigService {
  private config: AppConfig;
  private testMode: boolean;

  private defaultConfig: AppConfig = {
    toolName: "claude-code-helper",
    version: "2.0.0", // Should match package.json
    description: "CLI tool for managing Claude Code configurations",
    dataDir: path.join(os.homedir(), '.cch'),
    logging: {
      level: "info",
      format: "pretty"
    },
    safety: {
      enabled: true
    },
    mcp: {
      timeout: 30000,
      maxConcurrent: 5
    },
    permissions: {
      autoApply: true,
      warnOnDangerous: true
    }
  };

  constructor(testMode: boolean = false) {
    this.testMode = testMode;
    this.config = { ...this.defaultConfig };
    
    // Override data directory for test mode
    if (testMode) {
      if (process.env.CCH_TEST_DIR) {
        this.config.dataDir = process.env.CCH_TEST_DIR;
      } else {
        this.config.dataDir = path.join(os.tmpdir(), 'cch-test', Date.now().toString());
      }
    }
  }

  async load(): Promise<void> {
    // Layer 1: Default config (already set in constructor)
    let config = { ...this.config };

    // Layer 2: User config from data directory
    const userConfigPath = path.join(this.config.dataDir, 'config.json');
    const userConfig = await this.loadFile(userConfigPath);
    if (userConfig) {
      config = this.deepMerge(config, userConfig);
    }

    // Layer 3: Environment variables
    const envConfig = this.loadFromEnv();
    config = this.deepMerge(config, envConfig);

    // Layer 4: Command line flags (will be set via set() method)

    this.config = config;
  }

  get<T = any>(path: string, defaultValue?: T): T {
    const keys = path.split('.');
    let value: any = this.config;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue as T;
      }
    }

    return value as T;
  }

  set(path: string, value: any): void {
    const keys = path.split('.');
    let current: any = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  getAll(): AppConfig {
    return { ...this.config };
  }

  /**
   * Save user configuration
   */
  async save(): Promise<void> {
    const userConfigPath = path.join(this.config.dataDir, 'config.json');
    
    // Ensure directory exists
    await fs.promises.mkdir(path.dirname(userConfigPath), { recursive: true });
    
    // Save only non-default values
    const toSave = this.getDifferences(this.defaultConfig, this.config);
    
    await fs.promises.writeFile(
      userConfigPath,
      JSON.stringify(toSave, null, 2),
      'utf8'
    );
  }

  /**
   * Get configuration file paths
   */
  getConfigPaths(): Record<string, string> {
    return {
      userConfig: path.join(this.config.dataDir, 'config.json'),
      permissions: path.join(this.config.dataDir, 'permissions.json'),
      preferences: path.join(this.config.dataDir, 'preferences.json'),
      state: path.join(this.config.dataDir, 'state.json'),
      backups: path.join(this.config.dataDir, 'backups'),
      claudeConfig: path.join(os.homedir(), '.claude.json')
    };
  }

  private async loadFile(filePath: string): Promise<any> {
    try {
      const data = await fs.promises.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private loadFromEnv(): Partial<AppConfig> {
    const config: any = {};

    // Logging level
    if (process.env.CCH_LOG_LEVEL) {
      config.logging = { level: process.env.CCH_LOG_LEVEL };
    }

    // Verbose mode
    if (process.env.CCH_VERBOSE) {
      config.verbose = process.env.CCH_VERBOSE === 'true';
    }

    // Safety settings
    if (process.env.CCH_SAFETY_ENABLED !== undefined) {
      config.safety = { enabled: process.env.CCH_SAFETY_ENABLED !== 'false' };
    }

    // MCP timeout
    if (process.env.CCH_MCP_TIMEOUT) {
      config.mcp = { timeout: parseInt(process.env.CCH_MCP_TIMEOUT, 10) };
    }

    return config;
  }

  private deepMerge(target: any, source: any): any {
    const output = { ...target };
    
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    
    return output;
  }

  private isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  private getDifferences(defaults: any, current: any): any {
    const diff: any = {};

    Object.keys(current).forEach(key => {
      if (this.isObject(current[key]) && this.isObject(defaults[key])) {
        const nestedDiff = this.getDifferences(defaults[key], current[key]);
        if (Object.keys(nestedDiff).length > 0) {
          diff[key] = nestedDiff;
        }
      } else if (current[key] !== defaults[key]) {
        diff[key] = current[key];
      }
    });

    return diff;
  }
}