"use client";

import { useEffect, useMemo, useState } from "react";
import { useRoomStore } from "@/stores/useRoomStore";
import { getSocket } from "@/lib/socketClient";
import { Countdown } from "./Countdown";
import type { ActionResult, GameCard, RoomSnapshot } from "@/lib/types";
import { DrawingView, tryParseDrawing } from "./DrawingView";

const accentToClass: Record<GameCard["accent"], { chip: string; heading: string }> = {
  ember: { chip: "!bg-ember/20 !text-ember", heading: "text-ember" },
  neon: { chip: "!bg-neon/20 !text-neon", heading: "text-neon" },
  sol: { chip: "!bg-sol/20 !text-sol", heading: "text-sol" },
  orchid: { chip: "!bg-orchid/20 !text-orchid", heading: "text-orchid" },
};

function currentGame(snapshot: RoomSnapshot | null): GameCard | null {
  if (!snapshot) return null;
  const id = snapshot.round?.gameId ?? snapshot.currentGameId ?? snapshot.selectedGameId;
  return snapshot.games.find((g) => g.id === id) ?? null;
}

export function HostView() {
  const { snapshot, session } = useRoomStore();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!snapshot || !session) return <FullscreenLoader />;
  const hostMode = session.isHost;

  function act(event: "host:startMatch" | "host:nextPhase" | "host:endMatch") {
    setError(null);
    setBusy(true);
    const socket = getSocket();
    const cb = (res: ActionResult) => {
      setBusy(false);
      if (!res.ok) setError(res.reason);
    };
    if (event === "host:startMatch") socket.emit("host:startMatch", cb);
    else if (event === "host:nextPhase") socket.emit("host:nextPhase", cb);
    else socket.emit("host:endMatch", cb);
  }

  function updateSettings(patch: {
    familyMode?: boolean;
    streamerMode?: boolean;
    selectedGameId?: string;
  }) {
    getSocket().emit("host:updateSettings", patch, () => {});
  }

  const game = currentGame(snapshot);

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-6 py-8">
      <Header streamerLean={snapshot.streamerMode} />
      {snapshot.phase === "LOBBY" && (
        <LobbyPanel
          hostMode={hostMode}
          onStart={() => act("host:startMatch")}
          onUpdate={updateSettings}
          busy={busy}
          error={error}
        />
      )}
      {snapshot.phase === "SUBMIT" && <SubmitPanel game={game} />}
      {snapshot.phase === "REVEAL" && <RevealPanel game={game} />}
      {snapshot.phase === "VOTE" && <VotePanel game={game} />}
      {snapshot.phase === "SCORE" && <ScorePanel />}
      {snapshot.phase === "MATCH_END" && <MatchEndPanel />}
      <HostControls
        hostMode={hostMode}
        onNext={() => act("host:nextPhase")}
        onEnd={() => act("host:endMatch")}
        busy={busy}
      />
    </main>
  );
}

function Header({ streamerLean }: { streamerLean: boolean }) {
  const { snapshot } = useRoomStore();
  if (!snapshot) return null;
  const game = currentGame(snapshot);
  return (
    <header className="flex flex-col items-center gap-2 text-center">
      {!streamerLean && (
        <div className="cc-chip">
          <span>CrowdCircuit{game ? ` • ${game.name}` : ""}</span>
        </div>
      )}
      <div className="text-sm uppercase tracking-[0.35em] text-mist/60">Room code</div>
      <div className="cc-code">{snapshot.code}</div>
      <div className="text-sm text-mist/60">
        {snapshot.players.length} player{snapshot.players.length === 1 ? "" : "s"} •{" "}
        {snapshot.audienceCount} in audience
      </div>
    </header>
  );
}

