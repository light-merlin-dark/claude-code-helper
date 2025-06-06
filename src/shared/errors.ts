export class CCHError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CCHError';
  }
}

export class ConfigNotFoundError extends CCHError {
  constructor(path: string) {
    super(`Claude config not found at ${path}`);
    this.name = 'ConfigNotFoundError';
  }
}

export class BackupNotFoundError extends CCHError {
  constructor(filename: string) {
    super(`Backup not found: ${filename}`);
    this.name = 'BackupNotFoundError';
  }
}

export class InvalidCommandError extends CCHError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCommandError';
  }
}