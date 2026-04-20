import Link from "next/link";
import { CreateRoomForm } from "@/components/CreateRoomForm";
import { JoinRoomForm } from "@/components/JoinRoomForm";
import { GAME_LIST } from "@/games/registry";

export default function Landing() {
  return (
    <main className="relative mx-auto max-w-6xl px-5 py-10 sm:py-16">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-ember shadow-[0_0_18px_rgba(255,79,123,0.5)]">
            <span className="font-display text-lg font-bold">C</span>
          </div>
          <span className="font-display text-xl font-semibold">CrowdCircuit</span>
        </div>
        <nav className="hidden gap-6 text-sm text-mist/70 sm:flex">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <Link href="/play">Join a room</Link>
        </nav>
      </header>

      <section className="mt-14 grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div>
          <div className="cc-chip mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-neon animate-pulseSoft" />
            Live preview • MVP build
          </div>
          <h1 className="text-5xl font-semibold leading-[1.05] sm:text-6xl">
            Party games your friends will actually
            <span className="text-ember"> text about.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-mist/80">
            One shared screen. Phones as controllers. Weird prompts, sharper
            takes, and a host persona that doesn&apos;t make you cringe. Built for
            3–10 players with audience mode for the rest of the couch.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            <CreateRoomForm />
            <JoinRoomForm />
          </div>
          <p className="mt-4 text-xs text-mist/50">
            No account needed • Reconnect-friendly • Streamer-mode ready
          </p>
        </div>
        <div className="relative hidden lg:block">
          <HeroArtwork />
        </div>
      </section>

      <section id="features" className="mt-24 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="cc-card p-5">
            <div className="mb-2 text-sm font-semibold text-neon">{f.kicker}</div>
            <div className="text-xl font-semibold">{f.title}</div>
            <div className="mt-2 text-sm text-mist/70">{f.body}</div>
          </div>
        ))}
      </section>

      <section id="games" className="mt-24">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-3xl font-semibold">The pack</h2>
            <p className="mt-1 text-mist/70">
              {GAME_LIST.length} original games in one room. Host picks the vibe.
            </p>
          </div>
          <div className="hidden text-xs text-mist/60 sm:block">
            All legally distinct. All ours.
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {GAME_LIST.map((g) => {
            const accent = {
              ember: "text-ember",
              neon: "text-neon",
              sol: "text-sol",
              orchid: "text-orchid",
            }[g.accent];
            return (
              <div key={g.id} className="cc-card p-4">
                <div className={`text-sm font-semibold ${accent}`}>{g.name}</div>
                <div className="mt-1 text-xs italic text-mist/70">{g.tagline}</div>
                <div className="mt-2 text-xs text-mist/60 line-clamp-4">{g.description}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section id="how" className="mt-24">
        <h2 className="text-3xl font-semibold">How a round actually feels</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {HOW.map((h, i) => (
            <div key={h.title} className="cc-card p-5">
              <div className="text-xs text-mist/50">Step {i + 1}</div>
              <div className="mt-1 text-lg font-semibold">{h.title}</div>
              <div className="mt-2 text-sm text-mist/70">{h.body}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-24 flex flex-col items-center justify-between gap-3 border-t border-white/5 py-8 text-sm text-mist/50 sm:flex-row">
        <div>© {new Date().getFullYear()} CrowdCircuit. An original party platform.</div>
        <div>Play nice. Report things that aren&apos;t.</div>
      </footer>
    </main>
  );
}

const FEATURES = [
  {
    kicker: "HOST DISPLAY",
    title: "Cinematic host screen",
    body: "A separate, streamer-friendly layout for the TV. Room code, player list, phase transitions, big readable answers.",
  },
  {
    kicker: "PHONE CONTROLLER",
    title: "Thumb-first gameplay",
    body: "Big tap targets, phase-aware UI, instant reconnect on refresh or signal drop. Works on tiny screens.",
  },
  {
    kicker: "MODERATION",
    title: "Family mode + filters",
    body: "Word filters, rating-aware prompts, optional family mode, one-tap report on any custom take.",
  },
  {
    kicker: "AUDIENCE MODE",
    title: "Bring the whole couch",
    body: "Players cap at 10. Everyone else votes as audience with balanced weighted voting.",
  },
  {
    kicker: "RESILIENCE",
    title: "Refresh-proof",
    body: "Session tokens restore your seat. Server-authoritative timers mean no trust on the client.",
  },
  {
    kicker: "ACCESSIBILITY",
    title: "Readable + reduced-motion",
    body: "High contrast, screen-reader labels, keyboard focus styles, reduced motion by default.",
  },
];

const HOW = [
  {
    title: "Everyone gets a prompt",
    body: "Silly, sharp, or slightly chaotic. Written to spark takes, not essays.",
  },
  {
    title: "Submit in 45 seconds",
    body: "Then takes reveal on the host screen while the phones cool off.",
  },
  {
    title: "Vote by the secret criterion",
    body: "Funniest? Pettiest? Spiciest? The rule drops at voting time.",
  },
];

function HeroArtwork() {
  return (
    <div className="relative mx-auto aspect-square max-w-md">
      <div className="absolute inset-0 rounded-[3rem] bg-gradient-to-br from-orchid/60 via-ember/40 to-neon/60 blur-xl opacity-60" />
      <div className="absolute inset-2 cc-card flex flex-col justify-between p-6">
        <div>
          <div className="cc-chip">ROUND 3 • HOT TAKE HUSTLE</div>
          <p className="mt-4 text-2xl font-semibold leading-snug">
            Invent a reality show nobody asked for.
          </p>
        </div>
        <div className="space-y-2">
          <div className="rounded-xl bg-white/5 p-3 text-sm text-mist/80">“Divorcees vs. a Trampoline.”</div>
          <div className="rounded-xl bg-white/5 p-3 text-sm text-mist/80">“Line Cooks Who Lie.”</div>
          <div className="rounded-xl bg-ember/20 p-3 text-sm text-mist">“My In-Laws Review My Finances.”</div>
        </div>
        <div className="flex items-center justify-between text-xs text-mist/60">
          <span>Criterion: Pettiest</span>
          <span className="cc-chip">0:12</span>
        </div>
      </div>
    </div>
  );
}
