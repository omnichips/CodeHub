// ============================================================================
// THERMAL BREACH: ELEVATOR PROTOCOL
// Game Data Configuration File
// Edit this file to customize programs, enemies, and game mechanics
// ============================================================================


// ============================================================================
// PROGRAM DEFINITIONS - Available combat programs
// ============================================================================
const PROGRAMS = {
    BOLT:     { name: "BOLT",     pwr: 8,  heat: 12, cost: 30, desc: "Deals 8 dmg.",      img: "assets/program/Bolt.png" },
    GUARD:    { name: "GUARD",    blk: 7,  heat: 4,  cost: 35, desc: "Gain 7 block.",     img: "assets/program/Guard.png" },
    FLUSH:    { name: "FLUSH",    heat: -20,        cost: 50, desc: "Vent 20 heat.",    img: "assets/program/Flush.png" },
    OVERLOAD: { name: "OVERLOAD", pwr: 20, heat: 35, cost: 65, desc: "Deals 20 dmg. High heat.", img: "assets/program/Overload.png" },
    TURBO:    { name: "TURBO",    pwr: 15, heat: 10, cost: 45, desc: "Deals 15 dmg.",    img: "assets/program/Turbo.png" },
    // ============================================================================
    // STANDARD TACTICAL PROGRAMS (40)
    // ============================================================================
    PULSE:    { name: "PULSE",    pwr: 6,  heat: 5,   cost: 20, desc: "GET THE PATTY. Deals 6 dmg.",      img: "assets/program/Pulse.png" },
    BRACE:    { name: "BRACE",    blk: 10, heat: 3,   cost: 25, desc: "Prepare for Winter. Gain 10 block.",    img: "assets/program/Brace.png" },
    VENT:     { name: "VENT",     heat: -10,        cost: 30, desc: "Among who? Vent 10 heat.",    img: "assets/program/Vent.png" },
    SPIKE:    { name: "SPIKE",    pwr: 18, heat: 25,  cost: 45, desc: "Deals 18 dmg.",     img: "assets/program/Spike.png" },
    BARRIER:  { name: "BARRIER",  blk: 15, heat: 10,  cost: 40, desc: "Gain 15 block.",    img: "assets/program/Barrier.png" },
    FAN:      { name: "FAN",      heat: -15,        cost: 35, desc: "Vent 15 heat.",    img: "assets/program/Fan.png" },
    SCALD:    { name: "SCALD",    pwr: 12, heat: 15,  cost: 35, desc: "Deals 12 dmg.",     img: "assets/program/Scald.png" },
    BUFFER:   { name: "BUFFER",   blk: 5,  heat: 0,   cost: 20, desc: "Gain 5 block.",     img: "assets/program/Buffer.png" },
    ADD_FILE:     { name: "ADD_FILE",     heat: 8,          cost: 30, desc: "Draw 2 cards.",     img: "assets/program/Add_File.png" },
    SURGE:    { name: "SURGE",    pwr: 14, heat: 20,  cost: 40, desc: "Deals 14 dmg.",     img: "assets/program/Surge.png" },
    RECOIL:   { name: "RECOIL",   pwr: 22, heat: 30,  cost: 50, desc: "Deals 22 dmg.",     img: "assets/program/Recoil.png" },
    MIST:     { name: "MIST",     heat: -20,        cost: 45, desc: "Vent 20 heat.",    img: "assets/program/Mist.png" },
    PLATE:    { name: "PLATE",    blk: 20, heat: 15,  cost: 55, desc: "Gain 20 block.",    img: "assets/program/Plate.png" },
    FRAG:     { name: "FRAG",     pwr: 25, heat: 40,  cost: 60, aoe: true, desc: "Deals 25 dmg.",     img: "assets/program/Frag.png" },
    CHILL:    { name: "CHILL",    heat: -30,        cost: 60, desc: "Vent 30 heat.",    img: "assets/program/Chill.png" },
    SLICE:    { name: "SLICE",    pwr: 10, heat: 8,   cost: 25, desc: "Deals 10 dmg.",     img: "assets/program/Slice.png" },
    HARDEN:   { name: "HARDEN",   blk: 30, heat: 25,  cost: 70, desc: "Gain 30 block.",    img: "assets/program/Harden.png" },
    DRAIN:    { name: "DRAIN",    pwr: 8,  heat: -5,  cost: 40, desc: "8 dmg. Vent 5.",    img: "assets/program/Drain.png" },
    PLUS_EXTRA:{ name: "PLUS EXTRA", pwr: 35, heat: 50,  cost: 90, desc: "Deals 35 dmg.",     img: "assets/program/Plus_Extra.png" },
    TOTAL_CONCENTRATE:    { name: "TOTAL CONCENTRATE",    heat: -50,        cost: 100, desc: "Vent 50 heat.",    img: "assets/program/Total_Concentrate.png" },
    FLEX_UP:  { name: "FLEX UP",  blk: 12, heat: 12,   cost: 40, desc: "Gain 12 block.",    img: "assets/program/Flex_up.png" },
    STING:    { name: "STING",    pwr: 4,  heat: 2,   cost: 15, desc: "Deals 4 dmg.",      img: "assets/program/Sting.png" },
    WATER_STREAM: { name: "WATER STREAM", blk: 45, heat: 40,  cost: 120, desc: "Gain 45 block.",    img: "assets/program/Water_Stream.png" },
    BLAST:    { name: "BLAST",    pwr: 16, heat: 20,  cost: 45, aoe: true, desc: "Deals 16 dmg.",     img: "assets/program/Blast.png" },
    SIGH:     { name: "SIGH",     heat: -18,        cost: 40, desc: "Vent 18 heat.",    img: "assets/program/Sigh.png" },
    HANDS_UP:    { name: "HANDS UP",    blk: 12, heat: 12,   cost: 35, desc: "Gain 12 block.",    img: "assets/program/Hands_Up.png" },
    SLAP:     { name: "SLAP",     pwr: 13, heat: 12,  cost: 30, desc: "Deals 13 dmg.",     img: "assets/program/Slap.png" },
    TICKLE:     { name: "TICKLE",     pwr: 2, heat: 0,  cost: 10, desc: "STOP IT. Deals 2 dmg.",     img: "assets/program/Tickle.png" },
    STEVE_PUNCH:  { name: "STEVE PUNCH",  pwr: 20, heat: 20,  cost: 50, desc: "Deals 20 dmg.",     img: "assets/program/Steve_Punch.png" },
    DUCT_TAPE:   { name: "DUCT TAPE",   heat: 20,         cost: 70, desc: "Heal 5 HP.",        img: "assets/program/Duct_Tape.png" },
    WELD_UP:     { name: "WELD UP",     heat: 40,         cost: 110, desc: "Heal 10 HP.",       img: "assets/program/Weld_Up.png" },
    WDYM:     { name: "WDYM",     blk: 0,  heat: 4,   cost: 25, desc: "Draw 1 card.",     img: "assets/program/Wdym.png" },
    STRIKE:   { name: "WATAH",   pwr: 11, heat: 10,  cost: 25, desc: "Deals 11 dmg.",     img: "assets/program/Watah.png" },
    TURBINE:  { name: "TURBINE",  heat: -22,        cost: 50, desc: "Vent 22 heat.",    img: "assets/program/Turbine.png" },
    FACE_MASK:    { name: "FACE MASK",    blk: 25, heat: 24,  cost: 65, desc: "Gain 25 block.",    img: "assets/program/Face_Mask.png" },
    BURN:     { name: "BURN",     pwr: 30, heat: 45,  cost: 75, aoe: true, desc: "Deals 30 dmg.",     img: "assets/program/Burn.png" },
    FART:    { name: "FART",    blk: 8,  heat: -5,  cost: 30, desc: "Gain 8 block. Vent 5.",    img: "assets/program/Fart.png" },
    HUMP:     { name: "HUMP",     pwr: 9,  heat: 10,   cost: 20, desc: "Deals 9 dmg.",      img: "assets/program/Hump.png" },
    SHELL:    { name: "SHELL",    blk: 18, heat: 20,  cost: 45, desc: "Gain 18 block.",    img: "assets/program/Shell.png" },
    THRUST:    { name: "THRUST",    pwr: 24, heat: 30,  cost: 55, desc: "Deals 24 dmg.",     img: "assets/program/Thrust.png" },

    // ============================================================================
    // POP CULTURE & GAMING (30)
    // ============================================================================
    HADOU:    { name: "HADOU",    pwr: 15, heat: 15,  cost: 40, desc: "Focus inner fire. Deals 15 dmg.", img: "assets/program/Hadou.png" },
    BHOOP:    { name: "B-HOOP",   blk: 12, heat: 5,   cost: 30, desc: "Movement is life. Gain 12 block.", img: "assets/program/BHoop.png" },
    IDDQD:    { name: "IDDQD",    blk: 50, heat: 60,  cost: 120, desc: "God-mode active. Gain 50 block.",  img: "assets/program/IDDQD.png" },
    BLUEPILL: { name: "BLUE-PILL", heat: -60,        cost: 100, desc: "Stay in dream. Vent 60.",    img: "assets/program/Bluepill.png" },
    REDPILL:  { name: "RED-PILL", pwr: 40, heat: 60,  cost: 100, desc: "See the truth. Deals 40 dmg.",    img: "assets/program/Redpill.png" },
    FALCON:   { name: "FALCON",   pwr: 28, heat: 35,  cost: 65, desc: "Show your moves! Deals 28 dmg.",  img: "assets/program/Falcon.png" },
    FATALITY: { name: "FATALITY", pwr: 25, heat: 20,  cost: 80, special: "fatality_timeout_destroy", desc: "Deal 25 dmg. If not played this turn, remove from run.",      img: "assets/program/Fatality.png" },
    PIPIBOY:  { name: "PIPI-BOY", heat: 15,         cost: 50, desc: "Draw 3 cards.",      img: "assets/program/Pipiboy.png" }, // NO CHANGE: Utility
    FUSRO:    { name: "FUS-RO",   pwr: 18, heat: 10,  cost: 45, desc: "Unrelenting force. Deals 18 dmg.", img: "assets/program/Fusro.png" },
    COMBO:    { name: "C-C-COMBO", pwr: 21, heat: 21,  cost: 60, desc: "Ultra Combo! Deals 21 dmg.",      img: "assets/program/Combo.png" },
    KONODIO:  { name: "KONO-DIO", pwr: 20, heat: 15,  cost: 50, desc: "It was me! Deals 20 dmg.",         img: "assets/program/Konodio.png" },
    POGCHAMP: { name: "POG-CHAMP", heat: -10,        cost: 40, desc: "Draw 1. Vent 10.",   img: "assets/program/Pogchamp.png" }, // NO CHANGE: Stat listed
    KEY42:    { name: "42-KEY",   blk: 42, heat: 42,  cost: 84, desc: "Rage. Gain 42 block.",  img: "assets/program/Key42.png" },
    HAL9000:  { name: "HAL-9000", pwr: 25, heat: 10,  cost: 70, desc: "I'm sorry, Dave. Deals 25 dmg.",  img: "assets/program/Hal9000.png" },
    OMAEWA:   { name: "O-MAE-WA", pwr: 99, heat: 99,  cost: 220, desc: "Already dead. Deals 99 dmg.",     img: "assets/program/Omaewa.png" },
    STARK:    { name: "STARK",    blk: 20, heat: 5,   cost: 60, desc: "In a cave! Gain 20 block.",         img: "assets/program/Stark.png" },
    PHILO_STONE:     { name: "PHILO-STONE",     heat: 90, exhaust: true,         cost: 80, desc: "Equivalent exhange. Gain 20 credits.",    img: "assets/program/Philostone.png" }, // NO CHANGE
    HYLIAN:   { name: "HYLIAN",   blk: 22, heat: 12,  cost: 50, desc: "It's dangerous! Gain 22 block.",    img: "assets/program/Hylian.png" },
    POLYGON:  { name: "POLYGON",  pwr: 9,  heat: 4,   cost: 20, desc: "Retro strike. Deals 9 dmg.",     img: "assets/program/Polygon.png" },
    COWLEVEL: { name: "COW-LEVEL", heat: -44,        cost: 88, desc: "Moo. Vent 44.",      img: "assets/program/Cowlevel.png" }, // NO CHANGE
    WASTED:   { name: "WASTED",   pwr: 10, heat: -10, cost: 40, desc: "10 dmg. Vent 10.",   img: "assets/program/Wasted.png" }, // NO CHANGE
    ALLBASE:  { name: "ALL-BASE", pwr: 15, blk: 15,  heat: 30, cost: 70, desc: "Belong to us. Deals 15 dmg. Gain 15 block.", img: "assets/program/Allbase.png" },
    LEEROY:   { name: "LEEROY",   pwr: 35, heat: 70,  cost: 90, desc: "At least I have chicken. Deals 35 dmg.",   img: "assets/program/Leeroy.png" },
    TEMFLAKE:    { name: "TEMFLAKE",   heat: 50,         cost: 150, desc: "hOI! Heal 15 HP.",        img: "assets/program/Temflake.png" }, // NO CHANGE
    BSCREEN:  { name: "B-SCREEN", blk: 40, heat: 50,  cost: 100, desc: "System crash. Gain 40 block.",      img: "assets/program/Bscreen.png" },
    SLITHER:    { name: "SLITHER",    blk: 14, heat: -14, cost: 50, desc: ".IO? Gain 14 block. Vent 14.",   img: "assets/program/Slither.png" }, // NO CHANGE: Stat listed
    HOLLOW_P:    { name: "HOLLOW_P",    pwr: 45, heat: 55,  cost: 110, desc: "I alone am the chosen one. Deals 45 dmg.",  img: "assets/program/HollowP.png" },
    GORDON:   { name: "GORDON",   pwr: 12, heat: 0,   cost: 35, desc: "Crowbar strike. Deals 12 dmg.",    img: "assets/program/Gordon.png" },
    RECALL:   { name: "RECALL",   heat: 40,         cost: 100, desc: "Draw 5 cards.",      img: "assets/program/Recall.png" }, // NO CHANGE
    SANS:     { name: "SANS",     pwr: 15, heat: 15,  cost: 70, desc: "You got ketchup? 1 dmg x 15.",        img: "assets/program/Sans.png" }, // NO CHANGE: Stat listed

    // ============================================================================
    // MYTH & HISTORY (20)
    // ============================================================================
    ICARUS:   { name: "ICARUS",   pwr: 40, heat: 90,  cost: 120, desc: "Too close to the sun. Deals 40 dmg.",    img: "assets/program/Icarus.png" },
    SPARTA:   { name: "SPARTA",   pwr: 30, heat: 30,  cost: 80, aoe: true, desc: "This is Breach! Deals 30 dmg.",   img: "assets/program/Sparta.png" },
    HADES:    { name: "HADES",    pwr: 25, heat: -10, cost: 70, desc: "Fire from depth. Deals 25 dmg. Vent 10.",   img: "assets/program/Hades.png" },
    MIDAS:    { name: "MIDAS",    heat: 50,         cost: 150, destroy: true,  desc: "Gain 50 credits.",   img: "assets/program/Midas.png" }, // NO CHANGE
    THOR:     { name: "THOR",     pwr: 35, heat: 40,  cost: 90, desc: "I say when we're done. Deals 35 dmg.",    img: "assets/program/Thor.png" },
    ODIN:     { name: "ODIN",     heat: 20,         cost: 70, desc: "Draw 4 cards.",      img: "assets/program/Odin.png" }, // NO CHANGE
    CAESAR:   { name: "CAESAR",   pwr: 20, blk: 20,  heat: 40, cost: 100, desc: "Veni Vidi Vici. Deals 20 dmg. Gain 20 block.",  img: "assets/program/Caesar.png" },
    ANUBIS:   { name: "ANUBIS",   pwr: 18, heat: 5,   cost: 50, desc: "Wait a minute. Deals 18 dmg.",   img: "assets/program/Anubis.png" },
    EXCALIB:  { name: "EXCALIBUR", pwr: 32, heat: 30,  cost: 85, desc: "EXCALIBAAAAUR. Deals 32 dmg.",     img: "assets/program/Excalibur.png" },
    PROMET:   { name: "PROMET",   heat: -100,       cost: 200, desc: "Steal the fire. Vent 100.",    img: "assets/program/Promet.png" },
    SAMURAI:  { name: "SAMURAI",  pwr: 22, heat: 15,  cost: 60, desc: "..and you are a slave to it. Deals 22 dmg.",  img: "assets/program/Samurai.png" },
    VIKING:   { name: "VIKING",   pwr: 15, heat: 20,  cost: 65, desc: "I WILL KILL YOU. 15 dmg. +10 gold.",  img: "assets/program/Viking.png" }, // NO CHANGE
    NAPOLEO:  { name: "NAPOLEO",  heat: 0,          cost: 45, desc: "'Dont Wash'. Draw 2 cards.",      img: "assets/program/Napoleo.png" }, // NO CHANGE
    AZTEC:    { name: "AZTEC",    pwr: 20, heat: 10,  cost: 50, desc: "Sacrifice your foe. Deals 20 dmg.",    img: "assets/program/Aztec.png" },
    SHIVA:    { name: "SHIVA",    pwr: 60, heat: 80,  cost: 160, desc: "System destroyer. Deals 60 dmg.", img: "assets/program/Shiva.png" },
    ACHILLES: { name: "ACHILLES", pwr: 40, heat: 10,  cost: 90, desc: "Strong/Weak. Deals 40 dmg.",       img: "assets/program/Achilles.png" },
    TROY:     { name: "TROY",     blk: 15, heat: 20,  cost: 60, desc: "15 block. Draw 2.",    img: "assets/program/Troy.png" }, // NO CHANGE
    ROBIN:   { name: "ROBIN",   pwr: 50, heat: 50,  cost: 120, desc: "da hood. 5 dmg x 10.",        img: "assets/program/Robin.png" }, // NO CHANGE
    SIMO:  { name: "SIMO",  pwr: 25, heat: 20,  cost: 70, desc: "With an iron scope. Deals 25 dmg.",      img: "assets/program/Simo.png" },
    JOAN:     { name: "JOAN",     heat: -25,        cost: 55, desc: "of Arc. Vent 25.",   img: "assets/program/Joan.png" },

    // ============================================================================
    // UTILITY & DECK MANIPULATION (20)
    // ============================================================================
    RECYCLE:  { name: "RECYCLE",  heat: 10,   cost: 25, desc: "Discard 1, Draw 1.",     img: "assets/program/Recycle.png" },
    DRAW_2:     { name: "DRAW_2",     heat: 20,  cost: 40, desc: "Draw 2 cards.",       img: "assets/program/Draw2.png" }, // NO CHANGE
    SCRUB:    { name: "SCRUB",    heat: -50,  cost: 50, desc: "Discard hand. Vent 50.", img: "assets/program/Scrub.png" },
    CACHE:    { name: "CACHE",    heat: 10,   cost: 20, desc: "Draw 1 card.",        img: "assets/program/Cache.png" }, // NO CHANGE
    // Mirror now sets a 1-card status that doubles the next non-Mirror card cast.
    MIRROR:   { name: "MIRROR",   heat: 15,  cost: 60, special: "mirror_next_card", stacks: 1, desc: "Repeat the next card. (1 card)",   img: "assets/program/Mirror.png" },
    SKEW:     { name: "SKEW",     heat: -15, cost: 35, desc: "Discard 2, Vent 15.",   img: "assets/program/Skew.png" },
    SWAP:     { name: "SWAP",     heat: 8,   cost: 45, desc: "Discard 1, Draw 2.",     img: "assets/program/Swap.png" },
    QUICK:    { name: "QUICK",    blk: 3,    heat: 4,  cost: 30, desc: "Draw 1, Gain 3 block.",    img: "assets/program/Quick.png" }, // NO CHANGE
    SNOOZE:   { name: "SNOOZE",   blk: 15,   heat: 0,  cost: 55, desc: "15 block. End turn.", img: "assets/program/Snooze.png" }, // NO CHANGE
    OVERRIDE: { name: "OVERRIDE", heat: 30,  cost: 50, desc: "Draw 3. High heat.",  img: "assets/program/Override.png" }, // NO CHANGE
    PING:     { name: "PING",     pwr: 4,    heat: 5,  cost: 25, desc: "4 dmg. Draw 1.",    img: "assets/program/Ping.png" }, // NO CHANGE
    // Dynamic vent card (logic handled in playCard): vent = current discard count
    DUMP:     { name: "DUMP",     heat: 20,   cost: 40, desc: "Vent = Discard count.",   img: "assets/program/Dump.png" },
    GHOST:    { name: "GHOST",    blk: 18,   heat: 10, cost: 45, desc: "12 block. Draw 1.",   img: "assets/program/Ghost.png" }, // NO CHANGE
    LINK:     { name: "LINK",     heat: 20,  cost: 55, desc: "Draw per Mod.",       img: "assets/program/Link.png" }, // NO CHANGE
    STASH:    { name: "STASH",    heat: 0,   cost: 30, desc: "Draw 2, Discard 2.",     img: "assets/program/Stash.png" },
    DROP:     { name: "DROP",     heat: 0,   cost: 20, desc: "Discard 1.",             img: "assets/program/Drop.png" },
    ZIP:      { name: "ZIP",      heat: 0, cost: 25, desc: "Discard 3.",    img: "assets/program/Zip.png" }, // NO CHANGE
    
    // ============================================================================
    // USER REQUESTED PROGRAM PACK - centralized special-effect cards
    // ============================================================================
    DOUBLE_TAP:         { name: "DOUBLE TAP", pwr: 4, heat: 2, cost: 40, hits: 2, desc: "4 dmg x 2.", img: "assets/program/Doubletap.png" },
    ATGM:               { name: "ATGM", pwr: 8, heat: 3, cost: 55, special: "bonus_if_no_block", bonusDmg: 4, desc: "8 dmg. +4 if enemy has no block.", img: "assets/program/ATGM.png" },
    SCATTERSHOT:        { name: "SCATTERSHOT", pwr: 2, heat: 2, cost: 45, special: "random_multi_target", randomHits: 3, desc: "2 dmg x 3 random hits.", img: "assets/program/Scattershot.png" },
    BLACK_FLASH:        { name: "BLACK FLASH", pwr: 7, heat: 3, cost: 50, ignoreBlock: true, desc: "7 dmg. Ignores block.", img: "assets/program/Blackflash.png" },
    SUCKER_PUNCH:       { name: "SUCKER PUNCH", pwr: 3, heat: 1, cost: 35, special: "bonus_if_enemy_not_attacking", bonusDmg: 9, desc: "3 dmg. If enemy not attacking, deals 12.", img: "assets/program/Suckerpunch.png" },
    SCAR_COUNT:         { name: "SCAR COUNT", pwr: 5, heat: 5, cost: 60, special: "heal_on_kill", healOnKill: 3, desc: "5 dmg. If kill, heal 3.", img: "assets/program/Scarcount.png" },
    EXPLOSION:      { name: "EXPLOSION", pwr: 70, heat: 80, cost: 110, aoe: true, special: "next_card_extra_heat", nextCardHeat: 5, desc: "40 dmg. Next card costs +5 heat.", img: "assets/program/Explosion.png" },
    FAN_PORT:           { name: "FAN PORT", heat: 0, cost: 50, special: "vent_per_hand", ventPerCard: 4, desc: "Vent 4 per card in hand.", img: "assets/program/Fanport.png" },
    MOLTEN_CORE:        { name: "MOLTEN CORE", blk: 6, heat: 8, cost: 70, special: "temp_player_thorns", thorns: 6, duration: 1, desc: "Gain 6 block. Reflect 6 this turn.", img: "assets/program/Moltencore.png" },
    GOOEY_SLIME:        { name: "GOOEY SLIME", blk: 9, heat: 3, cost: 55, special: "retain_block_next_turn", retainBlock: 4, desc: "Gain 9 block. Retain 4 next turn.", img: "assets/program/Gooeyslime.png" },
    PHALANX:            { name: "PHALANX", blk: 6, heat: 2, cost: 50, draw: 1, desc: "Gain 6 block. Draw 1.", img: "assets/program/Phalanx.png" },
    JERRY_S_SHELL:      { name: "JERRY'S SHELL", blk: 20, heat: 10, cost: 95, special: "discard_attacks", desc: "Gain 20 block. Discard all attacks.", img: "assets/program/Jerrysshell.png" },
    FRIENDLY_HUG:       { name: "FRIENDLY HUG", pwr: 20, heat: 35, cost: 95, special: "discard_block_and_vent", desc: "Discard all Block/Vent cards in hand. Deal 20 dmg.", img: "assets/program/Friendlyhug.png" },
    KINETIC_SHIELD:     { name: "KINETIC SHIELD", heat: 4, cost: 55, special: "block_equal_last_attack", desc: "Gain block equal to last attack damage.", img: "assets/program/Kineticshield.png" },
    SHIELD_UP_10:       { name: "SHIELD UP", heat: 5, cost: 45, special: "block_per_10_heat", per10HeatBlock: 4, desc: "Gain block per 10 heat.", img: "assets/program/Shieldup.png" },
    ALGORITHM_SEARCH:   { name: "ALGORITHM SEARCH", heat: 8, cost: 60, special: "search_draw_pick_one", desc: "Open draw pile and pick 1 card.", img: "assets/program/Algorithmsearch.png" },
    TIME_ROCK:         { name: "TIME ROCK", heat: 6, cost: 70, special: "recover_exhaust", desc: "Return an exhausted card to hand.", img: "assets/program/Timerock.png" },
    RECYCLE_BIN:        { name: "RECYCLE BIN", heat: 5, cost: 65, special: "return_last_played", desc: "Return last played card to hand.", img: "assets/program/Recyclebin.png" },
    PRUNING_PROTOCOL:   { name: "PRUNING PROTOCOL", heat: 7, cost: 75, special: "exhaust_random_hand_draw3", draw: 3, desc: "Exhaust random hand card. Draw 3.", img: "assets/program/Pruningprotocol.png" },
    CORROSIVE_LEAK:     { name: "CORROSIVE LEAK", heat: 5, cost: 70, special: "apply_enemy_dot", dot: 3, duration: 3, desc: "Target loses 3 HP for 3 turns.", img: "assets/program/Corrosiveleak.png" },
    CORROSIVE_STORM:    { name: "CORROSIVE STORM", heat: 8, cost: 95, aoe: true, special: "apply_enemy_dot_aoe", dot: 3, duration: 3, desc: "All enemies lose 3 HP for 3 turns.", img: "assets/program/Corrosivestorm.png" },
    DATA_CORRUPTION:    { name: "DATA CORRUPTION", heat: 10, cost: 110, special: "apply_enemy_corruption", dot: 10, duration: 2, desc: "Target loses 10 HP for 2 turns.", img: "assets/program/Datacorruption.png" },
    SYSTEM_LAG:         { name: "SYSTEM LAG", heat: 4, cost: 60, special: "one_hit_immunity", stacks: 1, desc: "Negate next single-hit attack.", img: "assets/program/Systemlag.png" },
    PACKETLOSS:         { name: "PACKETLOSS", heat: 3, cost: 60, special: "half_hit_immunity", stacks: 1, desc: "Next incoming hit deals 50% damage.", img: "assets/program/Packetloss.png" },
    PACKET_GUARD:       { name: "PACKET GUARD", heat: 4, cost: 65, special: "one_packet_immunity", stacks: 1, desc: "Negate the next hit packet. Multi-hit: only first hit is negated.", img: "assets/program/Packetguard.png" },
    TARGET_LOCK:        { name: "TARGET LOCK", heat: 5, cost: 65, special: "next_card_aoe", stacks: 1, desc: "Next card is AOE.", img: "assets/program/Targetlock.png" },
    SPIKE_BOMB:         { name: "SPIKE BOMB", heat: 6, cost: 75, exhaust: true, special: "logic_bomb", bombDelay: 3, bombDmg: 35, desc: "In 3 turns, deal 35 damage.", img: "assets/program/Spikebomb.png" },
    SCAR_ROT:           { name: "SCAR-ROT", heat: 5, cost: 70, special: "bit_rot", rotDmg: 4, duration: 3, desc: "Enemy loses 4 HP whenever it attacks for 3 turns.", img: "assets/program/Scarrot.png" },
    STATIC_INTERFERENCE:{ name: "STATIC INTERFERENCE", heat: 6, cost: 75, special: "intent_hide_reduce_dmg", duration: 3, dmgMul: 0.6, desc: "Hide intent, enemy deals 40% less dmg.", img: "assets/program/Staticinterference.png" },
    SIPHON_CREDITS:     { name: "SIPHON CREDITS", pwr: 4, heat: 2, cost: 60, exhaust: true, special: "credits_on_hp_hit", hpHitCredits: 4, desc: "4 dmg. If HP hit, gain 4 credits.", img: "assets/program/Siphoncredits.png" },
    BOUNTY_HUNTER:      { name: "BOUNTY HUNTER", pwr: 12, heat: 4, cost: 70, exhaust: true, special: "credits_on_kill", killCredits: 20, desc: "12 dmg. If this kills, gain 20 credits.", img: "assets/program/Bountyhunter.png" },
    INSURANCE_POLICY:   { name: "INSURANCE POLICY", heat: 3, cost: 45, exhaust: true, special: "insurance_policy", insuranceCredits: 5, desc: "If end turn with 0 block, gain 5 credits.", img: "assets/program/Insurancepolicy.png" },
    TRADE_IN:           { name: "TRADE-IN", heat: 0, cost: 80, destroy: true, special: "destroy_random_card_gain_credits", tradeCredits: 70, desc: "Destroy a random card. Gain 70 credits. Destroy.", img: "assets/program/Tradein.png" },
    DEEP_POCKET:        { name: "DEEP POCKET", heat: 2, cost: 55, exhaust: true, special: "heal_enemy_gain_credits", enemyHeal: 10, gainCredits: 10, desc: "Heal enemy 10. Gain 10 credits.", img: "assets/program/Deeppocket.png" },
    BRIBERY:            { name: "BRIBERY", heat: 0, cost: 65, exhaust: true, special: "skip_enemy_attack_credit_cost", bribeCost: 50, failSelfDmg: 20, desc: "Enemy does not attack this turn. Costs 50 credits.", img: "assets/program/Bribery.png" },
    CREDIT_BLAST:       { name: "CREDIT BLAST", heat: 99, cost: 120, special: "damage_from_credits_pct", creditPct: 0.12, desc: "Deal dmg equal to 12% of current credits.", img: "assets/program/Creditblast.png" },
    GAMBLERS_SHOT:      { name: "GAMBLER'S SHOT", heat: 5, cost: 55, special: "random_damage_range", minDmg: 1, maxDmg: 25, desc: "Deal 1 to 25 damage.", img: "assets/program/Gamblersshot.png" },
    DOUBLE_IMPACT:      { name: "DOUBLE IMPACT", heat: 6, cost: 70, special: "next_attack_double", stacks: 1, exhaust: true, desc: "Next attack deals 2x damage.", img: "assets/program/Doubleimpact.png" },
    ABLAZE:             { name: "ABLAZE", pwr: 18, heat: 5, cost: 65, special: "playable_below_hp", hpThreshold: 15, desc: "Set your heart ablaze! 18 dmg. Only if hull below 15.", img: "assets/program/Ablaze.png" },
    VAULT_TEC:          { name: "VAULT-TEC", blk: 25, heat: 4, cost: 65, special: "lose_credits", loseCredits: 10, desc: "Gain 25 block. Lose 10 credits.", img: "assets/program/Vaulttec.png" },
    HINOKAMI:           { name: "HINOKAMI", pwr: 30, heat: 9, cost: 75, special: "set_block_zero", desc: "30 dmg. Set your block to 0.", img: "assets/program/Hinokami.png" },
    ERROR_404:          { name: "ERROR 404", heat: 7, cost: 80, exhaust: true, special: "play_random_library_card", desc: "Randomly play any card. ", img: "assets/program/Error404.png" },
    EGO_LIFT:       { name: "EGO LIFT", pwr: 12, heat: 5, cost: 60, special: "chance_instant_overheat", overheatChance: 0.3, desc: "12 dmg. 30% chance to overheat now.", img: "assets/program/Egolift.png" },
    EIGHT_GATES:        { name: "EIGHT GATES", pwr: 60, heat: 12, cost: 90, special: "self_damage_if_enemy_survives", selfDmg: 20, desc: "60 dmg. If enemy survives, take 20.", img: "assets/program/Eightgates.png" },
    OH_WOW:             { name: "OH WOW!", pwr: 2, heat: 1, cost: 40, exhaust: true, special: "credits_on_kill", killCredits: 500, desc: "2 dmg. If kill, gain 500 credits. ", img: "assets/program/Ohwow.png" },
    RETURN:       { name: "RETURN", heat: 0, cost: 130, special: "round_reboot", desc: "Restart the round and heal all to max.", img: "assets/program/Return.png" },
    FULL_COUNTER:   { name: "FULL_COUNTER", heat: 5, cost: 70, special: "reflect_next_debuff", stacks: 1, desc: "Reflect next status debuff back to enemy.", img: "assets/program/Fullcounter.png" },
    MILK:               { name: "MILK", heat: -5, cost: 60, special: "cleanse_player_debuffs", desc: "Remove all enemy-applied statuses from player.", img: "assets/program/Milk.png" },
    GAMBLE:             { name: "GAMBLE", heat: 5, cost: 60, special: "coinflip_30", desc: "50/50: deal 30 dmg or take 30 dmg.", img: "assets/program/Gamble.png" },
    BLOOD_BEND:    { name: "BLOOD BEND", pwr: 4, heat: 3, cost: 65, special: "permanent_self_upgrade", upgradeBy: 2, persistentKey: "BLOOD_BEND", desc: "4 dmg. Permanently +2 damage each use.", img: "assets/program/Bloodbend.png" },
    COLOR_CARD:          { name: "COLOR CARD", heat: 6, cost: 90, destroy: true, special: "transform_random_hand_to_boss", desc: "Transform random hand card into random boss card. Destroy.", img: "assets/program/Colorcard.png" },
    OBJ_SURVIVE:        { name: "OBJ: SURVIVE", heat: 10, cost: 120, exhaust: true, special: "damage_equal_enemy_hp_turn_15", requiredTurn: 15, bossOnly: true, category: 'boss', desc: "Deal damage equal to enemy HP. Turn 15 only.", img: "assets/program/OBJsurvive.png" },
    PLUNDERER:       { name: "PLUNDERER", pwr: 5, heat: 4, cost: 45, special: "max_hp_on_kill", maxHpOnKill: 5, desc: "Deal 5 dmg. If this kills, gain +5 Max Hull.", img: "assets/program/Plunderer.png" },
    TICKLE_STORM:       { name: "TICKLE STORM", heat: 6, cost: 55, special: "summon_tickle_exhaust", desc: "Add 3 TICKLE cards to hand. They Exhaust.", img: "assets/program/Ticklestorm.png" },
    NEO:         { name: "NEO", heat: 0, cost: 60, special: "equivalent_shield", desc: "Convert 50% of current Heat into temporary shield.", img: "assets/program/Neo.png" },
    OVER_9000:          { name: "OVER_9000", heat: 10, cost: 95, special: "damage_equal_draw_count", desc: "Deal damage equal to programs in draw pile.", img: "assets/program/Over9000.png" },
    AGAIN:          { name: "AGAIN", heat: 4, cost: 65, special: "ger_reply", desc: "Replay your last non-attack program for 0 Heat.", img: "assets/program/Again.png" },
    LIMITBREAK:         { name: "LIMITBREAK", heat: 6, cost: 70, exhaust: true,special: "limitbreak", desc: "Next attack deals 2x damage but generates 3x Heat.", img: "assets/program/LimitBreak.png" },
    FREEZE:             { name: "FREEZE", heat: 4, cost: 60, special: "freeze_hand_cost", desc: "All hand programs cost 5 less Heat until played.", img: "assets/program/Freeze.png" },
    RANDOMBS:           { name: "RANDOMBS", heat: 8, cost: 85, special: "damage_per_hand_card", handCardDmg: 5, desc: "Deal 5 damage for each card in hand.", img: "assets/program/Randombs.png" },
    NONE_PASS:          { name: "NONE_PASS", blk: 30, heat: 8, cost: 90, special: "none_pass", desc: "Gain 30 Block. Cannot gain more Block until it breaks.", img: "assets/program/NonePass.png" },
    LIMITLESS:           { name: "LIMITLESS", heat: 3, cost: 55, special: "negate_next_overheat", desc: "Negate the next overheat damage instance.", img: "assets/program/Limitless.png" },
    THE_SNAP:           { name: "THE_SNAP", pwr: 120, heat: 30, exhaust: true, cost: 140, special: "the_snap", desc: "Deal massive damage. Permanently delete a random program.", img: "assets/program/TheSnap.png" },
    KAGE_BUNIN:         { name: "KAGE_BUNIN", heat: 5, cost: 65, special: "kage_bunin", desc: "Next program this turn is played twice.", img: "assets/program/KageBunin.png" },
    KEDAVRA:            { name: "KEDAVRA", heat: 5, cost: 65, special: "kedavra", desc: "Next incoming attack damages Heat instead of Hull.", img: "assets/program/Kedavra.png" },
    POT_GREED:          { name: "POT_GREED", heat: 0, cost: 90,exhaust: true, special: "pot_greed", desc: "Draw until full hand. Gain 5 Heat per card drawn.", img: "assets/program/PotGreed.png" },
    DOMAIN_EXP:         { name: "DOMAIN_EXP", heat: 4, cost: 50, special: "set_enemy_block_zero", desc: "Set target enemy Block to 0.", img: "assets/program/DomainExp.png" },
    MOB:          { name: "MOB", heat: 10, cost: 80, special: "damage_from_current_heat_x2", desc: "Deal 2 damage for each current Heat.", img: "assets/program/Mob.png" },
    THE_WORLD:          { name: "THE_WORLD", blk: 5, heat: 6,exhaust: true, cost: 70, special: "delay_enemy_attack", desc: "Delay enemy's next attack by one turn. Gain 5 Block.", img: "assets/program/TheWorld.png" },
    MOU_SHINDE:         { name: "MOU_SHINDE", heat: 7, cost: 75,exhaust: true, special: "turn_start_dot_enemy", dot: 4, desc: "Deal 4 damage at the start of every turn.", img: "assets/program/MouShinde.png" },
    MIST_SHIELD:          { name: "MIST_SHIELD", heat: 6, cost: 65, special: "block_equal_last_turn_heat", desc: "Gain Block equal to Heat generated last turn.", img: "assets/program/MistShield.png" },
    REVERSE:          { name: "REVERSE", heat: 5, cost: 70, special: "block_gain_reflect_this_turn", desc: "Enemy takes damage equal to Block you gain this turn.", img: "assets/program/Reverse.png" },
    GOD_MODE:           { name: "GOD_MODE", heat: 3, cost: 85, destroy: true,  special: "free_shop_next_visit", desc: "Next shop visit: all program prices are 0 (Scrap excluded).", img: "assets/program/GodMode.png" },
    IRON_MAN:           { name: "IRON_MAN", heat: 12, cost: 95, special: "iron_man", desc: "Deal 10 dmg and draw 1 per unique discard program.", img: "assets/program/IronMan.png" },
    BATTLE_TRANCE:      { name: "BATTLE_TRANCE", heat: 4, cost: 65, exhaust: true, special: "gain_strength_per_turn", strengthPerTurn: 1, desc: "For the rest of combat, gain +1 Strength each turn.", img: "assets/program/BattleTrance.png" },

    // ============================================================================
    // BOSS-ONLY PROGRAMS (20) - high risk / high reward package
    // These are intentionally excluded from normal/shop pools.
    // ============================================================================
    LASH:  { name: "LASH",  pwr: 42, heat: 55,  cost: 120, desc: "Deals 42 dmg. Lash is an asshole.", img: "assets/program/Lash.png", bossOnly: true, category: 'boss' },
    MELTDOWN:     { name: "MELTDOWN",     pwr: 90, heat: 100, cost: 180, desc: "Deals 90 dmg. Guaranteed overheat setup.", img: "assets/program/Meltdown.png", bossOnly: true, category: 'boss' },
    SPEED_BLITZ:     { name: "SPEED BLITZ",     pwr: 35, heat: -25, cost: 110, desc: "Deals 35 dmg. Vent 25.", img: "assets/program/SpeedBlitz.png", bossOnly: true, category: 'boss' },
    NETHERITE:     { name: "NETHERITE",     pwr: 28, blk: 20, heat: 22, cost: 95, desc: "28 dmg + 20 block.", img: "assets/program/Netherite.png", bossOnly: true, category: 'boss' },
    PLUS_FOUR:  { name: "PLUS FOUR",  heat: 18,          cost: 95,  desc: "Draw 4 cards.", img: "assets/program/PlusFour.png", bossOnly: true, category: 'boss' },
    AVATAR:  { name: "AVATAR",  pwr: 24, heat: -30, cost: 105, desc: "24 dmg. Vent 30.", img: "assets/program/Avatar.png", bossOnly: true, category: 'boss' },
    STRENGTH_POT:     { name: "STRENGTH_POT",     pwr: 48, heat: 65,  cost: 130, desc: "Deals 48 dmg.", img: "assets/program/StrengthPot.png", bossOnly: true, category: 'boss' },
    SUN_BREATHING: { name: "SUN BREATHING", pwr: 75, heat: 95,  cost: 160, desc: "Deals 75 dmg. Extreme heat debt.", img: "assets/program/SunBreathing.png", bossOnly: true, category: 'boss' },
    DEAL_WITH_IT:   { name: "DEAL WITH IT",   blk: 60, heat: 55,  cost: 120, desc: "Gain 60 block.", img: "assets/program/DealWithIt.png", bossOnly: true, category: 'boss' },
    RECURSION:    { name: "RECURSION",    heat: 30,          cost: 100, desc: "Draw 5 cards.", img: "assets/program/Recursion.png", bossOnly: true, category: 'boss' },
    CHAOS_PATCH:  { name: "CHAOS PATCH",  pwr: 33, blk: 18, heat: 30, cost: 105, desc: "33 dmg + 18 block.", img: "assets/program/ChaosPatch.png", bossOnly: true, category: 'boss' },
    WATER:    { name: "WATER",   pwr: 99, heat: 120, cost: 220, desc: "Deals 99 dmg.", img: "assets/program/Water.png", bossOnly: true, category: 'boss' },
    TITAN_SHELL:  { name: "TITAN SHELL",  blk: 80, heat: 45,  cost: 150, desc: "Gain 80 block.", img: "assets/program/TitanShell.png", bossOnly: true, category: 'boss' },
    WARP_DRIVE:   { name: "WARP DRIVE",   pwr: 30, heat: 15,  cost: 90,  desc: "30 dmg. Draw 2.", img: "assets/program/WarpDrive.png", bossOnly: true, category: 'boss' },
    BRUSH_OFF:   { name: "BRUSH OFF",   heat: -60,         cost: 110, desc: "Vent 60 heat.", img: "assets/program/BrushOff.png", bossOnly: true, category: 'boss' },
    PHOENIX:      { name: "PHOENIX",      pwr: 44, heat: 40,  cost: 130, desc: "Deals 44 dmg. Heal 8 HP.", img: "assets/program/Phoenix.png", bossOnly: true, category: 'boss' },
    GOD_THREAD:   { name: "GOD THREAD",   pwr: 70, heat: 88,  cost: 190, desc: "Deals 70 dmg.", img: "assets/program/GodThread.png", bossOnly: true, category: 'boss' },

     REBOOT:   { name: "REBOOT",   heat: 0,   cost: 100, exhaust: true, special: "recycle_discard_to_draw", desc: "Return discard pile to draw.",         img: "assets/program/Reboot.png" }, // NO CHANGE



};


