'use strict';

const DANGEROUS_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertSafeKeySegment(segment, path) {
  if (DANGEROUS_SEGMENTS.has(segment)) {
    const error = new Error('Dangerous key segment at ' + path + ': ' + segment);
    error.code = 'DANGEROUS_KEY';
    error.path = path;
    error.segment = segment;
    throw error;
  }
}

function assertSafePath(path, label) {
  for (const segment of String(path).split('.')) {
    assertSafeKeySegment(segment, label + ': ' + path);
  }
}

function deepCloneJsonSafe(value, path = '$', seen = new WeakSet()) {
  if (value === null) return null;
  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'boolean') return value;
  if (valueType === 'number') {
    if (!Number.isFinite(value)) {
      const error = new Error('Non-JSON-safe number at ' + path);
      error.code = 'NON_JSON_SAFE';
      error.path = path;
      throw error;
    }
    return value;
  }
  if (valueType === 'undefined' || valueType === 'function' || valueType === 'symbol' || valueType === 'bigint') {
    const error = new Error('Non-JSON-safe value at ' + path + ' (' + valueType + ')');
    error.code = 'NON_JSON_SAFE';
    error.path = path;
    throw error;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      const error = new Error('Cycle detected at ' + path);
      error.code = 'CYCLE_DETECTED';
      error.path = path;
      throw error;
    }
    seen.add(value);
    const out = value.map((item, index) => deepCloneJsonSafe(item, path + '[' + index + ']', seen));
    seen.delete(value);
    return out;
  }
  if (!isPlainObject(value)) {
    const error = new Error('Non-JSON-safe object at ' + path);
    error.code = 'NON_JSON_SAFE';
    error.path = path;
    throw error;
  }
  if (seen.has(value)) {
    const error = new Error('Cycle detected at ' + path);
    error.code = 'CYCLE_DETECTED';
    error.path = path;
    throw error;
  }
  seen.add(value);
  const out = Object.create(null);
  for (const key of Object.keys(value)) {
    assertSafeKeySegment(key, path + '.' + key);
    out[key] = deepCloneJsonSafe(value[key], path + '.' + key, seen);
  }
  seen.delete(value);
  return out;
}

function deepFreezeValue(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) deepFreezeValue(item);
    return value;
  }
  for (const key of Object.keys(value)) deepFreezeValue(value[key]);
  return value;
}

function createReadOnlyMap(map) {
  const api = {
    get(key) { return map.get(key); },
    has(key) { return map.has(key); },
    forEach(callback, thisArg) { return map.forEach(callback, thisArg); },
    entries() { return map.entries(); },
    keys() { return map.keys(); },
    values() { return map.values(); },
    [Symbol.iterator]() { return map[Symbol.iterator](); },
  };
  Object.defineProperty(api, 'size', { enumerable: true, get() { return map.size; } });
  return Object.freeze(api);
}

function getPath(flatFacts, path) {
  if (Object.prototype.hasOwnProperty.call(flatFacts, path)) {
    return { found: true, value: flatFacts[path] };
  }
  return { found: false, value: undefined };
}

function detectFlatNestedConflict(obj) {
  if (!isPlainObject(obj)) return null;
  const keys = Object.keys(obj);
  const objectPrefixes = new Set(keys.filter((key) => !key.includes('.') && isPlainObject(obj[key])));
  for (const key of keys) {
    assertSafePath(key, '$factsKey');
    if (!key.includes('.')) continue;
    const prefix = key.split('.')[0];
    if (objectPrefixes.has(prefix)) return key;
  }
  return null;
}

function flattenFacts(obj, prefix = '', result = Object.create(null)) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    if (prefix) result[prefix] = obj;
    return result;
  }
  for (const key of Object.keys(obj)) {
    assertSafeKeySegment(key, prefix ? prefix + '.' + key : key);
    const value = obj[key];
    const fullKey = prefix ? prefix + '.' + key : key;
    const topLevelAlreadyFlat = prefix === '' && key.includes('.');
    if (!topLevelAlreadyFlat && isPlainObject(value)) {
      flattenFacts(value, fullKey, result);
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

module.exports = {
  DANGEROUS_SEGMENTS,
  isPlainObject,
  assertSafePath,
  deepCloneJsonSafe,
  deepFreezeValue,
  createReadOnlyMap,
  getPath,
  detectFlatNestedConflict,
  flattenFacts,
};
