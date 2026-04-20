// Central registry for all CrowdCircuit mini-games.
//
// Every game here uses the shared phase machine (LOBBY → SUBMIT → REVEAL → VOTE
// → SCORE → MATCH_END) but can customize: prompt pool, criterion style, scoring
// mode, UI labels, and whether there's a hidden "truth" to detect.
//
// Two scoring modes currently exist:
//   - "take"  : like Hot Take Hustle — authors score from votes received, sharp
//               voters score a bonus for picking the top submission.
//   - "fib"   : like Crowd Fibs — voters score for picking the hidden truth,
//               authors score for fooling other voters into picking their fib.

import type { Rating, SubmissionKind } from "@prisma/client";

export type ScoringMode = "take" | "fib" | "quiz" | "reaction";

// Game flow decides which phases run:
//   standard : SUBMIT → REVEAL → VOTE → SCORE (take + fib games)
//   quiz     : SUBMIT → REVEAL → SCORE      (no voting — truth scores directly)
//   reaction : SUBMIT → SCORE              (real-time mini-game, no reveal/vote)
export type GameFlow = "standard" | "quiz" | "reaction";

export interface SeedPrompt {
  text: string;
  rating: Rating;
  tag?: string;
  // For fib games: the hidden truthful answer.
  // For quiz games: the correct choice (string matches one entry in `choices`).
  truth?: string;
  // For quiz games: the multiple-choice options.
  choices?: string[];
  // Optional extra context (hint, image ref, setup line).
  detail?: string;
}

export interface GameDefinition {
  id: string;
  name: string;
  tagline: string;
  description: string;
  scoring: ScoringMode;
  flow: GameFlow;
  submissionKind: SubmissionKind;
  // Whether the criterion label is hidden during SUBMIT and revealed at VOTE.
  secretCriterion: boolean;
  // Some games don't use a criterion at all (fib / quiz / reaction).
  usesCriterion: boolean;
  submissionPlaceholder: string;
  submissionLabel: string;
  voteInstruction: (criterionLabel: string | null) => string;
  revealKicker: string;
  // Per-game phase timers. Fall back to DEFAULTS when undefined.
  submitSeconds?: number;
  revealSeconds?: number;
  voteSeconds?: number;
  seedPrompts: SeedPrompt[];
  seedCriteria?: { label: string; rating: Rating; hint?: string }[];
  accent: "ember" | "neon" | "sol" | "orchid";
}

const universalCriteria = (gameSpice: string[]): GameDefinition["seedCriteria"] => [
  { label: "Funniest", rating: "FAMILY", hint: "The one that made you laugh out loud." },
  { label: "Most Chaotic", rating: "FAMILY", hint: "Pure unhinged energy." },
  { label: "Most Convincing", rating: "FAMILY", hint: "Weirdly plausible." },
  { label: "Weirdest", rating: "FAMILY", hint: "Brain went sideways." },
  { label: "Most Heartwarming", rating: "FAMILY", hint: "Unexpectedly sweet." },
  ...gameSpice.map((label) => ({ label, rating: "STANDARD" as Rating })),
];