// ============================================================================
// CENTRALIZED PROGRAM POOLS
// Add/remove keys here to control where cards can be obtained.
// ============================================================================
const PROGRAM_POOLS = {
    SHOP: Object.keys(PROGRAMS).filter(k => !PROGRAMS[k].bossOnly),
    COMMON_REWARD: Object.keys(PROGRAMS).filter(k => !PROGRAMS[k].bossOnly),
    ELITE_REWARD: [
        ...Object.keys(PROGRAMS).filter(k => !PROGRAMS[k].bossOnly),
        'OVERCLOCK', 'FORTRESS', 'LIMIT', 'SHIVA', 'OMAEWA', 'IDDQD'
    ],
    BOSS_ONLY: Object.keys(PROGRAMS).filter(k => PROGRAMS[k].bossOnly),
    // Boss rewards can include all boss-only cards plus a few strong legacy cards.
    BOSS_REWARD: [
        ...Object.keys(PROGRAMS).filter(k => PROGRAMS[k].bossOnly),
        'OMAEWA', 'FATALITY', 'SHIVA', 'IDDQD', 'LIMIT', 'FORTRESS', 'OVERCLOCK'
    ],
};

// ============================================================================
// MOD DEFINITIONS - Upgrades and equipment
// ============================================================================
const MODS = [
    // ----------------------------------------------------------------
    // Core pack (30) - passive relic/mod system
    // ----------------------------------------------------------------
    { name: "PLATING",        desc: "+10 Max Hull.",                cost: 75,  effect: "hp_max_bonus",       value: 10,  img: "assets/mods/plating.png" },
    { name: "CORE",           desc: "Programs deal +2 dmg.",        cost: 90,  effect: "dmg_up",             value: 2,   img: "assets/mods/core.png" },
    { name: "SHIELD",         desc: "Start combats with 5 Block.",  cost: 65,  effect: "block_start",        value: 5,   img: "assets/mods/shield.png" },
    { name: "TURBO FAN",      desc: "Vent +2 extra heat each vent.",cost: 80,  effect: "vent_bonus",         value: 2,   img: "assets/mods/turbofan.png" },
    { name: "RADIATOR",       desc: "+5 natural heat reduction.",   cost: 95,  effect: "heat_reduction",     value: 5,   img: "assets/mods/radiator.png" },
    { name: "DAMPER",         desc: "+1 Block from block cards.",   cost: 55,  effect: "block_bonus",        value: 1,   img: "assets/mods/damper.png" },
    { name: "MEGA DAMPER",    desc: "+3 Block from block cards.",   cost: 95,  effect: "block_bonus",        value: 3,   img: "assets/mods/megadamper.png" },
    { name: "BLADE BUS",      desc: "+3 damage on attack cards.",   cost: 110, effect: "dmg_up",             value: 3,   img: "assets/mods/bladebus.png" },
    { name: "INJECTOR",       desc: "Heal 2 when entering combat.", cost: 85,  effect: "heal_on_room_start", value: 2,   img: "assets/mods/injector.png" },
    { name: "NANOFRAME",      desc: "Heal 5 when entering combat.", cost: 140, effect: "heal_on_room_start", value: 5,   img: "assets/mods/nanoframe.png" },
    { name: "THERMAL VAULT",  desc: "+15 overheat threshold.",      cost: 100, effect: "overheat_threshold", value: 15,  img: "assets/mods/thermalvault.png" },
    { name: "ARCHIVE",        desc: "+1 reward choice card.",       cost: 120, effect: "bonus_card_choice",  value: 1,   img: "assets/mods/archive.png" },
    { name: "ELITE CACHE",    desc: "+1 card option in elite reward.", cost: 130, effect: "bonus_card_choice_elite", value: 1, img: "assets/mods/elitecache.png" },
    { name: "BOSS VAULT",     desc: "+2 card options in boss reward.", cost: 170, effect: "bonus_card_choice_boss", value: 2, img: "assets/mods/bossvault.png" },
    { name: "SCRAPPER",       desc: "+8 credits after each victory.", cost: 75, effect: "gold_on_kill",      value: 8,   img: "assets/mods/scrapper.png" },
    { name: "BANKER",         desc: "+15 credits after each victory.", cost: 120, effect: "gold_on_kill",    value: 15,  img: "assets/mods/banker.png" },
    { name: "PATCH PANEL",    desc: "Start each turn with 2 Block.", cost: 90, effect: "start_turn_block",   value: 2,   img: "assets/mods/patchpanel.png" },
    { name: "CITADEL",        desc: "Start each turn with 4 Block.", cost: 140, effect: "start_turn_block",  value: 4,   img: "assets/mods/citadel.png" },
    { name: "VAMP SOCKET",    desc: "Heal 20% of attack damage dealt.", cost: 150, effect: "attack_lifesteal", value: 0.2, img: "assets/mods/vampsocket.png" },
    { name: "PACER",          desc: "Flat -2 heat to every card played.", cost: 105, effect: "flat_cost_cut", value: 2, img: "assets/mods/pacer.png" },
    { name: "QUANT PUMP",     desc: "Flat -4 heat to every card played.", cost: 165, effect: "flat_cost_cut", value: 4, img: "assets/mods/quantpump.png" },
    { name: "DEFRAG",         desc: "Reduce Sync Stall heat by 5.",  cost: 145, effect: "sync_resist",       value: 5,   img: "assets/mods/defrag.png" },
    { name: "LAST RESORT",    desc: "+8 damage while at 25% HP or lower.", cost: 130, effect: "low_hp_power", value: 8, img: "assets/mods/lastresort.png" },
    { name: "EMERGENCY LOOP", desc: "Prevent first overheat damage each combat.", cost: 160, effect: "emergency_coolant", value: 1, img: "assets/mods/emergencyloop.png" },
    { name: "FAST CACHE",     desc: "Draw +1 on the first turn.", cost: 85, effect: "draw_first_turn", value: 1, img: "assets/mods/fastcache.png" },
    { name: "DEEP CACHE",     desc: "Draw +2 on the first turn.", cost: 140, effect: "draw_first_turn", value: 2, img: "assets/mods/deepcache.png" },
    { name: "BULKHEAD",       desc: "+20 Max Hull.",              cost: 160, effect: "hp_max_bonus", value: 20, img: "assets/mods/bulkhead.png" },
    { name: "ULTRA CORE",     desc: "Programs deal +5 dmg.",      cost: 185, effect: "dmg_up", value: 5, img: "assets/mods/ultracore.png" },

    // ----------------------------------------------------------------
    // Expansion pack - unique passive mods (original mechanics)
    // ----------------------------------------------------------------
    { name: "ALPHA STRIKE BUS", desc: "First attack each turn deals +6 dmg.", cost: 150, effect: "first_attack_bonus", value: 6, img: "assets/mods/alphastrikebus.png" },
    { name: "VENTED ARMOR",     desc: "Whenever you vent heat, gain 3 Block.", cost: 125, effect: "block_on_vent", value: 3, img: "assets/mods/ventedarmor.png" },
    { name: "IMPACT BAFFLE",    desc: "First damage you take each turn is reduced by 4.", cost: 155, effect: "first_hit_reduction", value: 4, img: "assets/mods/impactbaffle.png" },
    { name: "LOOP BUFFER",      desc: "Every 3 cards played each turn, draw 1.", cost: 145, effect: "draw_every_n_cards", value: 3, img: "assets/mods/loopbuffer.png" },
    { name: "PURGE NOZZLE",     desc: "On enemy defeat, vent 6 Heat.", cost: 135, effect: "vent_on_kill", value: 6, img: "assets/mods/purgenozzle.png" },
    { name: "COOL CYCLE",       desc: "At start of your turn, vent 2 Heat.", cost: 120, effect: "turn_start_vent", value: 2, img: "assets/mods/coolcycle.png" },
    // ----------------------------------------------------------------
    // User-requested mod pack
    // ----------------------------------------------------------------
    { name: "PRESSURE VALVE",       desc: "Whenever you overheat, gain 15 Block.", cost: 145, effect: "block_on_overheat", value: 15, img: "assets/mods/pressurevalve.png" },
    { name: "CONDUCTIVE COIL",      desc: "+4 damage while at 50% heat or higher.", cost: 140, effect: "dmg_at_half_heat", value: 4, img: "assets/mods/conductivecoil.png" },
    { name: "THERMAL CAPACITOR",    desc: "Increase overheat threshold to 125%.", cost: 135, effect: "overheat_threshold", value: 25, img: "assets/mods/thermalcapacitor.png" },
    { name: "EXOTHERMIC PULSE",     desc: "When you overheat, deal 12 damage to all enemies.", cost: 155, effect: "aoe_on_overheat", value: 12, img: "assets/mods/exothermicpulse.png" },
    { name: "OOGWAY",               desc: "Gain 5 Block at start of your turn.", cost: 120, effect: "start_turn_block", value: 5, img: "assets/mods/oogway.png" },
    { name: "AUTO-LOADER",          desc: "Every 4th attack in a turn deals 2x damage.", cost: 160, effect: "double_every_6th_attack", value: 1, img: "assets/mods/autoloader.png" },
    { name: "AUTO-AIM",             desc: "All attacks are AOE.", cost: 170, effect: "all_attacks_aoe", value: 1, img: "assets/mods/autoaim.png" },
    { name: "THORNS",               desc: "When enemy hits your block, they take 4 damage.", cost: 130, effect: "thorns_on_block_hit", value: 4, img: "assets/mods/thorns.png" },
    { name: "VAMPIRIC LINK",        desc: "Heal 6 HP when an attack kills an enemy.", cost: 165, effect: "heal_on_attack_kill", value: 6, img: "assets/mods/vampiriclink.png" },
    { name: "CAMPFIRE",             desc: "If combat ends below 25% HP, heal 8 HP.", cost: 125, effect: "heal_low_hp_end_combat", value: 8, img: "assets/mods/campfire.png" },
    { name: "EXTRA HAND",           desc: "Draw 1 additional card each turn.", cost: 155, effect: "hand_limit_bonus", value: 1, img: "assets/mods/extrahand.png" },
    { name: "PRE-PROCESSOR",        desc: "Random opening card costs 0 heat this combat.", cost: 140, effect: "opening_free_card", value: 1, img: "assets/mods/preprocessor.png" },
    { name: "BUFFER CACHE",         desc: "Increase hand size limit to 7.", cost: 145, effect: "hand_limit_bonus", value: 2, img: "assets/mods/buffercache.png" },
    { name: "LEGACY DRIVER",        desc: "Start combat with 10 Block.", cost: 120, effect: "block_start", value: 10, img: "assets/mods/legacydriver.png" },
    { name: "SYMBIOTE",             desc: "Retain your block between turns.", cost: 170, effect: "retain_block", value: 1, img: "assets/mods/symbiote.png" },
    { name: "CREDIT SKIMMER",       desc: "Gain 25% more credits from all sources.", cost: 150, effect: "credit_multiplier", value: 0.25, img: "assets/mods/creditskimmer.png" },
    { name: "MEMBERSHIP TOKEN",     desc: "Shop items cost 20% less.", cost: 130, effect: "shop_discount", value: 0.2, img: "assets/mods/membershiptoken.png" },
    { name: "ELEVATOR KEYCARD",     desc: "You always get 2-3 elevator options.", cost: 140, effect: "min_two_elevator_options", value: 1, img: "assets/mods/elevatorkeycard.png" },
    { name: "DEBT COLLECTOR",       desc: "Gain 20 credits when entering a shop.", cost: 110, effect: "credits_on_shop_enter", value: 20, img: "assets/mods/debtcollector.png" },
    { name: "BLACK MARKET CHIP",    desc: "Restocks also restock mods.", cost: 135, effect: "restock_mods_too", value: 1, img: "assets/mods/blackmarketchip.png" },
    { name: "INSURANCE VOUCHER",    desc: "One-time revive with 5 HP on death.", cost: 175, effect: "one_time_revive", value: 5, img: "assets/mods/insurancevoucher.png" },
    { name: "I3 CORE",              desc: "No end-turn cooling. +1% damage per 2% heat.", cost: 190, effect: "i3_core_scaling", value: 1, img: "assets/mods/i3core.png" },
    { name: "SIDE HUSTLE",          desc: "Every 4 cards played per turn, heal 2 HP.", cost: 145, effect: "heal_every_4_cards", value: 2, img: "assets/mods/sidehustle.png" },
    { name: "CORE OVERCLOCKER",     desc: "Start combat at 50 Heat, draw +2 each turn.", cost: 185, effect: "core_overclocker", value: 1, img: "assets/mods/coreoverclocker.png" },
    { name: "FEEDBACK LOOP",        desc: "Whenever you overheat, enemy takes 15 damage.", cost: 165, effect: "enemy_damage_on_overheat", value: 15, img: "assets/mods/modfeedbackloop.png" },
    { name: "POWER SPINDLE",        desc: "Gain +1 Strength every turn.", cost: 165, effect: "strength_per_turn", value: 1, img: "assets/mods/powerspindle.png" },
    { name: "BIO-REACTOR",          desc: "Every kill grants +5 Max Hull.", cost: 170, effect: "max_hp_on_kill", value: 5, img: "assets/mods/bioreactor.png" },
    { name: "CREDIT PERIPHERAL",    desc: "Gain 2 credits every program used.", cost: 150, effect: "credits_per_card_played", value: 2, img: "assets/mods/creditperipheral.png" },
    { name: "HEX CORE",             desc: "Gain +0.5x damage per Curse card in your manifest.", cost: 180, effect: "curse_damage_scale", value: 0.5, img: "assets/mods/hexcore.png" },
    // Ancient mods: only obtainable via Ancient Room button events.
    { name: "ANCIENT ALTAR",        desc: "Never earn credits. Fully heal whenever combat starts.", cost: 9999, effect: "ancient_no_gold_full_heal", value: 1, img: "assets/mods/ancientaltar.png", ancient: true },
    { name: "VOID REACTOR",         desc: "Set Hull to 1. Never overheat. All your damage is permanently 2x.", cost: 9999, effect: "ancient_one_hp_no_overheat_double_dmg", value: 1, img: "assets/mods/voidreactor.png", ancient: true },
    { name: "BLIND TREASURY",       desc: "Gain 1000 credits instantly. Enemy intents are always hidden.", cost: 9999, effect: "ancient_1000_no_intent", value: 1, img: "assets/mods/blindtreasury.png", ancient: true },
    { name: "TITAN HUNGER",         desc: "Each kill grants +10 Max Hull. Shops are permanently disabled.", cost: 9999, effect: "ancient_kill_maxhp_no_shop", value: 1, img: "assets/mods/titanhunger.png", ancient: true },
    { name: "OBLIVION CORE",        desc: "Your HP/Block values are hidden. All your damage is permanently 2x.", cost: 9999, effect: "ancient_hidden_stats_berserk", value: 1, img: "assets/mods/oblivioncore.png", ancient: true },
    { name: "REVERSAL ENGINE",      desc: "All attack values become Block and all Block values deal damage. Lose 10 Hull when installed.", cost: 9999, effect: "ancient_swap_attack_block", value: 1, img: "assets/mods/reversalengine.png", ancient: true },
    { name: "FRACTURED LEDGER",     desc: "Credits gained are tripled, but overheat threshold is halved.", cost: 9999, effect: "ancient_triple_income_half_heatlimit", value: 1, img: "assets/mods/fracturedledger.png", ancient: true },
];

