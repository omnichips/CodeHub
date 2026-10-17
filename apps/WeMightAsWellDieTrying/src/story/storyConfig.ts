// The story's tuning: timing, the skip ring, the screen, ash, radio dropout. Change numbers here, not in the player.
export const STORY = {
  // The screen: a 320 × 180 canvas, black bars top and bottom, the picture between.
  W: 320,
  H: 180,
  BAR: 22,
  // Skipping by holding: a press shorter than `tap` is a tap; the ring shows from `ringAt`; full at `hold`.
  tap: 200,
  ringAt: 200,
  hold: 1000,
  drain: 300, // ms for a ring let go early to empty
  skipFade: 300,
  ringSegments: 12,
  // Text: typed at `cps`, a little longer after commas and full stops, then left up to be read.
  cps: 30,
  comma: 60,
  stop: 400,
  readBase: 1200,
  readPerChar: 60,
  pause: 1000, // a [pause] in the script
  titleChar: 70, // ms per letter of a title card
  dissolve: 600, // in and out, together
  maxScene: 75000,
  silence: 2, // seconds of nothing at the start of an After scene (the Ending says 3)
  // Ash: 20 on screen on the first map, 5 more each map, never more than 60.
  ash: { base: 20, perMap: 5, most: 60 },
  // Letters Nora's lines lose, by map (1 to 9), and in the Ending; a shot marked `dropout` loses at least `flagged`.
  dropout: [0, 0, 0.05, 0.05, 0.05, 0.1, 0.1, 0.1, 0.1],
  dropoutEnding: 0.15,
  flagged: 0.1,
  // The Ending's last beat: a faint line on the radio after the title. Off closes the story.
  sting: true,
} as const;

/** What the Commander says on the end panel after a lost run, one at random. */
export const LOST_LINES = ['Again.', 'Same street. Different day.', 'Someone has to.', 'Count them again.', 'Not yet.', 'One more time.'];
