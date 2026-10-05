// Loads the vendored Warlock sim (vendor/warlock-sim) into a fresh Node context and returns its WL object.
// For Node scripts and checks; the page loads the same files with <script> tags in the same order.
const fs = require('fs'), vm = require('vm'), path = require('path');
const VENDOR = path.join(__dirname, '..', 'vendor', 'warlock-sim');

function manifest() { return JSON.parse(fs.readFileSync(path.join(VENDOR, 'manifest.json'), 'utf8')); }

function load() {
  const ctx = { console, Math, JSON, Date,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
    escape, unescape, encodeURIComponent, decodeURIComponent };
  ctx.window = ctx; vm.createContext(ctx);
  manifest().files.forEach(f => vm.runInContext(fs.readFileSync(path.join(VENDOR, f), 'utf8'), ctx, { filename: f }));
  return ctx.WL;
}

module.exports = { load, manifest, VENDOR };