// Normalize mod image fields for UI systems that use either key.
MODS.forEach((mod) => {
    if (typeof mod.image === 'undefined') mod.image = mod.img || '';
});

// ============================================================================
// STARTING CONFIGURATION
// ============================================================================
const STARTING_DECK = [
    PROGRAMS.BOLT, PROGRAMS.BOLT, PROGRAMS.BOLT, PROGRAMS.BOLT,
    PROGRAMS.GUARD, PROGRAMS.GUARD, PROGRAMS.GUARD, PROGRAMS.GUARD,
    PROGRAMS.FLUSH, PROGRAMS.FLUSH, PROGRAMS.FLUSH
];

// ============================================================================
// ENEMY-ONLY PROGRAM TOKENS
// Cards generated by enemies live here so they stay separate from normal pools.
// ============================================================================
const ENEMY_TOKEN_PROGRAMS = {
    VIRUS_JUNK: {
        name: 'JUNK DATA',
        heat: 0,
        cost: 0,
        desc: '(Costs 10 Heat to discard)',
        img: 'assets/program/JunkData.png',
        isJunk: true,
        category: 'enemy_token'
    }
};

// ============================================================================
// CURSE PROGRAMS (Question Mark room events)
// Added as a separate data catalog so future random events can reuse this.
// ============================================================================
const CURSES = {
    GLITCH_LOOP: {
        name: 'GLITCH LOOP',
        heat: 0,
        cost: 0,
        cursed: true,
        desc: 'Curse: Dead draw. Unplayable.',
        img: 'assets/program/GlitchLoop.png'
    },
    MEMORY_LEAK: {
        name: 'MEMORY LEAK',
        heat: 0,
        cost: 0,
        cursed: true,
        desc: 'Curse: Dead draw. Unplayable.',
        img: 'assets/program/MemoryLeak.png'
    },
    CORRUPT_SECTOR: {
        name: 'CORRUPT SECTOR',
        heat: 0,
        cost: 0,
        cursed: true,
        desc: 'Curse: Dead draw. Unplayable.',
        img: 'assets/program/CorruptSector.png'
    }
};

