// Central registry for CrowdCircuit mini-games.
//
// This is the overhauled line-up — every game that ships in the app is
// defined here with its flow, scoring mode, accent, and status. Games
// flagged `status: "comingSoon"` show up in the phone vote UI with a
// locked badge; the server refuses to start them until their mechanic
// is built.
//
// Scoring modes currently supported by the engine:
//   take     — authors score from votes received, sharp voters bonus the winner.
//   fib      — voters score for picking the hidden truth, fibbers score for fooling.
//   quiz     — wager scoring against a fixed "truth".
//   reaction — real-time mini-games (TAP), self-report score.
//   percent  — guess a 0–100 number, score on proximity.
//   color    — submit an RGB (+ optional target-type variants), score on distance.
//   trace    — finger-trace accuracy.
//   herd     — cluster short-text answers, score for matching the room.
//   chain    — multi-stage "telephone" (phrase → drawing → guess).
//   combo    — parallel stages pair-shuffled at reveal.
//
// New modes declared here for forthcoming games (not yet implemented):
//   hold, photo, rhythm, zone, tile, reflex, pixel, tilt, alibi, saboteur, avalanche.
// Games using those modes are marked comingSoon so the UI can lock them.

import type { Rating, SubmissionKind } from "@prisma/client";

export type ScoringMode =
  | "take"
  | "fib"
  | "quiz"
  | "reaction"
  | "percent"
  | "herd"
  | "trace"
  | "color"
  | "chain"
  | "combo"
  // --- New modes for the overhauled line-up (comingSoon until built). ---
  | "hold"
  | "photo"
  | "rhythm"
  | "zone"
  | "tile"
  | "reflex"
  | "pixel"
  | "tilt"
  | "alibi"
  | "saboteur"
  | "avalanche";

export type StageKind = "TEXT" | "DRAWING" | "SLOGAN" | "ICON";

export interface GameStage {
  kind: "TEXT" | "DRAWING";
  label: string;
  placeholder: string;
  seconds?: number;
  targetRouting?: "prompt-bank" | "from-prev";
  helper?: string;
}

// Game flow decides which phases run.
//   standard : SUBMIT → REVEAL → VOTE → SCORE (take + fib)
//   quiz     : SUBMIT → REVEAL → SCORE        (no voting)
//   reaction : SUBMIT → SCORE                 (real-time, no reveal/vote)
//   chain    : (SUBMIT × N) → REVEAL → VOTE → SCORE
//   combo    : (SUBMIT × N) → REVEAL → VOTE → SCORE
export type GameFlow = "standard" | "quiz" | "reaction" | "chain" | "combo";

export interface SeedPrompt {
  text: string;
  rating: Rating;
  tag?: string;
  truth?: string;
  choices?: string[];
  detail?: string;
}

// "live"       — playable on the current engine.
// "comingSoon" — definition exists for UI/voting parity, but the game
//                needs its mechanic built before it's startable.
export type GameStatus = "live" | "comingSoon";

export interface GameDefinition {
  id: string;
  name: string;
  tagline: string;
  description: string;
  scoring: ScoringMode;
  flow: GameFlow;
  submissionKind: SubmissionKind;
  secretCriterion: boolean;
  usesCriterion: boolean;
  submissionPlaceholder: string;
  submissionLabel: string;
  voteInstruction: (criterionLabel: string | null) => string;
  revealKicker: string;
  submitSeconds?: number;
  revealSeconds?: number;
  voteSeconds?: number;
  seedPrompts: SeedPrompt[];
  seedCriteria?: { label: string; rating: Rating; hint?: string }[];
  accent: "ember" | "neon" | "sol" | "orchid";
  stages?: GameStage[];
  // Runtime flag — the host's phone + server check this before starting.
  status: GameStatus;
  // Short support line shown on locked games (e.g. "Adds hold-and-release
  // mechanic next"). Optional; ignored for live games.
  comingSoonNote?: string;
}

// ---------------------------------------------------------------------
// Playable today — mapped to the existing submission/scoring engine.
// ---------------------------------------------------------------------

