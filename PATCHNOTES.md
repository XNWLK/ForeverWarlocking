# Patch notes — Forever Warlocking

What changed, newest first. The [page](https://xnwlk.github.io/ForeverWarlocking/) always runs the newest version;
the [releases on GitHub](https://github.com/XNWLK/ForeverWarlocking/releases) mark a version now and then.

## Since v0.9.0

### 2026-11-24
- Wrack DS times its cooldowns as in the Warlock SIM: the Spellblasting potion comes at your first Wrack instead of on
  the pull, and the hint asks for Blood Fury once the Amplify Curse Bane of Agony has 17 seconds or less left (about
  943 DPS).
- Reset now starts a clean fight: the cooldown timing, a trinket's buff and Revelation no longer carry over from the
  fight before.

### 2026-11-23
- Wrack DS's weapon now has +22 Intellect instead of Revelation, as in the Warlock SIM (about 938 DPS).

### 2026-11-22
- Resists now follow each spell's own rule, as in the Warlock SIM. Immolate, Incinerate, Shadowburn, Death Coil, Bane of
  Agony and Drain Soul land whole or are resisted whole (the log says "resists" and the dummy shows "Resist"); Shadow
  Bolt, Searing Pain, Soul Fire, Conflagrate, Hellfire and Rain of Fire can be partly resisted; DoT and channel ticks
  are only rarely partly resisted. Spell Pierce adds damage to direct hits only. Your demon's spells can now be resisted
  too (the Imp's Firebolt whole, Lash of Pain and Demonic Brand partly). With Curse of the Elements up this almost never
  happens, so the numbers barely move.
- Shadow Demo wears Leggings of Torment as its pre-raid legs, as in the Warlock SIM (about 912 DPS).
- Rain of Fire's ticks are now only rarely partly resisted, like DoT ticks (Hellfire's stay as before), and a partial
  resist never takes more than 75% of a hit, as in the Warlock SIM. With Curse of the Elements up the numbers don't move.
- With two or three dummies, the hints now ask for your DoTs on the other dummies before a Life Tap for mana, as in the
  Warlock SIM (a little more damage for every build; one dummy is unchanged).
- Revelation works as measured in the game, as in the Warlock SIM: it comes a little less often (less with more crit),
  but now also from Hellfire and Rain of Fire ticks and from hits on any dummy. Your next direct spell uses it when its
  cast finishes, and while it is up every tick of a channel crits.
- Your demon now crits much less (its own small crit plus the crit on your gear, not your whole spell crit), takes more
  spell power from your Shadow or Fire spell power, and its mana comes back from your Intellect (the Imp the most).
  Shadow Demo is now about 901 DPS.
- Hellfire's cast no longer triggers Touch of the Grave or Judgement of Wisdom, and Rain of Fire's cast no longer
  triggers Touch of the Grave.
- The Weakness Analyzer's cooldown is now 6 minutes (was 90 seconds), as in the game and the Warlock SIM, so it is used
  less often (every build loses a few DPS; Wrack DS about 935).

### 2026-11-20
- Your food is now Baked Salmon / Lobster Stew (+28 spell damage, was Nightfin Soup +22), as in the Warlock SIM. Every
  build gains about 5 DPS; Wrack DS comes first at about 938.
- An imported settings code with Nightfin Soup or Runn Tum Tuber Surprise turns on the new food in their place.

### 2026-11-19
- Spells now carry their level-60 bonus from the game's data, as in the Warlock SIM: Searing Pain, Shadowburn, Soul
  Fire, Death Coil, Hellfire (also what it does to you), Rain of Fire and the Imp's Firebolt hit a little harder, and
  Life Tap gives 424 mana for 424 health (was 430). Fire Demo is now about 887 DPS; Wrack DS still comes first (about 934).

### 2026-11-16
- The Weakness Analyzer is now used the way the Warlock SIM uses it: by its new "Activate trinket" line in the
  priority list. For Shadow Demo, Wrack DS and Incinerate DS it goes off as soon as nothing more important is due
  (also during a Wrack channel or while you wait out a movement phase); for Fire Demo once the fight is a minute old.
  Incinerate Pandemic keeps the old timing. It still works by itself; it is not a button.
- The hint for your next cast now knows when a DoT no longer pays off near the end of a timed fight, as the SIM does.
- Wrack DS is now about 933 DPS.
- Wrack DS and Shadow Demo wear new pre-raid bracers (Tearfall Bracers of Shadow Wrath, with Shadow spell power), as in
  the Warlock SIM. Shadow Demo is now about 907 DPS.
- Brought up to date with the Warlock SIM again. Nothing changes in play.

### 2026-11-15
- The Pre-BiS gear is now all blue items, as in the Warlock SIM (new neck, ring, chest, gloves and, for Shadow Demo and
  Wrack DS, off hand). Every build is a little stronger; Wrack DS still comes first (about 909 DPS).
- Every Pre-BiS off hand now has its enchant (+9 Intellect), as in the Warlock SIM. Every build gains about 2 DPS;
  Wrack DS comes first at about 911.
- Wrack DS wears new pre-raid legs and bracers, as in the Warlock SIM (Leggings of Torment and Flameweave Cuffs of
  Shadow Wrath, both with Shadow spell power). It now does about 920 DPS; the other builds do not change.
- Brought up to date with the Warlock SIM again. Nothing changes in play.
- Shadow Demo no longer casts Immolate, as in the Warlock SIM: its priority list, the hint for your next cast and the
  lessons leave it out. It is still in your spellbook if you want it.
- Wrack DS wears new pre-raid boots and belt (Master's Boots and Belt of Shadow Wrath, both with Shadow spell power)
  and now does about 931 DPS.
- Brought up to date with the Warlock SIM once more. Nothing changes in play.

### 2026-11-14
- **You now fight like the Warlock SIM's front page**: every build wears its own Pre-BiS gear (Phase 1 items with their
  enchants), with the ideal Phase 1 raid buffs and consumables. The build list follows the SIM's new ranking, so the
  build you start with is now Wrack DS (about 900 DPS).
- Some of them work by themselves during the fight, at the same moments the SIM uses them: the Major Spellblasting
  Potion and the Weakness Analyzer go off with your cooldowns, the Demonic Rune when you are down 1,200 mana, and
  Revelation on your weapon can give your next spell extra crit. The combat log says when.
- The hint for your next cast knows a Demonic Rune is coming, so it no longer asks for Life Tap too early.
- The character sheet says which gear you are wearing.
- Brought up to date with the Warlock SIM (twice).
- **Partial resists work as in the Warlock SIM's new model**: a boss with resistance resists a share of each hit in
  10% steps, and your DoT and channel ticks are resisted much less than direct hits. Curse of the Elements still takes
  its resistance away, so the builds' DPS barely moves (0.1 at most). Spell Pierce on your gear is worth about half as
  much as before.

### 2026-11-13
- Brought up to date with the Warlock SIM. If you bring your gear in from its gear builder, a trinket's always-on bonus
  (such as extra spell power) now counts here too. Trinkets you use or that proc still do nothing here, as before.
- Brought up to date with the Warlock SIM (its item search only). Nothing changes in play.

### 2026-11-12
- **Wrack works differently, as in the Warlock SIM**: your Corruption, Bane of Agony and Siphon Life keep their usual
  ticks, and every halfway point between two of them that falls while you channel Wrack at their target gives one
  extra tick (Bane of Agony's at the strength of the moment it falls in). Stopping Wrack changes nothing else, and
  there is no smaller last tick any more. Over a whole Wrack that is about as many ticks as before; the combat log
  marks each extra one. Wrack DS is still about 689 DPS. Its lesson explains the new rule.
- **Wrack fix**: when you start Wrack again at the very moment of a halfway point, that point now gives its extra
  tick once instead of twice, as in the Warlock SIM.
- **Casting Wrack again while it runs starts it over**, like any other channel: the new one runs its own 6 ticks and
  the old one's leftover ticks are lost (if the new one is resisted, the old one is lost too). Before, the new one kept
  the ticks the old one had left. As in the Warlock SIM; the Wrack lesson says so.
- Fixed: for a few minutes after that update the page did not load (a typo in the Wrack lesson).

### 2026-11-11
- Shadow Demo and Fire Demo take 2 points of Demonic Embrace instead of Master Summoner, as in the Warlock SIM
  (a little more health; as Undead, Touch of the Grave hits a little harder).
- Then more Demonic Embrace, as in the Warlock SIM: Fire Demo has 4 points (one less in Demonic Energies and in Demonic
  Brand), Shadow Demo 3 (one less in Demonic Energies). Damage is nearly the same; Fire Demo is still the top build.
- From the official notes of the Forever patch of 2026-11-10, as in the Warlock SIM:
  - **Bane of Havoc now takes a global cooldown**, like any other spell. Casting it also cuts a channel short and
    starts the fight, and the review's timeline and opener count it as a cast.
  - Wrack deals 60 per tick before spell power (was 60.2), and its tooltip and Soul Siphon's are the official ones.
- **Amplify Curse is no longer lost on a missed Bane of Agony**: it stays up and the next Bane of Agony that lands gets
  the bonus (on your bar or used by itself).
- Wrack DS, as in the Warlock SIM: Corruption comes before Bane of Agony, and a Shadow Trance proc is held until it has
  8 seconds or less left, so it does not cut a Wrack short. Its Shadow Trance lesson explains this (about 689 DPS).

### 2026-11-10
- Synced with the Warlock SIM v169 and the Forever patch of 2026-11-10 (Wrack):
  - **While you channel Wrack, your Corruption, Bane of Agony and Siphon Life on that target tick twice as often**
    and still last as long. When Wrack stops they keep how far they had got toward their next tick, and one that ends
    between two ticks deals the part it built up as a smaller last tick. (Wrack no longer adds 10% to your DoTs.)
  - Wrack itself deals 70% of what it did.
  - **Casting Wrack again while it runs loses nothing**: the new one keeps the ticks the old one had left.
  - Soul Siphon counts only Corruption, Bane of Agony and Siphon Life.
  - Wrack DS keeps up Bane of Agony and Siphon Life again and is stronger (about 687 DPS in the SIM). Its lesson
    explains the new Wrack.

### 2026-11-04
- Three builds have new names, as in the Warlock SIM: **Shadow Demo** (was Demo Pact Shadow Bolt Succubus), **Fire Demo**
  (was Demo Pact Fire Imp) and **Incinerate Pandemic** (was Destro Incinerate Succubus). They play the same, and your
  progress and bests with them stay.
- Synced with the Warlock SIM v161 and the Forever patch of 2026-11-03:
  - **New builds: Wrack DS and Incinerate DS.** Both sacrifice their demon (Demonic Sacrifice), so you fight without a
    pet. Wrack DS uses Life Tap right after a full Wrack, once the 5-second rule is over, and does not cast Siphon Life.
  - SM Ruin and Wrack Succubus are gone. If you played one of them, you start on the top build of the list.
  - Wrack hits harder (Improved Drains no longer raises it), and Shadow and Flame gives up to 20%.
  - Salvation is gone from the game.

### 2026-11-01
- Behind the scenes: boss fights now run on shared parts (rooms, mechanics, creatures), so new bosses can be added
  much faster once they are known. Onyxia plays exactly as before.
- Synced with the Warlock SIM v155 (its new priority-list conditions). The ready builds play and rank as before.

### 2026-10-30
- **Fix:** in the boss fight the review listed area spells once per whelp under odd names ("x12:hellfire"). Each
  spell is one line again, in the review and in the damage meter.
- The review's timeline shows each tick of a channel (Hellfire, Rain of Fire, Drain Life, Wrack) as a mark on its bar;
  point at one to see what it hit. Hellfire is shown as burning around you, not on your target.
- **Fix:** in the boss fight the damage meter's per-target line pushed its numbers out of the box. It is now "Per
  target" with Onyxia, the Warder and the whelps on a line each.
- **Boss frame:** in the boss fight Onyxia's frame stays at the top of the screen all the time: her health, the phase
  and what she is doing (casting Flame Breath, taking in a deep breath, in the air ...). Click it to target her, even
  while she flies out of view.
- **Spellbook:** the "Edit bar" button is now "Spellbook". It opens a board with every spell you can cast: drag one
  onto any slot of your action bar (or click it, then a slot), drag slots to swap them, or drag a slot off the bar to
  take it away. Each build keeps its own bar. It works on phones too.
- **Amplify Curse as a button:** builds with the talent find it in the spellbook. Put it on your bar and you press it
  yourself (instant, off the global cooldown, 3 minute cooldown); your next Bane of Agony within 30 seconds is 50%
  stronger. Left off the bar, it still goes off by itself with Bane of Agony, as the sim does it.

### 2026-10-29
- **The first boss: Onyxia.** The Bosses button now opens a list of bosses. Onyxia is fought in her own lair, built in
  the shape of the real one: the egg-shaped cave with lava cracks, the two egg caves and the entrance tunnel.
  - A ghost tank holds her the whole fight, ghost off-tanks hold the whelps and the Warder. She loses health on a fixed
    schedule, so the kill always takes about 6 minutes: phase 2 at 65% (after 1:24), phase 3 at 40% (after 4:12).
    Phase 2 is the long one, so there is time to practise it.
  - Phase 1: Flame Breath, Cleave and Wing Buffet hit the front, Tail Sweep the back and throws you about 40 yards.
  - Phase 2: she flies. Fireballs land on you and around the room, Deep Breath burns a lane across the cave after
    the emote (at least twice every time; the lane is about 40 yards wide), 20 whelps come out of the egg caves and more later, an Onyxian Warder walks
    in and is held at the mouth of the tunnel. Walking into an egg cave hatches more whelps, and they come for you.
  - Phase 3: she lands. Bellowing Roar fears you for 3 seconds (a skull in a purple ring over you while it lasts),
    and the lava cracks erupt again and again while you are feared and for a few seconds after: the floor is a muted
    brown, the cracks are spread evenly over it, and a fiery red line marks where the fire bursts out.
  - She keeps away from the walls when she flies.
  - The boss list also names what comes next: Hyjal bosses and Barrow Deeps bosses, coming soon.
  - **A reward: the Golden Succubus.** Beat the sim on Onyxia (finish alive with 100% of the sim's DPS or more) and
    your Succubus can turn gold: choose her under Rewards in the Bosses window. Looks only. The boss list also shows
    your best result against Onyxia.
  - The raid's healers give back what she does to you a few seconds later; you die if too much comes at once.
  - Your damage is counted in the meter and the review; the sim is measured in a fight of the same length on one
    target.
  - Your Succubus no longer runs on the spot when she fights a big target.
  - While she takes in a deep breath and crosses the cave, the egg caves are searing hot (about 1,000 a second):
    you cannot hide from Deep Breath in them.
  - In phase 3 a few whelps crawl out of the egg caves now and then.
  - If she kills you, the fight ends there: the log says so, and the review says when and what killed you (and gives
    no better than a D).
  - "Watch it again" works for the boss fight: Onyxia, the whelps, the Warder, the ghost tanks, her fire, the
    fireballs and the lava all come back, with your health under the slider.
- **Fix:** Blood Fury, Berserking and Eureka! could be used in the middle of a cast. Now they say "Can't do that
  while casting". During a channel (Drain Life, Wrack, Hellfire, Rain of Fire) they cancel the channel.

### 2026-10-28
- Synced with the Warlock SIM v153: **Life Tap** follows the sim's new rule (tap only when the rest of the fight
  needs more mana than you have), **Wrack Succubus** only channels Wrack while its DoTs have 4 or more seconds left,
  and the Destruction Incinerate Imp build is retired (five builds left).
- **Demonic Brand** on the target shows its time left at the bottom of the icon, like the other debuffs, and its
  charges (x5, x4 ...) at the top.
- A **Discord** button next to Twitch at the top left leads to Xn's Discord.
- From the Forever patch notes: **Berserking** (Troll) lasts 15 seconds (was 10).

### 2026-10-27
- A **Twitch** button at the top left leads to Xn's live stream: come by with questions, or just to say hi.
- The two-minute fights are **three minutes** now, the same length the build list's numbers come from: the Movement
  drill, Target calls, Fire dance and Barrage (with more calls, fire and barrages to fill the time), three of the
  lesson tests, three of today's fights, the seeded fight, two presets, and a fight that ends after a set time.
- **More keybinds:** the plain mouse wheel (up and down) and a tilting wheel (left and right) can be bound, with or
  without Shift, Ctrl or Alt; the wheel zooms only while it is not bound. Walking and jumping can go on the middle or a
  thumb mouse button. New things to bind: previous dummy, dummy 1, 2 and 3, and the fight review.
- **Fight history:** a History button (next to Progress) lists your last 30 fights. Click one to open its review again,
  with everything it showed at the time. Each review now also has the fight's **combat log** at the end, to read or
  copy. The fights are kept in your browser.
- From the Forever patch notes: **Blood Fury** (Orc) has a 2-minute cooldown (was 3), **Touch of the Grave** (Undead)
  can come again after 15 seconds (was 25). The build list's numbers moved a little; Undead is now the best race for
  four of the six builds.
- A **"Bosses - Coming Soon"** button under Challenges: one day you will pick a real boss from the game there and
  practise against it with its own mechanics. It does nothing yet.

### 2026-10-26
- Racials from the Forever patch of 2026-10-26, as the Warlock SIM has them:
  - **Human:** Ruthless gives 1% crit (was 2%); The Human Spirit gives 10% more Spirit (was 5%).
  - **Orc:** Savage is gone; **Command** is back: your demon deals 5% more damage (its spells, its melee and Demonic
    Brand).
- The build list's numbers now come from 3-minute fights (the Warlock SIM's default is back to 180 seconds), so
  they are 1 to 2% lower. The order is the same.
- The build list's numbers moved with them; Orc is now the best race for most builds.

### 2026-10-24
- The build list has six builds: **Aff Pact Shadow Bolt Succubus is gone** (the Warlock SIM retired it; Demo Pact
  Shadow Bolt Succubus does the same job better). If it was your build, the page opens the top build instead.
- "SM Ruin (classic)" is now just **SM Ruin**.

### 2026-10-21
- Your demon's **melee hit** is now 8/17 of your spell hit above the base (it was all of it), as the Warlock SIM now
  has it, and none of it is lost any more (the first 1% used to not count): 17% spell hit means her melee never
  misses. Its spells still use your full hit chance. The build list's numbers moved a little for the Succubus builds.

### 2026-10-18
- **Spell Penetration** is its own stat, as in the Warlock SIM: it lowers a target's resistance, but not below 0.
  Spell Pierce still goes below 0. Settings codes with Spell Penetration on gear bring it along, and items list it.
- Builds imported from the Warlock SIM can carry **rules, groups and variables of your own** in their priority list.
  The sim's next-cast hint follows them (and names your rule's condition as the reason), the action bar gets their
  spells, and the rotation panel shows them.
- New buffs from imported settings: the Atiesh auras (Warlock, Mage, Druid) and another Warlock's Blood Pact.

### 2026-10-17
- Your demon's attacks crit with your spell crit only, as the Warlock SIM now has it. Agility does nothing any more:
  Grace of Air Totem and Scroll of Agility are gone, and items no longer list Agility. Old settings codes with them
  still import.
- **Amplify Curse** makes the whole Bane of Agony 50% stronger (it was only the spell's base damage). The build list's
  ranking is updated.

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