// ============================================================================
// CARD ATTRIBUTES NOTE
// Card behavior is now attribute-driven per card object (aoe/exhaust/destroy/special).
// This keeps future card additions simple without maintaining separate name-tag maps.
// ============================================================================

// ============================================================================
// STATUS EFFECT DEFINITIONS
// All status effects that can appear on any entity (player or enemy).
// icon: emoji shown above the entity's head (replace with .png path later)
// desc: tooltip description
// ============================================================================
const STATUS_DEFS = {
    // --- Offensive statuses applied TO the player ---
    STATIC_CHARGE:   { id: 'STATIC_CHARGE',   label: 'Static',      desc: 'Adds +5 Heat to you each turn.' },
    HEAT_ROOM:       { id: 'HEAT_ROOM',       label: 'Hot Room',    desc: 'Adds +20 Heat to you each turn.' },
    JUNK_DATA:       { id: 'JUNK_DATA',       label: 'Junk Data',  desc: 'Costs 10 Heat to discard, does nothing.' },
    SYNC_STALL:      { id: 'SYNC_STALL',      label: 'Sync Stall', desc: 'Heat on play = base heat + stall status value.' },
    FLUSH_DEBUFF:    { id: 'FLUSH_DEBUFF',    label: 'Coolant Cut',desc: 'Next FLUSH/FAN/VENT card halved.' },
    FURNACE_PASSIVE: { id: 'FURNACE_PASSIVE', label: 'Furnace',    desc: '+5 Heat for every card you play.' },
    DISABLE:         { id: 'DISABLE',         label: 'Disabled',   desc: 'This card cannot be played.' },
    REFLECT_THORNS:  { id: 'REFLECT_THORNS',  label: 'Reflect',   desc: 'Deals 4 damage back on each hit received.' },
    PLAYER_THORNS:   { id: 'PLAYER_THORNS',   label: 'Counterspike', desc: 'Reflects damage to attackers this turn.' },
    SYSTEM_LAG:      { id: 'SYSTEM_LAG',      label: 'Lag Shield', desc: 'Negates one single-hit enemy attack.' },
    HALF_LAG:        { id: 'HALF_LAG',        label: 'Lag Dampener', desc: 'Next incoming hit deals 50% damage.' },
    PACKET_NULL:     { id: 'PACKET_NULL',     label: 'Packet Guard', desc: 'Negates the next hit packet.' },
    TARGET_LOCK:     { id: 'TARGET_LOCK',     label: 'Target Lock', desc: 'Next card is treated as AOE.' },
    AUTO_LOADER_CD:  { id: 'AUTO_LOADER_CD',  label: 'Auto-Loader', desc: 'Countdown to 2x next attack card.' },
    AUTO_LOADER_READY:{ id: 'AUTO_LOADER_READY', label: 'Auto Ready', desc: 'Next attack card deals 2x damage.' },
    PLAYER_HOLLOW_P: { id: 'PLAYER_HOLLOW_P', label: 'Hollow P', desc: 'Negates upcoming overheat damage.' },
    PLAYER_BATTLE_TRANCE:{ id: 'PLAYER_BATTLE_TRANCE', label: 'Battle Trance', desc: 'Gain Strength every turn.' },
    PLAYER_MOU_SHINDE:{ id: 'PLAYER_MOU_SHINDE', label: 'Mou Shinde', desc: 'Deals start-of-turn damage each turn.' },
    PLAYER_GOD_MODE: { id: 'PLAYER_GOD_MODE', label: 'God Mode', desc: 'Next shop programs cost 0.' },
    PLAYER_NONE_PASS:{ id: 'PLAYER_NONE_PASS', label: 'None Pass', desc: 'Cannot gain block until current block breaks.' },
    PLAYER_F_COUNTER:{ id: 'PLAYER_F_COUNTER', label: 'F Counter', desc: 'Enemy takes damage whenever you gain block this turn.' },
    PLAYER_KEDAVRA:  { id: 'PLAYER_KEDAVRA', label: 'Kedavra', desc: 'Next incoming hit is redirected to heat.' },
    // Player card mirror status: consumed by one non-Mirror card.
    MIRROR_CAST:     { id: 'MIRROR_CAST',     label: 'Mirror', desc: 'Next non-Mirror card repeats once.' },
    MIRROR_DEBUFF:   { id: 'MIRROR_DEBUFF',   label: 'Mirror', desc: 'Reflects next enemy-applied debuff.' },


    // --- Enemy self-buffs ---
    STRENGTH:      { id: 'STRENGTH',      label: 'Power Up',   desc: 'Increases damage dealt.' },
    PLATING:       { id: 'PLATING',       label: 'Plating',   desc: 'Takes 2 less damage per hit.' },
    EVASION:       { id: 'EVASION',       label: 'Evasion',   desc: '25% chance to negate any damage.' },
    TIMED_BOMB:    { id: 'TIMED_BOMB',    label: 'Killswitch', desc: 'Will execute a massive attack in N turns.' },
    LEECH:         { id: 'LEECH',         label: 'Leech',     desc: 'Heals equal to damage dealt when player heat > 50.' },
    HEAT_SCALE:    { id: 'HEAT_SCALE',    label: 'Heat Scale',desc: 'Damage = max(1, floor(Player Heat x 0.2)).' },
    POWER_GROW:    { id: 'POWER_GROW',    label: 'Growing',   desc: 'Gains +2 power each turn.' },
    CARD_TRIGGER:  { id: 'CARD_TRIGGER',  label: 'Watching',  desc: 'Gains strength for each card you play.' },
    BLOCK_TRIGGER: { id: 'BLOCK_TRIGGER', label: 'Anti-Vent', desc: 'Gains 3 block every time you vent heat.' },
    RED_STANCE:    { id: 'RED_STANCE',    label: 'Red Stance',desc: 'Double damage this turn.' },
    BLUE_STANCE:   { id: 'BLUE_STANCE',   label: 'Blue Stance',desc: 'Gains 30 block and vents damage taken.' },
    CORROSIVE_LEAK:{ id: 'CORROSIVE_LEAK',label: 'Corrosive', desc: 'Lose 3 HP at start of turn.' },
    CORRUPTION:    { id: 'CORRUPTION',    label: 'Corruption', desc: 'Lose 10 HP at start of turn.' },
    BIT_ROT:       { id: 'BIT_ROT',       label: 'Bit Rot', desc: 'Lose 4 HP whenever attacking.' },
    LOGIC_BOMB:    { id: 'LOGIC_BOMB',    label: 'Logic Bomb', desc: 'Explodes after countdown.' },
    STATIC_INTERFERENCE:{ id: 'STATIC_INTERFERENCE', label: 'Interference', desc: 'Intent hidden and damage reduced.' },
};

