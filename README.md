# Forever Warlocking

## Local training improvements

The runner uses XN's original menus and project links. Challenges stays beneath the links, beside a
**Pull timer** selector (None, or 1–30 seconds) and **Start pull**. The custom-fight summary button and
reorganized Settings/Character menus are no longer displayed. The prior UI is preserved on local branch
`preserved-simplified-ui`.

Existing `?layout=simplified` links display the same original menus while retaining their separate saved
settings, names and records. The default URL retains its existing saves. Run `node tools/check-layout.mjs`
to check save isolation. Original Character / Talents / Buffs views and the combat review are retained.

**Keybinds** defaults to A/D for Strafe left/right, with Turn left/right unbound. **Camera** defaults to
Shift+wheel up/down for zoom; plain scrolling does not zoom. Both layouts support custom keyboard/mouse binds.
Existing unchanged defaults upgrade once, preserving custom bindings and avoiding spell conflicts. Resetting
all keys uses the new defaults. Key swaps cannot put a wheel or modifier combination onto movement.
Run `node tools/check-keys.mjs` to check binding behavior.

This local edition adds optional rotation coaching. **Review the fight** keeps XN's original review first: DPS, damage graph, timeline, time breakdown, spells
and uptime tables, all visible in their original order. Additional analysis follows in three optional, initially
collapsed modules: **DoT clipping & uptime**, **Life Tap & mana**, and **Casting, movement & pet**. Timestamp buttons
locate recorded moments in the original timeline; **Practice again** restarts the same setup. These additions
live in `js/review-modules.js` and do not replace the original review.
The DoT module lists every clip once in a compact table; each timestamp links to the timeline. Target and
replacement columns appear only when needed. Uptime gaps share a compact comparison table, with explanations
under **How to read this**.

Character, Talents and Buffs are read-only. Create your build and gear/buff setup in WarlockSIM, then
bring its build/settings codes into the runner with Import. The character sheet links directly to WarlockSIM.
The former in-game editor is preserved on local branch `preserved-in-game-editor`; existing imported codes and
saved browser data are retained. The shared import configuration continues to exclude unsupported active effects
from gameplay and the sim comparison. WarlockSIM vendor files and the sync process are unchanged.

Choose a **Pull timer** beside Challenges, then **Start pull** to reset the fight with a 1–30 second countdown.
Cast during the countdown so your opener lands at zero. Combat time starts on hostile impact/application or a
pet attack, never merely on starting a cast or reaching zero on the countdown. A hostile miss still engages the
target; channels engage on application. Life Tap does not pull. Early spells pull early; interrupted precasts do
not. Precasts appear at negative times in the review. The countdown is only a convenience: challenge grades
and best records work normally, with no separate countdown category.

**Clipped DoTs** appear in the log, callouts, review and timeline, with the target, time left and pending ticks
cancelled at a successful replacement. Missed refreshes, expiry on the final tick, and Conflagrate consumption do
not count as early-refresh clips. Replacing one Bane with another is recorded. Cancelled ticks are observations,
not a claim about net damage lost.

**Life Tap planner** estimates the mana needed to finish from the build's averaged simulated spell spending,
mana procs and passive regeneration. It uses the remaining timed duration or, in health fights, an estimated
kill time gradually updated from sustained DPS. Forecast revisions settle in direction; increases move one tap at a time and decreases use the settled lower count; a changing positive forecast cannot keep the helper hidden at zero. Zero-tap forecasts hide the helper. It highlights a needed full tap when its GCD fits before a DoT refresh and the
filler cast does not. The review records those opportunities, flags likely unnecessary late taps, and reports
mana at the exact finish before later regeneration. Pet-mana requests are treated separately. Aim to end near
zero while retaining enough for the final useful spell. These are estimates: your casts, movement, misses and
kill time can differ from the sim. Toggle **Life Tap planner** under **Show** to practise with or without its live guidance.

**Inspect an interval** below the damage graph accepts a drag selection or exact times. It shows recorded
damage, casts, crits/misses, cast/GCD occupancy, forced movement, gaps and aura uptime. The sim comparison uses
its averaged one-second curve. The spell table also compares player and sim crit percentages.

The coach excludes recorded forced movement from idle time. Uptime comparisons appear only after a completed
fight and are labelled as comparisons, not proven damage losses. Short samples, misses, target deaths and different
fight lengths can affect them. Spell formulas and the vendored WarlockSIM have not been changed.

This edition keeps the existing WoW icon references and procedural 3D models. It does not bundle new extracted
game models or textures. The original author and notices below are retained.

The **Race** picker also changes the player model in both layouts: Human, Gnome, Orc, Undead and Troll have
distinct proportions and faces. Human keeps XN's original hooded model; Undead has a forward hunch, an angular
hood, hollow cheeks, exposed forearm bones and crooked fingers. The robe and staff design and casting animations
are retained, with worn cloth and muted colors for Undead. Camera height follows the model; movement, collision size,
jump height and combat rules remain shared. Appearance geometry lives in `js/warlock-appearance.js`, separate
from WarlockSIM's racial stats. Replaced models release their geometries/materials without disposing shared textures.
Open `tools/race-preview.html` on the local server to compare front/back views and animations; its model checks
cover race switching, resource disposal, spell origins and jump height.

Run with Node.js (no packages to install):

```bash
node tools/serve.js
```

Open http://127.0.0.1:8770/. Checks: `node tools/check-setup.mjs`, `node tools/check-analysis.mjs`, `node tools/check-training.mjs`, `node tools/check-combat.mjs`,
`node tools/check-vendor.js`, and `node tools/stamp.js --check`. After edits run `node tools/stamp.js`.

The downloaded baseline is saved on local branch `main`; changes are developed on `training-improvements`. The
`upstream` remote points to XNWLK/ForeverWarlocking. The review branch is prepared against upstream history for the villms/ForeverWarlocking fork.
Local preparation does not publish changes or open a pull request.

### Updating the bundled WarlockSIM

Local and hosted builds load `vendor/warlock-sim`, not the live WarlockSIM website. Updating the upstream repo
alone does not update this app. Use the existing `tools/sync-sim.ps1 -Sim <path-to-updated-WarlockSIM>` script to
copy the chosen version; `vendor/warlock-sim/manifest.json` records its commit. Keep that folder unmodified between syncs.

Before publishing a synced version, run `node tools/check-vendor.js`, `node tools/check-combat.mjs`,
`node tools/check-setup.mjs`, `node tools/check-training.mjs` and `node tools/check-analysis.mjs`, then run
`node tools/stamp.js` and check the app in the browser. Combat checks compare the 3D implementation with the
bundled engine. The additional checks cover settings/gear, precasting, DoT clipping and mana guidance.
Shared value changes flow through the bundled data, but new mechanics, configuration fields or log formats may
also require changes in the 3D combat layer, import handling or analysis. Passing checks covers existing cases; inspect
upstream changes for new behavior they do not exercise. Publish the tested app and engine files together.

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
