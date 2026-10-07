// Use XN's menu layout everywhere. Old preview links retain their saved setup without changing the UI.
export const simplified = false;
const legacyPreview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('layout') === 'simplified';
export function storageKey(key, alternate = legacyPreview) { return key + (alternate ? '.simplified' : ''); }
export function readStored(storage, key, alternate = legacyPreview) {
  try {
    const destination = storageKey(key, alternate), existing = storage.getItem(destination);
    const raw = existing === null && alternate ? storage.getItem(key) : existing;
    const value = JSON.parse(raw) || {};
    if (typeof value !== 'object' || Array.isArray(value)) return {};
    // Snapshot once, including an empty setup. Later changes in either version stay independent.
    if (alternate && existing === null) { try { storage.setItem(destination, JSON.stringify(value)); } catch { /* this session can still use the copy */ } }
    return value;
  } catch { return {}; }
}