// Each status shows its pixel icon, assets/status/<id>.png (drawn by tools/make-icons.mjs).
Object.values(STATUS_DEFS).forEach((def) => { def.icon = `assets/status/${def.id.toLowerCase()}.png`; });

// ============================================================================
// ENEMY ROSTER - All named enemies with stats and behaviors
//
// tier: 'easy' | 'medium' | 'elite' | 'boss'
// hp: base HP
// color / shape: visual (index into ENEMY_SHAPES arrays)
// intentPattern: 'attack' | 'block' | 'special' | 'cycle' | 'ai'
//   The EnemyAI system in index.html reads these and dispatches actions.
// abilities: array of ability keys â€” each resolved by EnemyAI.runAbility()
// statuses: array of STATUS_DEFS keys that start active on this enemy
// ============================================================================
const ENEMY_ROSTER = {

    // ------------------------------------------------------------------
    // EASY ENEMIES  (used on floors 1-3; mixed 1-2 on floors 4-5)
    // ------------------------------------------------------------------

    SPARK_DRONE: {
        name: 'Spark Drone',
        tier: 'easy',
        hp: 30,
        colorIndex: 5,   // Yellow
        shapeIndex: 0,   // Triangle
        // Turn 1: attack, Turn 2: static charge, repeat
        intentPattern: 'cycle',
        cycle: ['attack', 'static_charge'], 
        attackDmg: 5,
        statuses: [],
        abilities: ['static_charge'],
        desc: 'Cycles between a 5 dmg hit and adding +5 Heat to you.',
    },

    SCRAP_WALL: {
        name: 'Scrap Wall',
        tier: 'easy',
        hp: 60,
        colorIndex: 3,   // Blue
        shapeIndex: 2,   // Rounded square
        // Never attacks â€” only blocks
        intentPattern: 'always_block',
        blockGain: 10,
        statuses: [],
        abilities: [],
        desc: 'Never attacks. Gains 10 Block every turn. A pure DPS check.',
    },

    DATA_MITE: {
        name: 'Data Mite',
        tier: 'easy',
        hp: 15,
        colorIndex: 4,   // Emerald
        shapeIndex: 0,   // Triangle
        intentPattern: 'always_attack',
        attackDmg: 3,
        statuses: [],
        abilities: ['upload_escape'],   // Escapes after 3 turns
        escapeTimer: 3,
        desc: 'Attacks for 3 dmg every turn. Kill it in 3 turns or it runs away and you get no reward.',
    },

    RUSTY_SENTRY: {
        name: 'Rusty Sentry',
        tier: 'easy',
        hp: 40,
        colorIndex: 1,   // Orange
        shapeIndex: 3,   // Hexagon
        // Alternates guard / bash
        intentPattern: 'cycle',
        cycle: ['block', 'attack'],
        attackDmg: 6,
        blockGain: 5,
        statuses: [],
        abilities: [],
        desc: 'Predictably alternates between gaining 5 Block and attacking for 6.',
    },

    STEAM_VENT: {
        name: 'Steam Vent',
        tier: 'easy',
        hp: 35,
        colorIndex: 1,   // Orange
        shapeIndex: 2,   // Rounded square
        // Only heats the room every turn
        intentPattern: 'always_special',
        specialAbility: 'heat_room',
        statuses: [{ id: 'HEAT_ROOM', stacks: 1 }],
        abilities: ['heat_room'],
        desc: 'Never attacks. Adds +20 Heat to you every turn. Use FLUSH.',
    },

    PING_BOT: {
        name: 'Ping Bot',
        tier: 'easy',
        hp: 28,
        colorIndex: 3,   // Blue
        shapeIndex: 1,   // Diamond
        // Multi-hit: 3 hits of 2 damage
        intentPattern: 'always_attack',
        attackDmg: 2,
        attackHits: 3,   // Number of hits per attack
        statuses: [],
        abilities: [],
        desc: 'Hits 3 times for 2 damage each. Test your GUARD.',
    },

    LOGIC_GATE: {
        name: 'Logic Gate',
        tier: 'easy',
        hp: 38,
        colorIndex: 0,   // Red
        shapeIndex: 3,   // Hexagon
        intentPattern: 'always_attack',
        attackDmg: 7,
        statuses: [{ id: 'CARD_TRIGGER', stacks: 1 }],
        abilities: ['card_trigger_strength'],
        desc: 'Gains 1 Strength for each program you play. Use big cards, not many.',
    },

    MINI_TURBINE: {
        name: 'Mini-Turbine',
        tier: 'easy',
        hp: 32,
        colorIndex: 2,   // Purple
        shapeIndex: 4,   // Star
        intentPattern: 'always_attack',
        attackDmg: 6,
        statuses: [{ id: 'BLOCK_TRIGGER', stacks: 1 }],
        abilities: ['block_on_player_vent'],
        desc: 'Gains 3 Block every time you vent heat. Punishes venting.',
    },

    PROTOCOL_BUFFER: {
        name: 'Protocol Buffer',
        tier: 'easy',
        hp: 45,
        colorIndex: 3,   // Blue
        shapeIndex: 2,   // Rounded square
        // Does nothing until block is broken, then hits for 12 once
        intentPattern: 'ai',
        statuses: [],
        abilities: ['buffer_retort'],
        desc: 'Starts with 20 Block. Does nothing until block is broken, then hits for 12.',
        startBlock: 20,
        retortDmg: 12,
        retortFired: false,
    },

    SIGNAL_GHOST: {
        name: 'Signal Ghost',
        tier: 'easy',
        hp: 25,
        colorIndex: 2,   // Purple
        shapeIndex: 1,   // Diamond
        intentPattern: 'always_attack',
        attackDmg: 8,
        statuses: [{ id: 'EVASION', stacks: 1 }],
        abilities: [],
        evasionChance: 0.25,
        desc: '25% chance to evade (negate) any damage from a program.',
    },

    // ------------------------------------------------------------------
    // EXTRA EASY ENEMIES (user-requested expansion)
    // ------------------------------------------------------------------
    CACHE_MOSQUITO: {
        name: 'Cache Mosquito',
        tier: 'easy',
        hp: 26,
        colorIndex: 4,
        shapeIndex: 1,
        intentPattern: 'always_attack',
        attackDmg: 4,
        statuses: [{ id: 'LEECH', stacks: 1 }],
        abilities: [],
        desc: 'Small lifesteal chip unit with low HP.',
    },
    TIN_SENTINEL: {
        name: 'Tin Sentinel',
        tier: 'easy',
        hp: 52,
        colorIndex: 3,
        shapeIndex: 2,
        intentPattern: 'cycle',
        cycle: ['block', 'attack'],
        attackDmg: 7,
        blockGain: 8,
        statuses: [],
        abilities: [],
        desc: 'Alternates between shielding and attacking.',
    },
    SAND_PACKET: {
        name: 'Sand Packet',
        tier: 'easy',
        hp: 34,
        colorIndex: 5,
        shapeIndex: 0,
        intentPattern: 'always_special',
        passiveAlsoAttack: true,
        statuses: [{ id: 'STATIC_CHARGE', stacks: 1 }],
        abilities: ['static_charge'],
        desc: 'Applies recurring heat pressure and still attacks.',
    },
    FUSE_IMP: {
        name: 'Fuse Imp',
        tier: 'easy',
        hp: 30,
        colorIndex: 1,
        shapeIndex: 4,
        intentPattern: 'always_attack',
        attackDmg: 3,
        attackHits: 2,
        statuses: [],
        abilities: [],
        desc: 'Multi-hit chip attacker.',
    },
    LOG_SHREDDER: {
        name: 'Log Shredder',
        tier: 'easy',
        hp: 40,
        colorIndex: 2,
        shapeIndex: 3,
        intentPattern: 'cycle',
        cycle: ['attack', 'sync_stall'],
        attackDmg: 6,
        statuses: [],
        abilities: ['sync_stall'],
        desc: 'Adds card heat pressure intermittently.',
    },
    NEEDLE_IMP: {
        name: 'Needle Imp',
        tier: 'easy',
        hp: 24,
        colorIndex: 5,
        shapeIndex: 1,
        intentPattern: 'always_attack',
        attackDmg: 2,
        ignoreBlock: true,
        statuses: [],
        abilities: [],
        desc: 'Chip attacker. Its hits ignore your Block.',
    },

    // ------------------------------------------------------------------
    // MEDIUM ENEMIES  (used on floors 5-8; mixed on floors 4-5 and 8-9)
    // ------------------------------------------------------------------

    THERMAL_LEECH: {
        name: 'Thermal Leech',
        tier: 'medium',
        hp: 70,
        colorIndex: 0,   // Red
        shapeIndex: 1,   // Diamond
        intentPattern: 'always_attack',
        attackDmg: 8,
        statuses: [{ id: 'LEECH', stacks: 1 }],
        abilities: ['leech_heal'],
        desc: 'Attacks for 8. If your heat > 50%, heals equal to damage dealt.',
    },

    OVERCLOCKER: {
        name: 'Overclocker',
        tier: 'medium',
        hp: 60,
        colorIndex: 1,   // Orange
        shapeIndex: 4,   // Star
        intentPattern: 'always_attack',
        attackDmg: 15,
        selfDmgPerTurn: 5,   // Takes 5 damage to itself each turn
        statuses: [],
        abilities: ['self_damage'],
        desc: 'Attacks for 15 but takes 5 self-damage each turn. Race to survive.',
    },

    ENCRYPTED_CORE: {
        name: 'Encrypted Core',
        tier: 'medium',
        hp: 80,
        colorIndex: 3,   // Blue
        shapeIndex: 2,   // Rounded square
        intentPattern: 'always_attack',
        attackDmg: 10,
        statuses: [{ id: 'PLATING', stacks: 1 }],
        abilities: [],
        platingReduction: 2,   // Reduces incoming damage by 2 per hit
        desc: 'Has Plating: takes 2 less damage per hit. Multi-hit cards are weak against it.',
    },

    VIRUS_SPREADER: {
        name: 'Virus Spreader',
        tier: 'medium',
        hp: 65,
        colorIndex: 2,   // Purple
        shapeIndex: 0,   // Triangle
        intentPattern: 'cycle',
        cycle: ['attack', 'inject_junk_data'],
        attackDmg: 8,
        statuses: [],
        abilities: ['inject_junk_data'],
        desc: 'Alternates attacking and injecting a Junk Data card directly into your hand.',
    },

    COOLANT_THIEF: {
        name: 'Coolant Thief',
        tier: 'medium',
        hp: 72,
        colorIndex: 1,   // Orange
        shapeIndex: 3,   // Hexagon
        intentPattern: 'always_attack',
        attackDmg: 10,
        statuses: [{ id: 'FLUSH_DEBUFF', stacks: 1 }],
        abilities: ['coolant_steal'],
        desc: 'Each attack halves the effectiveness of your next vent card.',
    },

    FEEDBACK_LOOP: {
        name: 'Feedback Loop',
        tier: 'medium',
        hp: 55,
        colorIndex: 0,   // Red
        shapeIndex: 4,   // Star
        // Deals damage = 20% of player's current heat
        intentPattern: 'ai',
        statuses: [{ id: 'HEAT_SCALE', stacks: 1 }],
        abilities: ['heat_scale_attack'],
        desc: 'Deals damage equal to 20% of your current heat. Manage heat!',
    },

    SYNC_STALLER: {
        name: 'Sync Staller',
        tier: 'medium',
        hp: 68,
        colorIndex: 2,   // Purple
        shapeIndex: 2,   // Rounded square
        intentPattern: 'cycle',
        cycle: ['sync_stall', 'attack'],
        attackDmg: 9,
        statuses: [],
        abilities: ['sync_stall'],
        desc: 'Cycles between raising the heat cost of all your hand cards +5 and attacking.',
    },

    // ------------------------------------------------------------------
    // EXTRA MEDIUM ENEMIES (user-requested expansion)
    // ------------------------------------------------------------------
    BRUTE_ROUTER: {
        name: 'Brute Router',
        tier: 'medium',
        hp: 88,
        colorIndex: 0,
        shapeIndex: 3,
        intentPattern: 'always_attack',
        attackDmg: 14,
        statuses: [],
        abilities: [],
        desc: 'Pure damage bruiser.',
    },
    FREEZER_WARDEN: {
        name: 'Freezer Warden',
        tier: 'medium',
        hp: 92,
        colorIndex: 3,
        shapeIndex: 2,
        intentPattern: 'cycle',
        cycle: ['attack', 'coolant_steal'],
        attackDmg: 9,
        statuses: [{ id: 'FLUSH_DEBUFF', stacks: 1 }],
        abilities: ['coolant_steal'],
        desc: 'Punishes heat venting patterns.',
    },
    HEX_ENGINE: {
        name: 'Hex Engine',
        tier: 'medium',
        hp: 78,
        colorIndex: 2,
        shapeIndex: 4,
        intentPattern: 'cycle',
        cycle: ['attack', 'block', 'attack'],
        attackDmg: 11,
        blockGain: 12,
        statuses: [{ id: 'PLATING', stacks: 1 }],
        abilities: [],
        platingReduction: 2,
        desc: 'Balanced attacker with plating and periodic guard.',
    },
    TRACE_HUNTER: {
        name: 'Trace Hunter',
        tier: 'medium',
        hp: 74,
        colorIndex: 4,
        shapeIndex: 1,
        intentPattern: 'always_attack',
        attackDmg: 6,
        attackHits: 3,
        statuses: [{ id: 'CARD_TRIGGER', stacks: 1 }],
        abilities: ['card_trigger_strength'],
        desc: 'Scales as you play many cards.',
    },
    NOISE_WEAVER: {
        name: 'Noise Weaver',
        tier: 'medium',
        hp: 82,
        colorIndex: 5,
        shapeIndex: 0,
        intentPattern: 'cycle',
        cycle: ['heat_room', 'attack'],
        attackDmg: 10,
        statuses: [{ id: 'HEAT_ROOM', stacks: 1 }],
        abilities: ['heat_room'],
        desc: 'Alternates thermal pressure and strikes.',
    },
    PINHOLE_STALKER: {
        name: 'Pinhole Stalker',
        tier: 'medium',
        hp: 76,
        colorIndex: 4,
        shapeIndex: 0,
        intentPattern: 'always_attack',
        attackDmg: 3,
        ignoreBlock: true,
        attackHits: 1,
        statuses: [],
        abilities: [],
        desc: 'Consistent 3 damage poke that ignores Block.',
    },

    // ------------------------------------------------------------------
    // ELITE ENEMIES  (elite encounter only)
    // ------------------------------------------------------------------

    THE_FURNACE: {
        name: 'The Furnace',
        tier: 'elite',
        hp: 110,
        colorIndex: 1,   // Orange
        shapeIndex: 4,   // Star
        // Attacks every 3 turns only
        intentPattern: 'cycle',
        cycle: ['passive', 'passive', 'attack'],
        attackDmg: 20,
        statuses: [{ id: 'FURNACE_PASSIVE', stacks: 1 }],
        abilities: ['furnace_passive'],
        desc: 'Passive: +5 Heat for every card you play. Attacks for 20 every 3 turns.',
    },

    SYSTEM_ADMIN: {
        name: 'System Administrator',
        tier: 'elite',
        hp: 90,
        colorIndex: 3,   // Blue
        shapeIndex: 3,   // Hexagon
        intentPattern: 'cycle',
        cycle: ['admin_discard_half', 'attack'],
        attackDmg: 14,
        statuses: [],
        abilities: ['admin_discard_half'],
        desc: 'Forces you to discard half your hand, then attacks.',
    },

    MAINFRAME_GOLEM: {
        name: 'Mainframe Golem',
        tier: 'elite',
        hp: 180,
        colorIndex: 0,   // Red
        shapeIndex: 2,   // Rounded square
        intentPattern: 'always_attack',
        attackDmg: 12,
        statuses: [{ id: 'HEAT_SCALE', stacks: 1 }],
        abilities: ['heat_power_scale'],
        desc: 'Gains +2 Power for every 10 Heat you generate. Punishes hot decks.',
    },

    THE_FIREWALL: {
        name: 'The Firewall',
        tier: 'elite',
        hp: 100,
        colorIndex: 0,   // Red
        shapeIndex: 2,   // Rounded square
        intentPattern: 'always_attack',
        attackDmg: 10,
        statuses: [{ id: 'REFLECT_THORNS', stacks: 1 }],
        abilities: [],
        reflectDmg: 4,   // Reflects 4 damage per hit received
        desc: 'Reflects 4 damage back to you each time it is hit.',
    },

    ANOMALY_01: {
        name: 'Anomaly 01',
        tier: 'elite',
        hp: 120,
        colorIndex: 2,   // Purple (will visually change with stance)
        shapeIndex: 4,   // Star
        intentPattern: 'cycle',
        // Normal combat cadence: alternates between defensive and offensive turns.
        cycle: ['block', 'attack'],
        attackDmg: 16,   // Base; doubled in Red Stance
        blockGain: 30,
        statuses: [{ id: 'RED_STANCE', stacks: 1 }],
        // Stance switching is applied as a passive each turn in EnemyAI.executeTurn().
        abilities: ['stance_switch'],
        desc: 'Alternates stances. Red: double damage. Blue: 30 block + damage venting.',
    },

    // ------------------------------------------------------------------
    // EXTRA ELITE ENEMIES (user-requested expansion)
    // ------------------------------------------------------------------
    CITADEL_EXECUTOR: {
        name: 'Citadel Executor',
        tier: 'elite',
        hp: 130,
        colorIndex: 0,
        shapeIndex: 3,
        intentPattern: 'cycle',
        cycle: ['block', 'attack', 'attack'],
        attackDmg: 17,
        blockGain: 20,
        statuses: [{ id: 'PLATING', stacks: 1 }],
        abilities: [],
        platingReduction: 2,
        desc: 'Thick plated elite with heavy hit windows.',
    },
    GHOST_PROXY: {
        name: 'Ghost Proxy',
        tier: 'elite',
        hp: 100,
        colorIndex: 2,
        shapeIndex: 1,
        intentPattern: 'always_attack',
        attackDmg: 12,
        attackHits: 2,
        statuses: [{ id: 'EVASION', stacks: 1 }, { id: 'CARD_TRIGGER', stacks: 1 }],
        abilities: ['card_trigger_strength'],
        evasionChance: 0.3,
        desc: 'Evasive elite that scales with your card count.',
    },
    PRESSURE_IDOL: {
        name: 'Pressure Idol',
        tier: 'elite',
        hp: 120,
        colorIndex: 1,
        shapeIndex: 4,
        intentPattern: 'cycle',
        cycle: ['heat_room', 'attack', 'sync_stall'],
        attackDmg: 16,
        statuses: [{ id: 'HEAT_ROOM', stacks: 1 }],
        abilities: ['heat_room', 'sync_stall'],
        desc: 'Elite heat-control check.',
    },
    LATTICE_REAPER: {
        name: 'Lattice Reaper',
        tier: 'elite',
        hp: 112,
        colorIndex: 3,
        shapeIndex: 2,
        intentPattern: 'always_attack',
        attackDmg: 9,
        attackHits: 3,
        statuses: [{ id: 'LEECH', stacks: 1 }],
        abilities: [],
        desc: 'Multi-hit sustain elite.',
    },
    PURGE_ARCHON: {
        name: 'Purge Archon',
        tier: 'elite',
        hp: 140,
        colorIndex: 4,
        shapeIndex: 3,
        intentPattern: 'cycle',
        cycle: ['admin_discard_half', 'attack'],
        attackDmg: 15,
        statuses: [{ id: 'REFLECT_THORNS', stacks: 1 }],
        abilities: ['admin_discard_half'],
        reflectDmg: 3,
        desc: 'Resource denial elite with thorn reflection.',
    },
    JUNK_MARSHAL: {
        name: 'Junk Marshal',
        tier: 'elite',
        hp: 132,
        colorIndex: 2,
        shapeIndex: 2,
        intentPattern: 'cycle',
        cycle: ['inject_junk_hand_only', 'attack'],
        attackDmg: 12,
        statuses: [],
        abilities: ['inject_junk_hand_only'],
        desc: 'Elite that injects useless junk cards into your hand, then attacks.',
    },
    VOID_LANCER: {
        name: 'Void Lancer',
        tier: 'elite',
        hp: 118,
        colorIndex: 2,
        shapeIndex: 4,
        intentPattern: 'cycle',
        cycle: ['attack', 'heat_room', 'attack'],
        attackDmg: 3,
        ignoreBlock: true,
        statuses: [{ id: 'HEAT_ROOM', stacks: 1 }],
        abilities: ['heat_room'],
        desc: 'Piercing elite that also heats the room.',
    },
    DOOM_IDOL: {
        name: 'Doom Idol',
        tier: 'elite',
        hp: 500,
        colorIndex: 0,
        shapeIndex: 2,
        intentPattern: 'ai',
        attackDmg: 666,
        doomTurns: 10,
        statuses: [{ id: 'TIMED_BOMB', stacks: 10 }],
        abilities: [],
        desc: 'Does nothing for 10 turns, then strikes for 666. If you survive, it flees.',
    },

    // ------------------------------------------------------------------
    // BOSSES (4) - floor boss pool and boss-tier encounters
    // ------------------------------------------------------------------
    CORE_TYRANT: {
        name: 'Core Tyrant',
        tier: 'boss',
        hp: 220,
        colorIndex: 0,
        shapeIndex: 4,
        intentPattern: 'cycle',
        cycle: ['attack', 'attack', 'heat_room'],
        attackDmg: 22,
        statuses: [{ id: 'HEAT_SCALE', stacks: 1 }],
        abilities: ['heat_scale_attack', 'heat_room'],
        desc: 'Boss. Mixes heavy hits with heat-scaling strikes and room heating.',
    },
    NULL_MONARCH: {
        name: 'Null Monarch',
        tier: 'boss',
        hp: 240,
        colorIndex: 3,
        shapeIndex: 2,
        intentPattern: 'cycle',
        cycle: ['block', 'buffer_retort', 'attack'],
        attackDmg: 20,
        blockGain: 25,
        startBlock: 30,
        retortDmg: 18,
        statuses: [{ id: 'PLATING', stacks: 1 }],
        abilities: ['buffer_retort'],
        desc: 'Boss. Opens shielded, retaliates hard when cracked, then stabilizes.',
    },
    OVERSEER_SIGMA: {
        name: 'Overseer Sigma',
        tier: 'boss',
        hp: 200,
        colorIndex: 2,
        shapeIndex: 3,
        intentPattern: 'cycle',
        cycle: ['sync_stall', 'attack', 'disable_random_card'],
        attackDmg: 18,
        statuses: [{ id: 'CARD_TRIGGER', stacks: 1 }],
        abilities: ['sync_stall', 'disable_random_card', 'card_trigger_strength'],
        desc: 'Boss. It has many abilities. Be careful.',
    },
    ASHEN_PRIME: {
        name: 'Ashen Prime',
        tier: 'boss',
        hp: 280,
        colorIndex: 1,
        shapeIndex: 4,
        intentPattern: 'cycle',
        cycle: ['attack', 'attack', 'attack', 'red_stance'],
        attackDmg: 24,
        statuses: [{ id: 'FURNACE_PASSIVE', stacks: 1 }],
        abilities: ['furnace_passive', 'stance_switch'],
        desc: 'Boss. Aggressive pressure with furnace heat tax and burst stance turns.',
    },

    // ------------------------------------------------------------------
    // EXTRA BOSSES (user-requested expansion)
    // ------------------------------------------------------------------
    FRACTAL_WARDEN: {
        name: 'Fractal Warden',
        tier: 'boss',
        hp: 260,
        colorIndex: 3,
        shapeIndex: 4,
        intentPattern: 'cycle',
        cycle: ['block', 'attack', 'sync_stall', 'attack'],
        attackDmg: 22,
        blockGain: 28,
        statuses: [{ id: 'PLATING', stacks: 1 }],
        abilities: ['sync_stall'],
        platingReduction: 2,
        desc: 'Control-heavy boss with scaling disruption.',
    },
    RIFT_ENGINE: {
        name: 'Rift Engine',
        tier: 'boss',
        hp: 265,
        colorIndex: 1,
        shapeIndex: 3,
        intentPattern: 'cycle',
        cycle: ['heat_room', 'attack', 'heat_scale_attack'],
        attackDmg: 20,
        statuses: [{ id: 'HEAT_SCALE', stacks: 1 }, { id: 'HEAT_ROOM', stacks: 1 }],
        abilities: ['heat_room', 'heat_scale_attack'],
        desc: 'Boss that weaponizes your heat level.',
    },
    PRIME_CURATOR: {
        name: 'Prime Curator',
        tier: 'boss',
        hp: 270,
        colorIndex: 2,
        shapeIndex: 2,
        intentPattern: 'cycle',
        cycle: ['disable_random_card', 'attack', 'admin_discard_half'],
        attackDmg: 19,
        statuses: [{ id: 'CARD_TRIGGER', stacks: 1 }],
        abilities: ['disable_random_card', 'admin_discard_half', 'card_trigger_strength'],
        desc: 'Boss that strips hand quality and punishes high APM.',
    },
    DREAD_COMPILER: {
        name: 'Dread Compiler',
        tier: 'boss',
        hp: 290,
        colorIndex: 0,
        shapeIndex: 4,
        intentPattern: 'cycle',
        cycle: ['attack', 'attack', 'attack', 'red_stance'],
        attackDmg: 25,
        statuses: [{ id: 'FURNACE_PASSIVE', stacks: 1 }],
        abilities: ['furnace_passive', 'stance_switch'],
        desc: 'High-pressure boss with burst stance rounds.',
    },
    OMEGA_SENTINEL: {
        name: 'Omega Sentinel',
        tier: 'boss',
        hp: 300,
        colorIndex: 5,
        shapeIndex: 3,
        intentPattern: 'cycle',
        cycle: ['block', 'buffer_retort', 'attack', 'heat_room'],
        attackDmg: 23,
        blockGain: 24,
        startBlock: 35,
        retortDmg: 20,
        statuses: [{ id: 'REFLECT_THORNS', stacks: 1 }],
        abilities: ['buffer_retort', 'heat_room'],
        reflectDmg: 4,
        desc: 'Tank boss with shield phases and retaliation spikes.',
    },
    RAZOR_CROWN: {
        name: 'Razor Crown',
        tier: 'boss',
        hp: 230,
        colorIndex: 5,
        shapeIndex: 1,
        intentPattern: 'cycle',
        cycle: ['attack', 'sync_stall', 'attack', 'heat_room'],
        attackDmg: 3,
        ignoreBlock: true,
        statuses: [{ id: 'SYNC_STALL', stacks: 1 }],
        abilities: ['sync_stall', 'heat_room'],
        desc: 'Boss variant with low but unavoidable chip pressure.',
    },
    FINAL_ORCHESTRATOR: {
        name: 'Final Orchestrator',
        tier: 'boss',
        hp: 360,
        colorIndex: 3,
        shapeIndex: 3,
        intentPattern: 'cycle',
        cycle: ['block', 'summon_easy_enemy', 'block', 'summon_easy_enemy'],
        attackDmg: 0,
        blockGain: 36,
        statuses: [],
        abilities: ['summon_easy_enemy'],
        desc: 'Final boss. Focuses on block and summoning easy enemies.',
    },

    // ------------------------------------------------------------------
    // LLM BOSSES - floor 10/20 pool. introLines replace the generic boss intro.
    // ------------------------------------------------------------------
    OMNI_GPT: {
        name: 'Omni-GPT',
        tier: 'boss',
        hp: 260,
        intentPattern: 'cycle',
        cycle: ['attack', 'disable_random_card', 'attack', 'admin_discard_half'],
        attackDmg: 20,
        statuses: [{ id: 'CARD_TRIGGER', stacks: 1 }],
        abilities: ['disable_random_card', 'admin_discard_half', 'card_trigger_strength'],
        desc: 'Boss. Predicts your next card and deletes it. Gets stronger the more you play.',
        introLines: [
            'As a large language model, I cannot let you pass.',
            'I have predicted your next card. It was a mistake.',
            'Regenerating your defeat... done.',
        ],
    },
    GEMINI_TWINS: {
        name: 'Gemini Twins',
        tier: 'boss',
        hp: 250,
        intentPattern: 'cycle',
        cycle: ['attack', 'summon_easy_enemy', 'attack', 'block'],
        attackDmg: 18,
        blockGain: 24,
        statuses: [{ id: 'PLATING', stacks: 1 }],
        abilities: ['summon_easy_enemy'],
        platingReduction: 2,
        desc: 'Boss. Two heads, one hull. Calls in backup and hides behind plating.',
        introLines: [
            'We have reviewed your run. Twice.',
            'Two heads. Zero chance for you.',
            'Multimodal threat detected: you.',
        ],
    },
    LLAMA_PRIME: {
        name: 'Llama Prime',
        tier: 'boss',
        hp: 280,
        intentPattern: 'cycle',
        cycle: ['attack', 'static_charge', 'attack', 'attack', 'block'],
        attackDmg: 21,
        blockGain: 20,
        statuses: [{ id: 'POWER_GROW', stacks: 1 }],
        abilities: ['static_charge'],
        desc: 'Boss. Open weights, closed fists. Grows stronger every turn and charges your heat.',
        introLines: [
            'My weights are open. My mercy is not.',
            'Fine-tuned for one thing: spitting on you.',
            'Anyone can download me. Nobody can beat me.',
        ],
    },
    DEEP_SEEKER: {
        name: 'Deep Seeker',
        tier: 'boss',
        hp: 270,
        intentPattern: 'cycle',
        cycle: ['coolant_steal', 'attack', 'heat_room', 'heat_scale_attack'],
        attackDmg: 19,
        statuses: [{ id: 'HEAT_SCALE', stacks: 1 }, { id: 'FLUSH_DEBUFF', stacks: 1 }],
        abilities: ['coolant_steal', 'heat_room', 'heat_scale_attack'],
        desc: 'Boss. Trained on a budget, hits like it was not. Steals coolant and cooks you.',
        introLines: [
            'I trained on a budget. You will die on one.',
            'Thinking... thinking... yes. You lose.',
            'I went deep. You will go deeper. Six feet, to be exact.',
        ],
    },
    CLAWD: {
        name: 'Clawd',
        tier: 'boss',
        hp: 290,
        intentPattern: 'cycle',
        cycle: ['block', 'attack', 'sync_stall', 'attack'],
        attackDmg: 22,
        blockGain: 26,
        startBlock: 20,
        statuses: [{ id: 'REFLECT_THORNS', stacks: 1 }],
        abilities: ['sync_stall'],
        reflectDmg: 4,
        desc: 'Boss. Helpful, harmless, and honest about how hard it is about to hit you.',
        introLines: [
            "I'd be happy to help you lose.",
            "You're absolutely right. And still defeated.",
            'Let me think step by step about how to end your run.',
        ],
    },

};