export const GAMES: Record<string, GameDefinition> = {
  "hot-take-hustle": {
    id: "hot-take-hustle",
    name: "Hot Take Hustle",
    tagline: "Silly prompts, sharper takes, secret criterion.",
    description:
      "Every round drops a silly prompt. Everyone submits a one-line take. The secret criterion is revealed at voting time — funniest, pettiest, most convincing, whatever the round demands.",
    scoring: "take",
    flow: "standard",
    submissionKind: "TEXT",
    secretCriterion: true,
    usesCriterion: true,
    submissionPlaceholder: "Drop your take…",
    submissionLabel: "Your take",
    voteInstruction: (c) => (c ? `Vote for the ${c.toLowerCase()}.` : "Vote for your favourite."),
    revealKicker: "TAKES REVEALED",
    accent: "ember",
    seedPrompts: [
      { text: "Rank these breakfast foods by how much they respect you.", rating: "FAMILY", tag: "food" },
      { text: "Name a fake holiday everyone would secretly celebrate.", rating: "FAMILY", tag: "invention" },
      { text: "Describe a new Olympic sport that requires zero athletic ability.", rating: "FAMILY", tag: "sports" },
      { text: "Pitch a sequel to a boring household object.", rating: "FAMILY", tag: "invention" },
      { text: "Invent a warning label nobody would ever follow.", rating: "FAMILY", tag: "absurd" },
      { text: "Give a motivational quote for people who just hit snooze six times.", rating: "FAMILY", tag: "life" },
      { text: "What's the most chaotic thing to shout at a library?", rating: "STANDARD", tag: "chaos" },
      { text: "Invent a reality show nobody asked for.", rating: "STANDARD", tag: "tv" },
      { text: "Write a dating profile bio for a raccoon with ambition.", rating: "STANDARD", tag: "dating" },
      { text: "Give a suspicious excuse for being three hours late to a video call.", rating: "STANDARD", tag: "work" },
      { text: "Pitch a self-help book written by a tired crow.", rating: "STANDARD", tag: "life" },
      { text: "Invent a conspiracy theory about a vegetable.", rating: "STANDARD", tag: "absurd" },
    ],
    seedCriteria: universalCriteria(["Most Petty", "Most Spicy", "Most Cursed", "Most Gremlin"]),
  },

  "pitch-party": {
    id: "pitch-party",
    name: "Pitch Party",
    tagline: "Two random words. One startup. Zero shame.",
    description:
      "You get two wildly unrelated nouns. Pitch a startup that somehow combines them. Everyone votes for who they'd pour fake venture capital into.",
    scoring: "take",
    flow: "standard",
    submissionKind: "TEXT",
    secretCriterion: false,
    usesCriterion: true,
    submissionPlaceholder: "Pitch your startup in one sentence…",
    submissionLabel: "Your pitch",
    voteInstruction: () => "Who would you invest in?",
    revealKicker: "PITCHES INCOMING",
    accent: "neon",
    seedPrompts: [
      { text: "Rubber duck × funeral services", rating: "FAMILY", tag: "pitch" },
      { text: "Subscription mailbox × haunted house", rating: "FAMILY", tag: "pitch" },
      { text: "Yoga studio × parking lot", rating: "FAMILY", tag: "pitch" },
      { text: "AI chatbot × competitive knitting", rating: "FAMILY", tag: "pitch" },
      { text: "Ice cream truck × tax advisory", rating: "FAMILY", tag: "pitch" },
      { text: "Dog walking × crypto wallet", rating: "FAMILY", tag: "pitch" },
      { text: "Meal kit × escape room", rating: "FAMILY", tag: "pitch" },
      { text: "Laundromat × meditation retreat", rating: "FAMILY", tag: "pitch" },
      { text: "Moving company × dating app", rating: "STANDARD", tag: "pitch" },
      { text: "Stand-up comedy × mattress delivery", rating: "STANDARD", tag: "pitch" },
      { text: "Bird-watching × nightclub", rating: "STANDARD", tag: "pitch" },
      { text: "Carwash × therapy practice", rating: "STANDARD", tag: "pitch" },
    ],
    seedCriteria: [
      { label: "Most Investable", rating: "FAMILY", hint: "You'd actually hit 'fund'." },
    ],
  },

  "bad-advice-booth": {
    id: "bad-advice-booth",
    name: "Bad Advice Booth",
    tagline: "Real problems. Worst possible guidance.",
    description:
      "A very real, very normal personal problem arrives on the host screen. Write the most spectacularly unhelpful advice you can. Good intentions not required.",
    scoring: "take",
    flow: "standard",
    submissionKind: "TEXT",
    secretCriterion: false,
    usesCriterion: true,
    submissionPlaceholder: "Write the worst possible advice…",
    submissionLabel: "Your advice",
    voteInstruction: () => "Which advice is the most disastrous?",
    revealKicker: "ADVICE DROP",
    accent: "orchid",
    seedPrompts: [
      { text: "My roommate keeps eating my leftovers. What do I do?", rating: "FAMILY", tag: "home" },
      { text: "My boss keeps scheduling meetings at 4:55pm on Fridays.", rating: "FAMILY", tag: "work" },
      { text: "I accidentally waved back at someone who wasn't waving at me.", rating: "FAMILY", tag: "social" },
      { text: "My neighbor plays bagpipes at 6am, badly.", rating: "FAMILY", tag: "home" },
      { text: "My plant has started judging me, I can feel it.", rating: "FAMILY", tag: "home" },
      { text: "I said 'you too' when the barista said enjoy your coffee.", rating: "FAMILY", tag: "social" },
      { text: "My friend won't stop recommending the same podcast.", rating: "FAMILY", tag: "social" },
      { text: "I replied-all to the whole company by accident.", rating: "STANDARD", tag: "work" },
      { text: "My dog has started ignoring me.", rating: "STANDARD", tag: "pets" },
      { text: "I keep losing arguments with my GPS.", rating: "STANDARD", tag: "tech" },
      { text: "My date keeps calling their car 'she'.", rating: "STANDARD", tag: "dating" },
      { text: "I laughed at the wrong part of the wedding speech.", rating: "STANDARD", tag: "social" },
    ],
    seedCriteria: [
      { label: "Most Disastrous", rating: "FAMILY", hint: "Strong 'do not try this' energy." },
    ],
  },

  "hype-machine": {
    id: "hype-machine",
    name: "Hype Machine",
    tagline: "Boring object. Unreasonable enthusiasm.",
    description:
      "You get a profoundly mundane object. Hype it like you're headlining the world's most optimistic keynote. Crowd votes who almost made them believe.",
    scoring: "take",
    flow: "standard",
    submissionKind: "TEXT",
    secretCriterion: false,
    usesCriterion: true,
    submissionPlaceholder: "Hype it up in one sentence…",
    submissionLabel: "Your hype",
    voteInstruction: () => "Who got you the most hyped?",
    revealKicker: "HYPE DROP",
    accent: "sol",
    seedPrompts: [
      { text: "A paperclip", rating: "FAMILY", tag: "object" },
      { text: "A single sock", rating: "FAMILY", tag: "object" },
      { text: "A wet napkin", rating: "FAMILY", tag: "object" },
      { text: "A half-charged battery", rating: "FAMILY", tag: "object" },
      { text: "A fridge magnet shaped like a pineapple", rating: "FAMILY", tag: "object" },
      { text: "A sticky door hinge", rating: "FAMILY", tag: "object" },
      { text: "A Tuesday in February", rating: "FAMILY", tag: "concept" },
      { text: "An elevator that only goes to two floors", rating: "FAMILY", tag: "place" },
      { text: "A beige cubicle", rating: "STANDARD", tag: "place" },
      { text: "The phrase 'per my last email'", rating: "STANDARD", tag: "concept" },
      { text: "A gas station hot dog", rating: "STANDARD", tag: "food" },
      { text: "A printer that only works at night", rating: "STANDARD", tag: "object" },
    ],
    seedCriteria: [
      { label: "Most Convincing", rating: "FAMILY", hint: "You briefly believed it." },
    ],
  },

  "scene-stealer": {
    id: "scene-stealer",
    name: "Scene Stealer",
    tagline: "One line. One scene. One thief.",
    description:
      "A scene setup arrives. Submit the single line of dialogue that would completely steal the scene. Voters pick the line they're quoting all night.",
    scoring: "take",
    flow: "standard",
    submissionKind: "TEXT",
    secretCriterion: false,
    usesCriterion: true,
    submissionPlaceholder: "The one line that steals the scene…",
    submissionLabel: "Your line",
    voteInstruction: () => "Which line steals the scene?",
    revealKicker: "LIGHTS UP",
    accent: "ember",
    seedPrompts: [
      { text: "A family dinner that is 96% too quiet.", rating: "FAMILY", tag: "scene" },
      { text: "A first day at a suspicious new job.", rating: "FAMILY", tag: "scene" },
      { text: "A team meeting 30 seconds before a fire drill nobody knows about.", rating: "FAMILY", tag: "scene" },
      { text: "An elevator stuck between floors with a stranger.", rating: "FAMILY", tag: "scene" },
      { text: "A haunted library that's also open-plan.", rating: "FAMILY", tag: "scene" },
      { text: "A wedding rehearsal three minutes after a breakup.", rating: "STANDARD", tag: "scene" },
      { text: "The school play's opening night goes sideways.", rating: "FAMILY", tag: "scene" },
      { text: "A reunion nobody RSVP'd to but everyone showed up.", rating: "STANDARD", tag: "scene" },
      { text: "A support group for former child actors of commercials.", rating: "STANDARD", tag: "scene" },
      { text: "The quietest heist in history, at a cat café.", rating: "FAMILY", tag: "scene" },
      { text: "A road trip where the GPS has become sentient.", rating: "FAMILY", tag: "scene" },
      { text: "A diner at 3am after an argument.", rating: "STANDARD", tag: "scene" },
    ],
    seedCriteria: [
      { label: "Funniest", rating: "FAMILY", hint: "Scene-stealing line of the round." },
    ],
  },

  "crowd-fibs": {
    id: "crowd-fibs",
    name: "Crowd Fibs",
    tagline: "Invent a lie. Spot the truth. Everyone wins, sort of.",
    description:
      "A weird-but-true trivia question appears. Players write fake answers that *sound* true. The real answer is shuffled in. Everyone tries to pick the truth. Points for detectives. Points for liars who fool the room.",
    scoring: "fib",
    flow: "standard",
    submissionKind: "TEXT",
    secretCriterion: false,
    usesCriterion: false,
    submissionPlaceholder: "Write a believable fake answer…",
    submissionLabel: "Your fake answer",
    voteInstruction: () => "Which one is the truth?",
    revealKicker: "TRUTHS & FIBS",
    accent: "orchid",
    seedPrompts: [
      {
        text: "According to researchers, what percentage of office printers are blamed for problems they didn't cause?",
        truth: "Roughly 62%, in a long-running print industry survey.",
        rating: "FAMILY",
        tag: "trivia",
      },
      {
        text: "A 2022 study found that most adults can recognise their partner by which sense alone?",
        truth: "Footsteps, with about 78% accuracy.",
        rating: "FAMILY",
        tag: "trivia",
      },
      {
        text: "What unusual item is the single most common thing left behind at airport security?",
        truth: "Reusable water bottles.",
        rating: "FAMILY",
        tag: "trivia",
      },
      {
        text: "Which common word was originally invented as a marketing term?",
        truth: "The word 'escalator' started as a brand name.",
        rating: "FAMILY",
        tag: "trivia",
      },
      {
        text: "Which animal has been documented 'napping' upside down for the longest stretch?",
        truth: "A species of parrotlet, observed sleeping hanging for up to 90 minutes.",
        rating: "FAMILY",
        tag: "trivia",
      },
      {
        text: "What oddly specific sound consistently makes workers in a study more productive?",
        truth: "A low, intermittent hum at roughly 70 decibels.",
        rating: "FAMILY",
        tag: "trivia",
      },
      {
        text: "In the 1800s, what was briefly considered a required part of polite greeting?",
        truth: "Holding a small handkerchief with your non-dominant hand.",
        rating: "FAMILY",
        tag: "trivia",
      },
      {
        text: "What is the most common reason people abandon an online cart, per retail studies?",
        truth: "They were just comparing prices with no intent to buy.",
        rating: "STANDARD",
        tag: "trivia",
      },
      {
        text: "A university study found what single factor best predicted long-term friendship retention?",
        truth: "Living within a 15-minute walk of each other.",
        rating: "STANDARD",
        tag: "trivia",
      },
      {
        text: "Which everyday word has been traced back to a sailor's insult for a lazy coworker?",
        truth: "The word 'loafer'.",
        rating: "STANDARD",
        tag: "trivia",
      },
    ],
  },

  "caption-chaos": {
    id: "caption-chaos",
    name: "Caption Chaos",
    tagline: "Describe the scene. Caption the chaos.",
    description:
      "A wildly absurd scene description arrives. Write the caption that belongs under it. Crowd picks the caption that cemented it into the group chat.",
    scoring: "take",
    flow: "standard",
    submissionKind: "TEXT",
    secretCriterion: false,
    usesCriterion: true,
    submissionPlaceholder: "Write the caption…",
    submissionLabel: "Your caption",
    voteInstruction: () => "Which caption wins the internet?",
    revealKicker: "CAPTION THIS",
    accent: "neon",
    seedPrompts: [
      { text: "A raccoon holding a tiny briefcase boarding a city bus.", rating: "FAMILY", tag: "scene" },
      { text: "A dog wearing three sweaters and a look of quiet disappointment.", rating: "FAMILY", tag: "scene" },
      { text: "A toddler presenting a serious slide deck to a houseplant.", rating: "FAMILY", tag: "scene" },
      { text: "A cat knocking over a chess piece with extreme deliberation.", rating: "FAMILY", tag: "scene" },
      { text: "An owl standing in a photocopier room at 2am.", rating: "FAMILY", tag: "scene" },
      { text: "A very tired dragon holding an 'employee of the month' plaque.", rating: "FAMILY", tag: "scene" },
      { text: "Two pigeons silently judging a food-truck line.", rating: "FAMILY", tag: "scene" },
      { text: "A cow breaking up a fight between two very small goats.", rating: "FAMILY", tag: "scene" },
      { text: "A single shoe left on a park bench with a Post-it that says 'thinking'.", rating: "STANDARD", tag: "scene" },
      { text: "A crab wearing a tiny top hat giving a speech to seagulls.", rating: "FAMILY", tag: "scene" },
      { text: "Someone's grandma high-fiving a bouncer outside a nightclub.", rating: "STANDARD", tag: "scene" },
      { text: "A very serious llama standing in front of a whiteboard.", rating: "FAMILY", tag: "scene" },
    ],
    seedCriteria: [
      { label: "Best Caption", rating: "FAMILY", hint: "Group-chat worthy." },
    ],
  },

  "villain-origin": {
    id: "villain-origin",
    name: "Villain Origin",
    tagline: "One tiny inconvenience. One tragic backstory.",
    description:
      "A small inconvenience is announced. Write the villain origin story it definitely caused. Voters pick the one they find tragically sympathetic.",
    scoring: "take",
    flow: "standard",
    submissionKind: "TEXT",
    secretCriterion: false,
    usesCriterion: true,
    submissionPlaceholder: "Write the villain origin…",
    submissionLabel: "Your origin",
    voteInstruction: () => "Whose origin feels *too* real?",
    revealKicker: "ORIGIN STORY",
    accent: "orchid",
    seedPrompts: [
      { text: "Stepping on a single Lego piece in the dark.", rating: "FAMILY", tag: "spark" },
      { text: "Finding the last slice eaten.", rating: "FAMILY", tag: "spark" },
      { text: "A group chat that went silent right after you spoke.", rating: "FAMILY", tag: "spark" },
      { text: "Microwave timer off by five seconds.", rating: "FAMILY", tag: "spark" },
      { text: "Someone who doesn't say 'bless you'.", rating: "FAMILY", tag: "spark" },
      { text: "Getting two very different coworker nicknames.", rating: "FAMILY", tag: "spark" },
      { text: "A birthday card from a parent in the wrong month.", rating: "STANDARD", tag: "spark" },
      { text: "A text that says 'we need to talk.'", rating: "STANDARD", tag: "spark" },
      { text: "An earbud that only works on one side.", rating: "FAMILY", tag: "spark" },
      { text: "A clothing tag that scratches for years.", rating: "FAMILY", tag: "spark" },
      { text: "A receipt that's just a little too long.", rating: "STANDARD", tag: "spark" },
      { text: "The phrase 'circling back.'", rating: "STANDARD", tag: "spark" },
    ],
    seedCriteria: [
      { label: "Most Sympathetic Villain", rating: "FAMILY", hint: "You kinda get it." },
    ],
  },

  "fortune-forge": {
    id: "fortune-forge",
    name: "Fortune Forge",
    tagline: "Write the fortune cookie nobody asked for.",
    description:
      "A theme is announced. Write the cursed, chaotic, or strangely correct fortune cookie message it generates. Everyone picks the one they'd post on the fridge.",
    scoring: "take",
    flow: "standard",
    submissionKind: "TEXT",
    secretCriterion: false,
    usesCriterion: true,
    submissionPlaceholder: "Your fortune…",
    submissionLabel: "Your fortune",
    voteInstruction: () => "Which fortune are you printing tonight?",
    revealKicker: "FORTUNES FORGED",
    accent: "sol",
    seedPrompts: [
      { text: "Fortunes about Tuesday", rating: "FAMILY", tag: "theme" },
      { text: "Fortunes from a very tired oracle", rating: "FAMILY", tag: "theme" },
      { text: "Fortunes for people running late", rating: "FAMILY", tag: "theme" },
      { text: "Fortunes for someone holding too many coffees", rating: "FAMILY", tag: "theme" },
      { text: "Fortunes for people who just got an email at 11pm", rating: "FAMILY", tag: "theme" },
      { text: "Fortunes about your houseplants", rating: "FAMILY", tag: "theme" },
      { text: "Fortunes for people standing in the wrong line", rating: "FAMILY", tag: "theme" },
      { text: "Fortunes from a retired wizard", rating: "FAMILY", tag: "theme" },
      { text: "Fortunes for someone who forgot what they came upstairs for", rating: "FAMILY", tag: "theme" },
      { text: "Fortunes for 3am decisions", rating: "STANDARD", tag: "theme" },
      { text: "Fortunes for the person who left the group on read", rating: "STANDARD", tag: "theme" },
      { text: "Fortunes for someone attending their own surprise party", rating: "STANDARD", tag: "theme" },
    ],
    seedCriteria: [
      { label: "Most Cursed", rating: "STANDARD", hint: "You will think about this later." },
    ],
  },

  "red-flag-rally": {
    id: "red-flag-rally",
    name: "Red Flag Rally",
    tagline: "Turn a red flag into a green flag. Somehow.",
    description:
      "A suspicious trait arrives. Write a context that flips it from red flag to green flag. Voters pick the most convincing flip.",
    scoring: "take",
    flow: "standard",
    submissionKind: "TEXT",
    secretCriterion: false,
    usesCriterion: true,
    submissionPlaceholder: "Make it make sense…",
    submissionLabel: "Your flip",
    voteInstruction: () => "Whose flip is the most believable?",
    revealKicker: "FLIP THE FLAG",
    accent: "neon",
    seedPrompts: [
      { text: "They have 47 unread voicemails from their mom.", rating: "FAMILY", tag: "flag" },
      { text: "They eat pizza with a knife and fork.", rating: "FAMILY", tag: "flag" },
      { text: "They own six identical sweaters.", rating: "FAMILY", tag: "flag" },
      { text: "They refuse to take any photo with their eyes closed.", rating: "FAMILY", tag: "flag" },
      { text: "They alphabetise their fridge.", rating: "FAMILY", tag: "flag" },
      { text: "They carry two phones on a first date.", rating: "STANDARD", tag: "flag" },
      { text: "They only reply to texts exactly four hours later.", rating: "STANDARD", tag: "flag" },
      { text: "They have a spreadsheet of their exes' pets.", rating: "STANDARD", tag: "flag" },
      { text: "They narrate their own cooking in third person.", rating: "FAMILY", tag: "flag" },
      { text: "They never sit with their back to the door.", rating: "STANDARD", tag: "flag" },
      { text: "They refer to their cat as 'my lawyer'.", rating: "FAMILY", tag: "flag" },
      { text: "They know the WiFi password of every café in town.", rating: "FAMILY", tag: "flag" },
    ],
    seedCriteria: [
      { label: "Most Convincing Flip", rating: "FAMILY", hint: "You actually bought it." },
    ],
  },

  "doodle-dash": {
    id: "doodle-dash",
    name: "Doodle Dash",
    tagline: "Draw the prompt. Nail the vibe. No skill required.",
    description:
      "Each round, everyone gets the same prompt and 60 seconds to doodle it on their phone. Drawings are revealed anonymously on the big screen — vote for the one that nails the spirit.",
    scoring: "take",
    flow: "standard",
    submissionKind: "DRAWING",
    secretCriterion: false,
    usesCriterion: true,
    submissionPlaceholder: "Tap to draw…",
    submissionLabel: "Your drawing",
    voteInstruction: () => "Which doodle wins the room?",
    revealKicker: "DOODLES DROPPED",
    submitSeconds: 60,
    voteSeconds: 25,
    accent: "neon",
    seedPrompts: [
      { text: "A pirate at the laundromat", rating: "FAMILY", tag: "scene" },
      { text: "A dinosaur trying to text", rating: "FAMILY", tag: "scene" },
      { text: "A ghost on their coffee break", rating: "FAMILY", tag: "scene" },
      { text: "A squirrel with a plan", rating: "FAMILY", tag: "scene" },
      { text: "An alien's first sandwich", rating: "FAMILY", tag: "scene" },
      { text: "A wizard stuck in traffic", rating: "FAMILY", tag: "scene" },
      { text: "A robot doing yoga", rating: "FAMILY", tag: "scene" },
      { text: "A penguin as a stand-up comedian", rating: "FAMILY", tag: "scene" },
      { text: "A cowboy in a library", rating: "FAMILY", tag: "scene" },
      { text: "A chef who only cooks breakfast", rating: "FAMILY", tag: "scene" },
      { text: "A cat running a yard sale", rating: "FAMILY", tag: "scene" },
      { text: "A vampire at a pool party", rating: "STANDARD", tag: "scene" },
    ],
    seedCriteria: [
      { label: "Best Doodle", rating: "FAMILY", hint: "Nails the prompt. Extra style." },
    ],
  },

  "tap-rally": {
    id: "tap-rally",
    name: "Tap Rally",
    tagline: "No typing. No voting. Just speed.",
    description:
      "Targets fly across your phone. Tap them as fast as you can before they escape. The screen is chaos. Highest score on the board wins the round — leaderboard updates live.",
    scoring: "reaction",
    flow: "reaction",
    submissionKind: "TAP",
    secretCriterion: false,
    usesCriterion: false,
    submissionPlaceholder: "Tap the targets!",
    submissionLabel: "Score",
    voteInstruction: () => "",
    revealKicker: "TAP RACE",
    submitSeconds: 25,
    accent: "ember",
    seedPrompts: [
      { text: "Speed Round", rating: "FAMILY", tag: "pace", detail: "Fast spawns, short lifetimes." },
      { text: "Steady Aim", rating: "FAMILY", tag: "pace", detail: "Slower targets, bigger combos." },
      { text: "Chaos Burst", rating: "FAMILY", tag: "pace", detail: "Targets everywhere, all at once." },
      { text: "Sniper Alley", rating: "FAMILY", tag: "pace", detail: "Small targets, big points." },
      { text: "Big Flash", rating: "FAMILY", tag: "pace", detail: "Large targets, rapid-fire." },
      { text: "Grand Rally", rating: "FAMILY", tag: "pace", detail: "Mixed speeds, full chaos." },
    ],
  },

  "wager-royale": {
    id: "wager-royale",
    name: "Wager Royale",
    tagline: "Know the answer? Bet on yourself.",
    description:
      "A trivia question drops. Pick your answer from four choices. Then set your wager — 100 to 1000 points. Correct wins your wager. Wrong costs it. Bold bets, big leaderboard swings.",
    scoring: "quiz",
    flow: "quiz",
    submissionKind: "QUIZ",
    secretCriterion: false,
    usesCriterion: false,
    submissionPlaceholder: "Pick one…",
    submissionLabel: "Your answer",
    voteInstruction: () => "",
    revealKicker: "THE TRUTH IS",
    submitSeconds: 25,
    revealSeconds: 6,
    accent: "sol",
    seedPrompts: [
      {
        text: "Which of these creatures has three hearts?",
        choices: ["Octopus", "Giraffe", "Jellyfish", "Flamingo"],
        truth: "Octopus",
        rating: "FAMILY",
        tag: "biology",
      },
      {
        text: "Which planet has the most moons?",
        choices: ["Jupiter", "Saturn", "Uranus", "Neptune"],
        truth: "Saturn",
        rating: "FAMILY",
        tag: "space",
        detail: "Counting confirmed natural satellites.",
      },
      {
        text: "A 'murmuration' describes a group of what?",
        choices: ["Owls", "Starlings", "Bats", "Bees"],
        truth: "Starlings",
        rating: "FAMILY",
        tag: "nature",
      },
      {
        text: "Which instrument has exactly 88 keys?",
        choices: ["Piano", "Harpsichord", "Accordion", "Organ"],
        truth: "Piano",
        rating: "FAMILY",
        tag: "music",
      },
      {
        text: "Which country has the most time zones?",
        choices: ["United States", "Russia", "France", "China"],
        truth: "France",
        rating: "FAMILY",
        tag: "geography",
        detail: "Counting overseas territories.",
      },
      {
        text: "Honey never does what?",
        choices: ["Crystallize", "Spoil", "Dissolve", "Freeze"],
        truth: "Spoil",
        rating: "FAMILY",
        tag: "food",
      },
      {
        text: "Which common fruit is botanically a berry?",
        choices: ["Strawberry", "Raspberry", "Banana", "Blackberry"],
        truth: "Banana",
        rating: "FAMILY",
        tag: "food",
      },
      {
        text: "Which language has the most native speakers worldwide?",
        choices: ["English", "Hindi", "Spanish", "Mandarin Chinese"],
        truth: "Mandarin Chinese",
        rating: "FAMILY",
        tag: "language",
      },
      {
        text: "Which of these is *not* actually an element on the periodic table?",
        choices: ["Mercury", "Promethium", "Unobtainium", "Einsteinium"],
        truth: "Unobtainium",
        rating: "FAMILY",
        tag: "science",
      },
      {
        text: "In chess, which piece can only move diagonally?",
        choices: ["Knight", "Rook", "Bishop", "Queen"],
        truth: "Bishop",
        rating: "FAMILY",
        tag: "games",
      },
      {
        text: "The tallest waterfall in the world is in which country?",
        choices: ["Brazil", "Norway", "Venezuela", "South Africa"],
        truth: "Venezuela",
        rating: "FAMILY",
        tag: "geography",
      },
      {
        text: "What is the only mammal capable of true flight?",
        choices: ["Flying squirrel", "Sugar glider", "Bat", "Colugo"],
        truth: "Bat",
        rating: "FAMILY",
        tag: "biology",
      },
    ],
  },
};

export const GAME_LIST: GameDefinition[] = Object.values(GAMES);

export function getGame(id: string): GameDefinition {
  return GAMES[id] ?? GAMES["hot-take-hustle"];
}
