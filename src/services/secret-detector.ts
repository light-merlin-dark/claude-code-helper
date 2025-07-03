/**
 * Secret detection service for identifying and masking sensitive data in configurations
 */

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
      pattern: /(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3[0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})/g,
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
}