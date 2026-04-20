import { PrismaClient, Rating } from "@prisma/client";

const prisma = new PrismaClient();

const prompts: { text: string; rating: Rating; tag?: string }[] = [
  { text: "Rank these breakfast foods by how much they respect you.", rating: "FAMILY", tag: "food" },
  { text: "Name a fake holiday everyone would secretly celebrate.", rating: "FAMILY", tag: "invention" },
  { text: "What is the most embarrassing superpower you could still brag about?", rating: "FAMILY", tag: "what-if" },
  { text: "Describe a new Olympic sport that requires zero athletic ability.", rating: "FAMILY", tag: "sports" },
  { text: "Pitch a sequel to a boring household object.", rating: "FAMILY", tag: "invention" },
  { text: "Invent a warning label nobody would ever follow.", rating: "FAMILY", tag: "absurd" },
  { text: "Give a motivational quote for people who just hit snooze six times.", rating: "FAMILY", tag: "life" },
  { text: "What would a dog write in its Yelp review of your house?", rating: "FAMILY", tag: "pets" },
  { text: "Name a new flavor of gum that shouldn't exist.", rating: "FAMILY", tag: "food" },
  { text: "Write a tiny pep talk for a vegetable about to become soup.", rating: "FAMILY", tag: "absurd" },
  { text: "Describe the worst possible theme song for a wedding entrance.", rating: "FAMILY", tag: "music" },
  { text: "Name an app that would thrive only in a haunted house.", rating: "FAMILY", tag: "tech" },
  { text: "What's the most chaotic thing to shout at a library?", rating: "STANDARD", tag: "chaos" },
  { text: "Invent a reality show nobody asked for.", rating: "STANDARD", tag: "tv" },
  { text: "Write a dating profile bio for a raccoon with ambition.", rating: "STANDARD", tag: "dating" },
  { text: "Give a suspicious excuse for being 3 hours late to a video call.", rating: "STANDARD", tag: "work" },
  { text: "Name a band that would headline a grocery store parking lot.", rating: "STANDARD", tag: "music" },
  { text: "Write a cursed fortune cookie message.", rating: "STANDARD", tag: "absurd" },
  { text: "Describe a luxury product that is somehow also deeply sad.", rating: "STANDARD", tag: "branding" },
  { text: "What is a red flag at a first date that is somehow also charming?", rating: "STANDARD", tag: "dating" },
  { text: "Invent a conspiracy theory about a vegetable.", rating: "STANDARD", tag: "absurd" },
  { text: "Pitch a self-help book written by a tired crow.", rating: "STANDARD", tag: "life" },
  { text: "What's an unreasonable demand you'd make as a tiny medieval king?", rating: "STANDARD", tag: "history" },
  { text: "Suggest a worst-case addition to a children's cereal.", rating: "STANDARD", tag: "food" },
];

const criteria: { label: string; rating: Rating; hint?: string }[] = [
  { label: "Funniest", rating: "FAMILY", hint: "The one that actually made you laugh." },
  { label: "Most Chaotic", rating: "FAMILY", hint: "Full unhinged energy." },
  { label: "Most Convincing", rating: "FAMILY", hint: "Could be true in the right universe." },
  { label: "Weirdest", rating: "FAMILY", hint: "Made your brain tilt." },
  { label: "Most Heartwarming", rating: "FAMILY", hint: "A little sparkle of kindness." },
  { label: "Sharpest", rating: "FAMILY", hint: "Clean, precise, and cutting." },
  { label: "Most Petty", rating: "STANDARD", hint: "Small energy, max commitment." },
  { label: "Most Spicy", rating: "STANDARD", hint: "Bold takes only." },
  { label: "Most Cursed", rating: "STANDARD", hint: "You'll think about it later tonight." },
  { label: "Most Likely to Start a Fight", rating: "STANDARD", hint: "But a friendly one." },
  { label: "Most Gremlin", rating: "STANDARD", hint: "Tiny, mischievous, proud." },
  { label: "Most Marketable", rating: "STANDARD", hint: "A VC would give you money for it." },
];

async function main() {
  console.log("Seeding CrowdCircuit prompts & criteria...");
  for (const p of prompts) {
    await prisma.prompt.upsert({
      where: { id: `seed-prompt-${p.text.slice(0, 30)}` },
      update: {},
      create: { id: `seed-prompt-${p.text.slice(0, 30)}`, ...p },
    });
  }
  for (const c of criteria) {
    await prisma.criterion.upsert({
      where: { id: `seed-crit-${c.label}` },
      update: {},
      create: { id: `seed-crit-${c.label}`, ...c },
    });
  }
  console.log(`Seeded ${prompts.length} prompts and ${criteria.length} criteria.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
