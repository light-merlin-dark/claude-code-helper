/**
 * Session parser service for analyzing Claude Code session transcripts
 * Parses .jsonl files to detect blobs (images, large text) within messages
 */

import fs from 'fs';
import path from 'path';

// Data models

export interface SessionMessage {
  messageIndex: number;
  role: 'user' | 'assistant' | 'system' | 'unknown';
  contentSize: number;
  hasImages: boolean;
  imageCount: number;
  largestImageSize: number;
  hasLargeText: boolean;
  largeTextSize: number;
  timestamp?: Date;
  messageId?: string;
}

export interface MessageBlob {
  message: SessionMessage;
  blobType: 'image' | 'large-text' | 'data-dump';
  blobSize: number;
  blobCount: number;
  description: string;
  safetyLevel: 'safe' | 'caution';
}

export interface SessionBlobAnalysis {
  sessionFilePath: string;
  totalMessages: number;
  totalSize: number;
  messagesWithBlobs: MessageBlob[];
  potentialSavings: number;
  blobPercentage: number;
}

export class SessionParser {

  /**
   * Main entry point: Analyze .jsonl session file for blobs
   */
  async analyzeSessionBlobs(sessionPath: string): Promise<SessionBlobAnalysis> {
    try {
      // Check if file exists
      if (!fs.existsSync(sessionPath)) {
        throw new Error(`Session file not found: ${sessionPath}`);
      }

      const fileStats = await fs.promises.stat(sessionPath);
      const messages = await this.parseSessionFile(sessionPath);
      const blobMessages: MessageBlob[] = [];

      // Analyze each message for blobs
      for (const [index, rawMessage] of messages.entries()) {
        const blobs = await this.detectBlobsInMessage(rawMessage, index);
        blobMessages.push(...blobs);
      }

      // Calculate totals
      const totalBlobSize = blobMessages.reduce((sum, b) => sum + b.blobSize, 0);
      const blobPercentage = fileStats.size > 0
        ? (totalBlobSize / fileStats.size) * 100
        : 0;

      return {
        sessionFilePath: sessionPath,
        totalMessages: messages.length,
        totalSize: fileStats.size,
        messagesWithBlobs: blobMessages,
        potentialSavings: totalBlobSize,
        blobPercentage
      };
    } catch (error) {
      throw new Error(`Failed to analyze session blobs: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  /**
   * Parse .jsonl file (one JSON object per line)
   */
  private async parseSessionFile(sessionPath: string): Promise<any[]> {
    try {
      const fileContent = await fs.promises.readFile(sessionPath, 'utf-8');
      const lines = fileContent.trim().split('\n').filter(line => line.trim());

      const messages = lines.map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          console.warn(`Warning: Failed to parse line ${index + 1} in ${path.basename(sessionPath)}`);
          return null;
        }
      }).filter(m => m !== null);

      return messages;
    } catch (error) {
      throw new Error(`Failed to parse session file: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  /**
   * Detect blobs within a single message
   */
  private async detectBlobsInMessage(message: any, index: number): Promise<MessageBlob[]> {
    const blobs: MessageBlob[] = [];
    const messageStr = JSON.stringify(message);
    const messageSize = Buffer.byteLength(messageStr, 'utf-8');

    // Build message metadata
    const sessionMessage = this.buildMessageMetadata(message, index, messageSize);

    // Detect base64-encoded images in content
    const imageBlob = this.detectImages(message, messageStr, sessionMessage);
    if (imageBlob) {
      blobs.push(imageBlob);
    }

    // Detect base64 files in toolUseResult
    const fileBlob = this.detectToolUseResultFiles(message, sessionMessage);
    if (fileBlob) {
      blobs.push(fileBlob);
    }

    // Detect large text blocks
    const textBlob = this.detectLargeText(message, sessionMessage);
    if (textBlob) {
      blobs.push(textBlob);
    }

    return blobs;
  }

  /**
   * Detect base64-encoded images in message
   */
  private detectImages(message: any, messageStr: string, sessionMessage: SessionMessage): MessageBlob | null {
    // Match data URIs for images: data:image/png;base64,...
    const imagePattern = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;
    const imageMatches = messageStr.match(imagePattern);

    if (!imageMatches || imageMatches.length === 0) {
      return null;
    }

    // Calculate total size of all images
    // Base64 is ~33% larger than binary, so actual size is ~75% of base64 length
    let totalImageSize = 0;
    let largestImageSize = 0;
    const imageTypes: string[] = [];

    imageMatches.forEach(img => {
      const estimatedSize = Math.floor(img.length * 0.75);
      totalImageSize += estimatedSize;
      largestImageSize = Math.max(largestImageSize, estimatedSize);

      // Extract image type
      const typeMatch = img.match(/data:image\/([^;]+);/);
      if (typeMatch) {
        imageTypes.push(typeMatch[1].toUpperCase());
      }
    });

    // Only report if total image size is significant (>100KB)
    if (totalImageSize < 100 * 1024) {
      return null;
    }

    const imageTypeStr = [...new Set(imageTypes)].join(', ');
    const description = `${imageMatches.length} image(s) [${imageTypeStr}] (~${this.formatBytes(totalImageSize)})`;

    return {
      message: sessionMessage,
      blobType: 'image',
      blobSize: totalImageSize,
      blobCount: imageMatches.length,
      description,
      safetyLevel: this.determineSafety(message)
    };
  }

  /**
   * Detect base64 files in toolUseResult
   */
  private detectToolUseResultFiles(message: any, sessionMessage: SessionMessage): MessageBlob | null {
    // Check if message has toolUseResult with file
    if (!message.toolUseResult || !message.toolUseResult.file || !message.toolUseResult.file.base64) {
      return null;
    }

    const base64Content = message.toolUseResult.file.base64;
    const base64Size = Buffer.byteLength(base64Content, 'utf-8');
    const estimatedFileSize = Math.floor(base64Size * 0.75);  // Base64 is ~33% larger

    // Only report if file is significant (>100KB)
    if (estimatedFileSize < 100 * 1024) {
      return null;
    }

    const filePath = message.toolUseResult.file.filePath || 'unknown file';
    const fileName = filePath.split('/').pop() || filePath;
    const description = `Base64 file [${fileName}] (~${this.formatBytes(estimatedFileSize)})`;

    return {
      message: sessionMessage,
      blobType: 'data-dump',
      blobSize: estimatedFileSize,
      blobCount: 1,
      description,
      safetyLevel: this.determineSafety(message)
    };
  }

  /**
   * Detect large text blocks in message
   */
  private detectLargeText(message: any, sessionMessage: SessionMessage): MessageBlob | null {
    // Extract text content from message
    let textContent = '';

    if (message.content) {
      if (typeof message.content === 'string') {
        textContent = message.content;
      } else if (Array.isArray(message.content)) {
        // Claude Code format: content is array of objects with type and text
        textContent = message.content
          .filter((c: any) => c.type === 'text' || typeof c === 'string')
          .map((c: any) => typeof c === 'string' ? c : c.text || '')
          .join('');
      }
    }

    const textSize = Buffer.byteLength(textContent, 'utf-8');

    // Only report if text is >1MB
    if (textSize < 1 * 1024 * 1024) {
      return null;
    }

    const description = `Large text output (${this.formatBytes(textSize)})`;

    return {
      message: sessionMessage,
      blobType: 'large-text',
      blobSize: textSize,
      blobCount: 1,
      description,
      safetyLevel: this.determineSafety(message)
    };
  }

  /**
   * Build message metadata
   */
  private buildMessageMetadata(message: any, index: number, size: number): SessionMessage {
    return {
      messageIndex: index,
      role: message.role || 'unknown',
      contentSize: size,
      hasImages: false,  // Will be set by detectImages
      imageCount: 0,
      largestImageSize: 0,
      hasLargeText: false,  // Will be set by detectLargeText
      largeTextSize: 0,
      timestamp: message.timestamp ? new Date(message.timestamp) : undefined,
      messageId: message.id || message.messageId
    };
  }

  /**
   * Determine if blob is safe to remove based on age
   */
  private determineSafety(message: any): 'safe' | 'caution' {
    // Check message timestamp
    const timestamp = message.timestamp || message.created_at || message.createdAt;

    if (timestamp) {
      try {
        const messageDate = new Date(timestamp);
        const now = new Date();
        const daysOld = (now.getTime() - messageDate.getTime()) / (1000 * 60 * 60 * 24);

        // Messages >7 days old = safe to remove blobs
        return daysOld > 7 ? 'safe' : 'caution';
      } catch (error) {
        // Invalid timestamp, assume caution
        return 'caution';
      }
    }

    // No timestamp, assume caution
    return 'caution';
  }

  /**
   * Format bytes to human-readable size
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  /**
   * Get sessions from a project that are >threshold size
   */
  async findLargeSessionsInProject(projectPath: string, thresholdMB: number = 5): Promise<string[]> {
    const largeSessions: string[] = [];
    const threshold = thresholdMB * 1024 * 1024;

    try {
      const files = await fs.promises.readdir(projectPath);
      const sessionFiles = files.filter(f => f.endsWith('.jsonl'));

      for (const file of sessionFiles) {
        const filePath = path.join(projectPath, file);
        const stats = await fs.promises.stat(filePath);

        if (stats.size > threshold) {
          largeSessions.push(filePath);
        }
      }
    } catch (error) {
      console.warn(`Failed to scan project: ${projectPath}`);
    }

    return largeSessions;
  }
}