function LobbyPanel({
  hostMode,
  onStart,
  onUpdate,
  busy,
  error,
}: {
  hostMode: boolean;
  onStart: () => void;
  onUpdate: (patch: {
    familyMode?: boolean;
    streamerMode?: boolean;
    selectedGameId?: string;
  }) => void;
  busy: boolean;
  error: string | null;
}) {
  const { snapshot } = useRoomStore();
  if (!snapshot) return null;
  return (
    <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <GamePicker
        games={snapshot.games}
        selectedId={snapshot.selectedGameId}
        hostMode={hostMode}
        onPick={(id) => onUpdate({ selectedGameId: id })}
      />
      <div className="space-y-6">
        <div className="cc-card p-6">
          <h2 className="text-lg font-semibold">Players in the room</h2>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {snapshot.players.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl bg-white/5 p-2.5 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-base"
                    style={{ background: p.avatarColor }}
                    aria-hidden
                  >
                    {p.avatarEmoji}
                  </span>
                  <span className="truncate font-medium">
                    {p.displayName}
                    {p.isHost && <span className="ml-2 text-xs text-neon">HOST</span>}
                  </span>
                </span>
                <span
                  className={`h-2 w-2 rounded-full ${p.connected ? "bg-neon" : "bg-white/30"}`}
                  title={p.connected ? "Connected" : "Disconnected"}
                />
              </li>
            ))}
            {snapshot.players.length === 0 && (
              <li className="col-span-full text-sm text-mist/60">
                Share the room code — players can join from their phone.
              </li>
            )}
          </ul>
          <div className="mt-3 text-xs text-mist/60">
            {snapshot.audienceCount > 0 && `${snapshot.audienceCount} in audience.`}
          </div>
        </div>
        <div className="cc-card p-6">
          <h3 className="text-lg font-semibold">Ready up</h3>
          <p className="mt-1 text-sm text-mist/70">
            Need at least 3 players. Max 10. Unlimited audience.
          </p>
          {hostMode ? (
            <>
              <div className="mt-4 space-y-2">
                <Toggle
                  label="Family mode"
                  description="Softer prompts and gentler criteria."
                  checked={snapshot.familyMode}
                  onChange={(v) => onUpdate({ familyMode: v })}
                />
                <Toggle
                  label="Streamer mode"
                  description="Cleaner host display for overlays."
                  checked={snapshot.streamerMode}
                  onChange={(v) => onUpdate({ streamerMode: v })}
                />
              </div>
              {error && (
                <div role="alert" className="mt-3 text-sm text-ember">
                  {error}
                </div>
              )}
              <button
                onClick={onStart}
                disabled={busy}
                className="cc-btn-primary mt-6 w-full"
              >
                {busy ? "Starting…" : "Start match"}
              </button>
            </>
          ) : (
            <p className="mt-4 text-sm text-mist/70">
              Waiting on the host to start the match.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function GamePicker({
  games,
  selectedId,
  hostMode,
  onPick,
}: {
  games: GameCard[];
  selectedId: string;
  hostMode: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <div className="cc-card p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pick a game</h2>
        <span className="text-xs text-mist/60">{games.length} available</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {games.map((g) => {
          const active = g.id === selectedId;
          const accent = accentToClass[g.accent];
          return (
            <button
              key={g.id}
              type="button"
              disabled={!hostMode}
              onClick={() => hostMode && onPick(g.id)}
              className={`rounded-2xl border p-4 text-left transition ${
                active
                  ? "border-ember bg-ember/10 shadow-[0_0_24px_rgba(255,79,123,0.25)]"
                  : "border-white/10 bg-white/[0.03] hover:border-white/30 disabled:cursor-default"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`text-base font-semibold ${accent.heading}`}>{g.name}</div>
                {active && <span className="cc-chip !bg-ember/20 !text-ember">Selected</span>}
              </div>
              <div className="mt-1 text-sm italic text-mist/70">{g.tagline}</div>
              <div className="mt-2 text-xs text-mist/60 line-clamp-3">{g.description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SubmitPanel({ game }: { game: GameCard | null }) {
  const { snapshot } = useRoomStore();
  if (!snapshot?.round) return null;
  const r = snapshot.round;
  const accent = game ? accentToClass[game.accent] : null;
  const isTap = r.flow === "reaction";
  const isQuiz = r.flow === "quiz";
  const isDrawing = r.submissionKind === "DRAWING";
  const isPercent = game?.scoring === "percent";
  const isHerd = game?.scoring === "herd";
  const isTrace = game?.scoring === "trace";
  const isColor = game?.scoring === "color";
  const isMultiStage = (r.totalStages ?? 1) > 1;
  const stageLabel =
    isMultiStage && game?.id === "stroke-of-genius"
      ? r.stage === 0
        ? "Stage 1 • Seed phrase"
        : r.stage === 1
        ? "Stage 2 • Draw the phrase"
        : "Stage 3 • Guess the drawing"
      : isMultiStage && game?.id === "mash-up-doodle"
      ? r.stage === 0
        ? "Stage 1 • Icon"
        : "Stage 2 • Slogan"
      : null;

  const isFinalRound = r.number === r.total;
  return (
    <section className="cc-card mx-auto w-full max-w-4xl p-10 text-center">
      {isFinalRound && (
        <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-ember/60 bg-ember/15 px-4 py-1 text-xs uppercase tracking-widest text-ember">
          <span className="h-1.5 w-1.5 animate-pulseSoft rounded-full bg-ember" />
          Final Round — all points count 2×
        </div>
      )}
      <div className="flex items-center justify-center gap-3 text-sm text-mist/60">
        <span>{game?.name}</span>
        <span>•</span>
        <span>
          Round {r.number} of {r.total}
        </span>
        <Countdown endsAt={r.phaseEndsAt} />
      </div>
      {stageLabel && (
        <div className="mt-3 inline-block rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs uppercase tracking-widest text-mist/70">
          {stageLabel}
        </div>
      )}
      <h2 className={`mt-4 text-3xl font-semibold sm:text-5xl ${accent?.heading ?? ""}`}>
        {isColor ? r.prompt : r.prompt}
      </h2>
      {r.promptDetail && (
        <p className="mt-2 text-lg text-mist/70">{r.promptDetail}</p>
      )}
      {isColor && r.truth && (
        <TargetColorSwatch colorCsv={r.truth} />
      )}
      {isTrace && r.prompt && <TraceGuidePreview name={r.prompt} />}
      <p className="mt-4 text-mist/60">
        {isTap
          ? "Phones are the race track. Tap everything that pops."
          : isPercent
          ? "Slide to your best guess. Closest to the real number wins."
          : isHerd
          ? "Type the first word the room would agree on. Match the herd, bank the points."
          : isTrace
          ? "Trace the shape on your phone. Accuracy × speed."
          : isColor
          ? "Dial R, G, B on your phone until your swatch matches the target."
          : isQuiz
          ? "Pick your answer and set your wager."
          : game?.flow === "chain"
          ? r.stage === 0
            ? "Write a short, vivid seed phrase."
            : r.stage === 1
            ? "Draw the phrase a teammate just handed you."
            : "Guess what the previous drawing was trying to say."
          : game?.flow === "combo"
          ? r.stage === 0
            ? "Draw an icon for the mash-up."
            : "Write a snappy slogan — we'll pair it with someone else's icon."
          : isDrawing
          ? "Draw on your phone. Pixel quality not required."
          : game?.scoring === "fib"
          ? "Write a fake answer that sounds true. The real one is in here too."
          : r.criterionHidden
          ? "Take out your phones. The criterion drops at voting time."
          : `Write the ${game?.name.toLowerCase()}.`}
      </p>
      {isQuiz && !isPercent && !isHerd && !isColor && r.choices && (
        <ul className="mx-auto mt-6 grid max-w-2xl gap-2 sm:grid-cols-2">
          {r.choices.map((c, i) => (
            <li
              key={c}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-lg"
            >
              <span className="mr-2 font-mono text-sol">
                {String.fromCharCode(65 + i)}.
              </span>
              {c}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {snapshot.players.map((p) => (
          <span
            key={p.id}
            className={`cc-chip flex items-center gap-2 ${
              r.submittedPlayerIds.includes(p.id) ? "!bg-neon/20 !text-neon" : ""
            }`}
          >
            <span
              className="grid h-5 w-5 place-items-center rounded-full text-sm"
              style={{ background: p.avatarColor }}
              aria-hidden
            >
              {p.avatarEmoji}
            </span>
            {p.displayName}
            {r.submittedPlayerIds.includes(p.id) ? " ✓" : " …"}
          </span>
        ))}
      </div>
    </section>
  );
}

function TargetColorSwatch({ colorCsv }: { colorCsv: string }) {
  const [r, g, b] = colorCsv
    .split(",")
    .map((s) => Math.max(0, Math.min(255, Math.round(Number(s)))));
  return (
    <div className="mx-auto mt-6 flex w-full max-w-md flex-col items-center">
      <div className="text-xs uppercase tracking-widest text-mist/60">Target color</div>
      <div
        className="mt-2 h-32 w-full rounded-2xl border border-white/10 shadow-[0_0_40px_rgba(255,255,255,0.1)]"
        style={{ background: `rgb(${r},${g},${b})` }}
        aria-label="Target color swatch"
      />
    </div>
  );
}

// Show the guide curve shape on the TV so everyone knows what's being traced.
function TraceGuidePreview({ name }: { name: string }) {
  const guides: Record<string, string> = {
    Spiral:
      (() => {
        let d = "";
        for (let i = 0; i <= 59; i++) {
          const t = i / 59;
          const angle = t * Math.PI * 4;
          const radius = 6 + t * 36;
          const x = 50 + Math.cos(angle) * radius;
          const y = 50 + Math.sin(angle) * radius;
          d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)} `;
        }
        return d.trim();
      })(),
    Star: (() => {
      let d = "";
      const outer = 42,
        inner = 18;
      for (let i = 0; i <= 10; i++) {
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        const r = i % 2 === 0 ? outer : inner;
        const x = 50 + Math.cos(a) * r;
        const y = 50 + Math.sin(a) * r;
        d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)} `;
      }
      return d.trim();
    })(),
    Wave: (() => {
      let d = "";
      for (let i = 0; i <= 59; i++) {
        const t = i / 59;
        const x = 8 + t * 84;
        const y = 50 + Math.sin(t * Math.PI * 3) * 26;
        d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)} `;
      }
      return d.trim();
    })(),
    Heart: (() => {
      let d = "";
      for (let i = 0; i <= 59; i++) {
        const t = (i / 59) * Math.PI * 2;
        const xo = 16 * Math.pow(Math.sin(t), 3);
        const yo =
          13 * Math.cos(t) -
          5 * Math.cos(2 * t) -
          2 * Math.cos(3 * t) -
          Math.cos(4 * t);
        const x = 50 + xo * 2.2;
        const y = 50 - yo * 2.2;
        d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)} `;
      }
      return d.trim();
    })(),
    Lightning:
      "M55 8 L28 45 L48 48 L30 92 L72 44 L52 44 L62 12",
    "Loop-the-loop": (() => {
      let d = "";
      for (let i = 0; i < 30; i++) {
        const t = i / 29;
        const x = 18 + t * 30;
        const y = 32 + Math.sin(t * Math.PI * 2) * 18;
        d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)} `;
      }
      for (let i = 0; i < 30; i++) {
        const t = i / 29;
        const x = 52 + t * 30;
        const y = 68 + Math.sin(t * Math.PI * 2) * 18;
        d += `L${x.toFixed(2)} ${y.toFixed(2)} `;
      }
      return d.trim();
    })(),
  };
  const d = guides[name] ?? guides.Wave;
  return (
    <div className="mx-auto mt-6 w-full max-w-sm">
      <div className="text-xs uppercase tracking-widest text-mist/60">Trace this shape</div>
      <div className="mt-2 aspect-square w-full rounded-2xl border border-white/10 bg-gradient-to-br from-neon/10 via-black to-sol/10 p-2">
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <path
            d={d}
            stroke="#7cf8d0"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray="3 2"
          />
        </svg>
      </div>
    </div>
  );
}