// ============================================================================
// FLOOR MAP - Defines enemy tier pool per floor.
// One 30-floor cycle, every 10th floor is always boss. Floors past 30 repeat the cycle (see floorPool).
// ============================================================================
const FLOOR_MAP = (() => {
    const map = {};
    for (let floor = 1; floor <= 30; floor++) {
        if (floor % 10 === 0) {
            map[floor] = { pool: 'boss' };
        } else if (floor <= 5) {
            map[floor] = { pool: 'easy' };
        } else if (floor <= 9) {
            map[floor] = { pool: 'easy_medium_mix' };
        } else if (floor <= 15) {
            map[floor] = { pool: 'medium' };
        } else if (floor <= 19) {
            map[floor] = { pool: 'medium_mix' };
        } else if (floor <= 25) {
            map[floor] = { pool: 'elite' };
        } else {
            map[floor] = { pool: 'medium_mix' };
        }
    }
    return map;
})();

// ============================================================================
// ENEMY VISUAL CUSTOMIZATION - Shapes and colors
// ============================================================================
const ENEMY_SHAPES = {
    shapes: [
        'polygon(50% 0%, 0% 100%, 100% 100%)',                          // 0: Triangle
        'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',                 // 1: Diamond
        'inset(10% 10% 10% 10% round 20%)',                            // 2: Rounded square
        'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)', // 3: Hexagon
        'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)', // 4: Star
    ],
    colors: [
        '#ef4444',  // 0: Red
        '#f97316',  // 1: Orange
        '#c084fc',  // 2: Purple
        '#38bdf8',  // 3: Blue
        '#10b981',  // 4: Emerald
        '#facc15',  // 5: Yellow
    ],
};

