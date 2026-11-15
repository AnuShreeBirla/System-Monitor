// settings.js
const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = Object.freeze({
  memoryThreshold: 80,
  monitoringEnabled: true,
  refreshInterval: 1000,
  openAtLogin: true,
  notificationsEnabled: true,
});

const KNOWN_KEYS = Object.freeze(Object.keys(DEFAULT_SETTINGS));

const REFRESH_INTERVAL_MIN = 250;
const REFRESH_INTERVAL_MAX = 60000;

function cloneDefaults() {
  return { ...DEFAULT_SETTINGS };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateField(key, value) {
  switch (key) {
    case 'memoryThreshold':
      if (typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 100) {
        return { ok: true, value };
      }
      return { ok: false, error: 'memoryThreshold must be a number from 1 to 100' };
    case 'monitoringEnabled':
      if (typeof value === 'boolean') return { ok: true, value };
      return { ok: false, error: 'monitoringEnabled must be true or false' };
    case 'refreshInterval':
      if (
        Number.isInteger(value) &&
        value >= REFRESH_INTERVAL_MIN &&
        value <= REFRESH_INTERVAL_MAX
      ) {
        return { ok: true, value };
      }
      return {
        ok: false,
        error: `refreshInterval must be an integer from ${REFRESH_INTERVAL_MIN} to ${REFRESH_INTERVAL_MAX} milliseconds`,
      };
    case 'openAtLogin':
      if (typeof value === 'boolean') return { ok: true, value };
      return { ok: false, error: 'openAtLogin must be true or false' };
    case 'notificationsEnabled':
      if (typeof value === 'boolean') return { ok: true, value };
      return { ok: false, error: 'notificationsEnabled must be true or false' };
    default:
      return { ok: false, error: `Unknown setting: ${key}` };
  }
}

function validatePatch(patch) {
  if (!isPlainObject(patch)) {
    return { ok: false, errors: ['Settings must be an object'], values: {} };
  }

  const values = {};
  const errors = [];

  for (const key of KNOWN_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const check = validateField(key, patch[key]);
    if (check.ok) values[key] = check.value;
    else errors.push(check.error);
  }

  if (errors.length > 0) {
    return { ok: false, errors, values: {} };
  }

  return { ok: true, errors: [], values };
}

/**
 * Merge a partial settings update into a copy of the current settings.
 * An invalid field rejects the whole update and leaves the current object untouched.
 */
function updateSettings(current, patch) {
  const validated = validatePatch(patch);
  if (!validated.ok) {
    return { ok: false, settings: current, errors: validated.errors };
  }

  return {
    ok: true,
    settings: { ...current, ...validated.values },
    errors: [],
  };
}

function loadSettings(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { settings: cloneDefaults(), errors: [], status: 'missing' };
    }
    return {
      settings: cloneDefaults(),
      errors: [`Could not read settings: ${error.message}`],
      status: 'unreadable',
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      settings: cloneDefaults(),
      errors: [`Settings file is not valid JSON: ${error.message}`],
      status: 'unreadable',
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      settings: cloneDefaults(),
      errors: ['Settings file must contain an object'],
      status: 'unreadable',
    };
  }

  const settings = cloneDefaults();
  const errors = [];
  let missingKey = false;

  for (const key of KNOWN_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(parsed, key)) {
      missingKey = true;
      continue;
    }
    const check = validateField(key, parsed[key]);
    if (check.ok) settings[key] = check.value;
    else errors.push(check.error);
  }

  return {
    settings,
    errors,
    status: errors.length > 0 || missingKey ? 'repaired' : 'loaded',
  };
}

function saveSettings(filePath, settings) {
  const persisted = {};
  for (const key of KNOWN_KEYS) {
    persisted[key] = settings[key];
  }

  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(persisted, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

module.exports = {
  DEFAULT_SETTINGS,
  REFRESH_INTERVAL_MIN,
  REFRESH_INTERVAL_MAX,
  cloneDefaults,
  validatePatch,
  updateSettings,
  loadSettings,
  saveSettings,
};