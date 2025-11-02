/**
 * Blob remover service for Claude Code session cleanup
 * Surgically removes blobs (images, large text) from .jsonl session files
 */

import fs from 'fs';
import path from 'path';
import { SessionParser, MessageBlob, SessionBlobAnalysis } from './session-parser';

export interface BlobRemovalOptions {
  removeImages: boolean;
  removeLargeText: boolean;
  minBlobSize: number;  // Only remove blobs >X bytes
  sanitize: boolean;    // Replace with placeholders instead of removing
  dryRun: boolean;
}

export interface BlobRemovalResult {
  sessionFile: string;
  originalSize: number;
  newSize: number;
  messagesRemoved: number;
  messagesSanitized: number;
  blobsRemoved: MessageBlob[];
  backupPath?: string;
  success: boolean;
  error?: string;
}

export class BlobRemover {
  private parser: SessionParser;

  constructor() {
    this.parser = new SessionParser();
  }

  /**
   * Surgically remove blobs from a session file
   */
  async removeBlobsFromSession(
    sessionPath: string,
    options: BlobRemovalOptions
  ): Promise<BlobRemovalResult> {
    try {
      // 1. Analyze blobs
      const analysis = await this.parser.analyzeSessionBlobs(sessionPath);
      const originalSize = analysis.totalSize;

      // 2. Determine which messages to clean
      const blobsToRemove = analysis.messagesWithBlobs.filter(blob => {
        if (blob.blobSize < options.minBlobSize) return false;
        if (!options.removeImages && blob.blobType === 'image') return false;
        if (!options.removeLargeText && blob.blobType === 'large-text') return false;
        return true;
      });

      if (blobsToRemove.length === 0) {
        return {
          sessionFile: sessionPath,
          originalSize,
          newSize: originalSize,
          messagesRemoved: 0,
          messagesSanitized: 0,
          blobsRemoved: [],
          success: true
        };
      }

      // 3. Create backup
      const backupPath = await this.backupSession(sessionPath);

      if (options.dryRun) {
        return this.buildDryRunResult(sessionPath, originalSize, blobsToRemove, backupPath);
      }

      // 4. Read session file
      const messages = await this.parseSessionFile(sessionPath);

      // 5. Remove or sanitize messages with blobs
      let cleanedMessages: any[];
      let messagesSanitized = 0;
      let messagesRemoved = 0;

      if (options.sanitize) {
        // Sanitize mode: replace blobs with placeholders
        const messageIndicesToSanitize = new Set(
          blobsToRemove.map(b => b.message.messageIndex)
        );

        cleanedMessages = messages.map((msg, index) => {
          if (messageIndicesToSanitize.has(index)) {
            messagesSanitized++;
            return this.sanitizeMessage(msg, blobsToRemove.filter(b => b.message.messageIndex === index));
          }
          return msg;
        });
      } else {
        // Remove mode: delete entire messages
        const messageIndicesToRemove = new Set(
          blobsToRemove.map(b => b.message.messageIndex)
        );

        cleanedMessages = messages.filter((_, index) => {
          const shouldRemove = messageIndicesToRemove.has(index);
          if (shouldRemove) messagesRemoved++;
          return !shouldRemove;
        });
      }

      // 6. Write cleaned session back
      await this.writeSessionFile(sessionPath, cleanedMessages);

      // 7. Calculate results
      const newStats = await fs.promises.stat(sessionPath);
      const newSize = newStats.size;

      return {
        sessionFile: sessionPath,
        originalSize,
        newSize,
        messagesRemoved,
        messagesSanitized,
        blobsRemoved: blobsToRemove,
        backupPath,
        success: true
      };

    } catch (error) {
      return {
        sessionFile: sessionPath,
        originalSize: 0,
        newSize: 0,
        messagesRemoved: 0,
        messagesSanitized: 0,
        blobsRemoved: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Sanitize message by replacing blobs with placeholders
   */
  private sanitizeMessage(message: any, blobs: MessageBlob[]): any {
    let messageStr = JSON.stringify(message);

    // Find which types of blobs are in this message
    const hasImages = blobs.some(b => b.blobType === 'image');
    const hasLargeText = blobs.some(b => b.blobType === 'large-text');
    const hasDataDump = blobs.some(b => b.blobType === 'data-dump');

    // Parse message for modification
    const sanitized = JSON.parse(messageStr);

    // Replace base64 images with placeholder
    if (hasImages) {
      messageStr = messageStr.replace(
        /data:image\/([^;]+);base64,[A-Za-z0-9+/=]+/g,
        (match, imageType) => {
          const originalSize = match.length;
          const estimatedBytes = Math.floor(originalSize * 0.75);
          return `[IMAGE REMOVED: ${imageType.toUpperCase()}, ~${this.formatBytes(estimatedBytes)}]`;
        }
      );
    }

    // Replace toolUseResult base64 files with placeholder
    if (hasDataDump && sanitized.toolUseResult && sanitized.toolUseResult.file && sanitized.toolUseResult.file.base64) {
      const base64Size = Buffer.byteLength(sanitized.toolUseResult.file.base64, 'utf-8');
      const estimatedBytes = Math.floor(base64Size * 0.75);
      const fileName = sanitized.toolUseResult.file.filePath || 'unknown file';
      sanitized.toolUseResult.file.base64 = `[BASE64 FILE REMOVED: ${fileName}, ~${this.formatBytes(estimatedBytes)}]`;
    }

    // Replace large text with placeholder
    if (hasLargeText) {
      if (sanitized.content) {
        if (typeof sanitized.content === 'string') {
          const textSize = Buffer.byteLength(sanitized.content, 'utf-8');
          if (textSize > 1024 * 1024) {  // >1MB
            sanitized.content = `[LARGE TEXT REMOVED: ${this.formatBytes(textSize)}]`;
          }
        } else if (Array.isArray(sanitized.content)) {
          sanitized.content = sanitized.content.map((c: any) => {
            if (c.type === 'text' && c.text) {
              const textSize = Buffer.byteLength(c.text, 'utf-8');
              if (textSize > 1024 * 1024) {
                return {
                  ...c,
                  text: `[LARGE TEXT REMOVED: ${this.formatBytes(textSize)}]`
                };
              }
            }
            return c;
          });
        }
      }
    }

    return sanitized;
  }

  /**
   * Backup session before modification
   */
  private async backupSession(sessionPath: string): Promise<string> {
    const sessionDir = path.dirname(sessionPath);
    const backupDir = path.join(sessionDir, '.backups');
    await fs.promises.mkdir(backupDir, { recursive: true });

    const timestamp = Date.now();
    const filename = path.basename(sessionPath);
    const backupPath = path.join(backupDir, `${timestamp}-${filename}`);

    await fs.promises.copyFile(sessionPath, backupPath);
    return backupPath;
  }

  /**
   * Write cleaned messages back to .jsonl
   */
  private async writeSessionFile(sessionPath: string, messages: any[]): Promise<void> {
    const content = messages.map(m => JSON.stringify(m)).join('\n');
    await fs.promises.writeFile(sessionPath, content + '\n', 'utf-8');
  }

  /**
   * Parse .jsonl file (one JSON object per line)
   */
  private async parseSessionFile(sessionPath: string): Promise<any[]> {
    const fileContent = await fs.promises.readFile(sessionPath, 'utf-8');
    const lines = fileContent.trim().split('\n').filter(line => line.trim());

    return lines.map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        console.warn(`Warning: Failed to parse line ${index + 1} in ${path.basename(sessionPath)}`);
        return null;
      }
    }).filter(m => m !== null);
  }

  /**
   * Build dry-run result
   */
  private buildDryRunResult(
    sessionPath: string,
    originalSize: number,
    blobsToRemove: MessageBlob[],
    backupPath: string
  ): BlobRemovalResult {
    const estimatedSavings = blobsToRemove.reduce((sum, b) => sum + b.blobSize, 0);
    const newSize = originalSize - estimatedSavings;

    return {
      sessionFile: sessionPath,
      originalSize,
      newSize: Math.max(0, newSize),
      messagesRemoved: blobsToRemove.length,
      messagesSanitized: 0,
      blobsRemoved: blobsToRemove,
      backupPath,
      success: true
    };
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
}