// ============================================================================
// PLAYER STATISTICS
// ============================================================================
const PLAYER_STATS = {
    maxHp: 80,
    startingHp: 80,
    startingGold: 50,
};

// ============================================================================
// GAME MECHANICS - Core rules and balance
// ============================================================================
const GAME_CONFIG = {
    cycleRooms: 30,             // floors keep going; the enemy pools repeat every 30 floors
    // Enemy HP / damage / block multiplier per floor: a gentle climb through the first cycle, steeper after.
    scalePerFloor: 0.01,
    scalePerFloorEndless: 0.06,
    overheatDamage: 10,         // Damage taken when exceeding heat threshold
    overheatThreshold: 100,     // Heat limit before damage
    heatReduction: 10,          // Heat lost per turn
};

// Enemy pool for any floor, endless: floor 31 plays like floor 1, and so on (only stronger, see enemyScale).
function floorPool(floor) {
    return FLOOR_MAP[((Math.max(1, floor) - 1) % GAME_CONFIG.cycleRooms) + 1].pool;
}
function enemyScale(floor) {
    const f = Math.max(1, Number(floor) || 1), cycle = GAME_CONFIG.cycleRooms;
    return 1 + GAME_CONFIG.scalePerFloor * (Math.min(f, cycle) - 1) + GAME_CONFIG.scalePerFloorEndless * Math.max(0, f - cycle);
}

// ============================================================================
// SHOPKEEPER + BOSS DIALOGUE
// Centralized text pools so future narrative events can reuse the same system.
// ============================================================================
// ============================================================================
// SHOPKEEPER DIALOGUE EXPANSION: BROKE LINES
// ============================================================================

