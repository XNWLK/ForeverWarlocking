# Vendored copy of the Warlock DPS sim

**Read-only. Do not edit anything in this folder** — the next sync overwrites it.

These are the data and engine files of Xn's Forever Warlock Sim, copied here so this project runs on its own.
The sim project is the single source of truth: a spell value, talent or mechanic is changed there, then copied over with

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File tools/sync-sim.ps1
```

```bash
node tools/check-vendor.js
```

`manifest.json` records which sim commit this copy is and the order the files must be loaded in.
