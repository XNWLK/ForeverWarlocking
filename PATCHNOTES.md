# Patch notes — Forever Warlocking

What changed, newest first. The [page](https://xnwlk.github.io/ForeverWarlocking/) always runs the newest version;
the [releases on GitHub](https://github.com/XNWLK/ForeverWarlocking/releases) mark a version now and then.

## Since v0.9.0

### 2026-10-17
- Your demon's attacks crit with your spell crit only, as the Warlock SIM now has it. Agility does nothing any more:
  Grace of Air Totem and Scroll of Agility are gone, and items no longer list Agility. Old settings codes with them
  still import.

### 2026-10-16
- Follows the Forever patch of 2026-10-16, as the Warlock SIM does:
  - **Eureka!** (Gnome) is an 8-second buff with no charges: every damaging spell that finishes while it is up does
    10% more damage and costs 10% less mana. Damage over time gets nothing from it.
  - **Touch of the Grave** (Undead): a 30% chance, then 25 seconds before it can come again; its damage is 5% of your
    maximum health, and nothing raises it.
  - **Ruthless** (Human, +2% crit) and **Savage** (Orc, +1% crit) for your spells and for the Succubus's melee.
    Blood Fury's cooldown is 3 minutes.
  - **Shadow Mastery** gives 2 to 10% Shadow damage. **Malediction** is gone; **Grim Reach** stands in its place.
    An old build code with Malediction still imports: its points move to Grim Reach as far as they fit.
  - Windfury and Flametongue Totem no longer help your demon, and Tranquil Air Totem is gone.
  - New talents for four ready builds; the build list's ranking is updated.
  - **Range talents:** Destructive Reach lengthens only Destruction spells and Grim Reach only Affliction spells
    (Corruption is Affliction). Drain Life no longer gains range from Destructive Reach.
- When your Affliction and Destruction spells reach different distances, the ground shows a ring for each: violet for
  Affliction, pink for Destruction.
- The **Addon** button at the top left opens Xn's Warlock Sim on CurseForge, where you get the addon. The README
  links there too, with the addon's GitHub page beside it.
- The GitHub buttons at the top left show GitHub's logo in place of the word, and the addon has its own GitHub button
  next to its Addon button.

### 2026-10-15
- **Lessons** (a new button at the top left): a short series for the build you play, made from its rotation - never
  stop casting, damage over time, curses and Banes, Demonic Brand, procs, cooldowns, mana and Life Tap, the whole
  rotation. Each ends with a test, a short fight with a few things to reach; passing it opens the next lesson.
- **Progress** (also at the top left): every fight you finish is counted per build. A chart of your share of the
  sim's DPS day by day, your best, the last seven days against the seven before, and whether your mistakes from
  "What it cost you" are getting smaller. Kept in your browser.
- **Today's fight**, at the top of the Challenges window: a new fight every day, the same dice for everyone, with your
  own build. Play it every day for a streak.
- **The sim as a ghost** (a switch, on at first): a see-through Warlock a little to your right casts what the sim
  casts at the same second, with the spell over its head. Its demon comes along, see-through too: the Imp casts
  Firebolt when the sim's Imp does, the Succubus runs in and uses Lash of Pain when the sim's does.
- **Proc alerts** (a switch, on at first): when Shadow Trance or Decimation comes up, a word at the top of the screen,
  a chime and a strong glow on the button to press.
- **Watch it again**: the review plays a finished fight back in the room - you, your demon and the dummies as they
  were - with play, pause, speed and a slider to go to any moment.
- The character sheet lists the items you wear when your imported settings come from the Warlock SIM's gear builder.
- Brought up to date with the Warlock SIM. Its settings codes and share links can now also carry the items of its
  new gear builder; Import takes the gear's numbers from them as before.

### 2026-10-14
- The page has a logo: a training dummy struck by a Shadow Bolt. It is the icon in the browser tab and stands at the
  start of the bar at the top left, in front of this project's GitHub button.

## v0.9.0 — 2026-10-14
- The first release on GitHub.
- The bar at the top left has an **Addon** button. It opens Xn's Warlock Sim, the in-game addon: the sim inside the
  game, with your own character. Its build and settings codes can be imported here.
- The labels in that bar are shorter ("SIM" for the Warlock SIM), so it no longer runs into the bar at the top right
  when a build with a long name is picked.

## 2026-10-13
- **Dummies with infinite health.** Two more ways a fight can end, in the Fight panel: "Infinite health: lasts until
  you end it", and the same with the dummies in execute range the whole time. While such a fight runs, "Review the
  fight" reads "End the fight and review" and ends it.
  - While you fight you are measured against a ten-minute fight of the sim; once you end it, against what the sim
    had done by the same second (like you, it did not know when the fight would end).
  - These fights keep no best and no list of results: how long they last is your choice.
- **Import takes the DPS sim's share link**, besides its build and settings codes: settings, a build and a race in
  one link.
- Fixed: a damaged share link left an error in the browser's console. The message on the page was and is right.
- The "Sim average" in the meter says on hover what the number is in each kind of fight.

## 2026-10-12
- **What it cost you:** the review lists what went wrong as the DPS it took, biggest first — time not casting,
  casts you stopped, DoTs and curses that were down, DoTs cast again too early, Life Taps you did not need, the pet
  standing idle. All estimates, and the review says how each is worked out.
- **Your results in this fight:** the review charts your last runs of the same fight.
- "The sim would cast" now says **why** ("it is about to run out", "not enough mana", "the filler" ...).
- **Race your best:** the meter shows a third bar, where your best run of this fight stood at the same second.
- **Opener trainer** (a switch, off by default): your first eight casts against the sim's usual opener.
- **Three new challenges:** the drill Proc watch, and the encounters Target calls and Reinforcements (adds that join
  mid-fight).
- **Robes** in eight colours, earned with good grades in the drills.
- **The result as a picture:** a card with your name, build, race, the fight, your DPS and the damage curve, to copy
  or save.
- **Screen:** interface size, and colour-blind colours.
- **Controller support**, with a fixed layout shown in the Keybinds panel.

## 2026-10-11
- Fire spells sound smoother: much less crackle, a calmer flame.
- The Succubus's melee range (5 yards) now comes from the DPS sim's data. Nothing changes in play.

## 2026-10-09
- Molten Skin and Soul Link reduce the damage your own Hellfire does to you.
- Fixed: in a fight on health that lasted longer than the sim's, the race against the sim now ends where the review
  does. The review's graph says "0 s to 30 s" for a 30-second fight (it said 31).

## 2026-10-08
- **Precast and pull timer.** A spell you start before the fight is a precast: the fight begins when it lands, and the
  sim is then measured with the same precast. The Pull button counts down to the pull. Bests and drill grades were
  reset once, since older results do not compare.
- The review has a **Mana** part (your mana over the fight, Life Taps, what was left) and **DoTs cast over too early**.
- DoT timers turn gold when it is time to cast again. Zooming can have its own keys.
- **Your Warlock takes the shape of its race.**
- The review's graph shows the sim's highest fight as a faint line.
- Flametongue Totem, for imported settings. Windfury, Flametongue and Grace of Air Totem do not stack: the first one
  that is on counts.
- Destro Incinerate Imp casts Curse of the Elements earlier, as in the DPS sim.

## 2026-10-07
- **Your health counts:** Life Tap costs health, Hellfire hurts you, a heal comes every 10 seconds, leeching spells
  give health back. Soul Shards never run out. Spells can be partly resisted until Curse of the Elements is up.
- **Threat** is shown in the meter, the review and Searing Pain's tooltip.
- **Sounds made again:** breathy casting, muffled hits, silent damage over time.
- No Spirit regeneration while channelling.
- Improved Shadow Bolt is applied by every Shadow Bolt crit. Windfury Totem, for imported settings.
- Only one air totem at a time; Blessing of Salvation and Tranquil Air Totem do not stack.
- Seven ready builds, as in the DPS sim.

## 2026-10-06
- **A version for phones and tablets:** a stick to walk, a spell grid, round buttons, a Menu with everything else.
- **The review's timeline:** your casts, the sim's, and when each DoT was up.
- **The sim's next cast** as a hint, **your best** in each fight, **DoT timers**, keys with Shift, Ctrl or Alt and
  mouse buttons, three **scripted encounters**, and a **link that shares your setup**.
- **The bar on the right:** switches, the sim's priority list, a live race against the sim, mistake callouts,
  character, talent and buff sheets, latency, fight presets, copying the log; **drills** graded against the sim,
  and a **seeded fight** everyone can play with the same dice. **Challenges** have a window of their own.
- Soul Fire's cooldown starts when its cast is complete.
- The 5-second rule: Spirit gives mana back only while no mana was spent for 5 seconds.
- Touch of the Grave grows with Shadow damage. The two elixirs' crit does not add up.
- Health and mana bars show a percentage. Link buttons at the top left.
- A new Warlock model and casting pose, the Imp walks, a calmer room of grey stone.

## 2026-10-05 — the first day
- The fel chamber to walk in, with the casting rules carried over from the DPS sim's engine: cast bar, global
  cooldown, DoTs, procs, execute phase, mana, the Imp and the Succubus with Attack and Follow.
- One, two or three dummies with target switching, Bane of Havoc, Rain of Fire and Hellfire.
- The ready builds listed by their DPS in the sim, every race, names you can change by clicking them.
- A fight review against the sim, import of the DPS sim's build and settings codes, an editable action bar and a
  keybinds panel, timed fights, movement phases and hits taken, damage numbers and cooldown sweeps like the game's,
  tooltips, a spell animation for every spell, and sounds (off until you switch them on).