function RevealPanel({ game }: { game: GameCard | null }) {
  const { snapshot } = useRoomStore();
  if (!snapshot?.round) return null;
  const r = snapshot.round;
  const isQuiz = r.flow === "quiz";
  const isDrawing = r.submissionKind === "DRAWING";
  const isPercent = game?.scoring === "percent";
  const isHerd = game?.scoring === "herd";
  const isColor = game?.scoring === "color";

  if (game?.flow === "chain" && r.chains) {
    return <ChainRevealPanel chains={r.chains} roundNumber={r.number} gameName={game.name} />;
  }

  if (game?.flow === "combo" && r.mashups) {
    return <MashupRevealPanel mashups={r.mashups} roundNumber={r.number} gameName={game.name} />;
  }

  if (isColor) {
    const [tr, tg, tb] = (r.truth ?? "0,0,0")
      .split(",")
      .map((s) => Math.max(0, Math.min(255, Math.round(Number(s)))));
    return (
      <section className="cc-card mx-auto w-full max-w-5xl p-10 text-center">
        <div className="text-sm text-mist/60">
          {game?.name} • Round {r.number}
        </div>
        <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{r.prompt}</h2>
        <div className="mx-auto mt-6 grid max-w-3xl gap-4 sm:grid-cols-2">
          <div className="cc-card border-orchid/40 bg-orchid/10 p-4">
            <div className="text-xs uppercase tracking-widest text-orchid">Target</div>
            <div
              className="mt-2 h-40 w-full rounded-xl border border-white/10"
              style={{ background: `rgb(${tr},${tg},${tb})` }}
            />
          </div>
          <div className="cc-card p-4">
            <div className="text-xs uppercase tracking-widest text-mist/60">Players' picks</div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {r.reveal.map((item, i) => {
                let pr = 0,
                  pg = 0,
                  pb = 0;
                try {
                  const parsed = JSON.parse(item.text);
                  pr = Number(parsed?.r) || 0;
                  pg = Number(parsed?.g) || 0;
                  pb = Number(parsed?.b) || 0;
                } catch {
                  // zeros
                }
                const dr = pr - tr;
                const dg = pg - tg;
                const db = pb - tb;
                const dist = Math.sqrt(dr * dr + dg * dg + db * db);
                const close = dist <= 25;
                return (
                  <div
                    key={item.submissionId ?? i}
                    className={`aspect-square rounded-lg border ${
                      close ? "border-neon shadow-[0_0_24px_rgba(124,248,208,0.6)]" : "border-white/10"
                    }`}
                    style={{ background: `rgb(${pr},${pg},${pb})` }}
                    title={close ? "Bullseye" : `Off by ${Math.round(dist)}`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (isPercent) {
    const truthNum = Number(r.truth ?? "0");
    const guesses = r.reveal
      .map((item) => {
        const v = parsePercentGuess(item.text);
        return { item, value: v, diff: Math.abs(v - truthNum) };
      })
      .sort((a, b) => a.diff - b.diff);
    return (
      <section className="cc-card mx-auto w-full max-w-4xl p-10 text-center">
        <div className="text-sm text-mist/60">
          {game?.name} • Round {r.number}
        </div>
        <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{r.prompt}</h2>
        {r.truth && (
          <div className="mx-auto mt-6 inline-flex flex-col items-center rounded-2xl border border-orchid/40 bg-orchid/10 px-10 py-5">
            <div className="text-xs uppercase tracking-widest text-orchid">
              The real answer
            </div>
            <div className="mt-1 text-6xl font-semibold text-orchid">
              {truthNum}
              <span className="text-3xl text-orchid/60">%</span>
            </div>
          </div>
        )}
        {guesses.length > 0 && (
          <ul className="mx-auto mt-6 grid max-w-2xl gap-2 sm:grid-cols-2">
            {guesses.map(({ item, value, diff }, i) => (
              <li
                key={item.submissionId ?? i}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                  diff <= 3
                    ? "border-neon/60 bg-neon/15"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <span className="text-sm text-mist/70">
                  {diff <= 3 ? "BULLSEYE" : `Off by ${diff}`}
                </span>
                <span className="font-mono text-lg">{value}%</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  if (isHerd) {
    // Group submissions by first word (matches server scoring) so the herd
    // clusters pop visually.
    const groups = new Map<string, string[]>();
    for (const item of r.reveal) {
      const key = item.text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .split(/\s+/)[0] || "—";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item.text);
    }
    const sortedGroups = [...groups.entries()].sort(
      (a, b) => b[1].length - a[1].length
    );
    return (
      <section className="cc-card mx-auto w-full max-w-4xl p-10 text-center">
        <div className="text-sm text-mist/60">
          {game?.name} • Round {r.number}
        </div>
        <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{r.prompt}</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {sortedGroups.map(([key, items], i) => {
            const isHerd = items.length >= 2;
            return (
              <div
                key={key}
                className={`cc-card border-white/10 p-5 text-left animate-floaty ${
                  isHerd ? "!border-sol/60 !bg-sol/10" : ""
                }`}
                style={{ animationDelay: `${i * 120}ms` }}
              >
                <div className="flex items-center justify-between text-xs uppercase tracking-widest">
                  <span className={isHerd ? "text-sol" : "text-mist/50"}>
                    {isHerd ? "Herd" : "Lone wolf"}
                  </span>
                  <span className="font-mono text-mist/70">
                    ×{items.length}
                  </span>
                </div>
                <ul className="mt-2 space-y-1">
                  {items.map((t, j) => (
                    <li key={j} className="text-base">
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="cc-card mx-auto w-full max-w-5xl p-10">
      <div className="text-center text-sm text-mist/60">
        {game?.name} • Round {r.number}
      </div>
      <h2 className="mt-2 text-center text-2xl font-semibold sm:text-4xl">{r.prompt}</h2>
      {r.promptDetail && (
        <p className="mt-2 text-center text-mist/60">{r.promptDetail}</p>
      )}
      {isQuiz ? (
        <div className="mt-6">
          {r.truth ? (
            <div className="cc-card mx-auto max-w-xl border-sol/40 bg-sol/10 p-6 text-center">
              <div className="text-xs uppercase tracking-widest text-sol">
                The truth is
              </div>
              <div className="mt-2 text-2xl font-semibold text-sol">{r.truth}</div>
            </div>
          ) : null}
          {r.choices && (
            <ul className="mx-auto mt-6 grid max-w-2xl gap-2 sm:grid-cols-2">
              {r.choices.map((c, i) => {
                const isTruth = r.truth === c;
                return (
                  <li
                    key={c}
                    className={`rounded-xl border px-4 py-3 text-left text-lg transition ${
                      isTruth
                        ? "border-sol bg-sol/20 text-sol"
                        : "border-white/10 bg-white/5 text-mist/80"
                    }`}
                  >
                    <span className="mr-2 font-mono">
                      {String.fromCharCode(65 + i)}.
                    </span>
                    {c}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {r.reveal.map((item, i) => {
            const drawing = isDrawing && !item.isTruth ? tryParseDrawing(item.text) : null;
            return (
              <div
                key={item.submissionId ?? `truth-${i}`}
                className="cc-card border-white/10 p-5 animate-floaty"
                style={{ animationDelay: `${i * 150}ms` }}
              >
                <div className="text-xs text-mist/50">
                  {isDrawing ? `Doodle ${i + 1}` : `Entry ${i + 1}`}
                </div>
                {drawing ? (
                  <div className="mt-2">
                    <DrawingView drawing={drawing} />
                  </div>
                ) : (
                  <div className="mt-1 text-lg">{item.text}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// Animated reveal of one chain at a time for Stroke of Genius.
function ChainRevealPanel({
  chains,
  roundNumber,
  gameName,
}: {
  chains: import("@/lib/types").ChainReveal[];
  roundNumber: number;
  gameName: string;
}) {
  const [chainIdx, setChainIdx] = useState(0);
  const [entryIdx, setEntryIdx] = useState(0);

  // Cycle through each chain's entries on a timer. ~3.5s per entry, then
  // pause and move to next chain.
  useEffect(() => {
    setChainIdx(0);
    setEntryIdx(0);
  }, [chains.length]);

  useEffect(() => {
    if (!chains.length) return;
    const chain = chains[chainIdx];
    if (!chain) return;
    const timeout = setTimeout(() => {
      if (entryIdx + 1 < chain.entries.length) {
        setEntryIdx(entryIdx + 1);
      } else if (chainIdx + 1 < chains.length) {
        setChainIdx(chainIdx + 1);
        setEntryIdx(0);
      }
    }, 3400);
    return () => clearTimeout(timeout);
  }, [chains, chainIdx, entryIdx]);

  if (!chains.length) {
    return (
      <section className="cc-card mx-auto w-full max-w-5xl p-10 text-center">
        <p className="text-mist/60">No chains completed this round.</p>
      </section>
    );
  }
  const chain = chains[chainIdx];
  return (
    <section className="cc-card mx-auto w-full max-w-5xl p-10">
      <div className="text-center text-sm text-mist/60">
        {gameName} • Round {roundNumber}
      </div>
      <h2 className="mt-2 text-center text-2xl font-semibold sm:text-3xl">
        Chain {chainIdx + 1} of {chains.length}
      </h2>
      <div className="mt-1 text-center text-xs uppercase tracking-widest text-mist/50">
        Started by {chain.originPlayerName}
      </div>
      <ul className="mx-auto mt-8 flex max-w-3xl flex-col gap-4">
        {chain.entries.slice(0, entryIdx + 1).map((e, i) => {
          const drawing = e.kind === "DRAWING" ? tryParseDrawing(e.text) : null;
          return (
            <li
              key={i}
              className="cc-card flex items-start gap-4 border-white/10 p-4 animate-floaty"
            >
              <div
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg"
                style={{ background: e.avatarColor }}
                aria-hidden
              >
                {e.avatarEmoji}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase tracking-widest text-mist/50">
                  {i === 0 ? "Seed" : e.kind === "DRAWING" ? "Drew it" : "Guessed it"} •{" "}
                  {e.playerName}
                </div>
                {drawing ? (
                  <div className="mt-2 max-w-sm">
                    <DrawingView drawing={drawing} />
                  </div>
                ) : (
                  <div className="mt-1 text-xl font-semibold">&ldquo;{e.text}&rdquo;</div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MashupRevealPanel({
  mashups,
  roundNumber,
  gameName,
}: {
  mashups: import("@/lib/types").MashupReveal[];
  roundNumber: number;
  gameName: string;
}) {
  if (!mashups.length) {
    return (
      <section className="cc-card mx-auto w-full max-w-5xl p-10 text-center">
        <p className="text-mist/60">No mash-ups this round.</p>
      </section>
    );
  }
  return (
    <section className="cc-card mx-auto w-full max-w-5xl p-8">
      <div className="text-center text-sm text-mist/60">
        {gameName} • Round {roundNumber}
      </div>
      <h2 className="mt-2 text-center text-2xl font-semibold sm:text-3xl">
        The drop
      </h2>
      <p className="mt-1 text-center text-xs uppercase tracking-widest text-mist/50">
        Random icon × slogan
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mashups.map((m, i) => {
          const icon = tryParseDrawing(m.iconText);
          return (
            <div
              key={m.id}
              className="cc-card border-white/10 p-4 animate-floaty"
              style={{ animationDelay: `${i * 140}ms` }}
            >
              {icon && (
                <div className="mx-auto max-w-[220px]">
                  <DrawingView drawing={icon} />
                </div>
              )}
              <div className="mt-3 text-center text-lg font-semibold">
                &ldquo;{m.sloganText}&rdquo;
              </div>
              <div className="mt-2 text-center text-xs text-mist/50">
                Icon {m.iconAuthorName} • Slogan {m.sloganAuthorName}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function parsePercentGuess(text: string): number {
  try {
    const parsed = JSON.parse(text);
    const v = Number(parsed?.value);
    if (Number.isFinite(v)) return Math.max(0, Math.min(100, Math.round(v)));
  } catch {
    // fall through
  }
  return 0;
}

function VotePanel({ game }: { game: GameCard | null }) {
  const { snapshot } = useRoomStore();
  if (!snapshot?.round) return null;
  const r = snapshot.round;
  const isFib = game?.scoring === "fib";

  if (game?.flow === "chain" && r.chains) {
    return (
      <section className="cc-card mx-auto w-full max-w-5xl p-10">
        <div className="flex items-center justify-between text-sm text-mist/60">
          <span>
            {game?.name} • Round {r.number} • Vote for the funniest chain
          </span>
          <Countdown endsAt={r.phaseEndsAt} />
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {r.chains.map((c, i) => (
            <div
              key={i}
              className="cc-card border-white/10 p-4"
            >
              <div className="text-xs uppercase tracking-widest text-mist/50">
                Chain {i + 1} • {c.originPlayerName}
              </div>
              <ul className="mt-2 flex flex-col gap-2">
                {c.entries.map((e, j) => {
                  const drawing =
                    e.kind === "DRAWING" ? tryParseDrawing(e.text) : null;
                  return (
                    <li key={j} className="flex items-start gap-2 text-sm">
                      <span
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs"
                        style={{ background: e.avatarColor }}
                        aria-hidden
                      >
                        {e.avatarEmoji}
                      </span>
                      {drawing ? (
                        <div className="max-w-[160px]">
                          <DrawingView drawing={drawing} />
                        </div>
                      ) : (
                        <span>&ldquo;{e.text}&rdquo;</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-mist/60">
          {r.votedVoterIds.length} vote{r.votedVoterIds.length === 1 ? "" : "s"} cast.
        </p>
      </section>
    );
  }

  if (game?.flow === "combo" && r.mashups) {
    return (
      <section className="cc-card mx-auto w-full max-w-5xl p-10">
        <div className="flex items-center justify-between text-sm text-mist/60">
          <span>
            {game?.name} • Round {r.number} • Pick the winning mash-up
          </span>
          <Countdown endsAt={r.phaseEndsAt} />
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {r.mashups.map((m) => {
            const icon = tryParseDrawing(m.iconText);
            return (
              <div key={m.id} className="cc-card border-white/10 p-4">
                {icon && (
                  <div className="mx-auto max-w-[220px]">
                    <DrawingView drawing={icon} />
                  </div>
                )}
                <div className="mt-3 text-center text-base font-semibold">
                  &ldquo;{m.sloganText}&rdquo;
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-sm text-mist/60">
          {r.votedVoterIds.length} vote{r.votedVoterIds.length === 1 ? "" : "s"} cast.
        </p>
      </section>
    );
  }

  return (
    <section className="cc-card mx-auto w-full max-w-5xl p-10">
      <div className="flex items-center justify-between text-sm text-mist/60">
        <span>
          {game?.name} • Round {r.number} • Voting
        </span>
        <Countdown endsAt={r.phaseEndsAt} />
      </div>
      <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">{r.prompt}</h2>
      {isFib ? (
        <div className="mt-2 cc-chip !bg-orchid/20 !text-orchid">
          Pick the real answer. Fakes are in here.
        </div>
      ) : r.criterionLabel ? (
        <div className="mt-2 cc-chip !bg-sol/20 !text-sol">
          Vote for the {r.criterionLabel}
        </div>
      ) : null}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {r.reveal.map((item, i) => {
          const drawing =
            r.submissionKind === "DRAWING" && !item.isTruth
              ? tryParseDrawing(item.text)
              : null;
          return (
            <div key={item.submissionId ?? `truth-${i}`} className="rounded-2xl bg-white/5 p-5">
              <div className="text-xs text-mist/50">
                {drawing ? `Doodle ${i + 1}` : `Entry ${i + 1}`}
              </div>
              {drawing ? (
                <div className="mt-2">
                  <DrawingView drawing={drawing} />
                </div>
              ) : (
                <div className="mt-1 text-lg">{item.text}</div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-mist/60">
        {r.votedVoterIds.length} vote{r.votedVoterIds.length === 1 ? "" : "s"} cast.
      </p>
    </section>
  );
}

function ScorePanel() {
  const { snapshot } = useRoomStore();
  if (!snapshot?.round) return null;
  const r = snapshot.round;
  const summary = r.roundSummary ?? [];
  const leaderboard = [...snapshot.players].sort((a, b) => b.score - a.score);
  const truthItem = r.reveal.find((item) => item.isTruth);
  const game = currentGame(snapshot);
  const isPercent = game?.scoring === "percent";
  const quizTruth =
    r.flow === "quiz"
      ? isPercent && r.truth
        ? `${r.truth}%`
        : r.truth
      : null;
  const playerById = new Map(snapshot.players.map((p) => [p.id, p]));
  return (
    <section className="mx-auto grid w-full max-w-5xl gap-6 md:grid-cols-2">
      <div className="cc-card p-6">
        <h3 className="text-lg font-semibold">This round</h3>
        {quizTruth && (
          <div className="mt-3 rounded-xl bg-sol/15 p-3 text-sm">
            <span className="text-xs uppercase tracking-widest text-sol">Answer</span>
            <div className="mt-1 text-base font-semibold text-sol">{quizTruth}</div>
          </div>
        )}
        {truthItem && (
          <div className="mt-3 rounded-xl bg-neon/10 p-3 text-sm">
            <span className="text-xs uppercase tracking-widest text-neon">Truth</span>
            <div className="mt-1">{truthItem.text}</div>
          </div>
        )}
        <ul className="mt-3 space-y-2">
          {summary.length === 0 && <li className="text-mist/60">No points scored.</li>}
          {summary.map((s) => {
            const p = playerById.get(s.playerId);
            return (
              <li
                key={s.playerId}
                className="flex items-center justify-between rounded-lg bg-white/5 p-3"
              >
                <span className="flex items-center gap-3">
                  {p && (
                    <span
                      className="grid h-7 w-7 place-items-center rounded-full text-base"
                      style={{ background: p.avatarColor }}
                      aria-hidden
                    >
                      {p.avatarEmoji}
                    </span>
                  )}
                  <span className="font-medium">{s.name}</span>
                </span>
                <span className="font-mono text-neon">+{s.delta}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="cc-card p-6">
        <h3 className="text-lg font-semibold">Leaderboard</h3>
        <ul className="mt-3 space-y-2">
          {leaderboard.map((p, i) => (
            <li
              key={p.id}
              className={`flex items-center justify-between rounded-lg p-3 ${
                i === 0 ? "bg-ember/20" : "bg-white/5"
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="w-6 text-center text-sm text-mist/50">{i + 1}</span>
                <span
                  className="grid h-8 w-8 place-items-center rounded-full text-base"
                  style={{ background: p.avatarColor }}
                  aria-hidden
                >
                  {p.avatarEmoji}
                </span>
                <span className="font-medium">{p.displayName}</span>
              </span>
              <span className="font-mono">{p.score}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function MatchEndPanel() {
  const { snapshot } = useRoomStore();
  if (!snapshot) return null;
  const leaderboard = [...snapshot.players].sort((a, b) => b.score - a.score);
  const champ = leaderboard[0];
  const highlights = snapshot.highlights ?? [];
  return (
    <section className="relative mx-auto w-full max-w-5xl">
      <ConfettiBurst />
      <div className="cc-card relative z-10 overflow-hidden p-10 text-center">
        <div className="text-sm uppercase tracking-[0.35em] text-mist/60">Match complete</div>
        {champ && (
          <div
            className="mx-auto mt-4 grid h-28 w-28 place-items-center rounded-full text-5xl animate-floaty"
            style={{
              background: champ.avatarColor,
              boxShadow: `0 0 60px ${champ.avatarColor}80`,
            }}
            aria-hidden
          >
            {champ.avatarEmoji}
          </div>
        )}
        <h2 className="mt-4 text-4xl font-semibold sm:text-5xl">
          {champ ? `${champ.displayName} takes the crown` : "It's a wrap"}
        </h2>
        {champ && (
          <div className="mt-1 text-lg text-mist/70">
            <span className="font-mono text-neon">{champ.score.toLocaleString()}</span> points
          </div>
        )}
        {highlights.length > 0 && (
          <div className="mt-8">
            <div className="text-xs uppercase tracking-[0.3em] text-mist/50">
              Match Awards
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {highlights.map((h, i) => (
                <div
                  key={h.id}
                  className="cc-card flex items-center gap-3 border-white/10 p-4 text-left animate-floaty"
                  style={{ animationDelay: `${i * 120}ms` }}
                >
                  <div
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-2xl"
                    style={{ background: h.avatarColor }}
                    aria-hidden
                  >
                    {h.avatarEmoji}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-wider text-sol">
                      {h.title}
                    </div>
                    <div className="truncate font-semibold">{h.playerName}</div>
                    <div className="text-xs text-mist/60">{h.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <ul className="mx-auto mt-8 max-w-md space-y-2 text-left">
          {leaderboard.map((p, i) => (
            <li
              key={p.id}
              className={`flex items-center justify-between rounded-lg p-3 ${
                i === 0 ? "bg-ember/20" : "bg-white/5"
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="w-6 text-center text-sm text-mist/50">{i + 1}</span>
                <span
                  className="grid h-7 w-7 place-items-center rounded-full text-base"
                  style={{ background: p.avatarColor }}
                  aria-hidden
                >
                  {p.avatarEmoji}
                </span>
                <span>{p.displayName}</span>
              </span>
              <span className="font-mono">{p.score}</span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-mist/60">Heading back to the lobby in a moment.</p>
      </div>
    </section>
  );
}

// Lightweight CSS confetti — no runtime deps. Each piece is a div with a
// keyframed fall + wobble, randomized at mount time.
function ConfettiBurst() {
  const pieces = useMemo(() => {
    const palette = ["#ff4f7b", "#ffd36e", "#7cf8d0", "#6fb3ff", "#b080ff", "#ff8a5b"];
    return Array.from({ length: 60 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 2.5,
      duration: 3.5 + Math.random() * 3,
      color: palette[i % palette.length],
      rotate: Math.floor(Math.random() * 360),
      size: 6 + Math.floor(Math.random() * 6),
    }));
  }, []);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute -top-4 block animate-confetti"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.6,
            background: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}

function HostControls({
  hostMode,
  onNext,
  onEnd,
  busy,
}: {
  hostMode: boolean;
  onNext: () => void;
  onEnd: () => void;
  busy: boolean;
}) {
  const { snapshot } = useRoomStore();
  if (!hostMode || !snapshot) return null;
  if (snapshot.phase === "LOBBY") return null;
  return (
    <div className="mt-auto flex flex-wrap justify-center gap-3 border-t border-white/5 pt-4">
      <button onClick={onNext} disabled={busy} className="cc-btn-ghost">
        Advance phase
      </button>
      <button onClick={onEnd} disabled={busy} className="cc-btn-ghost">
        End match
      </button>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white/5 p-3">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-mist/60">{description}</span>
      </span>
    </label>
  );
}

function FullscreenLoader() {
  return (
    <main className="grid min-h-screen place-items-center">
      <div className="cc-chip">
        <span className="h-1.5 w-1.5 animate-pulseSoft rounded-full bg-neon" />
        Tuning the crowd…
      </div>
    </main>
  );
}
