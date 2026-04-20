import { PrismaClient } from "@prisma/client";
import { GAME_LIST } from "../src/games/registry";

const prisma = new PrismaClient();

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function main() {
  let promptCount = 0;
  let criterionCount = 0;

  for (const game of GAME_LIST) {
    // Seed prompts per game. IDs are deterministic so re-running is idempotent.
    for (const p of game.seedPrompts) {
      const id = `seed-${game.id}-p-${slug(p.text)}`;
      const choices = p.choices ? JSON.stringify(p.choices) : null;
      await prisma.prompt.upsert({
        where: { id },
        update: {
          gameId: game.id,
          text: p.text,
          rating: p.rating,
          tag: p.tag,
          truth: p.truth ?? null,
          choices,
          detail: p.detail ?? null,
        },
        create: {
          id,
          gameId: game.id,
          text: p.text,
          rating: p.rating,
          tag: p.tag,
          truth: p.truth ?? null,
          choices,
          detail: p.detail ?? null,
        },
      });
      promptCount++;
    }

    if (game.seedCriteria) {
      for (const c of game.seedCriteria) {
        const id = `seed-${game.id}-c-${slug(c.label)}`;
        await prisma.criterion.upsert({
          where: { id },
          update: { gameId: game.id, label: c.label, rating: c.rating, hint: c.hint },
          create: { id, gameId: game.id, label: c.label, rating: c.rating, hint: c.hint },
        });
        criterionCount++;
      }
    }
  }

  console.log(
    `Seeded ${GAME_LIST.length} games, ${promptCount} prompts, ${criterionCount} criteria.`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
