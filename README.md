# Forever Warlocking

## Training and review additions

The runner retains XN's original menus, project links, character/talent/buff views and fight review.
Character configuration remains read-only: build and gear/buff settings come from WarlockSIM import codes.
The bundled WarlockSIM files and its sync process are unchanged.

- Optional 1–30 second pull countdown beside Challenges (default None). Combat starts on hostile
  impact/application, including a pet attack or hostile miss; starting a cast or reaching zero on the
  countdown does not itself start combat. Life Tap does not pull. Precast timestamps can be negative.
  Countdown use does not change challenge grading or record eligibility.
- Recorded DoT clipping, including remaining cancelled ticks and Bane replacement. Missed refreshes,
  final-tick expiry and Conflagrate consumption are excluded. Cancelled ticks are not measured damage loss.
- Optional review modules for DoT uptime/clipping, Life Tap/mana, and casting/movement/pet activity.
  Unused spells show “Not used” and do not generate uptime warnings. Life Tap information is review-only;
  it includes ending mana and estimated opportunities, not a live planner.
- Interval inspection beneath the existing damage graph: drag to select or enter exact times. Shows
  recorded damage, casts, crits, misses, cast/GCD occupancy, forced movement and aura uptime. Sim interval
  DPS is interpolated from its averaged one-second curve and is not a causal explanation of lost damage.
- Player and sim crit percentages per spell, using landed hits and ticks together, excluding misses.
- A/D strafe defaults, turn keys initially unbound, Shift+wheel zoom, and bindable pet Attack/Follow.
  Existing custom bindings are preserved; unchanged old defaults migrate without claiming occupied spell keys.
- DoT icons beside duration bars, stable character window dimensions, and aid descriptions.
- Procedural race appearances with race-adjusted camera height. Human retains the original hooded model.
  Movement/collision/jump rules remain shared. No extracted game models or textures are added.

### Local preview and validation

Run `node tools/serve.js` and open http://127.0.0.1:8770/.
After changing loaded files, run `node tools/stamp.js` to refresh asset versions.

Checks:

```bash
node tools/check-vendor.js
node tools/check-combat.mjs
node tools/check-training.mjs
node tools/check-analysis.mjs
node tools/check-setup.mjs
node tools/check-keys.mjs
node tools/stamp.js --check
```

`check-combat` compares the runner's rules with the bundled engine in its parity-test mode.
`check-training` separately exercises the interactive impact-based clock and countdown behavior.
The impact-based opener clock differs from the sim's time origin and can affect DPS comparisons.
Open `tools/race-preview.html` to inspect race models, animation and resource-disposal checks.

### Updating WarlockSIM

Local and hosted versions load `vendor/warlock-sim`, not the live WarlockSIM website. Use the existing
`tools/sync-sim.ps1 -Sim <path-to-updated-WarlockSIM>` workflow and check the recorded manifest commit.
Run the checks above and inspect the app before publishing the runner and engine together. New upstream
mechanics or log formats may require updates to the runner or analysis even when shared data updates cleanly.

---

An interactive Warlock practice sim for WoW Forever: stand in front of a training dummy, press your spells in real
time and see how your rotation does.

**Play it in the browser: https://xnwlk.github.io/ForeverWarlocking/** (desktop with keyboard and mouse, or a phone or
tablet with touch controls)

**Status: early, playable.** Pick a build and a race, walk around the fel chamber and cast your rotation on the
dummy with your Imp or Succubus: cast bar, global cooldown, DoTs, procs, execute phase, mana, a combat log and a
damage meter that also shows what the DPS sim reaches on the same dummy. One, two or three dummies, with target
switching, Bane of Havoc, Rain of Fire and Hellfire. After a fight a review shows where you lost time against the
sim, with a timeline of what you cast and when. You can import your own build and settings from the DPS sim, change
the action bar and its keys (also with Shift, Ctrl or Alt, and mouse buttons), and set timed fights, movement phases
and hits taken. Challenges are graded against the sim: drills, scripted encounters and a seeded fight. Practice aids
you can switch on: the sim's rotation, its next cast, DoT timers, mistake callouts. A link shares your setup.

It uses the same spell values, talents and mechanics as Xn's Forever Warlock Sim, the DPS simulator; a copy of that
sim's data and engine lives in [`vendor/warlock-sim/`](vendor/warlock-sim/README.md).

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
