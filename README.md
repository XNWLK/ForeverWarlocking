# Forever Warlocking

An interactive Warlock practice sim for WoW Forever: stand in front of a training dummy, press your spells in real
time and see how your rotation does.

**Play it in the browser: https://xnwlk.github.io/ForeverWarlocking/** (desktop with keyboard and mouse, or a phone or
tablet with touch controls)

**Status: early, playable.** Pick a build and a race (your Warlock takes the race's shape), walk around the fel chamber and cast your rotation on the
dummy with your Imp or Succubus: cast bar, global cooldown, DoTs, procs, execute phase, mana, a combat log and a
damage meter that also shows what the DPS sim reaches on the same dummy. One, two or three dummies, with target
switching, Bane of Havoc, Rain of Fire and Hellfire. After a fight a review shows where you lost time against the
sim, with a timeline of what you cast and when, how your mana and Life Taps went, and which DoTs you cast over too
early. You can import your own build and settings from the DPS sim (its codes or its share link), change
the action bar and its keys (also with Shift, Ctrl or Alt, and mouse buttons), and set timed fights, dummies with infinite health (also in execute range the whole time), movement phases
and hits taken. A spell you start casting before the fight is a precast: the fight begins when it lands, and the sim
is then measured with the same precast; a pull timer counts down to the pull. The review also lists what your
mistakes cost in DPS and charts your last results in the same fight; the meter races you against the sim and against
your own best run. Challenges are graded against the sim: drills, scripted encounters (fire, barrages, target calls,
adds that join mid-fight), a seeded fight and a new fight every day for a streak; good grades earn robes in other
colours. Lessons for each build explain its rotation step by step, each with a test that opens the next. A Progress
page shows your share of the sim day by day and whether your mistakes are getting smaller, and the review can play a
finished fight back in the room. Practice aids you can switch on: the sim as a see-through ghost beside you casting
what it casts, the sim's rotation, its next cast and why, an opener trainer, DoT timers, proc alerts, mistake
callouts. A link shares your setup, and a finished fight can be saved as a picture. There is an interface size setting, colour-blind colours, and
controller support.

It uses the same spell values, talents and mechanics as
**[Xn's Forever Warlock Sim](https://xnwlk.github.io/WarlockSIM/)**, the DPS simulator that plays a build thousands of
times and ranks them ([its repository](https://github.com/XNWLK/WarlockSIM)); a copy of that sim's data and engine
lives in [`vendor/warlock-sim/`](vendor/warlock-sim/README.md).

The simulator also exists inside the game: **[Xn's Warlock Sim](https://www.curseforge.com/wow/addons/xns-warlock-sim)** is an
addon for WoW Forever ([its repository](https://github.com/XNWLK/WarlockSIMAddon)) that reads your own character (talents, race, demon and the numbers on your character sheet)
and sims it. The build and settings codes it makes can be imported here, so you can practise the build you just
simmed.

What changed and when: the [patch notes](PATCHNOTES.md).

## Run it locally

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File tools/serve.ps1
```

Then open http://localhost:8770/.

After changing any file the page loads, run `node tools/stamp.js`: it gives every address in `index.html` a
version made from the files' contents, so a browser never mixes old and new files after an update.

## Notice

Copyright © 2026 XNWLK. All rights reserved. This repository has no open-source license.

This is an unofficial fan-made tool. It is not affiliated with, endorsed by or sponsored by Blizzard Entertainment.
World of Warcraft, Warcraft and Blizzard Entertainment are trademarks or registered trademarks of Blizzard
Entertainment, Inc. in the U.S. and/or other countries. Game content shown or used by this tool — spell, talent and
item names, tooltip text, numbers and icons — belongs to its respective owners and is used for reference only.

Provided "as is", without warranty of any kind.
