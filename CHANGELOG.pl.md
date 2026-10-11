<!-- markdownlint-disable MD024 -->

# Changelog

## Version 0.93

### Action Needed

- The `/red` chat command has been removed. Use the `red` die modifier instead — e.g. `/r 1d10red`
- `Big Knucks` now use `Melee Weapon` as their skill (not `Brawling`), we have intentionally not updated `Big Knucks` weapons on character/in world to avoid unexpected changes. GMs are advised to discuss the changes with players before manually correcting this error on actor sheets or replacing the item.

#### Weapons & Ammo That Cannot Crit

We have made damage criticals configurable per weapon and ammo, and migrated the weapons and ammo that RAW cannot cause a Critical Injury — such as the Air Pistol, Stun Gun, Stun Baton, and Rubber ammunition — to never crit. This migration matches on item name (including translations), so renamed or homebrew items are not caught.

If you have any such items that should not crit, set them manually: on a weapon, set **Critical Damage → Dice Required** to **0**; on ammo, enable **Modify Critical?** and set its **Dice Required** to **0**.

### New Features

- Add Foundry v13 Support
- Remove Foundry v12 Support
- Remove all non-core compendia.
  - These compendia have been moved to the `cyberpunk-red-dlc` module
- Transition ammo icons from `.png` to `.svg`
- Add a document browser for items and actors: search and filter the world and enabled compendia in one window, then click to open or drag to copy onto a sheet
  - Players get a shopping cart: add items, choose which owned actor to buy for, and check out — spending the character's wealth and logging the purchase to chat
- Fix orientation of non-english characters in Mook nameplates
- Disable input fields for Skill, Stat and Role values within the roll dialogue
- Migrate the dice/roll system onto native Foundry rolls (serializable, multiplayer-safe, with automatic Dice So Nice support)
- Add a `red` die modifier: a single explode-on-max / implode-on-1 for check dice, usable in any roll formula, macro or script (e.g. `1d10red`)
- Add a `dmg` damage marker modifier that drives the damage card and apply-damage controls and flags critical damage. A bare `dmg` roll defaults to RAW, with two companion modifiers to override it (e.g. `/r 2d6dmgab2cd10`):
  - `ab` — `abN` sets how many points of armor SP the roll ablates (default 1; `ab0` = none)
  - `cd` — `cdN` sets the critical bonus damage added on a crit (default 5; `cd0` = none)
