/**
 * Secret detection service for identifying and masking sensitive data in configurations
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SecretPattern {
  name: string;
  pattern: RegExp;
  description: string;
  confidence: 'high' | 'medium' | 'low';
  category: 'api-key' | 'token' | 'password' | 'credential' | 'personal' | 'crypto';
}

export interface DetectedSecret {
  type: string;
  value: string;
  maskedValue: string;
  location: string;
  confidence: 'high' | 'medium' | 'low';
  category: string;
  context: string;
}

export interface SecretScanResult {
  secrets: DetectedSecret[];
  totalCount: number;
  highConfidenceCount: number;
  categoryCounts: Record<string, number>;
}

export interface CacheScanOptions {
  progressCallback?: (progress: ScanProgress) => void;
}

export interface CacheSecretResult {
  location: string;
  type: 'session' | 'shell-snapshot' | 'debug-log' | 'file-history';
  secrets: DetectedSecret[];
  lineNumber?: number;
}

export interface CacheSecretScanResult {
  totalSecrets: number;
  highConfidenceCount: number;
  results: CacheSecretResult[];
  locationBreakdown: {
    sessions: number;
    shellSnapshots: number;
    debugLogs: number;
    fileHistory: number;
  };
  summary: string;
}

export interface ScanProgress {
  stage: string;
  current: number;
  total: number;
  percentage: number;
}

export class SecretDetector {
  private patterns: SecretPattern[] = [
    // API Keys - High confidence patterns
    {
      name: 'AWS Access Key',
      pattern: /AKIA[0-9A-Z]{16}/gi,
      description: 'AWS Access Key ID',
      confidence: 'high',
      category: 'api-key'
    },
    {
      name: 'AWS Secret Key',
      pattern: /aws.{0,20}['\"][0-9a-zA-Z\/+]{40}['\"]?/gi,
      description: 'AWS Secret Access Key',
      confidence: 'high',
      category: 'api-key'
    },
    {
      name: 'GitHub Token',
      pattern: /gh[ps]_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/gi,
      description: 'GitHub Personal Access Token',
      confidence: 'high',
      category: 'token'
    },
    {
      name: 'OpenAI API Key',
      pattern: /sk-[a-zA-Z0-9]{48}|sk-proj-[a-zA-Z0-9]{48}/gi,
      description: 'OpenAI API Key',
      confidence: 'high',
      category: 'api-key'
    },
    {
      name: 'Anthropic API Key',
      pattern: /sk-ant-api03-[a-zA-Z0-9_-]{95}/gi,
      description: 'Anthropic Claude API Key',
      confidence: 'high',
      category: 'api-key'
    },
    {
      name: 'Stripe API Key',
      pattern: /sk_live_[0-9a-zA-Z]{24}|pk_live_[0-9a-zA-Z]{24}/gi,
      description: 'Stripe API Key',
      confidence: 'high',
      category: 'api-key'
    },
    {
      name: 'Google API Key',
      pattern: /AIza[0-9A-Za-z_-]{35}/gi,
      description: 'Google API Key',
      confidence: 'high',
      category: 'api-key'
    },
    {
      name: 'JWT Token',
      pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/gi,
      description: 'JSON Web Token',
      confidence: 'high',
      category: 'token'
    },

    // Database Connection Strings
    {
      name: 'Database URL',
      pattern: /(postgresql|mysql|mongodb|redis):\/\/[^:\s]+:[^@\s]+@[^\s]+/gi,
      description: 'Database connection string with credentials',
      confidence: 'high',
      category: 'credential'
    },

    // Private Keys
    {
      name: 'RSA Private Key',
      pattern: /-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]*?-----END (RSA )?PRIVATE KEY-----/gi,
      description: 'RSA Private Key',
      confidence: 'high',
      category: 'crypto'
    },
    {
      name: 'SSH Private Key',
      pattern: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/gi,
      description: 'SSH Private Key',
      confidence: 'high',
      category: 'crypto'
    },

    // Generic API Keys - Medium confidence
    {
      name: 'Generic API Key',
      pattern: /(?:api[_-]?key|apikey|key)\s*[=:]\s*['\"]?[a-zA-Z0-9_-]{20,}['\"]?/gi,
      description: 'Generic API key pattern',
      confidence: 'medium',
      category: 'api-key'
    },
    {
      name: 'Generic Token',
      pattern: /(?:token|access[_-]?token|auth[_-]?token)\s*[=:]\s*['\"]?[a-zA-Z0-9_-]{20,}['\"]?/gi,
      description: 'Generic token pattern',
      confidence: 'medium',
      category: 'token'
    },
    {
      name: 'Generic Secret',
      pattern: /(?:secret|client[_-]?secret|app[_-]?secret)\s*[=:]\s*['\"]?[a-zA-Z0-9_-]{20,}['\"]?/gi,
      description: 'Generic secret pattern',
      confidence: 'medium',
      category: 'credential'
    },
    {
      name: 'Bearer Token',
      pattern: /Bearer\s+[a-zA-Z0-9_-]{20,}/gi,
      description: 'Bearer authentication token',
      confidence: 'medium',
      category: 'token'
    },

    // Personal Information
    {
      name: 'Email Address',
      pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
      description: 'Email address',
      confidence: 'low',
      category: 'personal'
    },
    {
      name: 'Credit Card',
      pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3[0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
      description: 'Credit card number',
      confidence: 'high',
      category: 'personal'
    },
    {
      name: 'Phone Number',
      pattern: /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
      description: 'Phone number',
      confidence: 'low',
      category: 'personal'
    },
    {
      name: 'SSN',
      pattern: /\b\d{3}-?\d{2}-?\d{4}\b/g,
      description: 'Social Security Number',
      confidence: 'medium',
      category: 'personal'
    },

    // Base64 Encoded Secrets (potential)
    {
      name: 'Base64 Secret',
      pattern: /(?:secret|key|token|password)\s*[=:]\s*['\"]?[A-Za-z0-9+\/]{40,}={0,2}['\"]?/gi,
      description: 'Potentially base64 encoded secret',
      confidence: 'low',
      category: 'credential'
    },

    // URL with credentials
    {
      name: 'URL with Credentials',
      pattern: /https?:\/\/[^:\s]+:[^@\s]+@[^\s]+/gi,
      description: 'URL containing username and password',
      confidence: 'high',
      category: 'credential'
    }
  ];

  /**
   * Scan text content for secrets
   */
  scanText(text: string, location: string = 'unknown'): DetectedSecret[] {
    const secrets: DetectedSecret[] = [];
    
    for (const pattern of this.patterns) {
      const matches = text.matchAll(pattern.pattern);
      
      for (const match of matches) {
        if (match[0] && this.isValidSecret(match[0], pattern)) {
          const context = this.extractContext(text, match.index || 0);
          
          secrets.push({
            type: pattern.name,
            value: match[0],
            maskedValue: this.maskSecret(match[0], pattern),
            location,
            confidence: pattern.confidence,
            category: pattern.category,
            context
          });
        }
      }
    }
    
    return this.deduplicateSecrets(secrets);
  }

  /**
   * Scan entire Claude config for secrets
   */
  scanConfig(config: any): SecretScanResult {
    const allSecrets: DetectedSecret[] = [];
    
    // Scan project-specific data
    if (config.projects) {
      Object.entries(config.projects).forEach(([projectPath, project]: [string, any]) => {
        if (project) {
          // Scan project configuration
          const projectConfigText = JSON.stringify(project, null, 2);
          const projectSecrets = this.scanText(projectConfigText, `Project: ${projectPath}`);
          allSecrets.push(...projectSecrets);
          
          // Scan conversation history
          if (project.history) {
            project.history.forEach((entry: any, index: number) => {
              const entryText = JSON.stringify(entry, null, 2);
              const entrySecrets = this.scanText(entryText, `${projectPath} - History Entry ${index + 1}`);
              allSecrets.push(...entrySecrets);
              
              // Scan pasted content specifically
              if (entry.pastedContents) {
                Object.entries(entry.pastedContents).forEach(([pasteId, paste]: [string, any]) => {
                  if (paste && paste.content) {
                    const pasteSecrets = this.scanText(
                      paste.content, 
                      `${projectPath} - Pasted Content (${pasteId})`
                    );
                    allSecrets.push(...pasteSecrets);
                  }
                });
              }
            });
          }
        }
      });
    }
    
    // Scan global configuration
    const globalConfigText = JSON.stringify(config, null, 2);
    const globalSecrets = this.scanText(globalConfigText, 'Global Configuration');
    allSecrets.push(...globalSecrets);
    
    return this.summarizeResults(allSecrets);
  }

  /**
   * Mask secrets in configuration
   */
  maskSecretsInConfig(config: any, dryRun: boolean = false): { maskedConfig: any; secretsFound: number } {
    let secretsFound = 0;
    const maskedConfig = JSON.parse(JSON.stringify(config)); // Deep clone
    
    if (!dryRun && maskedConfig.projects) {
      Object.entries(maskedConfig.projects).forEach(([projectPath, project]: [string, any]) => {
        if (project && project.history) {
          project.history.forEach((entry: any) => {
            // Mask secrets in conversation text
            if (entry.display) {
              const { maskedText, count } = this.maskSecretsInText(entry.display);
              entry.display = maskedText;
              secretsFound += count;
            }
            
            // Mask secrets in pasted content
            if (entry.pastedContents) {
              Object.values(entry.pastedContents).forEach((paste: any) => {
                if (paste && paste.content) {
                  const { maskedText, count } = this.maskSecretsInText(paste.content);
                  paste.content = maskedText;
                  secretsFound += count;
                }
              });
            }
          });
        }
      });
    }
    
    return { maskedConfig, secretsFound };
  }

  /**
   * Generate a summary report of detected secrets
   */
  generateSecretReport(result: SecretScanResult): string {
    if (result.totalCount === 0) {
      return '✅ No secrets detected in configuration';
    }
    
    const lines: string[] = [];
    lines.push(`🔐 ${result.totalCount} potential secrets detected:`);
    lines.push('');
    
    // Summary by category
    Object.entries(result.categoryCounts).forEach(([category, count]) => {
      const emoji = this.getCategoryEmoji(category);
      lines.push(`  ${emoji} ${this.capitalizeCategory(category)}: ${count}`);
    });
    
    lines.push('');
    lines.push(`Confidence levels:`);
    lines.push(`  • High confidence: ${result.highConfidenceCount}`);
    lines.push(`  • Medium/Low confidence: ${result.totalCount - result.highConfidenceCount}`);
    
    return lines.join('\n');
  }

  private isValidSecret(value: string, pattern: SecretPattern): boolean {
    // Special validation for credit cards
    if (pattern.name === 'Credit Card') {
      return this.isValidCreditCard(value);
    }
    
    // Filter out obvious false positives
    const falsePositives = [
      'example.com',
      'localhost',
      '127.0.0.1',
      'test@test.com',
      'user@example.com',
      'password123',
      'secretkey',
      'your_api_key_here',
      'INSERT_API_KEY_HERE'
    ];
    
    const lowerValue = value.toLowerCase();
    return !falsePositives.some(fp => lowerValue.includes(fp));
  }
  
  private isValidCreditCard(value: string): boolean {
    // Remove any spaces or dashes
    const digits = value.replace(/[\s-]/g, '');
    
    // Must be 13-19 digits
    if (!/^\d{13,19}$/.test(digits)) {
      return false;
    }
    
    // Apply Luhn algorithm
    let sum = 0;
    let isEven = false;
    
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i], 10);
      
      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      
      sum += digit;
      isEven = !isEven;
    }
    
    // Must pass Luhn check
    if (sum % 10 !== 0) {
      return false;
    }
    
    // Additional checks for known test credit card numbers
    const testCards = [
      '4111111111111111', // Visa test
      '5555555555554444', // Mastercard test
      '378282246310005',  // Amex test
      '6011111111111117', // Discover test
    ];
    
    if (testCards.includes(digits)) {
      return false; // Skip test cards
    }
    
    return true;
  }

  private extractContext(text: string, index: number): string {
    const start = Math.max(0, index - 50);
    const end = Math.min(text.length, index + 100);
    const context = text.substring(start, end);
    
    // Clean up the context for display
    return context
      .replace(/\s+/g, ' ')
      .replace(/[\r\n]/g, ' ')
      .trim();
  }

  private maskSecret(value: string, pattern: SecretPattern): string {
    if (value.length <= 8) {
      return '*'.repeat(value.length);
    }
    
    // Keep first 3 and last 3 characters for identification
    const start = value.substring(0, 3);
    const end = value.substring(value.length - 3);
    const middle = '*'.repeat(Math.max(3, value.length - 6));
    
    return `${start}${middle}${end}`;
  }

  maskSecretsInText(text: string): { maskedText: string; count: number } {
    let maskedText = text;
    let count = 0;
    
    for (const pattern of this.patterns) {
      const matches = maskedText.matchAll(pattern.pattern);
      
      for (const match of matches) {
        if (match[0] && this.isValidSecret(match[0], pattern)) {
          const masked = this.maskSecret(match[0], pattern);
          maskedText = maskedText.replace(match[0], masked);
          count++;
        }
      }
    }
    
    return { maskedText, count };
  }

  private deduplicateSecrets(secrets: DetectedSecret[]): DetectedSecret[] {
    const seen = new Set<string>();
    return secrets.filter(secret => {
      const key = `${secret.type}:${secret.value}:${secret.location}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private summarizeResults(secrets: DetectedSecret[]): SecretScanResult {
    const categoryCounts: Record<string, number> = {};
    let highConfidenceCount = 0;
    
    secrets.forEach(secret => {
      categoryCounts[secret.category] = (categoryCounts[secret.category] || 0) + 1;
      if (secret.confidence === 'high') {
        highConfidenceCount++;
      }
    });
    
    return {
      secrets,
      totalCount: secrets.length,
      highConfidenceCount,
      categoryCounts
    };
  }

  private getCategoryEmoji(category: string): string {
    const emojis: Record<string, string> = {
      'api-key': '🔑',
      'token': '🎫',
      'password': '🔒',
      'credential': '🔐',
      'personal': '👤',
      'crypto': '🔑'
    };
    return emojis[category] || '🔍';
  }

  private capitalizeCategory(category: string): string {
    return category
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Scan all Claude Code cache locations for secrets
   */
  async scanCache(options: CacheScanOptions = {}): Promise<CacheSecretScanResult> {
    const results: CacheSecretResult[] = [];

    // 1. Scan session .jsonl files
    const sessionResults = await this.scanSessionFiles(options.progressCallback);
    results.push(...sessionResults);

    // 2. Scan shell snapshots (command history)
    const shellResults = await this.scanShellSnapshots(options.progressCallback);
    results.push(...shellResults);

    // 3. Scan debug logs
    const debugResults = await this.scanDebugLogs(options.progressCallback);
    results.push(...debugResults);

    // 4. Scan file history
    const fileHistoryResults = await this.scanFileHistory(options.progressCallback);
    results.push(...fileHistoryResults);

    return this.summarizeCacheResults(results);
  }

  /**
   * Scan session .jsonl files for secrets
   */
  private async scanSessionFiles(progressCallback?: (progress: ScanProgress) => void): Promise<CacheSecretResult[]> {
    const projectsDir = path.join(os.homedir(), '.claude/projects');

    if (!fs.existsSync(projectsDir)) {
      return [];
    }

    const results: CacheSecretResult[] = [];
    const projectDirs = await fs.promises.readdir(projectsDir, { withFileTypes: true });
    const validProjects = projectDirs.filter(d => d.isDirectory());

    let processedFiles = 0;
    let totalFiles = 0;

    // Count total files first
    for (const projectDir of validProjects) {
      try {
        const projectPath = path.join(projectsDir, projectDir.name);
        const files = await fs.promises.readdir(projectPath);
        totalFiles += files.filter(f => f.endsWith('.jsonl')).length;
      } catch (error) {
        // Skip inaccessible directories
        continue;
      }
    }

    for (const projectDir of validProjects) {
      try {
        const projectPath = path.join(projectsDir, projectDir.name);
        const files = await fs.promises.readdir(projectPath);
        const sessionFiles = files.filter(f => f.endsWith('.jsonl'));

        for (const sessionFile of sessionFiles) {
          const filePath = path.join(projectPath, sessionFile);

          try {
            const content = await fs.promises.readFile(filePath, 'utf-8');

            // Scan each line (each message)
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (!lines[i]) continue;

              const secrets = this.scanText(lines[i], `${projectDir.name}/${sessionFile}:${i + 1}`);
              if (secrets.length > 0) {
                results.push({
                  location: filePath,
                  type: 'session',
                  secrets,
                  lineNumber: i + 1
                });
              }
            }
          } catch (error) {
            // Skip unreadable files
          }

          processedFiles++;
          if (progressCallback && processedFiles % 10 === 0) {
            progressCallback({
              stage: 'Scanning session files',
              current: processedFiles,
              total: totalFiles,
              percentage: Math.round((processedFiles / totalFiles) * 100)
            });
          }
        }
      } catch (error) {
        // Skip inaccessible directories
        continue;
      }
    }

    return results;
  }

  /**
   * Scan shell snapshots for secrets in command history
   */
  private async scanShellSnapshots(progressCallback?: (progress: ScanProgress) => void): Promise<CacheSecretResult[]> {
    const snapshotsDir = path.join(os.homedir(), '.claude/shell-snapshots');

    if (!fs.existsSync(snapshotsDir)) {
      return [];
    }

    const files = await fs.promises.readdir(snapshotsDir);
    const results: CacheSecretResult[] = [];
    const totalFiles = files.length;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = path.join(snapshotsDir, file);

      try {
        const stats = await fs.promises.stat(filePath);
        if (!stats.isFile()) continue;

        const content = await fs.promises.readFile(filePath, 'utf-8');
        const secrets = this.scanText(content, `shell-snapshots/${file}`);

        if (secrets.length > 0) {
          results.push({
            location: filePath,
            type: 'shell-snapshot',
            secrets
          });
        }
      } catch (error) {
        // Skip unreadable files
      }

      if (progressCallback && (i + 1) % 10 === 0) {
        progressCallback({
          stage: 'Scanning shell snapshots',
          current: i + 1,
          total: totalFiles,
          percentage: Math.round(((i + 1) / totalFiles) * 100)
        });
      }
    }

    return results;
  }

  /**
   * Scan debug logs for secrets
   */
  private async scanDebugLogs(progressCallback?: (progress: ScanProgress) => void): Promise<CacheSecretResult[]> {
    const debugDir = path.join(os.homedir(), '.claude/debug');

    if (!fs.existsSync(debugDir)) {
      return [];
    }

    const files = await fs.promises.readdir(debugDir);
    const results: CacheSecretResult[] = [];

    // Get file stats and sort by modification time
    const fileStats = await Promise.all(
      files.map(async (f) => {
        try {
          const filePath = path.join(debugDir, f);
          const stats = await fs.promises.stat(filePath);
          return { name: f, path: filePath, stats };
        } catch {
          return null;
        }
      })
    );

    // Filter out nulls and non-files, then sort by mtime
    const validFiles = fileStats
      .filter((f): f is NonNullable<typeof f> => f !== null && f.stats.isFile())
      .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime())
      .slice(0, 100); // Scan 100 most recent logs

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];

      try {
        const content = await fs.promises.readFile(file.path, 'utf-8');
        const secrets = this.scanText(content, `debug/${file.name}`);

        if (secrets.length > 0) {
          results.push({
            location: file.path,
            type: 'debug-log',
            secrets
          });
        }
      } catch (error) {
        // Skip unreadable files
      }

      if (progressCallback && (i + 1) % 10 === 0) {
        progressCallback({
          stage: 'Scanning debug logs',
          current: i + 1,
          total: validFiles.length,
          percentage: Math.round(((i + 1) / validFiles.length) * 100)
        });
      }
    }

    return results;
  }

  /**
   * Scan file history for secrets
   */
  private async scanFileHistory(progressCallback?: (progress: ScanProgress) => void): Promise<CacheSecretResult[]> {
    const historyDir = path.join(os.homedir(), '.claude/file-history');

    if (!fs.existsSync(historyDir)) {
      return [];
    }

    const files = await fs.promises.readdir(historyDir);
    const results: CacheSecretResult[] = [];
    const totalFiles = files.length;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = path.join(historyDir, file);

      try {
        const stats = await fs.promises.stat(filePath);
        if (!stats.isFile()) continue;

        const content = await fs.promises.readFile(filePath, 'utf-8');
        const secrets = this.scanText(content, `file-history/${file}`);

        if (secrets.length > 0) {
          results.push({
            location: filePath,
            type: 'file-history',
            secrets
          });
        }
      } catch (error) {
        // Skip unreadable files
      }

      if (progressCallback && (i + 1) % 100 === 0) {
        progressCallback({
          stage: 'Scanning file history',
          current: i + 1,
          total: totalFiles,
          percentage: Math.round(((i + 1) / totalFiles) * 100)
        });
      }
    }

    return results;
  }

  /**
   * Summarize cache scan results
   */
  private summarizeCacheResults(results: CacheSecretResult[]): CacheSecretScanResult {
    let totalSecrets = 0;
    let highConfidenceCount = 0;
    const locationBreakdown = {
      sessions: 0,
      shellSnapshots: 0,
      debugLogs: 0,
      fileHistory: 0
    };

    for (const result of results) {
      totalSecrets += result.secrets.length;

      for (const secret of result.secrets) {
        if (secret.confidence === 'high') {
          highConfidenceCount++;
        }
      }

      switch (result.type) {
        case 'session':
          locationBreakdown.sessions += result.secrets.length;
          break;
        case 'shell-snapshot':
          locationBreakdown.shellSnapshots += result.secrets.length;
          break;
        case 'debug-log':
          locationBreakdown.debugLogs += result.secrets.length;
          break;
        case 'file-history':
          locationBreakdown.fileHistory += result.secrets.length;
          break;
      }
    }

    const summary = totalSecrets === 0
      ? 'No secrets found in cache'
      : `Found ${totalSecrets} secrets across ${results.length} files`;

    return {
      totalSecrets,
      highConfidenceCount,
      results,
      locationBreakdown,
      summary
    };
  }
}