const guesspionagePrompts: SeedPrompt[] = [
  { text: "What % of people have fallen asleep in a meeting?", rating: "FAMILY", truth: "68" },
  { text: "What % of people secretly dislike their neighbour?", rating: "FAMILY", truth: "37" },
  { text: "What % of people have lied about reading a book?", rating: "FAMILY", truth: "44" },
  { text: "What % of drivers admit to singing alone in the car?", rating: "FAMILY", truth: "81" },
  { text: "What % of people have googled themselves this month?", rating: "FAMILY", truth: "52" },
  { text: "What % of households have a TV that nobody watches?", rating: "FAMILY", truth: "29" },
  { text: "What % of people have cried at a Pixar movie?", rating: "FAMILY", truth: "64" },
  { text: "What % of people have texted the wrong person?", rating: "FAMILY", truth: "73" },
  { text: "What % of people prefer the sound of rain over silence?", rating: "FAMILY", truth: "58" },
  { text: "What % of workers have taken a sick day when not sick?", rating: "FAMILY", truth: "49" },
];

const colourTargets: SeedPrompt[] = [
  { text: "Match this: Sunset Coral", rating: "FAMILY", truth: "255,111,97" },
  { text: "Match this: Electric Teal", rating: "FAMILY", truth: "64,224,208" },
  { text: "Match this: Royal Purple", rating: "FAMILY", truth: "120,81,169" },
  { text: "Match this: Neon Mustard", rating: "FAMILY", truth: "255,219,88" },
  { text: "Match this: Storm Navy", rating: "FAMILY", truth: "21,34,56" },
  { text: "Match this: Bubblegum Pink", rating: "FAMILY", truth: "255,158,205" },
  { text: "Match this: Forest Moss", rating: "FAMILY", truth: "78,107,66" },
  { text: "Match this: Hot Lava", rating: "FAMILY", truth: "255,71,40" },
];

const doodleDashPrompts: SeedPrompt[] = [
  { text: "A penguin who lost their wallet", rating: "FAMILY" },
  { text: "The world's worst superhero", rating: "FAMILY" },
  { text: "A vegetable on strike", rating: "FAMILY" },
  { text: "A haunted vending machine", rating: "FAMILY" },
  { text: "A pet that's clearly an alien", rating: "FAMILY" },
  { text: "Breakfast in the year 3000", rating: "FAMILY" },
  { text: "A villain's vacation selfie", rating: "FAMILY" },
  { text: "A sport invented by toddlers", rating: "FAMILY" },
  { text: "A dinosaur's job interview", rating: "FAMILY" },
  { text: "The saddest sandwich", rating: "FAMILY" },
];

const counterfeitPrompts: SeedPrompt[] = [
  // The "truth" field is a shorthand reference for the scene — future
  // iterations will render a proper image here during the flash phase.
  { text: "Reproduce: a cat in a spacesuit on the moon", rating: "FAMILY", truth: "cat-astronaut" },
  { text: "Reproduce: a pirate ship sailing through clouds", rating: "FAMILY", truth: "sky-pirate" },
  { text: "Reproduce: a giant robot eating a donut", rating: "FAMILY", truth: "robot-donut" },
  { text: "Reproduce: a flamingo on rollerblades", rating: "FAMILY", truth: "flamingo-skates" },
  { text: "Reproduce: a castle melting in the sun", rating: "FAMILY", truth: "melty-castle" },
];

const sliderWarsPrompts: SeedPrompt[] = [
  { text: "Match this: Deep Ocean", rating: "FAMILY", truth: "20,60,120" },
  { text: "Match this: Electric Lime", rating: "FAMILY", truth: "200,255,60" },
  { text: "Match this: Magenta Heart", rating: "FAMILY", truth: "220,30,140" },
  { text: "Match this: Toast Brown", rating: "FAMILY", truth: "135,80,50" },
];

// ---------------------------------------------------------------------
// The 18-game line-up.
// ---------------------------------------------------------------------