- Make damage criticals configurable per weapon and per ammo (critical threshold, dice required, and bonus damage; ammo can override the weapon's rule)
- Support `@`-roll-data references (e.g. `@stats.ref`) in roll formulas
- Support arbitrary multi-term roll formulas with keep/drop and other dice-pool modifiers (e.g. `3d6kh2`, `2d6 + 1d4 + @stats.body`), each term carrying its own modifiers — the whole formula is evaluated natively instead of being reduced to a single dice term plus flat mods
- Render Foundry's native dice on every roll card, keeping the CPR title, modifier breakdown, critical flavour and apply-damage controls (a dedicated dice re-skin will follow)
- Sanitise the `dmg`/`ab`/`cd`/`red` markers out of an item's **Damage** field on save — for every attackable item's `system.damage` **and** an ammo override's damage value. They are built from the item's own critical/ablation settings (and `red` conflicts with the auto-appended `dmg`); every other modifier is kept, e.g. `3d6kh2dmg5ab0cd10red` is saved as `3d6kh2`
- Migrate all application windows (sheets, dialogs, and settings menus) to Foundry's ApplicationV2 framework and remove jQuery, in preparation for the removal of the deprecated ApplicationV1 framework in Foundry v16
- Add an optional client setting to extend the Cyberpunk RED theme to Foundry's interface and ApplicationV2 windows using Foundry's supported theme tokens; legacy ApplicationV1 windows retain their Foundry appearance
- Add a "Homebrew Rules" settings menu with JonJon's optional Luck Roll: when enabled, clicking the LUCK stat rolls 1d10 under your LUCK (Roll Under Max or Roll Under Current), with a Success/Failure chat card; off by default
- The dialog box for updating mook skills now presents the skills by category, similar to the character sheet
- Item upgrades may now be configured with negative modifiers
- Add 4 new CPR default Turn Marker options that can be selected via the system settings menu

### Bug Fixes

- Preserve shared empty ammo stacks when transferring loaded weapons between actor sheets
- Fix auto-stacking of stackable upgradable items (such as clothing and gear) when dropped onto a character, mook, or container sheet
- Restore the rich-text editors on item and actor sheets (descriptions, notes) that stopped opening after the ApplicationV2 migration; the edit button now sits at the top right of the field
- Tidy the item sheet settings and description panes: remove the divider lines, show the allowed install types as a comma-separated list, and right-align the allowed-types and installed-items values
- Secondary weapon upgrades (e.g. an installed Bayonet) now apply their Attack Modifier to attack rolls.
- Populate chat message speaker data on rolls so macros and modules can identify the acting token and scene, not just the actor
- Fix a startup error when launching a world with no active scene, which prevented the Defense Value ruler and other ready-time setup from initialising
- Fix Import All Content breaking items with pre-installed upgrades
- The "Damage Dealt To" damage-application card now shows the target's Token name instead of the Actor name
- Ctrl-Clicking (or Cmd-Clicking) an item properly sends a card to chat
- Dragging invalid items (e.g. Roles) to a container actor is handled gracefully instead of throwing dev errors
- Removed dead code around hiding the mook portrait
- Fixed some items types throwing dev console errors when dragged to a mook sheet
- Fixed duplicating Active Effects on character sheets
- Active Effect skill modifiers offer unowned world skills and the owner's skills on owned items, and resolve names for skills embedded only on an actor
- Skill modifier names from Active Effects now resolve in roll dialogs, chat roll cards, and character sheet tooltips instead of showing ???
- Hitting enter when editing a custom Active Effect key no longer closes the sheet
- Changing a mode for a skill modifier does not throw console errors
- The `Big Knucks` cyberware item has been corrected in the compendium to use `Melee Weapon` Skill

### Changes

- Theme all chat messages, including native Foundry rolls and RollTable draws, with CPR chat fonts and colors while keeping bespoke CPR roll/item card layouts.
- Remove foundry and third-party global css overrides to . Scopes system CSS to CPR windows and `@system` layer.
- Redesign the item sheet header into a chip-based three-row layout (breadcrumb and sources, name, stat chips and price) and make the description tab full-width
- The item browser result rows now share the redesigned item sheet header layout (breadcrumb, name, chips, price and source)
- Items can now cite multiple sourcebooks: the single `source` field is now a `sources` list; existing worlds migrate automatically
- Item sheet headers and browser rows now show only an item's first source inline, revealing the rest in a hover tooltip
- Pre-Installed smartgun-link upgrade into Malorian Arms 3516
- Pre-Installed hands and feet into Meatlimbs
- Pre-Installed hands, feet, and exposed cyberware coverings into Cyberlimbs
- Dragging a duplicate role (by name) is intentionally prevented and shows a warning
- Removed duplicate cyberware icons from `src/icons/cyberweapons`
- Unique icons have been created for each role

### Plumbing

- Browser end-to-end tests now run sharded across parallel CI jobs, with each shard's report and sheet screenshots merged into a single result and MR comment.
- Added a Vitest unit-test layer (`npm run test:unit`) for the Foundry-light code (pure helpers, config invariants), with a minimal Foundry-global shim and a CI job.
- Cleaned up all ESLint warnings and tightened the lint configuration so they are now treated as errors, including reporting unused `eslint-disable` directives.

## Version 0.92.4

### Action Needed

### Bug Fixes

- Add the Medtech's `Medical Tech Skill` & `Surgery Skill` to the list of available Role Abilities when configuring Active Effects
- Restore `Medical Tech (Cryosystem Operation)` role ability to Medtech role item in the Core compendium.

### New Features

## Version 0.92.3

### Action Needed

- Actors with the `Medtech` role should review their rank abilities and correct any errors
  - Rank allocation follows the same process as described on page 149 of the Core Rule Book
  - Allocate one point to Medical Tech Skills for each point allocated to Medical Tech (Cryosystem) & Medical Tech (Pharmaceuticals)
  - Allocate two points to Surgery Skill for each point allocated to Surgery

### Bug Fixes

- Fix bonus damage from `Spot Weakness` not being included in damage calculations for autofire attacks
- Fix location of upgrade element for equipped armor
- Fixed error where users were incorrectly notified to check their role abilities after allocating ranks for the Medtech Role
- Fix damage calculations to include upgrades for armors
- Update popup weapon cyberware details and register them as `concealable`
- Fix mook crit injuries from not appearing in chat when rolled
- Prevent net combat from dealing critical damage
- Crit injuries rolled on mook sheets now appear in chat properly
- Added `Medical Tech Skill` & `Surgery Skill` to Medetech role abilities.
  - Medtech role abilities should no longer notify users to `Check your role rank abilities, they don’t look right, Choomba”` when correctly allocating rank points.
  - Rank allocation follows the same process as described on page 149 of the Core Rule Book. Allocate one point to `Medical Tech Skills` For each point allocated to `Medical Tech (Cryosystem)` & `Medical Tech (Pharmaceuticals)` and allocate two points to `Surgery Skill` for each point allocated to `Surgery`.

### New Features

- Actors created as "Mooks" will now use the mook sheet layout by default. Mooks may still be configured to use the character sheet layout as before.
- Reformat chatcards to make the expanded damage roll calculations easier to read

## Version 0.92.2

### Action Needed

#### Weapon Quality/Attack Mod

We have fixed a number of Quality/Attack Mod mismatches on weapons in the Compendia for the below weapons. If any of your Characters/Mooks/Containers use any of these weapons the quickest way to fix them is to remove the old weapons from their sheet and replace them from the Compendia.

- Arasaka Weeping Reaver Katana
- SlamDance FangFist
- SlamDance Tasmanskiy Klô
- Malorian Arms 3516
- Arasaka Minami 10
- Arasaka WSSA Sniper System
- Chadran Arms City Reaper
- Chadran Arms Jungle Reaper
- Dai Lung Magnum
- Dai Lung Streetmaster
- Eagletech Bearcat
- Eagletech Scorpion
- Federated Arms Super Chief
- Federated Arms Tech-Assault III
- GunMart Home Defender
- GunMart Snipe-Star
- Militech Avenger
- Militech Boomer Buster
- Militech Bulldog
- Militech Dragon
- Militech Hotshot
- Militech Viper
- Nova Cityhunter
- Towa Manufacturing Type-G
- Towa Manufacturing Type-R
- Tsunami Arms Type-18
- Chainknife
- Sub-Flechette Gun
- Archimedes
- TearJerker

### New Features

- Add Ukrainian Language support

### Bug Fixes

- Fix term "Optional Slots" to "Option Slots"
- Fix small layout bug with Item Sheet: Source/Page display
- Corrected armor penetration settings for Federated Arms X-9mm
- Fix Weapon Quality/Attack Mod mismatches
- Fix `Techtronica Russia BMG 500` price/hands
- Fix incorrect option slot details for melee weapons, gear items, and upgrade attachments in the core compendiums
- Fix options slots for exotic weapons
- Fix term "Optional Slots" to "Option Slots"

## Version 0.92.1

### Bug Fixes

- Fix HP/Humanity interacting with the mouse scrollwheel
- Fix bug preventing extended magazines from modifying weapon ammo count
- Set correct `ammoVariety` on Westwood Pistol, Hello Cutie 1TruLuv, and Timeless WW1 Rifle to Pistol Conversion
- Fix creating weapon item on `CPRActorSheet` crashing that Actor's sheet and migrate to fix currently broken weapons
- Fix all container items that contain "programs" in `system.installedItems.allowedTypes` to correctly be "program"
- Fix shop container config not saving
- Remove items from weapons that do not exist in the game and in the actor owner of the item
- Fix Condition Lab and Triggler configutation styling in Dark Mode

## Version 0.92

### Bug Fixes

- Remove `templateVersion` from `system.json` which was causing a warning message in the Foundry Admin page.
- Fixed issue where deleting a Compendia item that has installed items within it, would prompt the user to delete those internal installed items. Since Compendia items only store ephemeral installed-item data (and no real in-world) items exist, this would error or incorrectly delete corresponding in-world items.

## Version 0.89.2

### Bug Fixes

- \#1130 - Fixed loading ammo into weapon upgrades.
- \#1131 - Fixed issue where migration app would not scroll when many compendia caused overflow.
- Migration error reports now redact host information.

## Version 0.89.1

### Bug Fixes

- \#1128 - Fixed visual bug related to weapon firemodes not showing state correctly.
- Fix uprade weapons (e.g., underbarrel weapons) not rolling.

## Version 0.89.0

### Action Needed

#### Item Quality

We have (re)added item quality data points to Weapons, Cyberdecks, etc. we have migrated items with a best effort (checking for poor/exellent in item names/descriptions) but this migration may not catch 100% of items.

Please manually review any items in your world/custom compendia/on actors that may need to be adjusted.

#### Skill Types

##### Removing Old Generic Skills

We have removed the old (incorrect) generic skills `Science`, `Play Instrument`, `Martial Arts`, `Local Expert`, and `Language` from being added to new Characters/Mooks and We have added new system compendia for `Skills (Languages)`, `Skills (Local Expert)`, `Skills (Martial Arts)`, `Skills (Science)`, and `Skills (Science)` which you can use to populate these specific skills for new actors.

As we do not want to lose any of your data we have not removed these Skills from your actors, we have instead made them deletable so you can add the add the correct specific skills and remove the old ones from character sheets as in your own time.

##### Modifying existing Specific Skills

For some functionality in the system we have added a `Skill Type` to each skill, while we have made a best effort to migrate all skills to the correct type there may be some instances where we were unable to detect the correct Skill Type of a skill. If you have any actors with custom skills for `Science`, `Play Instrument`, `Martial Arts`, `Local Expert`, and `Language` you may need to set it's Skill Type of the skill manually in that skill's Settings page. You can follow the process on the [wiki page](https://gitlab.com/cyberpunk-red-team/fvtt-cyberpunk-red-core/-/wikis/System-Documentation/Items/Skills#settings-tab).

#### Weapons Ignoring Armor

We have added the ability to allow weapons to ignore a percentage of armor or armor under a certian SP. We have migrated all melee weapons to include the new datapoints to ignore 50% armor by default.

If your players or mooks have any weapons that ignore a different percentage or armor under a certian SP that is not 50%/0SP then you will need to update these manually (or replace from a copy in the system compendia).

#### Get EMP'd Macro

If you have imported the `Get EMP'd Macro` you will need to delete the copy in your world and re-import it from the `Other/Macros` Compendium as we have updated this Macro.

### New Features

- Added compatibility for Foundry v12.
- Removed compatibility for Foundry v11.
- Add Compendia for:
  - Skills (Local Expert)
  - Skills (Science)
  - Skills (Martial Arts)
  - Skills (Play Instrument)
  - DLC: 12 Days of Gearmas (thanks to @LordCheesusCrust)
- Add a check to characters to see if they are considered "Hardened"
  - Based on the rules in Danger Gal Dossier pg. 150
  - Displays an overlay Icon on the Character Sheet Image which lists the reasons a character is considered hardened when hovered
  - Programmatically available under the `system.derivedStats.isHardened` datapoint
- Add Quality to Weapons/Cyberdecks
- Add new translations:
  - Chinese (Simplified)
  - Chinese (Traditional)
  - Japanese
- \#653 - Enable support for dddice
- Adjust font size of Handle/Name in Character sheets if the name overflows
- Skill Items now have a `skillType` for programmatic access
- Remove `Science`, `Play Instrument`, `Martial Arts` skills
  - These will remain on existing Characters
  - They will not be added to new Characters
- Rename default `Local Expert` skill to `Local Expert (Your Home)`
- Add CSS theme support for Monks Active Tile Triggers Module
- Add Speedheal Macro
- Add "Long-Barrel Pistol" DV Table from 12 Days of REDmas DLC
- Add ability to set weapon ignore percentage
- Add ability to set weapon to ignore armor below set SP amount
- \#235 - Added ability to change resource bars for armor from item sheet
- Add Critical Effect Failue datapoint for Weapons
- Display Net Architectures in Character's gear tab
- Add Basic system API
  - Add `GetEMPableItems` function to API
- Add Q-Workshop dice presets for Dice-So-Nice
- Add a default Black ICE actor when first launching a world

### Changes

- Fix actor lookup in Get EMP Macro
- Weapons in fight tab now categorized by Ranged/Melee
- Scrolling with the mousewheel no longer adjusts stats/skills on the Character sheet
- Change Pause Font to Tektur for better internationalization support
  - Remove Orbitron font
- Change the styling of `<code>` elements
- Header elements in text input areas are now styled in a similar way to the core book
- Update netrunning tiles with new tiles from Solution
- Update Macro icons to fit system style
- Update Demon sheet layout to be less wonky
- Change how we handle Branded Items
  - Rename branded items to use the full item name from the source book
  - Remove the programatic band name handler
- Ensure all SVGs have `width`/`height` set corectly to prevent known Firefox/PIXI bug

### Bug Fixes

- \#933 - Fix multiple compendium errors/missing values, thanks @Alexander Fokin
- \#950 - Bolded DV checks in various items of the compendia
- Fix NET Arch image path seperators
- \#951 - Fix duplicate page references on item description that are already present in manual/page properties for items
- \#979 - Fix styling of inline rolls in chat
- Fix Medtech translation stering on Role Item
- Added several small updates to descriptions to understand various items better
- Fix image overflow on Item Sheets
- Fix typos in some items
- Fix Computer not being isElectronic
- Fix filepicker favorites styling
- \#1017 - Fix duplicate effect bonuses being applied to attacks
- Fix program damage type in Chat messages for Programs
- Fix not being able to creat effects on owned items.
- Fix Black ICE actions/skills not being properly translated
- Change description of Warlocks Book to be RTal Homebrew Policy compliant
- Fix more typos in items
- \#1089 - Fix missing effects on items split from stacks
- \#1077 - Fix DV Ruler button on character sheets not working correctly.

## Version 0.88.2

### Changes

- Switched to using DataModels to enforce data types (#316, #723)
- Fix roll processing to accept lowercase and upper case roll formulas
  - EG: 1d6 & 1D6
- Add setting to disable warning when rolling damage without targets
- The fumble recovery skill for Solos is now accounted for

### Action Needed

Our v11 Migrations of Active Effects introduced a bug where modifiers to STATs (and only STATs). Caused them to be multiplied by 3.

For example, if you had the Grafted Bone and Muscle Lace (BODY +2) on an actor with a base BODY of 6, instead of having a BODY of 8, the actor would now have a BODY of 12.

Unfortunately we cannot revert this automatically so you will need to fix these issues manually. Either restore from a pre-`0.88` backup and remgirate or adjust the actors back. This affects all Characters/Mooks who had STAT modifiers.

\*\*If you are currently migrating from a version prior to `0.88`, the above does not apply (as the migration script has been fixed).

### Bug Fixes

- \#856 - Fix token targeting chat cards spoiling actor names, use token names instead.
- Fix weapons moved to stash not applying correct amount of ammo stack
- Fix incorrect Black Chrome Grenade Names
- Fix `Heavy Pistol (ArmorPiercing)` icon
- Fix Mood Eye Cyberware not being fashionware
- Fix Perfect Fit Cyberfoot not requiring foundational
- Fix HP and Humanity resetting to 40 HP/60 Humanity every time that world and current scene reloaded.
- Fix unlinked character and mook actors resetting back to default 40 HP, 60 Humanity
- Fix being unable to edit/toggle the same AE from multiple copies of the same item.
- Fix BlackICE actor program link list not in alphabetical order
- Fix issue where items did not have their dv tables translated.
- Fixed rare issue where container actor would fail migration.
- Fix issue where orphaned effects on actors were causing migrations to fail.
- Fix migration issue where AEs on stats were causing them to be incorrectly recalculated.
- Fix translation issues with translated skills via Babele

### New Features

- The Changelog is now a Journal allowing:
  - The entire Changelog to be shown
  - Re-opening at any time

## Version 0.88.1

### Action Needed

**WARNING**: IF YOU HAVE UPDATED FROM `0.88.0`/FOUNDRY V11, THIS WAS WRONG (but not your fault). YOU NEED TO ROLL BACK TO THE BACKUP YOU MADE / FOUNDRY V10, THEN UPDATE TO THIS VERSION. AGAIN, **ROLL BACK TO FOUNDRY V10 AND YOUR BACKUP THAT YOU MADE IN CPR `0.87.6`**, THEN UPDATE DIRECTLY TO `V0.88.1`. Come to the discord if you are confused.

### Bug Fixes

- Actually fix a (Foundry) bug where unlinked tokens were losing all of their items.

## Version 0.88.0

### Action Needed

We have renamed all Compendia in the system utilizing the new Compendium Folders feature which has meant some changes behind the scenes which mean the pack names themselves have changed.

This means any instances where you have dragged an item from a compendium into a text field like an Item Description or Journal entry which created a link to the item is now referencing a broken item. Unfortunately this would be very complex and fragile to migrate so we have not provided migrations for this. You can fix it by editing the document and dragging and dropping the item from the compendium again.

### New Features

- Add CSS theming to Journals
- New Theming for Tooltips
- Add CSS theming to all TextEditor instances (Notes, Descriptions, etc.)
- Support for editing Active Effects on owned items

### Bug Fixes

- A couple of minor CSS fixes
- Facedown rolls correctly include reputation value.
- Fix CSS colors on User Config pop out
- Fix Item Description tooltips in gear sheets to sanitize UUID references
- Fix missing \_stats data from all system Compendia/Packs
- Localized Mook skills are now sorted alphabetically
- Fix luck rolls adding luck stat when no luck applied
- Temp fix for Dice so Nice treating reputation as string on facedown rolls
- Fix missing foundational need for Holo Projector Cyberware

### Changes

- Update token methods for v11 compatibility
- Update System files for v11
- Update `label` > `name` for Active effects
- Hide system only Compendiums from Compendium tab
- Organize Compendiums into Compendium Folders
- Switch all TextEditor instances to use Prosemirror
- Combine "effects" and "notes" field for Black Ice.
- Change font-hero to use same styling as journal headers
- Change styling of release notes pop-up to match journal styling
- All Compendium updated for v11 and now sorted into Folders

## Version 0.87.6

### Bug Fixes

- Fix a bug where world items with items installed wouldn't render (introduced in last hotfix).

## Version 0.87.5

### Bug Fixes

- Fix rendering of Actor documents from compendia.
  - Future work: Fix certain updates to compendia documents failing.

## Version 0.87.4

### New Features

- Add the ability to migrate Locked compendia
  - Adds System Setting: "Migrate Locked Compendia"
    - Default: true
  - If enabled it will unlock compendia then re-lock them after
- Add the ability to migrate Module compendia
  - Adds System Setting: "Migrate module Compendia"
    - Default: false
  - If enabled we will migrate Module provided compendia

### Bug Fixes

- Fix some typos/wording in BC+ items
- Add CSS overrides for Dice Tray module buttons
- Fix character sheet filter when using localization
- Fix mook skill mod dialog div overflow
- Fix mook skill mod dialogue translations
- Fix Roll Card chat message scaling with Font Size changes
- Fix localization of skill names in roll dialogs
- Fix localization of Equipped status in the item sheet
- Fix Localization of skills in attack roll cards
- Fix bug in 012-installedItemMigrationFix.js migration script that failed with unconfigured secondary weapons
- Fix description for Micro Hydrogen Combustor in Black Chrome
- Fix migration error in 006-universalInstall script
- Fix #707 - Importing actors from .jsons with installed items should now work as expected.
- Fix an issue where compendia actors erroneously had their installed item data wiped.

## Version 0.87.3

### Bug Fixes

- \#808 - Installed items in a mook were mapped to the wrong mook \_id, this has been fixed.
- \#812 - Some roles were missing the bonuses data point as an empty array.
- Fix not being able to open any Items due to the DV Tables compendium setting pointing to the old name
- Fix being unable to delete certain effects from compendium items with Active Effects.
- Fix CSS issues with modules Cautious Gamemaster's Pack and Item Piles
- \#824 - Now when you drag a cyberware item to a mook sheet, if it can't be auto-installed/equipped, it will delete the newly created item so it does not remain hidden in the inventory.
- Fix Crushed Fingers/Lost Eye Critical Injury Effect Name
- \#827 - Fix items not being created when purchased from a vendor/container actor.
- \#829 - Fix failure when migrating tokens with broken references to their parent actors.
- Fix issue where unlinked actors were not gaining Active Effects.
- Fix compendia name references for critical injuries which was preventing rolling critical injuries
- \#830 - Fix a case where the 0.87 migration would create duplicate and useless active effects
- \#846 - Installed items losing their installation data after migration
- Various minor CSS fixes
- \#854 - Fix missing Babele translations for Critical Injuries preventing rolling Critical Injuries from character sheets
- Fix rolling custom skills.
- Fix Beta Linear Frames AE mode to be set not add
- Fix Nova Model 757 slots

## Version 0.87.2

### Bug Fixes

- Fix Programs having `undefined` before their name in character sheets
- Fix call to `cprBrandName` in Container sheet
- Fix Price of Fuma Kotaro Linear Frame (Implanted) in Black Chrome
- Fix text color on mook sheet for CyberWare Weapons
- Fix migration with container actors
- Increase Black ICE sheet width to acomodate 2 digit REZ values better
- Fix Black ICE tokens/actors not updating when populating with a program

## Version 0.87.1

### Bug Fixes

Fix broken migrations

## Version 0.87.0

### Action Needed

#### New Discord

We have moved Discord server! If you need any help with this release, want to help with future releases, or just want to join our community we can now be found in our new [Discord server](https://discord.gg/TsvcZUEtbJ). We hope to see you there!

#### Ammo Modifies Weapon Damage

Ammo can now modify weapon damage / autofire maximums. For example, shotgun shells automatically roll 3d6 damage instead of the shotgun's base damage. We made a best attempt at migrating relevant items on actors, but if you've changed the name of compendia items or have homebrew items with this functionality, those items will need to be updated manually.

#### Situational Modifiers

Effects with situational modifiers have been given the appropriate settings on all compendium items, but you will have to manually update them on items that already exist on actors. See New Features -> Roll Modifiers section of Changelog for more details.

#### Electronic Items

We have migrated all Gear items provided by our Compendia to support `isElectronic` but you will need to update any homebrew items manually if you want them to support this new data point.

#### CSS Themes / Rewrite

Do to a large amount of changes to the way we use CSS and having to overwrite a number of Foundry CSS defaults any modules which also touch Foundry CSS may be incompatible or have conflicts with our CSS changes.

For example if you are using [Ernies Modern UI](https://foundryvtt.com/packages/ernies-modern-layout) and the system provided Dark Mode theme then Ernies needs to be configured to use Dark Mode as well.

### New Features

#### Improved Dialogues

- All dialogues have been given new styling and have been converted to a new system called CPRDialog
- This will allow for more responsive dialogues with complex logic, the first use of which is in new roll dialogues:
  - The UI for roll dialogues has been improved and brought more in-line with the style of our system
  - Dialogues are now responsive sheets and can change depending on inputs
  - No more detective work: A tool tip (both in dialogues and on roll cards) displays where every bonus/penalty on your roll comes from
  - Toggle situational modifiers from active effects, upgrades, and roles right from the dialog
  - Toggle the core situational modifiers on page 130 of the core rule book from a drop-down menu
  - Add any additional modifiers to the roll as needed

#### Roll Modifiers

- New Active Effect key: All Actions - Modify all actions with a single active effects key. Found in the 'Miscellaneous' category in the Active Effect configuration window.
- Each modifier on an effect can be toggled as Situational. Situational modifiers are ones that only apply in certain situations. Situational modifiers can also be toggled On By Default.
  - For example, the TeleOptics cyberware adds a +1 to certain attacks when the target is greater than 51m away. Since we do not want this bonus applying all the time, it is toggled Situational. This way, we can apply it in roll dialogues with one click, only as needed. If your character is a sniper and almost always uses the TeleOptics bonus, you can also toggle the Situational modifier as Default On. This way, the modifier is applied by default, but it can be toggled off during the few times your character moves to closer range. This way, the modifier is applied by default, but it can be toggled off during the few times your character moves to closer range.
- Modifiers to rolls from Role Abilities also have Situational (and On By Default) options
- Modifiers to rolls from item Upgrades also have Situational (and On By Default) options
  - Note: effects with situational modifiers have been given the appropriate settings on all compendium items but you will have to manually update them on items that already exist on actors
- Known Issue:
  - Active Effects on Stats behave differently than all others. Because of this, modifiers on Stat effects currently cannot be toggled Situational. This will be fixed in a future release.

#### CSS Themes

We have added the functionality for system specific themes. This allows us to ship a few default themes (dark mode!). You can configure this in the `Settings > Cyberpunk RED - CORE` section.

If you are interested in making a theme for the system check out the [CSS Themes](https://gitlab.com/cyberpunk-red-team/fvtt-cyberpunk-red-core/-/wikis/System-Documentation/CSS-Themes) wiki page which details the process.

#### Kompendia

- Added The 12 Days of Cybermas with help from Miklos
- Added Hornet’s Pharmacy with help from Miklos
- Added Nomad vehicle upgrades with help from WombatCombat
- Added Spinning Your Wheels upgrades with help from Sushimatic
- Added Must Have Cyberware Deals with help from Miklos
- Added Midnight With The Upload with help from Miklos
- Added Night City Tarot content with help from Hakuan Quietpaws
- Added All About Drones with help from Hakuan Quietpaws
- Added Exotics of 2045 with help from Hakuan Quietpaws
- Added Black Chrome Plus DLC with help from H.P. Racha and Sushimatic Racha and Sushimatic
- Added Cargo Containers and Cube Hotels with help from Hakuan Quietpaws
- Added Night City Weather with help from Miklos
- Added Branded Weapons with help from Hakuan Quietpaws
- Added Black Chrome with help from, H.P. Racha, Hakuan Quietpaws, and Sushimatic Racha, Hakuan Quietpaws, and Sushimatic
- Added clothing descriptions with help from Hakuan Quietpaws
- Added Mook Encounter Complication, Hardened Lieutenant Tactics, and Hardened Mini Boss Mini Promotion rolltables
- Added missing Elflines Online items with help from LordCheesusCrust
- Added Elflines Online the Trading Card Game with help from LordCheesusCrust
- Added Achievements And Loot Boxes with help from LordCheesusCrust
- Added language specific skills with help from LordCheesusCrust

#### Other New Features

- Added a check for `core.photosensitivityMode` when rendering pause animation
- Added a `isElectronic` data point to Gear items
  - While it's not used by the system itself it has been added as a convenience feature for module makers and/or writing macros (e.g. a macro to select which items to disable with an EMP)
- Added `Get EMP'd Items` macro
  - A new Macro that takes actors selected in a scene and returns 2 of Installed Cyberware (without shielding), carried (electronic) Gear items, or Cyberdecks and outputs the results to chat
- Added a `brand` field to physical items
  - All compendia provided by the system have been migrated
  - We so not provide any migrations for in world items as there are to many edge cases to reliably do this
- Added many many new icons for the new Compendia
- You can now pass an ablation modifier via the /red command
  - Example: `/red 6d6a2` will generate a 6d6 damage roll as it always did, but when the damage is applied to tokens the armor will be ablated by 2
  - Reminder: if using any roll modifiers and the card description modifier (#), the card description modifier must be the last one used on the line. This has always been the case, just calling it out here as this now adds an additional modifier.
- Upgrade items can now have ActiveEffects added to them and activated when the item they are installed into is equipped

### Changes

#### Sheet Rewrites

This release brings lots of Sheet changes to fix a lot of wonk exposed by the font change in the last release, reduce code complexity behind the scenes, and add more information and functionality to the sheets.

- Character Sheet
  - Stats block
    - Refactored for better layout
    - Allows 2 digit values for EMP/LUCK
  - Info block
    - Rewrite to add more functionality
    - Move Eurobucks from Gear
    - Move Reputation from Lifepath tab
      - Move Facedown roll from Fight tab to Reputation section
    - Move Sheet Search/Filter from right pane no man's land
      - This removes the System Option and is displayed for all users
      - Enable automatic searching when typing
    - Remove the HP/Humanity Calculators
      - Recalc functionality moved to Section title
  - Fight Tab
    - Weapons
      - Move Weapon actions (Reload etc.) to take up less space
      - Only show `Autofire` or `Suppressive` if configured
      - Show loaded Ammo Type
      - Show weapon stats
        - ROF
        - Attack Modifier
        - Damage
        - Hands Required
    - Armor
      - Add Armor Image
      - Update the Layout
    - Critical Injuries
      - Add Critical Injury Image
      - Display `Death Save +1` if an Injury increases the Death Save
      - Display the name of any Active Effects that are applied
- Mook Sheet
  - Use the same Weapon block code as the character sheet
  - Use the same Armor block code as the character sheet
  - Support item upgrades on the mook sheet (issue #779)
- Black Ice Sheet
  - Complete re-write
  - Adds `damage` field
  - Copies Image from program along with stats
- Item Sheet
  - Slight Rewrite of header

#### Ammo Modifies Weapon Damage

Ammo can now modify weapon damage / autofire maximums. This supports ammo which overrides the weapon damage (e.g. shotgun shells), ammo which does no damage (e.g. sleep ammo), and ammo which adds/subtracts from the weapon damage (junk ammo). Similarly, ammo can modify the autofire maximum of the base weapon (junk ammo).

#### Other Changes

- Updated the background and header images to new versions by Rayane Souizi "Wizi"
- Ammo selection dropdown now shows stack size
- Changed the default weapon to use the default weapon icon
- `source` field for items has been split into 2 separate Fields
  - `source.book`
  - `source.page`
- Updated compendia icons for armor
- Reordered system systems
- Adjusted the wording of existing Elflines items to better fit their function
- Updated default icons for Black ICE and Demons
- Containers configured as shops now default to buying all at 100%
- Removed duplicated suffixes on ammo selection
- Clicking reload when you are out of an ammo type will bring up the switch ammo dialogue

### Bug Fixes

- Fixed a capitalisation issue in the medical grade cyber limbs. Thanks ButchAmy!
- Fixed incorrect page reference numbers for medical grade cyber limbs
- Fixed medical grade cyber limbs incorrectly accepting upgrades
- Fixed a typo in the underbarrel grenade launcher description
- Added back the underbarrel shotgun that was accidentally deleted
- Dragging document links to item descriptions links the document correctly
- \#703 - Fixed issue where GM dropping tokens on the canvas would cause a Player-facing permissions error
- \#700 - Fixed issue where creating BI/Demon/Container tokens on the canvas would cause an error in the console
- Fixed missing tool-tip text in compendia settings
- Fixed incorrect rounding on the flamethrower and thrown weapon Icons
- Removed duplicate Smart Lens Cyberware
- Fixed no DV table being set for the pop-up grenade launcher. Thanks diwako!
- Fixed some incorrect wording for Cyberchairs. Thanks VinceKun!
- Fixed bicycles not being able to accept upgrades
- Fixed description of the Militech Crusher which confused shotgun shells and shotgun slugs
- Fixed not being able to install the correct type of upgrades into a Smart Lens
- \#701 - Fixed issue with Black ICE rolling the wrong damage
- Fixed Smart Glasses / Smart Lenses not taking cybereye options
- Fixed issue where GM dropping tokens on the canvas would cause a Player-facing permissions error
- Fixed issue where creating BI/Demon/Container tokens on the canvas would cause an error in the console
- Fixed many places where 'NET' was incorrectly formatted as 'Net'
- Fixed a couple issues around migration:
  - \#681 - Issue where uninstalling installed items was broken if the item was directly installed into the actor and not into a `containerType` item
  - The code was calling createEmbeddedDocument on the TokenDocument however this version of Foundry expects the call to be on the associated actor
- \#741 - Fixed issue where selling stackable items to a vendor was broken
- Migrating actors that are on scenes in a compendium would fail because the code did UUID lookups and Foundry won't let you do this synchronously. Added code so if the restoration is for a Compenium actor/item, the lookup is done with an async await.
- Fixed an issue where if migration performs a backup/restore of an installed item, it would delete the original item which was causing the container item to report the incorrect amount of used slots.
- Standardized the passed migration context to actor:\*EmbeddedDocuments to isMigrating
- Fixed HTML stripping of item descriptions on the Character sheet
- \#705 - When clicking the DV button on a sheet, users would sometimes feel like the Ruler was broken since it wouldn't show a DV if they did not have the token selected. Functionality has been enhanced:
  - Clicking the DV ruler will now highlight the current set DV table on the associated token
  - If the user owns only 1 token of either Character or Mook on a scene, it will default to using the DV settings of that token
  - If a user owns multiple tokens of either Character or Mook, a warning message is now thrown when the user clicks the ruler to select a DV telling them they need to select the token before use
  - If a user owns multiple tokens of either Character or Mook and has no tokens selected, when they use the ruler, a message is displayed below the distance advising the user to select the token of the DV they want to see
- Fixed the usages of restoreOwnedItem to be consistent with backupOwnedItem in that it cleans up the owned item that was created
- \#671 - Fixed BlackICE tokens getting corrupted when they were first created because the calls to update the token were passing bad data
- \#795 - Fixed incorrect damage from rollcard for programs.
- Fixed Cyberchairs not overriding a users MOVE stat as they should. Thanks Dingo!
- \#577 - Restored firemode of weapon after a macro completes to what it was before the macro was executed
- Previously, when unloading ammo that you no longer own the item for, it would leave the bullet count in the weapon but clear the UUID of the ammo in the weapon. This could cause problems when attempting to use that weapon as the bullet type is unknown. Additionally, when reloading, it would only take the bullet difference from the other bullet type instead of the full amount to load the weapon.
- Fixed untranslated skills in active-effect dialog.
- Fixed Combat Utility Belt custom status auto apply an remove handling
- \#657 - Fixed issues with dragging various document types to the hotbar.

## Version 0.86.1 | Date: 2023-02-05

### Bug Fixes

- \#683 - Dragging a World Item which has another World Items installed in it and THAT item also has another world item installed in it (Cyberarm->Cyberdeck (Hardwired)->Cyberdeck) results in two cyberdecks being created on the actor. This would exponentiate every level of installation if there were more.
- Add text for missing localized string `CPR.messages.installInvalidType`
- \#686 - Installing a secondary weapon as a weapon upgrade does not show that upgrade in the Fight Tab
- \#693 - The stripHTML() Handlebar helper fails if the passed HTML contains a percentage sign.
- \#691 - Actors stored in compendiums and dragged out into worlds were losing information on any items that were installed.
- Fixed the ability to decrement REZ of a running program in the NET tab
- \#692 - Code accidentally added `programs` instead of `cyberware` for owned cyberware on existing actors. This fix adds `cyberware` as it should have been however we can't know if `programs` was a valid entry for a world, so we are not removing that. It does not impact anything and a GM can manually remove `programs` from an owned piece of cyberware via the item settings if needed.

### Changes

- When `Debug Elements in UI` is enabled on an item with other installed items in it, the installed items will have their UUID's displayed to help troubleshooting.

## Version 0.86.0 | Date: 2023-01-21

### Release Specific Notes

If you're a GM and you linked Black-ICE items to tokens on the canvas, you might have noticed that the description would not transfer. We fixed this for new linkages created (issue #623), but for any created since the last release, you'll have to copy the description over if you want it.

We have added the ability for all types of Cyberware to be weapons. This means we have removed the Weapons that duplicated this functionality from the Weapons Compendium. This should not affect already made characters but if you want to streamline your Character/Mook Sheets you can remove the old Cyberware and Weapon items and replace with the new ones to access the new functionality.

In this release we revamped the underlying code which allowed the installation of items (Cyberware, Programs, Upgrades) into a more universal system. In doing this, it removed the previous limitation that only owned items can be upgraded. This now allows GM's to pre-create custom upgraded items in the world and use them as needed in their games. More details of the new system and these expanded capabilities can be seen in the CHANGELOG.

If you have any of these items in your world and you changed the name to be something other than what is in the Compendium (ie changed a `Skill Chip` name to be `Perception Skill Chip`), you will need to manually update these items to ensure they are accurate per Rules as Written:

- Any `Memory chips` and `Skill chips` should have their size set to 1 (was 0 for the previous system)
- Any renamed `Chipware Socket` should allow both `Upgrades` and `Cyberware` to be installed into them and their slot count should be set to 1

In testing the new system, it occurred to us that under the previous system, it was possible to accidentally install too many items into another item. For instance, an actor may have too many Fashionware items installed (more than 7). If your world contains items/actors that have too many items installed, a warning banner will be displayed during migration to notify you and there will also be a message in the Console providing the same information. Those items will not allow you to install anything additional into them. You can correct these by accessing the item in your world and uninstalling some of the items.

We **HIGHLY** recommend that when migration is completed, you **ALWAYS** check the console to ensure you did not miss any important messages about your world. Additional details can be found [here](https://gitlab.com/cyberpunk-red-team/fvtt-cyberpunk-red-core/-/wikis/Release-Information/migrations)

### New Features

- Universal Installation System replaces the back end code for installing Cyberware in Actors, Programs in Cyberdecks and Upgrades in other owned Items. This new system provides the following new features:
  - World Items (aka unowned items) can now be upgraded by World Upgrades to allow GMs to create pre-upgraded weapons, armors, etc
    - World Items can only be upgraded by other World Items, so ensure you import any upgrades you want to install into the world
    - `Hint`: Import an item & upgrade to the world, open item sheet & click on Installed Items to select upgrade to install
  - Upgraded items and Loaded weapons can now be drag/transferred between Actors
    - If the destination actor does not have an ammo of the same type, an ammo item is created in their inventory with a quantity of 0
  - Upgraded items can now be dragged out to the Item Sidebar creating a World Upgraded Item that can then be dragged to other Actors
    - A folder is created to store copies of the installed items. You can not delete a world item which is installed in another item. You must uninstall it first
  - You can now install that Cyberdeck into the `Cyberdeck (Hardwired)` Cyberware Item and it is displayed in the `Cyber` tab as such
    - `Hint`: Click the `Install into` arrow next to the Cyberdeck item in the Actor inventory
  - You can now install Chipware into a Chipware Socket and it is displayed in the `Cyber` tab as such
    - `Hint`: When installng Chipware, drop down the installation icon and select `Chipware Socket`
  - Vendors now sum the value of the item they are selling + all installed items (upgrades, programs, etc) to determine the total value of the item they are selling
    - Hovering over an item which has items installed in it will display a tool-tip with what is installed
  - Attempting to delete a World Item installed in another World Item will result in a dialog preventing the deletion and telling you where that item is installed
- \#442 - Implement a "Smart Snort" feature for drugs which will auto-activate only specific effects when consumed
- \#412 - Duplicate Active Effects in the Item Sheet (and Actor sheet)
- \#655 - Enable deleting changes in an Active Effect
- \#678 - Migrated cyberdecks did not have "program" as a valid installation type
- All Cyberware can now be a weapon
- Added a note making it more clear how under barrel weapons work

### Changes

- Change the Crit Injury icon for head injuries
- Change the Crit Injury icons to display before name
- Update Character sheet to show more information for items
- Update wording for Failed rolls
- Babele translation config files added for DLC. Translations will follow later
- The Item Upgrades pack has been renamed from `item-upgrades` to `upgrade-items` to be consistent with other pack names
- Update the main system font to Jost for better readability
- Prior to this release, selling an upgraded item to a vendor renamed the item, pre-pending the word `Upgraded` to the name. Items are no longer renamed and instead, `Upgraded` is displayed inline if the item is upgraded without changing the item name.
- \#448 - Add the ability to "quick fix" a critical injury - resolved for now by making them all Toggled
- \#611 - Default to Body table when rolling critical injuries
- \#633 - Uninstall of programs from fight tab is failing
- Resizing sheets is now handled by Foundry, removing our custom code to manage it
- Updated the design of the character Effects tab
- Updated the design of the Effect tab in the active effects sheet
- \#658 - Unlinked tokens created from actors that had installed items were not updated to point to the token items
- DV now shows before the DV Table name of the ruler label when measuring
- \#628 - Rollcard for programs without damage should not show the damage icon in the Rollcard
- Dialog Affirmations now follow Foundry (`Confirm`, `Cancel`)
- Set the price of several unpurchasable items to 0
- Removed the poor quality underbarrel grenade launcher, as it isn't actually a distinct item from the regular underbarrel grenade launcher

### Bug Fixes

- \#621 - Add ROF to Cyberware Weapons and Weapon Upgrade Weapons on Mook sheet
- ROF now uses localized strings
- Fixed a few minor active effect UI issues
  - Effects listed on the left of the item sheet are only greyed out for disabled effects on owned items
  - The toggle on an unowned (world) item persists state
  - A better read-only view when viewing effects on an item in a compendium
- \#625 - Daemon actor does not display notes
- \#610 - Cannot Split Stacks of Drugs
- \#623 - Populating Black Ice does not copy description
- \#604 - Container tabs not collapsing
- \#602 - Items not stacking vendors
- \#652 - Damage icon missing from Black Ice Sheet:
- Black-ICE can be renamed again
- \#632 - Black Ice and Daemons cannot roll initiative
- \#656 - Cannot Delete Items From Duplicated Sheet
- Weapon Fields Should be Hidden for Non-weapons in Upgrade Item Settings

## Version 0.85.2 (Hotfix) | Date: 2022-12-15

### Bug Fixes

- Corrected a capitalisation error that was causing the included Dystopian City Streets map to disappear. Thanks to Latcher for spotting this!

## Version 0.85.1 (Hotfix) | Date: 2022-12-14

### Bug Fixes

- Fixed #624 - NET architecture sheet can't click generation button

## Version 0.85.0 | Date: 2022-12-11

### New Features

- Added 12 new guns from The 12 Days of Gunmas
- Added 12 new guns and 1 new attachment from Woodchipper’s Garage
- Added 2 new cyberware, 1 new gun, and 1 new clothing from Micro Chrome
- Added 1 new vehicle and 2 new items from Spinning Your Wheels
- Added 2 new items from Cyberchairs
- Added 'Paintballs' and 'Custom' ammo varieties
- Added 'Acid' and 'Special' ammo types
- Added Basic, Acid, Biotoxin, and Poison paintballs
- Added new icons for the Basic, Acid, Biotoxin, and Poison paintballs. Thanks Mirrandin!
- Added custom ammo used by the Malorian Arms Sub-Flechette Gun, the Nova Model 757 Cityhunter, and the Sternmeyer M-02 Heavy Rifle
- Added icons for the Underbarrel Shotgun, the Underbarrel Grenade Launcher and the (new) Poor Quality Underbarrel Grenade Launcher
- Added new icons for the Chipware Compartment, the Smart Lens, the Inline Skates, and the Skateboard
- Added 8 new vehicle icons
- Added new icons for the Bodyweight Suit, the Bulletproof Shield, and generic head armor
- Added new icons for the Body and Head Injury Tables
- \#565 - The amount ammo reduces SP on hit can now be configured in the item, and compendium items have been updated to make use of this
- Added support for choosing any skill for use with a weapon, covering DLC and potential future source books
- Added descriptions to various upgrades that were missing them
- Added page references to all clothing items and critical injuries
- \#444 - Russian Localization Added. Thanks to our translators @openmanv and @kurigohan.

### Changes

- \#482 - The Babele module should no longer require renaming files or directories to make it work
- \#585 - Renamed ammo to list the weapon first and then the type (`Basic Rifle` -> `Rifle (Basic)`) to enable easier browsing and consistency with other naming schemes
- Renamed the Extended Magazine and Drum Magazine upgrades (`SMG Drum Magazine` -> `Drum Magazine (SMG)`) to enable easier browsing and consistency with other naming schemes
- Changed the Extended Magazine and Drum Magazine upgrades to use the Ammo icon instead of the default icon
- Improved the visibility of the thumbnail image for the included NET Architecture scenes
- Renamed the `Free` price category to `No Price`
- Use Foundry tooltips instead of browser tooltips
- \#600 - Standardised raw `.svg` graphics to be squares, with any rounding applied later
- Adjusted `vial_poison.svg` to better match other icons
- Standardised the x-axis and y-axis offsets of the filters applied to `.svg` graphics
- Capped the drop shadow intensity of the `.svg` graphics at `stdDeviation="15"`. This will make some of the darker graphics easier to read
- Adjusted the formatting of the credits to improve readability
- Where weapon features aren't currently supported, a note has been added to that weapons description
- Changed the magazine upgrades to use `override` instead of `modifier`

### Bug Fixes

- Aligned the second column on the gear tab so it is not all over the place
- Fixed missing thumbnail image for the included Dystopian City Junction map
- Corrected the name format of the included maps
- Corrected a typo in the name of the Excellent Heavy SMG
- Corrected a typo in the Battery Pack ammo description
- Fixed the Incendiary Shotgun Slug using the wrong icon
- \#453 - Fixed strings that could not be translated properly
- Fixed images in the item sheets for a number of compendium items
- \#601 - Rolled critical injuries do not apply active effects
- Fixed Dargun doing 8d6 instead of 4d6 damage, thanks Sryth!
- Fixed incorrect grouping in several `.svg` graphics which caused filters to not be applied correctly
- Fixed the W I D E Wound State heart not displaying properly on the actor sheet
- \#592 - Fixed some `.svg` icons not showing up properly in the UI
- Adjusted the size, spacing, and formatting of the ammo icons. This fixed a few minor GFX bugs, and made them look more cohesive. Thanks Mirrandin!

## Version 0.84.1 (Hotfix) | Date: 2022-11-30

### Bug Fixes

- Fix HTML Stripping in item descriptions on character sheets
- Fix Create/Edit Role Ability dialog not submitting.
- \#583 - Using ledger re-applies all Active Effects

## Version 0.84.0 | Date: 2022-11-22

### Release Specific Instructions

In this release we read Critical Injuries and DV Tables directly from the system compendia. As such if you are using the Critical Injuries unmodified from the RED Corebook you can delete the previously imported "Critical Injuries (Head)" and "Critical Injuries (Body)" items as well as the "Critical Injury Tables" and "DV Rolltables" Roll Table

If you are using modified Critical Injuries please check out [this](https://gitlab.com/cyberpunk-red-team/fvtt-cyberpunk-red-core/-/wikis/System-Documentation/Items/Critical-Injuries#configuring-home-brew-injuries) Wiki article on how to use Homebrew Injuries. The same process can also be used with Homebrew DV Tables following this [Wiki](https://gitlab.com/cyberpunk-red-team/fvtt-cyberpunk-red-core/-/wikis/System-Documentation/DV-Tables#configuring-home-brew-dv-tables) article.

### New Features

- Revamped automatic damage application:
  - Shields are taken into account
  - Damage reduction active effects and role effects are taken into account
  - Zap now counts as an "attack" and you can roll damage from the chat card
  - Roll damage from program attack cards

### Changes

- \#434 - Users no longer need to import compendia to use DV measurements or roll critical injuries
- Drugs can now be equipped, owned, or carried
- Moved created migrationFolder management on CPRMigration and moved backupOwnedItem to CPRMigration as it will probably become necessary if we have more ActiveEffect changes in the future
- UI Improvements:
  - The gear tab of the character sheet now displays icons and is more readable/clear
  - Better spacing to multiple headers in the character sheet
  - Added icons to the container inventory
  - Removed action label on container sheets since it was poorly aligned and the buttons are self-explanatory
  - Add Slot details to Item Upgrade Dialogue
- \#539 - Add ROF to weapons in the fight tab
- Hide/Show `Used Upgrade Slots` if an item has slots
- \#555 - Create Elflines Online Compendium as a Compendium not a macro
- The Role block in the left pane of the character sheet is now just a simple text box. Active NET Role is now set from the NET section of the Fight tab. This should be a lot clearer to users and require less maintenance.

### Bug Fixes

- \#553 - Macros can be dragged to the hotbar
- \#546 - Techscanner now properly gives bonuses to Cybertech and Weaponstech
- \#547 - Fixed the code so upgrades to attackmod are now taken into consideration
- \#554 - Introduced new price category `Dirt Cheap`. Changed the code to store Price Categories as config data (`config.js`) and altered code to dynamically display the price categories based on the price passed `cprGetPriceCategory`. The `Valueable` mixin code was also adjusted to utilize this single location of Price Categories. Any item priced > 0 or < the second category will be lumped into the lowest category tier. Example, while `Dirt Cheap` is not supposed to start until `5 eb`, there's no category for `0-4 eb` so instead of it being in the `free` category, it is in the `Dirt Cheap` category.
- \#549 - stop reordering items from the role list of abilities after adding points to them (ex: Tech and Solo)
- \#471 - On a Macbook, the `Command` key can now be used in lieu of the `Control` key to skip roll dialogs
- \#557 - Fix the variety of Shotgun Smart Slugs
- \#559 - Fix multiple areas where the skill names were not being translated properly
- \#560 - Fixed `Initiative Reaction` to apply to initiative rolls
- Fixed issued where the image on a sheet would overflow onto the sheet data
- Fixed issue where item images were no longer displaying on the item sheets

## Version 0.83.1 (Hotfix) | Date: 2022-10-23

### Bug Fixes

- \#529 - Fix non-shop containers having the wrong button
- \#536 - Spelling mistake: "Ememies" (English)
- \#495 - Ability to use UUID links in Character sheets or Item sheets
- Fixed location of Lifestyle Data for Tragic Love Affairs and Affectations
- Fix rolling initiative before combat has started
- Fix weapon upgrades that are secondary weapons to work correctly
- Fix cyberdeck program installation where it was adding the item.\_id under item.system
- Fixed regression where filteredItems was re-introduced back into the system. This was replaced with actor.itemTypes in 0.82.0
- Fixed an issue where attempting to delete a ledger line would throw an error
- Fixed a couple migration issues:
  - When a migration failed for any reason, on the next run through it could corrupt upgraded items
  - When running migration through multiple levels of migration, it was possible that the world data model version would be set incorrectly because the code did not await the update of the world data model version. This would cause migration to execute a second time which may cause problems.

## Version 0.83.0 | Date: 2022-10-02

### New Features

- New UI for modifying Mook skills on the Mook sheet
- Drugs can be used in the Mook sheet
- Stackable items can be dragged to the Mook sheet and stacked properly

### Changes

- Automatic babele folder configuration, so that it does not have to be set by the user
- Mook portrait is always shown
- A few minor UI improvements to the Mook sheet

### Bug Fixes

- \#476 - Vehicles cost can now be edited
- Cyberware & Upgrade templates still had some references to .data causing the shim to fire
- \#469 - Fixed icon display for Foreign Object Critical in Rollable Tables
- \#507 - Black ICE Class does not appear to save
- \#520 - Splitting items works again

## Version 0.82.1 (Hotfix) | Date: 2022-09-23

- Fix an issue where the mook sheet notes were not writeable
- \#494 - Cyberware weapons were corrupting data points

## Version 0.82.0 | Date: 2022-09-22

### New Features

- Foundry V10 Compatibility
- Spanish translation! Thank you ZRAAA78!

### Bug Fixes

- \#473 - Fashionware foundational item not migrated to v10
- \#472 - EMP & Luck Values/Max greater than 9 mess with the formatting. If a user enters a value > 9, a warning banner is shown letting them know there will be formatting issues and the formatting changes to make it more obvious something is amiss.
- \#468 - Actor image goes outside border over text fixed (overflow hidden).
- \#474 - Replaced `filteredItems` on `Item` types with scoped, relative properties called `relativeSkills` and `relativeAmmo` for specific items which require these data points.
- Replaced all instances of filteredItems with actor.itemTypes (native to Foundry). This addressed an issue causing very slow loading times of the resources tab in the token configuration dialog.
- Removed the need for installedPrograms data to be stored on the actor which was noticed during the filteredItems cleanup.
- \#490 - Vehicles still using v10 data/system shim.
- \#486 - Autofire Skill correctly used when autofire toggle applied in fight tab

## Version 0.81.5 (Hotfix) | Date: 2022-09-20

- 467 - Fix shield ablation arrow in Fight Tab to be functional
- 461 - Throw an exception if someone enters a decimal point when modifying eurobucks
- 477 - Autofire functionality is not working from the Fight Tab
- 468 - Actor image goes outside border over text
- Item Upgrades & Cyberware which are weapons no longer get their item data corrupted when opening the item sheet

## Version 0.81.4 (Hotfix) | Date: 2022-08-21

- 464 - Fix issue where containers corrupt eurobucks amount for non-stackable items

### New Features

- Polish support available!

## Version 0.81.3 (Hotfix) | Date: 2022-08-02

### Bug Fixes

- When installing cyberware and selecting `None` for the Humanity Loss, the maximum humanity was not being decremented forcing one to re-calculate it using the calculator.
- Corrected an issue with Compendium Migration where `Scene` type Compendia was not properly being migrated.
- \#437 - Chat Card shows armor ablation even if target has no armor
- \#419 - Invert function of CTRL Rolls creates an issue with Primary Role Abilities

## Version 0.81.2 (Hotfix) | Date: 2022-08-02

### Bug Fixes

- \#458 - The rulers for the DV Calculation is broken for tables with regexp characters in the name [such as (Autofire)]
- \#455 - Containers/Vendors issues (non-English settings)

## Version 0.81.1 (Hotfix) | Date: 2022-08-01

### Bug Fixes

- \#456 - Selling non-stackable items to vendors results in a NaN offer from the vendor
- \#454 - Kendachi Mono-Three has Incorrect Attack Bonus
- \#452 - Migrated Excellent Quality Weapons have no Bonus to Attack
- \#451 - All Migrated Weapon Icons Changed to Heavy Pistol

## Version 0.81.0 | Date: 2022-07-31

### New Features

- \#225 - Active effects for Items
  - Active Effects are a Foundry feature that allow items to apply modifications to stats and skills of characters in the game. Active Effects can also be added to Characters arbitrarily without associating to an item.
  - An Effects tab on the actor sheet has been added to summarize where active effects are coming from. From there character-level effects can be managed. (create/toggle/edit/delete). (create/toggle/edit/delete). Effects from Items cannot be edited or deleted from this tab. Mooks do not yet enjoy Active Effects.
  - An Active Effect has a "usage" associated with it on an item. This affects when the effect will be applied. Examples are when carried, when equipped, toggling it on/off yourself or always on. Some specialized ones exist too: Cyberware allows for "when installed." More may be added in the future.
  - The following item types can have Active Effects added to them: armor, clothing, drugs (more on that next), gear, cyberware, weapons, and injuries (see #290).
  - Active effects can be applied to stats, skills, role abilities, a handful of derived stats (like HP), or custom keys in a manner similar to what 5E expects. Only plain addition or subtraction modes are supported.
  - A MOD column has been added to the Role tab in a manner similar to what we have for skills already. Like skills, this makes it clear which abilities are being affected by an Active Effect.
  - Arbitrary skill mods on characters cannot be set in the character sheet any more, that column shows mods coming from active effects now. You can still create skill mods with active effects using the Effects tab.
  - Active effects can affect skills on a character, even custom skills. Note that there is a known issue where a custom skill does not always show up the first time any character is opened. (see issue #440 for details) Closing an reopening the sheet fixes it for the rest of that session. (see issue #440 for details) Closing an reopening the sheet fixes it for the rest of that session.
- \#305 - Drugs and Consumables
  - The Drug item type has been added and has a unique action and usage. This is meant to model consumables, meaning items that stack and can be consumed to enjoy some stat or skill benefit.
  - Consuming a drug will reduce the amount by 1 and enable any active effects with the "when consumed" usage set.
  - If you implemented drugs with a different item type before you may want to re-create them with the new type.
- Feature Request #295: EB Ledger for Shop Container Actors
- Feature Add: Player ability to sell to Vendors by drag/dropping from character sheet to Vendor.
  - Vendors have been enhanced with the ability to allow players to sell to them. The type of items the vendor is willing to purchase is configurable and each item type can have a set percentage to offer for to purchase the item. Example: Setting armor purchase percentage to 80, will offer a player 80eb for a piece of armor that has a value of 100eb.
- Feature Request #179: Add ability to track reputation and roll face down (Works for Mooks as well since MR !625).
- Add Light/Medium/Heavy/Very Heavy Generic Melee Weapons.
- Support for the Drag Ruler module
- Feature Request #424: Ability to use LUCK on Stat, Skill, Attack, Program, Cyberdeck, and Interface/Charismatic Impact rolls. Automatically deducts from character sheet.
- \#414 - German is now a supported language. Most game system text (excluding pre-made items) will appear in this language if set in game settings. Thank you to our German translators: High123, Similar and Tealk.

### Changes

- Feature Request #352: Removed the fixed height CSS for the "Player Notes" section in the lifepath tab for a better writing/reading experience
- Consolidated gain, lose and set ledger functions for EB, IP and Reputation to make it more manageable
- \#244 - Remove unused data points in the template
- Substantial refactoring of the item code to support Active Effects and improve maintainability.
- Added possibility to describe a "/red" roll with a description, e.g. "/red 1d10 # This is my roll!". The description of individual dice is not possible
- Feature Request #378: Add ability to share actor artwork to players from the character sheet by right clicking on the Actor's image.
- Feature Request #379: Added ability to populate a NET architecture with the help of rolltables. It also rolls for the number of floors (3d6) and how many branches there should be (see p. 210 in the book)
- Even more icons!
  - Icons for each street drug
  - Icons for each pharmaceutical
  - Even more status icons
- Change Character sheet Wound State to unique icons rather than the font-awesome smileyfaces
- CUB Condition Map json file, ready to be imported to CUB Condition Lab
- Format Eurobucks displays in a more readable way
- Use fantasy style icons for items when generating the ELO Armory
- Add Head armor generation to ELO Armory Macro
- Add missing Lifepath questions
- Fix ordering of Lifepath items to match Book order
- Rename Excellent/Poor Quality Weapon/Cyberdeck Compendium items for easier sorting
- Add `walk`/`run` as derivedStats
- Feature Request #352: Removed the fixed height CSS for the "Player Notes" section in the lifepath tab for a better writing/reading experience
- Consolidated gain, lose and set ledger functions for EB, IP and Reputation to make it more manageable
- Renamed included maps to better differentiate them from other map packs
- Containers now default to neutral token disposition
- Added Medtech drugs to the compendium
- Added thrown weapons to the compendium and a thrown weapon DV table
- Clarified the effect of the whiplash head critical injury
- Added a unique icon to the Flamethrower
- Feature Request #308: Renamed 'Datapoint' to 'Attribute' and renamed 'Item Upgrades' to simply 'Upgrades'
- Feature Request #330: added Skin Weave and Subdermal Armor to the Armor compendium
- Added a line break to the deathSaveIncrease summary line to enable easier reading
- Adjusted wording for several critical injuries to reduce ambiguities
- Adjusted the formatting of issues templates for easier filling out
- Set upgrade slots to 0 on melee, cyberware, and exotic weapons in the compendium
- Re-wording of Bows/Crossbows description in compendium
- Fix Item Sheet upgrade display count to correctly show upgrade usage
- Greeter text (the post-migration pop-up window) is displayed as HTML rather than plain text
- Changed migration status to use a status bar instead of flooding the screen with status messages
- Ammo can be concealed, and can no longer be "upgraded". Different ammo types (rubber, toxic, etc) are still intact
- A few changes to your world may have been made as part of migration activities:
  - Some fields on items were given defaults if they are empty. For example a null price or price category is set to something befitting the item type. It is still a guess, but now there is possibly correct data instead of definitely wrong or useless data.
  - Clothing and gear upgrades were converted to active effects
  - Armor, programs, netarch, vehicles, and weapons cannot be stacked any more. Duplicate items may have been created (up to 50) in players' inventories
  - The _quality_ field has been removed from items (weapons, cyberdecks and vehicles) to avoid confusion about whether to change values in other fields. You can still use the name and other fields (such at attack modifier) to express excellent quality items
  - Some item types (weapons, vehicles) no longer "stack." They do not have an amount field any more

### Bug Fixes

- Corrected an issue when a player did not have proper permissions on a vendor, the purchase would fail, but the player would still be charged for the item
- Fixed the ability to delete items from the Mook sheet
- Fixed #367: As a GM, if you attempted to use a macro to roll a skill without having an actor selected, it failed with a traceback. We now catch this and throw an appropriate message
- Fixed #373: Expansive Shotgun Slug ammunition is now usable with the Shotgun (and not the Heavy Pistol)
- Fixed #380: Corrected various typos
- Corrected various spelling and formatting issues in the changelog
- Fixed #377: Certain clothes have null as description instead of empty string
- Fixed #374: Mook sheets now correctly show the updated magazine size when an item upgrade that changes it is used
- Fixed actor sheet content filter not working anymore
- Fixed #386: Basic weapons in the compendium didn't have their range tables set
- Fixed #375: Read attackmod for both cyberware & weapons, previously cyberware was ignored
- Fixed #387: Fixed adding macros for cyberware weapons
- Fixed #390: Rubber Shotgun Slugs are considered Heavy Pistol Ammo
- Fixed #416: Excellent Weapons missing +1 to attack
- Fixed #433: Fixed some hard-coded text to now use the localized strings
- Fixed #431: Mook sheets now correctly show the skill total instead of NaN
- Fixes #446 & #447: Fixes issues with Max Humanity and Empathy getting set properly when installing Cyberware
- Fixes #449: The stat value now shows on a stat roll card
- Fixes #450: Unable to delete ledger lines for a container type actor

### Maintenance Items

- Moved preCreateItem hook from actor.js to item.js and combined the code of createItem hook from both actor.js and item.js into item.js
- Added a warning popup if a macro is using actor.addCriticalInjury() alerting a user to the eventual deprecation of the method. [Please see the updated API Wiki for details on the new way to create a Critical Injury from a Macro.](https://gitlab.com/cyberpunk-red-team/fvtt-cyberpunk-red-core/-/wikis/System-Documentation/API/addCriticalInjury)
- Removed shading from the "Cancel" button on dialogs which may have inadvertently made people believe it was the default
- Renamed method \_favoriteVisibility to_toggleSectionVisibility and CSS tag toggle-favorite-visibility to toggle-section-visibility as it accurately describes what happens
- Updated the prompt naming for the cyberware installation to be consistent with code
- Consolidated the interface to get Roll Tables from the system into a method in systemUtils that can either use a regular expression or not

## Version 0.80.1 (Hotfix) | Date: 2021-01-04

### Changes

- Addressed #352: Removed the fixed height CSS for the "Player Notes" section in the lifepath tab for a better writing/reading experience
- Fixed #354 - Item Upgrades should be removable again and additional upgrades can be installed
- Fixed #355 - Drag and drop to hotbar restored
- Corrected many French translation strings

## Version 0.80.0 | Date: 2021-12-23

### New Features

- Updated the system for Foundry v9 compatibility. No further updates will be provided to the 0.8.x release. [Please backup your data before attempting any major upgrade!](https://www.youtube.com/watch?v=OmbxMmqNNXU)
- Added functionality to delete single ledger lines for the GM. Players are not able to do so.
  - It is possible to not only delete the line in the ledger, but also change the value up or down upon deletion.
- Added functionality to manually increase the Death Save Penalty of a character. This is useful in case a character gets hit, while Mortally Wounded.
- Many new icons added to items in the compendiums! See CREDITS.md for attribution and thanks!

### Changes

- When a release update is applied, a pop up window will now display with relevant information:
  - At a minimum, there will be a link to the CHANGELOG for the release
  - If there is a corresponding video which demonstrates new feature functions, it will also be linked off of the popup
    - DEV NOTE: To add this, simply configure the flag for the Video URL `system.json` and it will be automatically displayed
  - If there are specific configuration instructions for a release (example: import the DV Tables Rolltable, or import Critical Injuries), they will also be provided in this pop-up.
    - DEV NOTE: To add this, simply create a new text file with the instructions in `lang/release-notes` with the name `v${version}-${lang}` and it will be automatically displayed
- Actor damage application function has a new boolen argument to specify if the damage is lethal or not. Non-lethal damage will not reduce an actor below 1 hit point.
- Mook sheets have been modified to correct a few problems:
  - Additional item types will now appear on a mook sheet, including clothing and cyberdeck items (they were previously invisible if something went wrong).
  - Cyberware can be installed or uninstalled by pressing Shift-Click (SHIFT key + Mouse Click) on the cyberware item. By default when dragging cyberware it will still prompt you to install it. Installed cyberware cannot be dragged, so must be uninstalled first.
  - All items on a mook can be dragged between sheets, allowing the GM to "loot" mooks on behalf of player characters.
  - Several changes to the GitLab README to assist with introducing new developers to the system (Join Us!)

### Bug Fixes

- Rubber ammunition no longer ablates armor and will not reduce an actor to below 1 hit points per RAW.
- Fixed #286 - The item data was not being passed when dragging from a Mook sheet causing the drag/drop to fail. This has been resolved.
- Fixed #298 - DV ruler will attempt to automatically use the Autofire DV Table if an Autofire DV Table exists.
  - NOTE: If your wielded weapon does not have a DV Table associated with the weapon item settings (example Assault Rifle), there is no way to know what the "proper DV" table is for this weapon, therefore if your Token already has a DV Table set on it of a weapon that also has an Autofire mode (example SMG), when you enable the Autofire radio button on the Assault Rifle, it will change to the SMG Autofire DV Table. Best practice: Set DV Tables on the weapons themselves.
- Fixed #328 - Deletion Icon for some Roles was hidden, due to a short name of the role abilities compared to the role name.
- Fixed #254 - Deleting an unlinked token that has a sheet open will now close that sheet as it is rendered useless.
- Fixed #329 - Containers are not randomly forgetting their settings anymore.
- Fixed comments in the default macro that gets created when you drag a weapon to the hotbar to correctly provide the settings for a ranged weapon attack.
- Fixed #331 - The actor role tab now uses the proper localisation string for deleting the role item.
- Fixed #337 - Added missing Bohemian Jacket. Corrected name of Asia Pop Mirrorshades and Mr. Studd.
- Fixed #339 - Added missing Tracer Button.
- Fixed #335 - The Media Role Ability now uses the associated rank as a modifier.
- Fixed #342 - Medical Grade Cyberlimbs are missing
- Fixed #343 - Allow Smartglasses to take cybereye options. Add Smart Lens from Microchrome. Move Battleglove to gear.
- Fixed #334 - Missing translation strings for initiative (Meat/NET option) has been re-added and cyberware-based initiative is now working correctly.This requires a Netrunner to have the 'Netrunner' role assigned. Rezzed programs granting SPEED bonuses will be added as a modifier in accordance with pg. 205 of the core rulebook.
- Fixed #349 - Installed cyberware properly supports "Ctrl+Click" to send details to the chat window.
- Fixed #350 - Fixed uninstalled cyberware on a mook sheet being impossible to delete if the original install failed.
- Fixed a couple missing translation strings related to synchronizing armor SP to resource bars

## Version 0.79.1 (Hotfix) | Date: 2021-09-11

- Fixed #325 - DV ruler broken. Restored by naming the function.

## Version 0.79.0 | Date: 2021-09-11

### New Features

- Added support for automatic damage application on Characters and Mooks.
  - The damage chat card of weapon attacks now has an additional button to apply the damage to the selected tokens.
  - A prompt showing the tokens, which will be damaged is shown. It can be skipped by holding the ctrl key while clicking.
  - Double damage for the head location and half SP for melee and martial arts attacks are respected.
  - Bonus damage from critical injuries is always applied, as it penetrates the armor.
  - Damage dealt by programs is directly applied to the HP. No rezzed defender program (e.g. Armor) is considered. If you have any damage reduction while netrunning please apply the damage yourself.
  - Any damage will be applied to a Demon or Black ICE, even if it is meat space damage. It is not checked, that the damage came from a program.
  - For each token, where the damage was applied a chat card with the HP reduction and armor ablation will be shown. In case the armor prevented all damage it will also be told.
  - The damage application does not consider any Solo role abilities, as the damage reduction of it is only applicable once per round.
- Implemented Critical Initiative per RTG release of FAQ 1.3 (FR Issue #288).
  - NOTE: This feature is ENABLED by default as it follows RAW, however may be disabled via the System Settings.
- Implemented CPR Roll Cards for Initiative.
  - Solo Role Ability `Initiative Reaction` is taken into account when rolling Initiative.
- Implemented proper initiative rules for NET Combat.
  - If a character or mook has a cyberdeck equipped when rolling initiative, you will be prompted whether you are rolling for Meat or NET combat as the calculation used depends on this.
- Roles are now items which allows for creation of custom roles and better handling of their functionality.
  - Can configure role abilities to roll with different skills for different situations like the Tech's Upgrade Expertise ability.
  - Can configure flat bonuses to attack, damage, and skill rolls for situations like the Solo's Precision Attack or the Nomad's Moto.
  - Compendium of all the core Roles is included for ease of getting started.
  - BREAKING: Netrunners must select which role should be utilized for netrunning from the "Configure Active Role" dialog on the main part (left) of the character sheet, otherwise you will not be able to utilize the cyberdeck tab of the character sheet. This will be selected for you on migration if you had the Netrunner role selected on a character previously, but will need to be configured on new characters.
- Added filter capability for Skills & Gear. This is a client side option which can be enabled/disabled in the System Settings.

### Changes

- Feature Request #296: Exotic Weapons from the Core Rulebook are now present in the Weapons Compendium. The Battleglove has been placed into Cyberware Compendium, and Battery Pack has been placed into the Ammo Compendium.
- Feature Request #319: Item Upgrades are now accessible on a Mook sheet. This includes support for Underbarrel weapons which will display as a usable weapon.

### Bug Fixes

- Fixed #292: Attempting to delete installed cyberware is prevented now, as it can leave the actor in a broken state.
- Fixed #294: Cybersnake and Vampyres cyberware items from the compendium now display their weapon stats in the fight tab.
- Fixed #318: Underbarrel attachment item upgrades in the compendium now pre-select the appropriate ammo types.
- Fixed #320: The missing Scorpion.png file is now available in the system icons/netrunning folder. Thanks again to Verasunrise and Hyriu33 for the artwork.
- Fixed #322: Cyberware ranged weapons were not having their ammunition auto-decrement.
- Fixed #323: Cyberware weapons now show as weapons in the Mook Sheet.
- Fixes #317: Before adding a Role Item during migration, added a check to see if one exists already. Also added code to the data model migration to remove the `roleskills` data point which should result in zeroing all of the role skills on that actor. This datapoint can be removed next release.
- Fixes #324: This bug was introduced with the new initiative code so it never made it to master. Critical damage should work again.
- Fixed #325 - DV rulers broken when a DV table is set

## Version 0.78.2 (Hotfix) | Date: 2021-08-12

- Fix missing import statement in macro code, which prevented all macros generated by dragging items to the hotbar from functioning.

## Version 0.78.1 (Hotfix) | Date: 2021-08-04

- Fixes issue #289: There was a naming conflict on Handlebar helpers between `CPR` and the module `Better Roll Tables`. This hotfix prefixes our helper with `cpr` to avoid this conflict. A more permanent solution will be implemented for all helpers next release.

## Version 0.78.0 | Date: 2021-08-03

### New Features

- Cyberware Items which act as weapons can now be configured as such
  - Core Rule Book Examples: Popup Weapons, Big Knucks, Wolvers, etc
  - These weapons will show in the Fight Tab as Cyberware Weapons under the standard weapons
- Introduction of the Item Object: Item Upgrade
  - Initial implementation of the Item Upgrade Object enables:
    - Upgrades to Weapons, Cyberdecks, Cyberware, Clothing, Armor and Gear
    - Weapons
      - Adding weapon attachments to weapons to can modify settings for ROF, Attack Modifier, Magazine Size & Damage
        - For each of these data points, you have the option to modify or override the value of them allowing for flexibility in upgrade attachments
        - Core Rule Book Examples: Drum Magazine, Extended Magainze
      - Adding a secondary weapon as an attachment
        - Core Rule Book Examples: Grenade Launcher Underbarrel, Shotgun Underbarrel, Bayonet
    - Cyberdecks
      - Item Upgrades occupy Option Slots, so it is now possible to use Item Upgrades to install & track Hardware Upgrades to the Cyberdeck
        - Core Rule Book Examples: Backup Drive, DNA Lock, Range Upgrade, etc.
      - Item Upgrades can be added to expand the amount of slots in the Cyberdeck. While there's no RAW for this, it has been added to support Homebrew.
        - Example: USB Drive, External Drive, etc..
    - Cyberware
      - As some Cyberware is now Weapon Items, Item Upgrades can be used to add Attachment to these Weapon Types
        - Example: Popup Assault Rifle w/ Underbarrel Grenade Launcher
        - Note: While it is possible to install an Item Upgrade Weapon Attachment on a non-weapon cyberware, it will NOT display on the Fight Tab as it is not associated with a Cyberware Weapon
    - Clothing
      - Clothing can now have upgrades applied to them to modify COOL and the "Wardrobe & Style" Skill Rolls.
        - Overriding stats/skills is not supported, all values will be treated as a modifier.
        - Note: If the upgrade applies to COOL, it will affect ALL rolls of COOL (COOL Skills too).
    - Armor
      - Armor can now have upgrades applied to modify their SP on the head and/or body as well as to increase the HP on shields
      - NOTE: Due to the way the shield mechanics work, you'll have to repair the shield after installing the item upgrade
    - Gear
      - Gear can now have upgrades applied to them that will allow equipping of the Gear to affect rolls of a base stat.
        - This will allow capability to create Gear items, such as certain drugs (Black Lace, Boost and Synthcoke) and add an Item Upgrade to affect the core stat. Ideally this will be covered with Active Effects, when we get to implementing that, but this is one way to do it for now.
- Inventory items which are upgraded will have a unique "U" identifier appended to their name
- When actors own an Item Upgrade Object, any items they own which match the Item Upgrade Type will have an action item added to their line in the inventory allowing you to easily install the upgrade to that item.
- An "Item Upgrade" compendium has now been provided with examples of Cyberdeck and Weapon Upgrades.
- Added possibility to split items into separate stacks for ammo, gear and clothing.
- Some Items can now be automatically stacked, when dragged onto the character sheet or being purchased/taken from a container. This is enabled for the following Item types: Ammo, Gear, Clothing
- Added feature to purchase/take only a part of the items offered in a container actor.
- Elflines Online
  - A compendium has been added with 2 macros
    - `Create an Elflines Online Character`: This macro will create a blank Elfline Online Character with skills as defined from the Elflines Online Skill List in the Elfline Online compendium released by RTG.
    - `Create Elflines Online Armory`: This macro will create a folder of items as defined from the Elflines Online Armory in the Elfline Online compendium released by RTG.
- Added Martial Arts weapon type, as it is slightly different from the Unarmed weapon type with the scaling for the damage in the case of a BODY of 4 or under while having a cyberarm (rule book pages 176 and 178)
- Introduced a limited view of the mook sheet when a player only has limited permission on the mook
- A compendium for clothing has been added (thanks @aarong123!)
- Help article buttons (?) are now available on items when viewing them in the top-right corner. This will redirect you to the associated item help page on our wiki.

### Changes

- Newly created actors and items will automatically have default icons configured.
- Restructured the language file for easier translations.
- Added test cases for code quality: The english language file is checked for unused strings and the changelog is checked for changes with each merge request.
- Skills are now also sorted alphabetically on the character sheet if translated into languages other than English.
- The price of an item is interpreted as the price of a single unit of an item. This has been now clarified with a text upon hovering over the word "Price" in the item setting page.
  - The single unit of an item is 1, with an exception for some of the ammunition, where it is 10. Please have a look at the rule book page 344 for that.
- The container sheet inventory will now stretch with the window length vertically
- Many, many little tweaks and improvements to the French translation (thank you @h.gelis and @thevincekun)

### Bug Fixes

- Fixed #263: New containers now show infinite stock option, as they are initialized as a shop.
- Fix #265, #266, #267: Gear tab now remembers scroll position.
- Fix #276: Items can be transferred from unlinked actors
- Fixed, that number of options slots were not displayed in the item sheet description tab for foundational cyberware.
- Fixed #262: Missing Expansive, Rubber and Smart Ammo for Very Heavy Pistols has been added to the compendium. Basic Grenade and Basic Rocket have been removed and should not exist according to allowed ammo type rules.
- Fixed #287: Typing "/red Xd6" would produce "criticals" whenever the initial result was 6. This has been fixed to behave like a normal damage roll.
- Fixed #285: Character sheet, Roll Tab, Abilities' names are truncated unless you have Medtech on the list.
- Fixed #260: Players can move container actors - added another configurable option to allow players to move containers. The defaults are: Stash:yes, Loot:no, Shop:no, Custom:configurable
- Fixed #261: Container actor tokens are not persisting their configuration when the token is unlinked - Foundry appears to share flag settings between actor & tokens so to solve this issue, the container settings were moved to persisting flags to the token actor. Configuring non-token actors has been disabled. Existing containers may need to be re-configured on the token post-migration.
- Fixed an issue with Firefox browsers throwing an error when using our default SVG images. The SVG tag we were using defined the height/width using a style property, however, Firefox perfers individual height and width properties.

## Version 0.77.1 (Hotfix) | Date: 2021-06-29

- Corrected localization issue of text on chat cards when rolling NET Damage
- Added Zap as a rollable interface ability as it was missing from the list (Zap damage will be handled in a future release)

## Version 0.77.0 | Date: 2021-06-25

### Migration to foundry 0.8.X

- **BREAKING:** This version of our system will not work with Foundry version 0.7.X and below. Do not update this system until you are ready to update your Foundry to version 0.8.X. And as always, **make a backup of your user data** before updating!
- Migrated the source code to work with foundry version 0.8.X
- Rewrote the migration code support new features from foundry 0.8.X

### New Features

- Improvements have been added to the cyberware tab. For foundational cyberware that has no optional slots (such as Borgware), no Used/Total is displayed in the title.
- Added options to choose how to display the skill values for the mook character sheet. Now one can show it in the same way as it is printed in the book. Please look at the settings for this.
- Improved Ledger functionality of the Eurobucks/wealth and Improvement Points of characters
  - A new display of the ledger of both of these properties, to show all transactions done in the past, is now available.
  - Modification now gives the possibility to give a reason for the change and it is recorded who did the change.
- Added container actor sheet, which can be used for shops, loot or storage purposes.
  - **Please note, that the players have to be owners of the container actor for full functionality.**
  - Type Shop: Items cost their configured price and can be bought by the players with the click of a button. The GM has the option to make the stock of the shop be infinite or not. If it is not infinite the item will be removed after purchase.
  - Type Loot: Items are free to take and will be removed after taking them.
  - Type Stash: In addition to the same functionality as "Loot", the players can also modify the contents of the container, e.g. to use it as a group stash.
  - Type Custom: The GM has the option to specify the settings as desired.
    - Are all items free? - Makes taking an item from the container not cost anything. (On for Loot and Stash, Off for Shop)
    - Infinite Stock? - Items are not removed from the container after purchasing/taking them. (Off for Loot and Stash, GM can decide in case of Shop)
    - Players can create items? - Allows to add new items with the plus sign in the header of each category for the players. Also allows players to drag items into the container. (On for Stash, else Off)
    - Players can delete items? - Allows players to delete items with the trash can symbol. (On for Stahl, else Off)
    - Players can modify items? - Allows modification of the items. If enabled the item sheets render in an editable way, otherwise they render in a non-editable way. (On for Stash, else Off)
  - Players are not allowed to drag an item out of the container actor to their character sheet. This is only enabled for the GM, as otherwise the players could "steal" items from the container. Players have to use the take/purchase button for that.
  - **KNOWN ISSUE:** Currently, there is a [bug](https://gitlab.com/cyberpunk-red-team/fvtt-cyberpunk-red-core/-/issues/261) affecting unlinked container actors therefore we recommend to workaround this bug, when you create a new container actor, change the Prototype Token to Link Actor Data. This bug will be addressed in a future release.
- The French translation has been updated to account for all strings in this release. (Thank you VinceKun!)
- Netrunning Initial Implementation
  - Introduction of the Item Object: Cyberdeck
    - Migration code added for existing "Gear" items which have the word "cyberdeck" in the name. These items will be pre-pended with a '[MIGRATED]' tag on it to help identify that the item should be replaced with a new Cyberdeck Item. We have opted to not automate this replacement as people may update just prior to hosting a game and this would/could cause issues for planned sessions.
    - Cyberdeck items in the Shipped Gear Compendium have been replaced with versions utilizing the new Cyberdeck Item Object
  - Ability to equip one (1) Cyberdeck enables Meat/NET toggle on Fight Tab
  - Ability to install Programs on the Cyberdeck from the Cyberdeck Settings Page and directly from the Gear Tab
  - Programs (Booster) have been enhanced to allow the addition of Roll Modifiers for Interface Abilities (i.e. Eraser gives a +2 to Cloak)
  - Booster Roll Modifiers exposed in Roll verification dialog and added to the roll for Rezzed Boosters Only
    - Shipped Program Compendium updated to include these roll modifiers (Any imported items should be re-imported or manually updated to add these)
  - Programs (Attacker) have been enhanced to allow the setting of Damage. For Anti-Program Attackers, both BlackICE and non-BlackICE damage rolls may be configured
    - Attack rolls for Anti-Program Attack Rolls will prompt on which damage type to roll
  - When equipping a Cyberdeck in inventory, the Fight Tab exposes a toggle between Meat and NET space. NET space enables quick access to:
    - Roll Interface Abilities
    - Roll Speed against a Black-ICE encounter
    - Roll Defense against a NET Attack
      - Includes any Rezzed Boosters that may have a DEF rating in the Modifiers field
    - Activate/Deactivate & track Rezzed Boosters, Defenders & Black ICE
      - Ability to manage (reduce & reset) the REZ on Boosters and Defenders programs when they take an attack
      - Capability to install a Booster twice to a Cyberdeck (requires 2 of the same program item in inventory) and REZ both thereby stacking their bonus modifiers per discussion with RTG on Discord
  - Deletion of the Cyberdeck Item will auto-return all programs to Actors inventory
  - Black ICE changes/enhancements
    - Black ICE Program type added
    - The ability to REZ a Black ICE Program on the Cyberdeck will create a Black ICE Actor next to the Token performing the REZ
      - **NOTE: In order for Players to REZ Black ICE Actors, they will need Foundry Permissions to create actors and tokens in the World otherwise the GM will need to REZ/deREZ the Black ICE for the players.**
    - Rezzing a Black ICE Program will:
      - Try to find a Black ICE Actor of the same name
      - If a Black ICE Actor is not found:
        - Look for an Actor folder called "CPR Autogenerated" and if it does not exist, create it
        - Create a Black ICE Actor of the same name as the Black ICE Program in the Actor Folder "CPR Autogenerated"
        - Configure the new Black ICE Actor according to the specs stored on the Black ICE Program
      - Place a Token on the Active Scene with unlinked Actor Data to the previously mentioned Black ICE Actor
      - Token Actor Data is updated with the numbers from the Black ICE Program regardless if it is a new Actor or not
    - Deleting or de-rezzing a Black ICE on a Cyberdeck will delete the Token from the scene
    - Black ICE Rez numbers are synchronized between the Cyberdeck Rezzed section and the associated Black ICE Token
    - GM Only Enhancement: When using the "Character Sheet" Sheet for Mooks, GM's have added functionality in the Rezzed Section:
      - Ability to execute Black ICE attack, damage and defense rolls
      - Ability to decrement REZ
    - Black ICE Actors unassociated with a Netrunner have had functionality added to them to quickly configure them using Black ICE Program Items
      - If a player opts to do this configuration, it further enables the ability to roll Damage from the Black ICE Actor
        - In a later release, we may decouple this and allow the ability to configure damage right on the Black ICE Actor
  - Cyberdeck Loading Requirement
    - Actors must own the Cyberdeck + Programs to install onto the Cyberdeck. ie inability to pre-load the Cyberdeck with programs before adding to an Actor. This is due to the direct relationship of the Program Items and the Cyberdeck.
  - Netrunning TODO
    - Booster Speed is not taken into account for Foundry Initiative rolls.
  - Netrunning icons for actors (and some other things) are now included in the system. They can be accessed from the tile browser in "systems/cyberpunk-red-core/icons/netrunning". Big big thanks to Verasunrise (the artist) and Hyriu33 for letting us provide this awesome artwork with our system!
- Street Drugs have been added to the "Gear" compendium.

### Changes

- Restructured the code for character and mook sheets for ease of development
- Changed the scene activation when generating a scene from a net architecture to just viewing the scene. This allows to show the new scene to the GM, but not the players in order to do some more preparation if needed.
- Fixed various formatting issues on the mook sheet - i.e. whitespace trimmed; trailing commas and erroneous parentheses removed for Skills, Cyberware/Gear, Programs, and Critical Injuries lists.
- Added icon artwork for many of the items in the shipped Weapons Compendium. Artwork provided by [Flintwyrm](https://twitter.com/Flintwyrm).
- Renamed some compendia to make it more clear which are necessary to import and which should not be imported.
- Default images added for compendia. Images from <https://game-icons.net>. They can be accessed from the file browser in "systems/cyberpunk-red-core/icons/compendium/default".
- The French translation has been updated to account for all strings in this release. (Thank you VinceKun!)

### Bug Fixes

- Borgware items (Shoulder Mount / Implanted Frames / MultiOptic Mount / Shoulder Array) are now classified as foundational cyberware and do not require a missing foundational item.
- Code added so New Worlds will not immediately go through migration
- Fixed warning when the medtech would put the proper amount of points into surgery. The intention is, that per time you choose the surgery skill you should add two points there.
- Fixed #226 - Lock Pick is now "Lock Picking Set". Meat arms and legs now exist and operate correctly with standard hands, feet and usable accessories.
- Fixed #232 - Cancelling dialog boxes no longer creates errors in dev log
- Fixed #234 - Attempting to install cyberware, where there is no suitable foundation no longer throws an error in the console.
- Fixed Issue, with netrunning tile naming case. This caused tiles to not be displayed on linux systems.

## Version: 0.76.2 (Hotfix) | Date: 2021-05-28

- Non owned actor sheets (Limited and Observer permissions) render again, the content is also shown now.
- Borgware items are now configured correctly as foundational in compendium.
- Borgware no longer displays "0/0 Optional slots" when installed on character sheet.
- Observer/limited view permissions for character sheets now work correctly.
- Core skills/cyberware now cannot be added to unlinked tokens.
- Auto-install cyberware prompt now correctly shows based on sheet type rather than actor type.
- Auto-install cyberware prompt for mook sheets now only displays to the user who initiated the prompt.
- Internal, external, and fashionware cyberware now display correctly on mook sheets.
- Deleting/uninstalling optional cyberware from mook sheets now works correctly.
- Cleaned up of many (but not all) trailing commas in mook sheet.

## Version: 0.76.1 (Hotfix) | Date: 2021-05-27

- Programs can now be displayed in gear tab and on mook sheets for easier tracking.

## Version 0.76.0 | Date: 2021-05-26

### New Features

- FnWeather made a great video demonstrating some of the following changes which you can find here: <https://www.youtube.com/watch?v=csgB6c5KhkU>. Thanks to him!
- Added "Option Slots Size" for optional cyberware. This allows proper tracking of cyberware that can use no slots, or multiple slots. By default when first updating to this version all cyberware has an assumed slot size of 1. Please update your optional cyberware accordingly in line with the core rulebook.
- Added extra content to the cyberware tab to display the amount of 'used' slots for foundational cyberware.
- Added option to reroll duplicate critical injuries. There is a system setting to decide if you want to use it, with the default being off.
- Added functionality to automatically resize the character and item sheets. There is a system setting to decide if you want to use it, with the default being off.
- Added Debug Elements setting for developers.
- Added "Unarmed" weapon type with optional (on by default) automatic damage determination based on BODY.
- Added new functionality for the NET architectures.
  - It can now be configured on its item sheet, adding, removing and editing the floors.
  - If a specific black ICE is selected it is linked to the corresponding black ICE item sheet if it exists. You have to create these black ICE items yourself.
  - In addition one can automatically generate a scene showing the NET architecture. This scene generation allows for floors up to eight (8) deep and up to four (4) branches to be displayed.
  - Experimental: The scene generation can be customized to use custom assets and custom sizes to allow for maximum flexibility.
  - As these new features of the NET architecture are experimental, there might be some problems or bugs. If you find any, please let us know.
- Two built-in scenes (maps) are now available in the compendium, alongside the NET architecture tiles. These have been graciously provided by [SolutionMaps](https://www.patreon.com/solutionmaps).
- The system compendium has now been updated to include ammo, armor, additional cyberware, gear, programs, vehicles and weapons. Simple descriptions are provided to align with the R. Talsorian "Homebrew Content Policy". Please ensure you always reference an official, legally-owned rulebook for the full item description and information. No Actors or "Black ICE" programs are provided, as these count as NPCs under the policy rules and cannot be distributed. If you find any mistakes or typos in the compendia, please let us know in issue #226.
- One can now change item-amount from character sheet for Ammo, Clothing, and Gear item-types.
- If an item has a source set, it now displays in the header of the item sheet.
- Armor SP can now be displayed in resource bars! Select the Star Icon next to equipped armor to make that armor active. Then, set the token up to display the resource(s) named externalData.currentArmorHead, externalData.currentArmorBody, and/or externalData.currentArmorShield.
- Mook sheet improvements
  - Cyberware can be dragged on the sheet and it will automatically be installed.
  - The automatic calculations for hp, humanity, and emp has been disabled.
  - Mook names can be changed on the sheet.
  - The ruler glyph for calculating range DVs has been added.
  - Custom skills work as designed and can be edited.
  - Critical injuries added (same as character sheets).
  - Fixed an alignment issue on weapon section.
  - A notes section has been added for free-form text about the mook.
  - All gear and cyberware can be removed by hovering over and pressing DEL. The tooltips reflect this.
  - Skills can be reset to 0 using the DEL key in the same manner as deleting items.
  - The suppressive fire option is now considered in mook sheets (same as character sheets, see issue #195).
  - Portrait added in an expandable frame.

### Changes

- Setting the autofire maximum multiplier on an item will now be taken into account when rolling damage for autofire damage rolls. For weapons defined in the core rules (SMG, H. SMG & Assault Rifles) leaving this as 0 will utilize the core rule set for those items. You can over-ride the core rules (for homebrew) by actually setting this to a non-zero amount. If you set the multiplier in the roll dialog to a value higher than the allowable value, it will default to the maximum allowable multiplier.
- Characters are now linked to their token by default, Mooks are not.
- Hoverable input fields now remain visible if field is focused and fade out for a more visually pleasing transition from visible to not-visible. (Thanks to sdenec#3813 because I borrowed some of his code from Tidy5e Sheet to accomplish this.)
- Critical damage roll cards no longer show the bonus damage added to the total, since the bonus damage is directly applied to the hp and does not consider armor (issue #214).
- Added localization to places where it was not implemented. (!325)
- Removed "Core" tag from Critical Injury and DV compendia (which should be imported) to make them distinct from "Skills - Core" and "Cyberware - Core" (which should NOT be imported). (!379)

### Bug Fixes

- fixed #49 - The equipped glyph now takes the same space as the other two
- fixed #158 - Stat padding fixed for LUCK and EMP, so that they have the same font size as the others
- fixed #176 - Game paused animation properly translates now
- fixed #187 - Item icons are now resizing correctly to fit into their frame
- fixed #189 - EMP stat on new mook sheet can now be modified
- fixed #192 - Fixed that double quotes in weapon names break macros
- fixed #195 - Fixed that 'Has Suppressive Fire' option didn't do anything
- fixed #198 - Removes DV display when others are measuring
- fixed #204 - Fixed IP and Eurobucks Ledger functions to work with unlinked tokens
- fixed #215 - A bug where a newly created, non-edited cyberware would vanish upon install
- fixed #221 & #222 - Correction of two critical injuries
- fixed #224 - Med Tech and Fixer role abilities should now roll correctly, as per RAW
- fixed #228 - Fixed some mook sheet weapon/armor section alignment issues
- fixed !366 - Body ablation not being shown in description tab due to typo

## Version: 0.75.4 (Hotfix) | Date: 2021-05-05

- Fixed release manifest to not lock users into version 0.75.2 without possibility to update

### Please Note

- Version 0.74.2 had an error in the release manifest causing issues with updating. This was attempted to be fixed a first time but sadly that fix contain a further issue. A second attempt was made and this was successful. During this however the version numbers appear to have got confused slightly, leading to the strange jump between the version number below (0.74.2) and above (0.75.4).
- In more specific terms:
  - Hotfix 0.74.2 is created with the fix below. The version number in `system.json` is changed, but the manifest and download links aren't updated
  - Another hotfix is created numbered 0.75.3. This changes the manifest and download links to be that of 0.75.3, but contains a typo in the download link
  - The typo is then fixed, but without a bump in the version number
  - 0.75.4 is created, with a new version agnostic manifest link but the download link from 0.75.3
- This history was initially preserved in a branch containing the various release manifests, but in April 2023 Zankoas deleted that branch in a clean-up. In doing so this note was added to avoid losing the record entirely In doing so this note was added to avoid losing the record entirely
- Three commits from that branch containing the `system.json` changes between 0.74.2 and 0.75.4 hadn't been merged in, and as such were deleted
- 0.74.2 wasn't tagged, but can be found at commit hash `1fdb27abbcfbf57152690e76992c109a464d57f7` on date `03/05/21 16:48:36`

## Version: 0.74.2 (Hotfix) | Date: 2021-05-02

- Role ability settings were lost when changing other data on the sheet. [issue #203](https://gitlab.com/cyberpunk-red-team/fvtt-cyberpunk-red-core/-/issues/203)

## Version: 0.74.1 (Hotfix) | Date: 2021-04-25

- Macros were not working due to a change in the way rolls were handled.

## Version: 0.74.0 | Date: 2021-04-23

### UI/UX

- FnWeather made a great video demonstrating some of the following changes which you can find here: <https://www.youtube.com/watch?v=Q8DP0qcR4AU>. Thanks to him!
- Added the ability to show DV for ranged weapons when using the ruler for measurement
  - Right clicking a token, you can select a DV table to use and after setting this, any ruler measurements will show the DV along with the measured range.
  - Ranged Weapons can be also configured to use a specific DV table in the item settings. Weapons with DV Tables associated with them will have a ruler in their Fight Tab which can be clicked to set the DV Table for the associated token to quickly switch DV tables when using the Ruler Measurement Tool.
- Added a Compendium with Roll Tables for Core Ranged DV Measurements from the book also providing a page reference in the description field. Compendium contains a "DV Generic" table that has a description explaining how to create custom DV tables and how they work with the system.
- Added a "MOD" column to the Skills section of the character sheet and as a field on the Skill Item. When skills (or attacks) are rolled, the dialog will auto-populate with the mod. Skill mods on the character sheet only show non-zero values.
- Introduced some code so that the core skills on the character sheet are localized, which will help with current and future translations.
- Added a "Clothing" item for those stylish chooms (per feature request #165).
- Localized the new item and actor drop-down menus so that they appear more professional.
- Critical Injuries are now items so that injuries can be premade, dragged to the character sheet, and used more easily in critical injury tables.
  - Even better, once you have critical injury tables, you can roll right from the character sheet and it will automatically add a randomized critical injury.
- Wound State penalties automatically apply as mods on the roll (e.g. if the token is Seriously Wounded all actions will automatically have a -2 penalty)
- You can now change the amount of ammo in a weapon's clip right from the fight tab. In addition, you can type "+X" or "-Y" (where X and Y are numbers) into the input and it will perform the math.
- Mook sheet introduced. Please use [issue #181](https://gitlab.com/cyberpunk-red-team/fvtt-cyberpunk-red-core/-/issues/181) to suggest improvements or point out rough edges.
- Added "Source" field to item sheets to keep track of where items came from (e.g. Core Rules Pg. 351)
- "Thrown Weapon" is now a weapon type and "Athletics" is now a weapon skill for throwing grenades, etc. Weapons that use the athletics skill also use DEX as the stat, which is consistent with the rules.
- Weapon section of the Fight Tab has been slightly redesigned.
- Shields have been implemented (they are an armor type item).
- Added the ammunition type to the attack and damage roll cards.
- Added "N/A" as a choice for cyberware install location.
- New beautiful artwork for the d6s and d10s (thank you to Flintwyrm!)
- Cleaned up display of chat cards. Most of the data is now by-default hidden and can be opened by clicking on the roll total.
- Rolls now indicate if they are whispered, blind, or self.
- Can now roll damage from the chat card for attack rolls.
- Added ability to unload a weapon.
- Added a field for a static attack modifier on weapons.
- Added a warning on cyberware install to remind users that installing cyberware also deducts from maximum humanity.

### Bug Fixes

- 'Basic' skills (the ones that all characters have points in) now display as bold again (no issue to reference)
- Token name now correctly displays in chat when rolling from a macro.
- Fixed a bug which caused unlinked tokens to erroneously pull certain data from the parent actor.
- Fixed a bug which caused collapsed gear categories to not retain their state upon character sheet update.

### Plumbing

- Refactored data model to conform with plans going forward.
- Logging has been overhauled.

## Version: 0.66.0 (Hotfix) | Date: 2021-03-21

- Aimed shot was using the Autofire Skill when attacking instead of using the Weapon Skill
- Suppressive Fire was using the Weapon Skill when attacking instead of using the Autofire Skill

## Version: 0.65.0 | Date: 2021-03-20

### UI/UX

- Implemented a chat command “/red” which will roll 1d10 and explode on a 10 or negatively explode (implode?) on a 1. Rolls of the form “/red+X”, “/red-X”, and “/red XdY” are also supported (though there are no dice icons if Y isn’t a 6 or a 10).
- Macros can now be made for weapons, skills, journal entries and actors by dragging and dropping to the macro bar. Weapon macros can be easily edited to roll for damage, aimed shots, autofire, and suppressive fire.
- Improvement Points now trackable and exist on the front of the character sheet, underneath Humanity.
- Eurobucks tracked in the gear tab.
- Can now view details of installed cyberware in ‘read-only’ mode.
- Being able to edit installed cyberware causes issues so the original fix was to make it so that installed cyberware could not be edited. This had the unintended consequence that you could no longer click on the item to see its description if you wanted to reference how it worked. This solves that issue.
- System setting to allow skipping of the roll dialogue. This basically inverts the function of ctrl-click. This rolls default values on a regular click and brings up the roll modification dialogue on ctrl-click.
- Early implementation for keeping track of critical injuries.
- New glyphs/buttons for autofire and suppressive fire.
- Death saves are now rollable, trackable, and relate to critical injuries.
- Added the option to apply no humanity loss on installation of cyberware. This is useful if the user realizes a mistake after installation. They can uninstall, edit the item and reinstall without having to worry about fixing humanity loss afterwards. Also useful for reinstallation of items like Skill Chips and extra cyberarms for the quick-change mounts.
- Added support for damage formulas like 2d6+2, 3d6-4, etc. for all your homebrew and 2020 conversions.
- Ctrl-click an item name to send its description to chat. This feature is still in the early stages of development and may have some formatting issues on the chat card. These will be addressed as the feature is refined.
- Rolling for cyberware is now printed to chat.
- Items of type ‘gear’ are now equippable (just a cosmetic feature for keeping track of what is on your person vs. somewhere else).
- Improved alignment when there are multiple Roles selected to display.

### Plumbing

- All rolls moved off of the character sheet to allow for drag n’ drop macros.
- Foundation for roll glyphs embedded into chat cards implemented.
- Many changes and fixes for data migration during updates.

### Bug Fixes

- Applying status condition icons no longer fails.
- Custom pause animation no longer disappears on unpause/re-pause.
- Collapsing the side bar now works as expected.
- Rolls are now displayed as originating from the selected token, rather than the player. If no token is selected or associated with the actor sheet, rolls are displayed from the actor that triggered the roll.
- Fixed alt-text localization for critical injuries section.
- When changing the ammo types on an owned weapon, a race condition was occurring which was intermittently over-writing what the proper value of ammoVariety should be so setting compatible ammo would sometimes just fail. Re-ordered the way things are done and this has resolved this issue.
- Vehicles now correctly display Structural Damage Points (SDP) instead of the erroneous spd.
- Fix for the inability to set compatible ammo for an unowned weapon.
- Fixed a bug where choosing to roll for humanity loss when installing cyberware wouldn’t work.
- Fix for humanity loss looping back and subtracting from the maximum when dropping below 0 upon cyberware installation.
- There was an issue where if you made any change to the character sheet, it would reset the view of the sheet. For example, if you opened the sheet and collapsed category 1, Closed the sheet, Opened the sheet, Category 1 is still collapsed. All Good. Change anything (Pin something, change a skill level) Category 1 would instantly expand.
- Fixed a bug where wound state was not updating properly on some actors.