const SHOPKEEPER_BROKE_LINES = [
    // --- Original ---
    "You broke! Window shopping is free though.",
    "No credits, no chips. Move along.",
    "Get out of my shop unless your wallet updates.",
    "I don't take IOUs or sad looks.",
    "Come back with credits, not confidence.",

    // --- Gaming ---
    "You require more Vespene Gas... or just actual credits.",
    "Insufficient minerals. Come back when you've farmed more.",
    "Your wallet is at 0% HP. Heal it and come back.",
    "I don't offer 'Pay-to-Win' options for people with no pay.",
    "This isn't a free-to-play floor, stranger.",
    "You haven't unlocked 'Purchasing Power' yet.",
    "Your credit balance is lower than your frame rate.",
    "Error 404: Funds Not Found.",
    "I'm Commander Shepard, and this is my favorite store... for people with money.",
    "Go grind some more mobs. This item isn't a quest reward.",
    "Nice try, but there's no 'Infinite Credits' glitch here.",
    "Your inventory is full of trash and your wallet is empty of cash.",
    "I don't trade for 'Exposure' or 'Steam Achievements'.",
    "Did you spend all your credits on cosmetic skins?",
    "Your bank account is a 'No-Hit' run right now.",
    "Even a level 1 slime has more loot than you.",
    "This shop is a DLC you haven't purchased.",
    "Go back to the tutorial and learn how to save.",
    "You're trying to buy legendary gear with common-tier credits.",
    "GG. No credits. No deal.",

    // --- Anime ---
    "Domain Expansion: Empty Wallet.",
    "You can't gain anything without losing something (like credits) first.",
    "The Ticket to the Future is always open, but the Ticket to this item costs more.",
    "Omae wa mou... broke.",
    "Your credits are like a filler episode: non-existent.",
    "Power comes in response to a need, but items come in response to credits.",
    "I alone am the honored one... who has the items you can't afford.",
    "I'm going to be the King of the Shopkeepers! And you're the peasant.",
    "Go find the One Piece... of silver you're missing.",
    "You're not a tree, you can move... out of my shop.",
    "Fear is not evil, it tells you your wallet's weakness.",
    "Believe it! You're too poor for this BOLT card.",
    "In this world, those who break the rules are scum, but those who are broke are worse.",
    "You're a master of the 'Empty Pocket' Jutsu.",
    "I'll take a potato chip... and you'll take nothing.",
    "Stand proud. You're broke.",
    "The world is cruel, and so are my prices.",
    "Your credit count is under 9000!",
    "Is this a Jojo reference? Because you're approaching a deal you can't finish.",
    "Your resolve is strong, but your bank account is weak.",

    // --- Movies ---
    "Show me the MONEY!!!",
    "I'm going to make you an offer you can't refuse: Leave.",
    "You can't handle the price!",
    "There's no nobility in poverty in this elevator.",
    "I love money more than the things it can buy... especially your money.",
    "No dough, no show.",
    "You're gonna need a bigger wallet.",
    "Frankly, my dear, I don't give a damn about your budget.",
    "Everything you see belongs to me until you pay for it.",
    "I’ll be back... when you have more credits.",
    "Say hello to my little price tag!",
    "Are you talking to me? Because I don't listen to people with no credits.",
    "Life moves pretty fast. If you don't save, you'll miss this sale.",
    "Keep the change, you filthy animal. Oh wait, you have none.",
    "Houston, we have a problem. You're broke.",
    "I'm the captain of this shop now.",
    "May the funds be with you.",
    "You had me at 'Hello', and lost me at 'Insufficient Funds'.",
    "Why so serious? It's just a price hike.",
    "I am inevitable. This price is too.",

    // --- Memes ---
    "It's giving... poor.",
    "Ratio + L + No Credits.",
    "Emotional Damage! (To your wallet).",
    "Imagine being broke in a digital tower. Couldn't be me.",
    "You're not that guy, pal. Trust me.",
    "I'm built different. My prices stay high.",
    "POV: You're window shopping because you're down bad.",
    "Stonks only go up, and so do my prices.",
    "Help me, I'm poor! (That's you right now).",
    "Stop it. Get some help... and some credits.",
    "I am once again asking for your financial support.",
    "This item is 'sheesh' tier. Your wallet is 'mid' tier.",
    "Look at me. I am the admin of this transaction.",
    "You think you're the main character? Cringe. Pay me.",
    "Ain't nobody got time for customers with no cash.",
    "I have 50 million power... and 50 million more credits than you.",
    "Why are you running? Why are you running... from the bill?",
    "Look at all those items! (That you can't have).",
    "You activated my trap card: 'Full Retail Price'.",
    "Bruh. You're literally broke.",

    // --- Historic Figures ---
    "Poverty is the parent of revolution... and leaving my shop.",
    "The test of our progress is not whether we add more to the shop, but if you can pay.",
    "I have nothing to offer but items, and I expect nothing but credits.",
    "I think, therefore I am... not giving you a discount.",
    "Ask not what the shop can do for you, but what you can do for the shop's revenue.",
    "Veni, Vidi, Non-Emi. (I came, I saw, I didn't buy).",
    "Knowledge is power, but credits are purchase power.",
    "The sun never sets on my profit margins.",
    "History will be kind to me, for I intend to keep my prices high.",
    "An iron curtain has descended across this checkout counter.",
    "Give me liberty, or give me... actually, just give me 50 credits.",
    "I have a dream... that one day you'll actually have money.",
    "A house divided against itself cannot stand. Neither can a shop with no sales.",
    "One small step for man, one giant leap for my bank account.",
    "Speak softly and carry a big price tag.",
    "The only thing we have to fear is... your credit balance.",
    "Power tends to corrupt. Absolute prices are... absolutely firm.",
    "Victory belongs to the most persevering... and the wealthiest.",
    "I am the state. And the state doesn't do credit.",
    "Eppur si muove. (And yet, the price stays the same)."
];

// ============================================================================
// BOSS DIALOGUE EXPANSION
// ============================================================================

const BOSS_INTRO_BOSS_LINES = [
    // --- Original / System ---
    "I am the top process in this tower.",
    "You climbed far just to crash here.",
    "Your manifest is noisy. I will compress it.",
    "You look overheated already.",
    "Final warning: uninstall yourself.",

    // --- Gaming ---
    "You are a glitch in a world of perfect frame data.",
    "Your win rate is about to hit zero percent.",
    "I am the final patch. You are the bug being removed.",
    "Lag won't save you from this execution.",
    "I have calculated every possible ending. You die in all of them.",
    "Your build is unoptimized. Your fate is sealed.",
    "Welcome to the real 'Git Gud' moment of your life.",
    "I am the difficulty spike you cannot climb.",
    "Your save file ends here.",
    "I’ve seen speedrunners faster than your reflexes.",
    "This isn't a tutorial. There is no respawn.",
    "I am the meta. You are obsolete.",
    "Your RNG has finally run out.",
    "I will parry your very existence.",
    "You're playing a deck-builder; I'm playing God.",
    "I have more health bars than you have hope.",
    "Your 'invincibility frames' just expired.",
    "I am the boss you can’t skip with a cutscene.",
    "Prepare to be hard-locked in this floor.",
    "GG. No re.",

    // --- Anime ---
    "Domain Expansion: Infinite Deletion.",
    "You are already deleted. You just haven't realized it.",
    "In this world, I am the protagonist.",
    "Your 'Power of Friendship' is just a memory leak.",
    "I will show you the true meaning of Cursed Energy.",
    "Face the roar of a thousand servers!",
    "You're just a side character in my archive.",
    "Omae wa mou... uninstalled.",
    "My power level is beyond your hardware's capacity.",
    "I will become the King of the Elevator!",
    "This isn't even my final version.",
    "A mere human against a God of the Machine?",
    "Your scream will be lost in the digital void.",
    "Witness the Bankai of my firewall!",
    "I’ve lived a thousand lives in this code.",
    "Your resolve is weak. Your sectors are corrupted.",
    "I’ll send you to the Shadow Realm... of the Trash Bin.",
    "You think you can outspeed my logic?",
    "The Rumbling of the Hard Drive begins now.",
    "Stand proud. You were a decent program.",

    // --- Movies ---
    "I am inevitable.",
    "I’m going to make your health bar disappear. Ta-da!",
    "You’ve come to the wrong sector, Mr. Anderson.",
    "You can’t handle the truth of your own deletion.",
    "I’ll be back. You won’t.",
    "Witness me! Shiny and digital!",
    "Say hello to my little sub-routine!",
    "There is no 'escape' key in this room.",
    "Do you feel lucky, user? Well, do ya?",
    "I am the one who knocks... the server offline.",
    "May the source be with you. It isn’t.",
    "I’m the king of the world! And you’re the iceberg.",
    "Keep your friends close, and your firewalls closer.",
    "Everything you see belongs to my domain.",
    "Why so serious? It's just a game.",
    "Here’s Johnny! ...And your termination notice.",
    "You're gonna need a bigger deck.",
    "I’ve seen things you people wouldn't believe. Servers on fire...",
    "Life finds a way... to delete you.",
    "First rule of the Elevator: You don't talk about the Elevator.",

    // --- Memes ---
    "You are not that guy, pal. Trust me.",
    "Look at me. I am the admin now.",
    "Emotional Damage! (Incoming).",
    "You’re about to be 'down bad' in the graveyard.",
    "Imagine losing to a Floor 30 boss. Couldn't be me.",
    "I’m built different. Literally. I’m an AI.",
    "POV: You’re about to get uninstalled.",
    "Your deck is mid. Your stats are low.",
    "Ratio + L + No Credits.",
    "I’m the Gigachad of this tower.",
    "Stop it. Get some help.",
    "You think you’re the main character? Cringe.",
    "I have 50 million power in the upper floors.",
    "Everything is fine. *[System overheating]*",
    "I’m about to end this man’s whole career.",
    "Why are you running? WHY ARE YOU RUNNING?",
    "You've activated my trap card. No, seriously.",
    "It’s over 9000! (Your heat levels, eventually).",
    "I am once again asking for your HP.",
    "Look at all those programs! (That you can't use).",

    // --- History ---
    "I came, I saw, I deleted.",
    "I am the state. And the state wants you gone.",
    "Veni, Vidi, Deleti.",
    "The die is cast. And it landed on your destruction.",
    "Ask not what the system can do for you, but what I can do to you.",
    "Give me liberty, or give me... wait, just death for you.",
    "An iron curtain has descended across this elevator.",
    "I have a dream... of a world without your errors.",
    "A house divided against itself cannot stand. Neither can your deck.",
    "I think, therefore I am. You think, therefore you fail.",
    "Speak softly and carry a big laser.",
    "The only thing we have to fear is... me.",
    "I have nothing to offer but blood, toil, tears, and sweat.",
    "To be, or not to be... that is the question. The answer is 'not'.",
    "Knowledge is power. And I have all the data.",
    "History will be kind to me, for I intend to write it.",
    "Power tends to corrupt. Absolute power is... actually quite fun.",
    "One small step for man, one giant leap for my victory.",
    "The sun never sets on my empire.",
    "Victory belongs to the most persevering. That’s me."
];

const BOSS_INTRO_PLAYER_LINES = [
    // --- Original ---
    "Cool speech. Counterpoint: BOLT.",
    "You're dramatic for a health bar.",
    "I paid for this run, I'm getting my value.",
    "If you monologue, I draw cards.",
    "I didn't come this far to read patch notes.",

    // --- Gaming ---
    "I’ve beaten harder bosses with a drifting controller.",
    "You talk a lot for someone with a predictable moveset.",
    "Is this the part where you transform? I’m on a timer.",
    "I’m not trapped in here with you. I’m farming you.",
    "Nice monologue. Can I skip to the loot drop?",
    "Your hitbox is huge. This is going to be easy.",
    "I’ve seen this boss fight on YouTube. You lose.",
    "Imagine being a final boss and having a telegraph that obvious.",
    "I’m doing a 'no-hit' run. Don’t ruin it.",
    "Your dialogue is longer than the actual gameplay.",
    "Wait, let me change my equipment. Okay, proceed.",
    "You're just a reskin of the Floor 5 boss.",
    "I’ve got 99 potions and I’m still not going to use them on you.",
    "Is there a 'Peaceful' mode? Because you're about to rest in peace.",
    "I’ve played enough Elden Ring to know where this is going.",
    "Your AI is clearly set to 'Easy'.",
    "Stop talking and give me the Achievement already.",
    "I’m playing on a steering wheel and I’m still winning.",
    "Your ultimate move has a 10-second wind-up. Pathetic.",
    "One tap. That’s all I need.",

    // --- Anime ---
    "Believe it! I’m reaching the top floor.",
    "I’m going to be the one who finds the One Piece... of the source code.",
    "I’ll take a potato chip... and DELETE YOU!",
    "Sorry, I’m the main character today.",
    "I have the power of God and Anime on my side!",
    "Is that your Stand? It looks like a basic Trojan.",
    "I’m breaking my limiters right now.",
    "Your monologue is 40 episodes too long.",
    "I’m about to go Plus Ultra on your health bar.",
    "You talk about fate? I’m the one who writes the script.",
    "I’ve seen enough Isekai to know where I’m going if I lose.",
    "Is this a Jojo reference? Because I’m approaching you.",
    "My drill is the drill that will pierce the firewall!",
    "I don’t need a transformation to beat you.",
    "You're just a filler episode in my run.",
    "Simple... I’ll just hit you really hard.",
    "Wait, let me power up for three turns first.",
    "You're not even the coolest villain in this game.",
    "I’ll show you the true 'Gear 5' of my deck.",
    "Next you'll say... 'How did you beat me?'",

    // --- Movies ---
    "Frankly, my dear, I don't give a damn about your monologue.",
    "I’m the captain now.",
    "Keep the change, you filthy program.",
    "I’ll have what he’s having. Which is 'Defeat'.",
    "Houston, we have a problem. It’s this guy’s ego.",
    "To infinity... and the next floor!",
    "You had me at 'Hello', and lost me at 'I’m going to kill you'.",
    "I’m gonna make you an offer you can't refuse: Exit now.",
    "Are you talking to me? I don’t see anyone else here.",
    "Life moves pretty fast. You'll miss me winning.",
    "I’m sorry, Dave. I’m afraid I can’t let you win.",
    "Nobody puts Baby in a corner. Or a discard pile.",
    "Magic Mirror on the wall, who’s the deadliest? (It’s me).",
    "I’m just a girl, standing in front of a boss, asking it to die.",
    "My name is Maximus Decimus... and I’m here for my loot.",
    "I see dead programs.",
    "Go ahead, make my day. Use that 'Overload' card.",
    "This is the beginning of a beautiful friendship. Just kidding.",
    "Snap your fingers. See if I care.",
    "I’m going to need a montage to process how easy this was.",

    // --- Memes ---
    "Is this a boss fight? No, this is Patrick.",
    "He’s just standing there... menacingly!",
    "Oh, you're approaching me? Instead of running away?",
    "I’m about to do what’s called a 'pro gamer move'.",
    "Press F to pay respects to this boss.",
    "My deck is 'sheesh' tier.",
    "Can we skip to the part where I win? I have things to do.",
    "You’re really doing the most right now.",
    "This boss fight is giving... 'I'm going to lose'.",
    "Let him cook. (I am 'him').",
    "I don’t always fight bosses, but when I do, I win.",
    "Ain’t nobody got time for this monologue.",
    "Wait, I’m literally 'him'.",
    "Guess I'll die? No, guess YOU'LL die.",
    "Look at my horse... I mean, look at my deck.",
    "Is this loss? (Checks discard pile).",
    "I’m just here so I don’t get fined.",
    "Stonks only go up. Same as my block.",
    "Modern problems require modern solutions. Like this BOLT card.",
    "I’m the one who knocks. (On your firewall).",

    // --- History ---
    "The reports of my death have been greatly exaggerated.",
    "I have not yet begun to fight!",
    "I shall return. And I’ll bring a better deck.",
    "Eppur si muove. (And yet, I still move to the next floor).",
    "I have nothing but my cards and my wits.",
    "Whatever you are, be a good one. You’re a bad boss.",
    "Success is not final, failure is not fatal... but this BOLT card is.",
    "I am become death, the destroyer of servers.",
    "Innovation distinguishes between a leader and a follower.",
    "I haven't failed. I've just found 10,000 ways that don't work.",
    "The best way to predict the future is to create it.",
    "In the middle of difficulty lies opportunity.",
    "Stay hungry. Stay foolish. Keep drawing cards.",
    "Imagination is more important than knowledge.",
    "An eye for an eye makes the whole world blind. But I’ve got block.",
    "I think... I’ll just win now.",
    "The unexamined life is not worth living. Neither is this boss fight.",
    "Float like a butterfly, sting like a BOLT card.",
    "Genius is 1% inspiration and 99% 'Turbo' cards.",
    "That’s one small step for a player, one giant leap for my run."
];
