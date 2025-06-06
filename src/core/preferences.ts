import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../utils/logger';

export interface Preferences {
  permissions?: {
    autoApply?: boolean;
    showChangeSummary?: boolean;
    backupBeforeApply?: boolean;
    verboseLogging?: boolean;
    suppressDangerWarnings?: boolean;
  };
  display?: {
    useColors?: boolean;
    compactMode?: boolean;
  };
}

const DEFAULT_PREFERENCES: Preferences = {
  permissions: {
    autoApply: true,
    showChangeSummary: true,
    backupBeforeApply: true,
    verboseLogging: false,
    suppressDangerWarnings: false
  },
  display: {
    useColors: true,
    compactMode: false
  }
};

function getPreferencesPath(testMode: boolean = false): string {
  const baseDir = testMode ? path.join(__dirname, '../../tests/data') : os.homedir();
  return path.join(baseDir, '.cch', 'preferences.json');
}

export async function loadPreferences(testMode: boolean = false): Promise<Preferences> {
  const prefsPath = getPreferencesPath(testMode);
  
  if (!fs.existsSync(prefsPath)) {
    // Return defaults if file doesn't exist
    return DEFAULT_PREFERENCES;
  }
  
  try {
    const content = fs.readFileSync(prefsPath, 'utf8');
    const prefs = JSON.parse(content);
    
    // Merge with defaults to ensure all fields exist
    return {
      permissions: {
        ...DEFAULT_PREFERENCES.permissions,
        ...prefs.permissions
      },
      display: {
        ...DEFAULT_PREFERENCES.display,
        ...prefs.display
      }
    };
  } catch (error) {
    logger.debug('Error loading preferences, using defaults: ' + error);
    return DEFAULT_PREFERENCES;
  }
}

export async function savePreferences(preferences: Preferences, testMode: boolean = false): Promise<void> {
  const prefsPath = getPreferencesPath(testMode);
  const prefsDir = path.dirname(prefsPath);
  
  // Ensure directory exists
  if (!fs.existsSync(prefsDir)) {
    fs.mkdirSync(prefsDir, { recursive: true });
  }
  
  // Merge with defaults before saving
  const mergedPrefs = {
    permissions: {
      ...DEFAULT_PREFERENCES.permissions,
      ...preferences.permissions
    },
    display: {
      ...DEFAULT_PREFERENCES.display,
      ...preferences.display
    }
  };
  
  fs.writeFileSync(prefsPath, JSON.stringify(mergedPrefs, null, 2));
}

export async function updatePreference(
  path: string,
  value: any,
  testMode: boolean = false
): Promise<void> {
  const prefs = await loadPreferences(testMode);
  
  // Navigate to the correct location in the preferences object
  const parts = path.split('.');
  let current: any = prefs;
  
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  
  current[parts[parts.length - 1]] = value;
  
  await savePreferences(prefs, testMode);
}

export async function getPreference<T>(
  path: string,
  defaultValue: T,
  testMode: boolean = false
): Promise<T> {
  const prefs = await loadPreferences(testMode);
  
  // Navigate to the correct location in the preferences object
  const parts = path.split('.');
  let current: any = prefs;
  
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return defaultValue;
    }
    current = current[part];
  }
  
  return current as T;
}