export const GAMES: Record<string, GameDefinition> = {
  // ===== LIVE (mapped to existing mechanics) ======================

  guesspionage: {
    id: "guesspionage",
    name: "Guesspionage",
    tagline: "Guess the percentage. Closest wins.",
    description:
      "A survey question appears. Everyone secretly guesses 0–100%. Points scale with how close you land, big bonus for bullseyes.",
    scoring: "percent",
    flow: "quiz",
    submissionKind: "PERCENT",
    secretCriterion: false,
    usesCriterion: false,
    submissionPlaceholder: "Your guess",
    submissionLabel: "Your guess",
    voteInstruction: () => "",
    revealKicker: "REAL ANSWER",
    submitSeconds: 30,
    seedPrompts: guesspionagePrompts,
    accent: "sol",
    status: "live",
  },

  "colour-picker": {
    id: "colour-picker",
    name: "Colour Picker",
    tagline: "Match the colour on your phone's wheel.",
    description:
      "The TV reveals a target colour. Spin your phone's RGB sliders until your swatch matches. Closest submission wins the round.",
    scoring: "color",
    flow: "quiz",
    submissionKind: "COLOR",
    secretCriterion: false,
    usesCriterion: false,
    submissionPlaceholder: "Dial the colour",
    submissionLabel: "Your swatch",
    voteInstruction: () => "",
    revealKicker: "TARGET",
    submitSeconds: 40,
    seedPrompts: colourTargets,
    accent: "orchid",
    status: "live",
  },

  "slider-wars": {
    id: "slider-wars",
    name: "Slider Wars",
    tagline: "Three sliders, one target. Nail it.",
    description:
      "Like Colour Picker but the prompts rotate — sometimes it's a colour, sometimes a frequency curve, sometimes a launch angle. Everyone competes simultaneously.",
    scoring: "color",
    flow: "quiz",
    submissionKind: "COLOR",
    secretCriterion: false,
    usesCriterion: false,
    submissionPlaceholder: "Dial the sliders",
    submissionLabel: "Your submission",
    voteInstruction: () => "",
    revealKicker: "TARGET",
    submitSeconds: 35,
    seedPrompts: sliderWarsPrompts,
    accent: "neon",
    status: "live",
  },

  "tap-rally": {
    id: "tap-rally",
    name: "Tap Rally",
    tagline: "Tap every target before it fades.",
    description:
      "Targets pop up on your phone — tap fast. Everyone plays simultaneously, fastest reflexes win the round. Supports solo high-score chasing.",
    scoring: "reaction",
    flow: "reaction",
    submissionKind: "TAP",
    secretCriterion: false,
    usesCriterion: false,
    submissionPlaceholder: "",
    submissionLabel: "",
    voteInstruction: () => "",
    revealKicker: "FINAL SCORES",
    submitSeconds: 20,
    seedPrompts: [
      { text: "Tap every target before it fades.", rating: "FAMILY" },
      { text: "Warm up those thumbs — every miss hurts.", rating: "FAMILY" },
      { text: "Final sprint — bank as many hits as you can.", rating: "FAMILY" },
    ],
    accent: "ember",
    status: "live",
  },

  "doodle-dash": {
    id: "doodle-dash",
    name: "Doodle Dash",
    tagline: "Race to draw it first — votes decide the best.",
    description:
      "A prompt appears, everyone races to draw it before the timer. All sketches hit the big screen, the room votes for the best.",
    scoring: "take",
    flow: "standard",
    submissionKind: "DRAWING",
    secretCriterion: true,
    usesCriterion: true,
    submissionPlaceholder: "Draw it",
    submissionLabel: "Your doodle",
    voteInstruction: (c) =>
      c ? `Vote for the ${c.toLowerCase()} doodle.` : "Vote for your favourite doodle.",
    revealKicker: "DOODLES REVEALED",
    submitSeconds: 60,
    seedPrompts: doodleDashPrompts,
    seedCriteria: [
      { label: "Funniest", rating: "FAMILY" },
      { label: "Most Cursed", rating: "FAMILY" },
      { label: "Most Chaotic", rating: "FAMILY" },
      { label: "Most Heartwarming", rating: "FAMILY" },
      { label: "Hardest to Identify", rating: "FAMILY" },
    ],
    accent: "neon",
    status: "live",
  },

  counterfeit: {
    id: "counterfeit",
    name: "Counterfeit",
    tagline: "Flash, memorise, redraw.",
    description:
      "The TV flashes a scene for a few seconds. Everyone redraws it from memory on their phone. Room votes for the most accurate reproduction.",
    scoring: "take",
    flow: "standard",
    submissionKind: "DRAWING",
    secretCriterion: false,
    usesCriterion: true,
    submissionPlaceholder: "Draw what you saw",
    submissionLabel: "Your reproduction",
    voteInstruction: () => "Vote for the most accurate copy.",
    revealKicker: "COUNTERFEITS",
    submitSeconds: 60,
    revealSeconds: 10,
    seedPrompts: counterfeitPrompts,
    seedCriteria: [
      { label: "Most Accurate", rating: "FAMILY" },
      { label: "Best Vibe", rating: "FAMILY" },
    ],
    accent: "sol",
    status: "live",
  },

  // ===== COMING SOON — stubbed, will light up across follow-up sessions.

  chicken: {
    id: "chicken",
    name: "Chicken",
    tagline: "Hold to build. Release before it maxes.",
    description:
      "A bar fills on the TV. Hold your phone button to score — release before it hits the top or lose the round. Last to release with a valid score gets a bonus.",
    scoring: "hold",
    flow: "reaction",
    submissionKind: "TAP", // placeholder; real "HOLD" kind lands with the build
    secretCriterion: false,
    usesCriterion: false,
    submissionPlaceholder: "",
    submissionLabel: "",
    voteInstruction: () => "",
    revealKicker: "WHO CHICKENED OUT",
    seedPrompts: [],
    accent: "ember",
    status: "comingSoon",
    comingSoonNote: "Needs hold-and-release phone input + live TV bar.",
  },

  "pixel-war": {
    id: "pixel-war",
    name: "Pixel War",
    tagline: "One shared canvas. Everyone fights for pixels.",
    description:
      "A grid canvas lives on the TV. Each player secretly draws a different thing on the same pixels. Everyone guesses what everyone else was making at the end.",
    scoring: "pixel",
    flow: "standard",
    submissionKind: "DRAWING",
    secretCriterion: false,
    usesCriterion: false,
    submissionPlaceholder: "",
    submissionLabel: "",
    voteInstruction: () => "",
    revealKicker: "THE CANVAS",
    seedPrompts: [],
    accent: "orchid",
    status: "comingSoon",
    comingSoonNote: "Needs live shared canvas + guessing round.",
  },

  traced: {
    id: "traced",
    name: "Traced",
    tagline: "One line, no lifting. Guess what it is.",
    description:
      "One player draws with a single continuous line while everyone else buzzes in to guess. Drawer rotates each round so everyone gets a turn.",
    scoring: "chain",
    flow: "chain",
    submissionKind: "DRAWING",
    secretCriterion: false,
    usesCriterion: false,
    submissionPlaceholder: "",
    submissionLabel: "",
    voteInstruction: () => "",
    revealKicker: "TRACED",
    seedPrompts: [],
    accent: "neon",
    status: "comingSoon",
    comingSoonNote: "Needs single-stroke canvas + buzzer/guess flow.",
  },

  "face-off": {
    id: "face-off",
    name: "Face Off",
    tagline: "Snap the selfie. Room picks the best.",
    description:
      "A prompt appears — 'angriest face', 'most serene', 'surprise attack'. Everyone snaps a selfie, all photos hit the TV gallery, room votes.",
    scoring: "photo",
    flow: "standard",
    submissionKind: "DRAWING", // placeholder; real "PHOTO" kind lands with the build
    secretCriterion: false,
    usesCriterion: true,
    submissionPlaceholder: "",
    submissionLabel: "",
    voteInstruction: (c) =>
      c ? `Vote for the ${c.toLowerCase()}.` : "Vote for the best photo.",
    revealKicker: "GALLERY",
    seedPrompts: [],
    accent: "ember",
    status: "comingSoon",
    comingSoonNote: "Needs PHOTO submission kind + TV photo gallery.",
  },

  "tilt-racer": {
    id: "tilt-racer",
    name: "Tilt Racer",
    tagline: "Tilt your phone. Steer on the TV.",
    description:
      "Race / bumper-cars on the big screen by tilting your phone. 3–10 players scale naturally — more chaos the more racers.",
    scoring: "tilt",
    flow: "reaction",
    submissionKind: "TAP", // placeholder
    secretCriterion: false,
    usesCriterion: false,
    submissionPlaceholder: "",
    submissionLabel: "",
    voteInstruction: () => "",
    revealKicker: "FINISH LINE",
    seedPrompts: [],
    accent: "neon",
    status: "comingSoon",
    comingSoonNote: "Needs gyroscope input + TV race/physics sim.",
  },

  "reflex-roulette": {
    id: "reflex-roulette",
    name: "Reflex Roulette",
    tagline: "Names cycle. Tap when it's yours.",
    description:
      "Player names flash through a roulette on the TV. Tap the instant your name lands — faster reaction = higher score.",
    scoring: "reflex",
    flow: "reaction",
    submissionKind: "TAP", // placeholder
    secretCriterion: false,
    usesCriterion: false,
    submissionPlaceholder: "",
    submissionLabel: "",
    voteInstruction: () => "",
    revealKicker: "REACTIONS",
    seedPrompts: [],
    accent: "sol",
    status: "comingSoon",
    comingSoonNote: "Needs name-roulette TV animation + instant-tap input.",
  },

  "sync-up": {
    id: "sync-up",
    name: "Sync Up",
    tagline: "Tap in time with the pattern.",
    description:
      "A visual rhythm pattern plays on the TV. Everyone taps their phone to match. Scored independently on precision.",
    scoring: "rhythm",
    flow: "reaction",
    submissionKind: "TAP", // placeholder
    secretCriterion: false,
    usesCriterion: false,
    submissionPlaceholder: "",
    submissionLabel: "",
    voteInstruction: () => "",
    revealKicker: "PRECISION",
    seedPrompts: [],
    accent: "orchid",
    status: "comingSoon",
    comingSoonNote: "Needs rhythm pattern generator + timing capture.",
  },

  alibi: {
    id: "alibi",
    name: "Alibi",
    tagline: "Two suspects. The rest grill them.",
    description:
      "Two players are the suspects with a shared story. Everyone else is the interrogator trying to find the holes. Roles rotate each round.",
    scoring: "alibi",
    flow: "standard",
    submissionKind: "TEXT",
    secretCriterion: false,
    usesCriterion: false,
    submissionPlaceholder: "",
    submissionLabel: "",
    voteInstruction: () => "",
    revealKicker: "VERDICT",
    seedPrompts: [],
    accent: "ember",
    status: "comingSoon",
    comingSoonNote: "Needs role rotation + interrogation Q&A flow.",
  },

  saboteur: {
    id: "saboteur",
    name: "Saboteur",
    tagline: "Everyone builds the thing. One of you doesn't.",
    description:
      "Each player controls a cursor contributing to a collaborative task. One secret saboteur tries to screw it up without being caught.",
    scoring: "saboteur",
    flow: "standard",
    submissionKind: "TEXT",
    secretCriterion: false,
    usesCriterion: false,
    submissionPlaceholder: "",
    submissionLabel: "",
    voteInstruction: () => "",
    revealKicker: "UNMASKING",
    seedPrompts: [],
    accent: "neon",
    status: "comingSoon",
    comingSoonNote: "Needs live cursor collab + secret role assignment.",
  },

  shockwave: {
    id: "shockwave",
    name: "Shockwave",
    tagline: "Radar sweeps. Tap when it hits your zone.",
    description:
      "A radar pulse rotates around the TV. Each player owns a slice — tap the instant the pulse hits yours.",
    scoring: "zone",
    flow: "reaction",
    submissionKind: "TAP", // placeholder
    secretCriterion: false,
    usesCriterion: false,
    submissionPlaceholder: "",
    submissionLabel: "",
    voteInstruction: () => "",
    revealKicker: "ON THE PULSE",
    seedPrompts: [],
    accent: "neon",
    status: "comingSoon",
    comingSoonNote: "Needs radar TV animation + zone-slice assignment.",
  },

  "land-grab": {
    id: "land-grab",
    name: "Land Grab",
    tagline: "Secretly claim tiles. Collisions lose the tile.",
    description:
      "A grid map appears on the TV. Everyone secretly picks tiles to claim. Collisions cancel out. More players = more mind games.",
    scoring: "tile",
    flow: "standard",
    submissionKind: "TEXT", // placeholder
    secretCriterion: false,
    usesCriterion: false,
    submissionPlaceholder: "",
    submissionLabel: "",
    voteInstruction: () => "",
    revealKicker: "THE MAP",
    seedPrompts: [],
    accent: "sol",
    status: "comingSoon",
    comingSoonNote: "Needs interactive grid map + claim resolution.",
  },

  avalanche: {
    id: "avalanche",
    name: "Avalanche",
    tagline: "Shared Tetris. Majority vote controls the piece.",
    description:
      "Tetris blocks fall on the TV. Everyone's phone input is collected and the majority move wins. Alliances, sabotage, pure chaos.",
    scoring: "avalanche",
    flow: "reaction",
    submissionKind: "TAP", // placeholder
    secretCriterion: false,
    usesCriterion: false,
    submissionPlaceholder: "",
    submissionLabel: "",
    voteInstruction: () => "",
    revealKicker: "STACKED",
    seedPrompts: [],
    accent: "orchid",
    status: "comingSoon",
    comingSoonNote: "Needs Tetris engine on TV + majority-vote controls.",
  },
};

export const GAME_LIST: GameDefinition[] = Object.values(GAMES);

// The fallback when a Room row references a legacy gameId that's no
// longer in the registry. Pick the first live game in declaration order.
const FALLBACK_GAME_ID: string =
  GAME_LIST.find((g) => g.status === "live")?.id ?? GAME_LIST[0].id;

export function getGame(id: string): GameDefinition {
  return GAMES[id] ?? GAMES[FALLBACK_GAME_ID];
}

export function isLive(id: string): boolean {
  return GAMES[id]?.status === "live";
}

export function firstLiveGameId(): string {
  return FALLBACK_GAME_ID;
}
