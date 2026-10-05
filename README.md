# Forever Warlocking

An interactive Warlock practice sim for WoW Forever: stand in front of a training dummy, press your spells in real
time and see how your rotation does.

**Play it in the browser: https://xnwlk.github.io/ForeverWarlocking/** (desktop, keyboard and mouse)

**Status: early, playable.** Pick a build and a race, walk around the fel chamber and cast your rotation on the
dummy: cast bar, global cooldown, DoTs, procs, execute phase, mana, a combat log and a damage meter. Pets and more
dummies are not built yet.

It uses the same spell values, talents and mechanics as Xn's Forever Warlock Sim, the DPS simulator; a copy of that
sim's data and engine lives in [`vendor/warlock-sim/`](vendor/warlock-sim/README.md).

## Run it locally

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File tools/serve.ps1
```

Then open http://localhost:8770/.

## Notice

Copyright © 2026 XNWLK. All rights reserved. This repository has no open-source license.

This is an unofficial fan-made tool. It is not affiliated with, endorsed by or sponsored by Blizzard Entertainment.
World of Warcraft, Warcraft and Blizzard Entertainment are trademarks or registered trademarks of Blizzard
Entertainment, Inc. in the U.S. and/or other countries. Game content shown or used by this tool — spell, talent and
item names, tooltip text, numbers and icons — belongs to its respective owners and is used for reference only.

Provided "as is", without warranty of any kind.
