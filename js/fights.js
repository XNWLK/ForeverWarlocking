// Fight history: your most recent fights, kept in this browser (IndexedDB, which has room for them; the settings
// do not), so that a fight's review and combat log can be opened again after many more runs.
// An entry: { id, at, title, build, race, dps, simDps, seconds, names: [dummy names], review: the review's data
// without its functions, log: [[fight second, text, kind]] }.

const DB = 'forever-warlocking', STORE = 'fights';
export const KEEP = 30;
let opening = null;

function open() {
  if (!opening) {
    opening = new Promise(function (ok, fail) {
      if (!window.indexedDB) { fail(new Error('no IndexedDB')); return; }
      const req = window.indexedDB.open(DB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }); };
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function () { fail(req.error); };
      req.onblocked = function () { fail(new Error('blocked')); };
    });
    opening.catch(function () { opening = null; });       // a private window may refuse; try again next time
  }
  return opening;
}
// Runs work(store) in one transaction; resolves with what work's request returned (if any) once it is done.
function run(mode, work) {
  return open().then(function (db) {
    return new Promise(function (ok, fail) {
      const t = db.transaction(STORE, mode), req = work(t.objectStore(STORE));
      t.oncomplete = function () { ok(req ? req.result : undefined); };
      t.onerror = t.onabort = function () { fail(t.error); };
    });
  });
}

// Keeps a fight; the oldest ones beyond KEEP go.
export function saveFight(entry) {
  return run('readwrite', function (s) { return s.add(entry); }).then(function () {
    return run('readwrite', function (s) {
      const keys = s.getAllKeys();
      keys.onsuccess = function () { keys.result.slice(0, Math.max(0, keys.result.length - KEEP)).forEach(function (k) { s.delete(k); }); };
      return keys;
    });
  });
}
// All kept fights, newest first.
export function listFights() {
  return run('readonly', function (s) { return s.getAll(); }).then(function (list) { return (list || []).sort(function (a, b) { return b.at - a.at; }); });
}
export function deleteFight(id) { return run('readwrite', function (s) { return s.delete(id); }); }
export function clearFights() { return run('readwrite', function (s) { return s.clear(); }); }
