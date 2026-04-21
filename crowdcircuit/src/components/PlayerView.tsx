"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRoomStore } from "@/stores/useRoomStore";
import { getSocket } from "@/lib/socketClient";
import { Countdown } from "./Countdown";
import type { GameCard, PlayerStageTarget } from "@/lib/types";
import { Canvas } from "./Canvas";
import { DrawingView, tryParseDrawing } from "./DrawingView";
import { emptyDrawing, isDrawingNonTrivial, type Drawing } from "@/lib/drawing";

export function PlayerView() {
  const { snapshot, session } = useRoomStore();
  if (!snapshot || !session) return <Loader />;
  const me = snapshot.players.find((p) => p.id === session.playerId);
  const audience = session.isAudience;
  const game = snapshot.games.find(
    (g) =>
      g.id === (snapshot.round?.gameId ?? snapshot.currentGameId ?? snapshot.selectedGameId)
  );

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-4 px-4 py-6">
      <Header
        audience={audience}
        displayName={session.displayName}
        code={snapshot.code}
        gameName={game?.name ?? null}
        avatarColor={me?.avatarColor ?? "#ff4f7b"}
        avatarEmoji={me?.avatarEmoji ?? "🎲"}
      />
      {snapshot.phase === "LOBBY" && <LobbyCard audience={audience} game={game ?? null} />}
      {snapshot.phase === "SUBMIT" && !audience && (
        <SubmitCard
          submitted={!!me && !!snapshot.round?.submittedPlayerIds.includes(me.id)}
          game={game ?? null}
        />
      )}
      {snapshot.phase === "SUBMIT" && audience && (
        <WaitingCard text="Players are writing answers. Stay loud." />
      )}
      {snapshot.phase === "REVEAL" && (
        <WaitingCard text="Answers are being revealed on the big screen." />
      )}
      {snapshot.phase === "VOTE" &&
        (game?.flow === "standard" ||
          game?.flow === "chain" ||
          game?.flow === "combo") && <VoteCard game={game} />}
      {snapshot.phase === "VOTE" &&
        game?.flow !== "standard" &&
        game?.flow !== "chain" &&
        game?.flow !== "combo" && (
          <WaitingCard text="Scores are coming up on the big screen." />
        )}
      {snapshot.phase === "SCORE" && <ScoreCard />}
      {snapshot.phase === "MATCH_END" && <EndCard />}
      <div aria-live="polite" className="mt-auto text-center text-xs text-mist/40">
        {me ? (me.connected ? "Connected" : "Reconnecting…") : "Session restored"}
      </div>
    </main>
  );
}

function Header({
  audience,
  displayName,
  code,
  gameName,
  avatarColor,
  avatarEmoji,
}: {
  audience: boolean;
  displayName: string;
  code: string;
  gameName: string | null;
  avatarColor: string;
  avatarEmoji: string;
}) {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-xl"
          style={{ background: avatarColor }}
          aria-hidden
        >
          {avatarEmoji}
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-mist/60">
            {audience ? "Audience" : "Player"}
            {gameName ? ` • ${gameName}` : ""}
          </div>
          <div className="text-lg font-semibold">{displayName}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs uppercase tracking-widest text-mist/60">Room</div>
        <div className="font-mono text-lg tracking-[0.35em] text-neon">{code}</div>
      </div>
    </header>
  );
}

function LobbyCard({ audience, game }: { audience: boolean; game: GameCard | null }) {
  return (
    <div className="cc-card p-5">
      <h2 className="text-xl font-semibold">You&apos;re in.</h2>
      {game && (
        <div className="mt-2 rounded-xl bg-white/5 p-3 text-sm">
          <div className="text-xs uppercase tracking-widest text-mist/60">Next up</div>
          <div className="mt-1 font-semibold">{game.name}</div>
          <div className="text-mist/70">{game.tagline}</div>
        </div>
      )}
      <p className="mt-3 text-sm text-mist/70">
        {audience
          ? "You're in audience mode — you'll vote but won't submit."
          : "The host will start the match. Loosen your thumbs."}
      </p>
    </div>
  );
}

function SubmitCard({
  submitted,
  game,
}: {
  submitted: boolean;
  game: GameCard | null;
}) {
  const { snapshot, session } = useRoomStore();
  const round = snapshot?.round;
  if (!round || !game || !session) return null;

  // For multi-stage (chain/combo) games, look up this player's target.
  const target: PlayerStageTarget | null =
    round.playerTargets?.[session.playerId] ?? null;

  const kind = round.submissionKind;
  if (kind === "DRAWING")
    return <DrawingSubmit submitted={submitted} game={game} target={target} />;
  if (kind === "QUIZ") return <QuizSubmit submitted={submitted} game={game} />;
  if (kind === "TAP") return <TapSubmit submitted={submitted} game={game} />;
  if (kind === "PERCENT") return <PercentSubmit submitted={submitted} game={game} />;
  if (kind === "TRACE") return <TraceSubmit submitted={submitted} game={game} />;
  if (kind === "COLOR") return <ColorSubmit submitted={submitted} game={game} />;
  return <TextSubmit submitted={submitted} game={game} target={target} />;
}

// For chain/combo games, a small banner above the submission prompt that
// shows the player what they're responding to (a previous drawing or phrase).
function StageContext({ target }: { target: PlayerStageTarget | null }) {
  if (!target) return null;
  const fromWho = target.fromPlayerName ? ` from ${target.fromPlayerName}` : "";
  if (target.inputKind === "DRAWING" && target.inputText) {
    const drawing = tryParseDrawing(target.inputText);
    if (!drawing) return null;
    return (
      <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="text-xs uppercase tracking-widest text-mist/60">
          Drawing{fromWho}
        </div>
        <div className="mt-2">
          <DrawingView drawing={drawing} />
        </div>
      </div>
    );
  }
  if (target.inputKind === "TEXT" && target.inputText) {
    return (
      <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
        <div className="text-xs uppercase tracking-widest text-mist/60">
          Phrase{fromWho}
        </div>
        <div className="mt-1 text-base">&ldquo;{target.inputText}&rdquo;</div>
      </div>
    );
  }
  return null;
}

function PercentSubmit({ submitted, game }: { submitted: boolean; game: GameCard }) {
  const { snapshot } = useRoomStore();
  const round = snapshot?.round;
  const [value, setValue] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    getSocket().emit(
      "player:submit",
      { text: JSON.stringify({ value }) },
      (res) => {
        setBusy(false);
        if (!res.ok) setError(res.reason);
      }
    );
  }

  if (!round) return null;
  return (
    <div className="cc-card p-5">
      <SubmitHeader game={game} round={round} />
      <div className="mt-6 text-center">
        <div className="text-xs uppercase tracking-widest text-mist/60">Your guess</div>
        <div className="mt-1 text-6xl font-semibold tabular-nums text-orchid">
          {value}
          <span className="text-3xl text-mist/60">%</span>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="mt-5 w-full accent-orchid"
        aria-label="Percentage guess"
      />
      <div className="mt-1 flex justify-between text-xs text-mist/40">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
      {submitted && (
        <div className="mt-4 rounded-xl bg-neon/15 p-3 text-sm text-neon">
          Guess locked in — slide to change it.
        </div>
      )}
      {error && (
        <div role="alert" className="mt-2 text-sm text-ember">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="cc-btn-primary mt-4 w-full"
      >
        {submitted ? `Update guess (${value}%)` : `Lock in ${value}%`}
      </button>
    </div>
  );
}

interface RoundHeaderData {
  number: number;
  total: number;
  prompt: string | null;
  promptDetail: string | null;
  phaseEndsAt: number | null;
}

function SubmitHeader({
  game,
  round,
  children,
}: {
  game: GameCard;
  round: RoundHeaderData;
  children?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-center justify-between text-xs text-mist/60">
        <span>
          {game.name} • Round {round.number}/{round.total}
        </span>
        <Countdown endsAt={round.phaseEndsAt} />
      </div>
      <h2 className="mt-2 text-lg font-semibold leading-snug">{round.prompt}</h2>
      {round.promptDetail && (
        <div className="mt-1 text-sm text-mist/60">{round.promptDetail}</div>
      )}
      {children}
    </>
  );
}

function TextSubmit({
  submitted,
  game,
  target,
}: {
  submitted: boolean;
  game: GameCard;
  target: PlayerStageTarget | null;
}) {
  const { snapshot } = useRoomStore();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const round = snapshot?.round;

  // New stage → reset the local draft so we don't carry a prior stage's text.
  useEffect(() => {
    setText("");
  }, [round?.stage]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    getSocket().emit("player:submit", { text }, (res) => {
      setBusy(false);
      if (!res.ok) setError(res.reason);
    });
  }

  if (!round) return null;
  const placeholder = placeholderForGame(game.id, round.stage);
  const label = labelForGame(game.id, round.stage);
  // For chain games the stage helper is more useful than a shared prompt.
  const isMultiStage = (round.totalStages ?? 1) > 1;

  return (
    <div className="cc-card p-5">
      <SubmitHeader game={game} round={round} />
      {isMultiStage && (
        <div className="mt-2 text-xs uppercase tracking-widest text-mist/60">
          Stage {round.stage + 1}/{round.totalStages} • {label}
        </div>
      )}
      <StageContext target={target} />
      {submitted ? (
        <div className="mt-4 rounded-xl bg-neon/15 p-4 text-neon">
          Locked in. You can tweak it until time runs out.
        </div>
      ) : null}
      <form onSubmit={submit} className="mt-4">
        <label htmlFor="take" className="sr-only">
          {label}
        </label>
        <textarea
          id="take"
          className="cc-input min-h-[120px] text-base"
          placeholder={placeholder}
          maxLength={140}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-1 text-right text-xs text-mist/50 tabular-nums">
          {text.length}/140
        </div>
        {error && (
          <div role="alert" className="mt-2 text-sm text-ember">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={busy || text.trim().length === 0}
          className="cc-btn-primary mt-3 w-full"
        >
          {submitted ? "Update answer" : "Submit answer"}
        </button>
      </form>
    </div>
  );
}

function DrawingSubmit({
  submitted,
  game,
  target,
}: {
  submitted: boolean;
  game: GameCard;
  target: PlayerStageTarget | null;
}) {
  const { snapshot } = useRoomStore();
  const [drawing, setDrawing] = useState<Drawing>(() => emptyDrawing());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const round = snapshot?.round;

  useEffect(() => {
    setDrawing(emptyDrawing());
  }, [round?.stage]);

  function submit() {
    if (busy) return;
    if (!isDrawingNonTrivial(drawing)) {
      setError("Add a few more strokes first!");
      return;
    }
    setBusy(true);
    setError(null);
    getSocket().emit(
      "player:submit",
      { text: JSON.stringify(drawing) },
      (res) => {
        setBusy(false);
        if (!res.ok) setError(res.reason);
      }
    );
  }

  if (!round) return null;
  const isMultiStage = (round.totalStages ?? 1) > 1;
  // For chain games, stage 1 shows the phrase the player needs to draw.
  const drawPhrase =
    target?.inputKind === "TEXT" && target.inputText ? target.inputText : null;
  return (
    <div className="cc-card p-4">
      <SubmitHeader game={game} round={round} />
      {isMultiStage && (
        <div className="mt-2 text-xs uppercase tracking-widest text-mist/60">
          Stage {round.stage + 1}/{round.totalStages} • Draw this
        </div>
      )}
      {drawPhrase && (
        <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3 text-center">
          <div className="text-xs uppercase tracking-widest text-mist/60">
            Draw this
            {target?.fromPlayerName ? ` • from ${target.fromPlayerName}` : ""}
          </div>
          <div className="mt-1 text-lg font-semibold">&ldquo;{drawPhrase}&rdquo;</div>
        </div>
      )}
      <div className="mt-3">
        <Canvas value={drawing} onChange={setDrawing} />
      </div>
      {submitted && (
        <div className="mt-3 rounded-xl bg-neon/15 p-3 text-sm text-neon">
          Drawing locked in. You can update it until time runs out.
        </div>
      )}
      {error && (
        <div role="alert" className="mt-2 text-sm text-ember">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="cc-btn-primary mt-3 w-full"
      >
        {submitted ? "Update drawing" : "Submit drawing"}
      </button>
    </div>
  );
}

function QuizSubmit({ submitted, game }: { submitted: boolean; game: GameCard }) {
  const { snapshot } = useRoomStore();
  const round = snapshot?.round;
  const [choice, setChoice] = useState<string | null>(null);
  const [wager, setWager] = useState(300);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function submit() {
    if (busy) return;
    if (!choice) {
      setError("Pick one of the choices first.");
      return;
    }
    setBusy(true);
    setError(null);
    getSocket().emit(
      "player:submit",
      { text: JSON.stringify({ choice, wager }) },
      (res) => {
        setBusy(false);
        if (!res.ok) setError(res.reason);
      }
    );
  }

  if (!round) return null;
  const choices = round.choices ?? [];
  return (
    <div className="cc-card p-5">
      <SubmitHeader game={game} round={round} />
      <div className="mt-4 grid gap-2">
        {choices.map((c) => {
          const active = choice === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setChoice(c)}
              className={`rounded-xl border p-3 text-left transition ${
                active
                  ? "border-sol bg-sol/15 text-sol"
                  : "border-white/10 bg-white/5 hover:border-white/30"
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>
      <div className="mt-5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-mist/70">Wager</span>
          <span className="font-mono text-sol">{wager}</span>
        </div>
        <input
          type="range"
          min={100}
          max={1000}
          step={50}
          value={wager}
          onChange={(e) => setWager(Number(e.target.value))}
          className="mt-2 w-full accent-sol"
          aria-label="Wager"
        />
        <div className="mt-1 flex justify-between text-xs text-mist/40">
          <span>100</span>
          <span>1000</span>
        </div>
      </div>
      {submitted && (
        <div className="mt-3 rounded-xl bg-neon/15 p-3 text-sm text-neon">
          Locked in. You can change it until time runs out.
        </div>
      )}
      {error && (
        <div role="alert" className="mt-2 text-sm text-ember">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={busy || !choice}
        className="cc-btn-primary mt-4 w-full"
      >
        {submitted ? "Update answer" : `Lock in ${wager} on "${choice ?? "…"}"`}
      </button>
    </div>
  );
}

// Tap Rally — client-driven real-time reaction mini-game.
// Targets spawn at random positions, each living ~1.2s. Tap before it expires
// to bank points (faster tap = more). At phase end, final score is submitted.
interface TapTarget {
  id: number;
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  r: number; // pixel radius
  spawnedAt: number;
  lifetime: number;
  alive: boolean;
}

function TapSubmit({ submitted, game }: { submitted: boolean; game: GameCard }) {
  const { snapshot } = useRoomStore();
  const round = snapshot?.round;
  const [score, setScore] = useState(0);
  const [hits, setHits] = useState(0);
  const [missesCount, setMissesCount] = useState(0);
  const [fastestMs, setFastestMs] = useState<number>(9999);
  const [targets, setTargets] = useState<TapTarget[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedOnce, setSubmittedOnce] = useState(false);
  const startRef = useRef<number>(Date.now());
  const nextIdRef = useRef(1);

  // Restart when a new round begins.
  useEffect(() => {
    startRef.current = Date.now();
    setScore(0);
    setHits(0);
    setMissesCount(0);
    setFastestMs(9999);
    setTargets([]);
    setSubmittedOnce(false);
    nextIdRef.current = 1;
  }, [round?.number, round?.gameId]);

  const endsAt = round?.phaseEndsAt ?? null;
  const active = endsAt != null && Date.now() < endsAt;

  // Spawn loop — every ~450ms add a target.
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setTargets((cur) => {
        const now = Date.now();
        // Drop any that expired (counts as a miss).
        const kept: TapTarget[] = [];
        let expired = 0;
        for (const t of cur) {
          if (!t.alive) continue;
          if (now - t.spawnedAt >= t.lifetime) {
            expired++;
            continue;
          }
          kept.push(t);
        }
        if (expired) setMissesCount((m) => m + expired);
        // Cap concurrent targets so the board doesn't get unfair.
        if (kept.length >= 4) return kept;
        const fresh: TapTarget = {
          id: nextIdRef.current++,
          x: 0.1 + Math.random() * 0.8,
          y: 0.1 + Math.random() * 0.8,
          r: 36 + Math.floor(Math.random() * 18),
          spawnedAt: now,
          lifetime: 1100 + Math.random() * 700,
          alive: true,
        };
        return [...kept, fresh];
      });
    }, 440);
    return () => clearInterval(interval);
  }, [active]);

  // GC expired targets at ~30fps so the UI stays smooth.
  useEffect(() => {
    if (!active) return;
    const tick = setInterval(() => {
      setTargets((cur) => {
        const now = Date.now();
        let expired = 0;
        const kept: TapTarget[] = [];
        for (const t of cur) {
          if (!t.alive) continue;
          if (now - t.spawnedAt >= t.lifetime) {
            expired++;
            continue;
          }
          kept.push(t);
        }
        if (expired) setMissesCount((m) => m + expired);
        return kept;
      });
    }, 33);
    return () => clearInterval(tick);
  }, [active]);

  const handleHit = useCallback((id: number) => {
    setTargets((cur) => {
      const t = cur.find((x) => x.id === id);
      if (!t || !t.alive) return cur;
      const age = Date.now() - t.spawnedAt;
      // Faster tap → more points (max ~15, min ~5).
      const bonus = Math.max(5, Math.round(15 - (age / t.lifetime) * 10));
      setScore((s) => s + bonus);
      setHits((h) => h + 1);
      setFastestMs((m) => Math.min(m, age));
      return cur.filter((x) => x.id !== id);
    });
  }, []);

  // Auto-submit when the phase timer elapses.
  useEffect(() => {
    if (!endsAt) return;
    const msLeft = endsAt - Date.now();
    if (msLeft <= 0) return;
    const t = setTimeout(() => {
      doSubmit();
    }, msLeft + 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);

  function doSubmit() {
    if (submitting || submittedOnce) return;
    setSubmitting(true);
    setError(null);
    getSocket().emit(
      "player:submit",
      {
        text: JSON.stringify({
          score,
          hits,
          misses: missesCount,
          fastestMs: fastestMs === 9999 ? 0 : fastestMs,
        }),
      },
      (res) => {
        setSubmitting(false);
        if (!res.ok) setError(res.reason);
        else setSubmittedOnce(true);
      }
    );
  }

  if (!round) return null;
  return (
    <div className="cc-card p-4">
      <SubmitHeader game={game} round={round} />
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="cc-chip !bg-ember/15 !text-ember">Score {score}</span>
        <span className="cc-chip">Hits {hits}</span>
        <span className="cc-chip">Miss {missesCount}</span>
      </div>
      <div
        className="relative mt-3 aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-ember/10 via-black to-sol/10"
        role="region"
        aria-label="Tap the targets"
      >
        {active
          ? targets.map((t) => {
              const elapsed = Date.now() - t.spawnedAt;
              const frac = Math.max(0, 1 - elapsed / t.lifetime);
              return (
                <button
                  key={t.id}
                  type="button"
                  onPointerDown={() => handleHit(t.id)}
                  aria-label="Tap target"
                  className="absolute grid place-items-center rounded-full bg-ember/90 shadow-[0_0_20px_rgba(255,79,123,0.8)] transition-transform active:scale-90"
                  style={{
                    left: `calc(${t.x * 100}% - ${t.r}px)`,
                    top: `calc(${t.y * 100}% - ${t.r}px)`,
                    width: t.r * 2,
                    height: t.r * 2,
                    opacity: 0.3 + 0.7 * frac,
                  }}
                >
                  <span className="text-xs font-bold text-white">TAP</span>
                </button>
              );
            })
          : (
              <div className="absolute inset-0 grid place-items-center text-mist/60">
                {submittedOnce || submitted
                  ? "Score banked. Nice work."
                  : "Get ready…"}
              </div>
            )}
      </div>
      {error && (
        <div role="alert" className="mt-2 text-sm text-ember">
          {error}
        </div>
      )}
      {active && (
        <button
          type="button"
          onClick={doSubmit}
          disabled={submitting}
          className="cc-btn-ghost mt-3 w-full text-sm"
        >
          Bank score now
        </button>
      )}
    </div>
  );
}

// Trace Race — finger-trace the shown curve. Guide path is sampled into N
// checkpoints and the player's stroke is scored by how many checkpoints it
// passes close to, multiplied by a speed factor.
interface TracePoint {
  x: number;
  y: number;
}

const TRACE_GUIDES: Record<string, { path: TracePoint[]; viewBox: string }> = {
  // Each guide is sampled in the 0..100 viewBox and drawn as a smooth curve.
  Spiral: {
    viewBox: "0 0 100 100",
    path: Array.from({ length: 60 }, (_, i) => {
      const t = i / 59;
      const angle = t * Math.PI * 4;
      const radius = 6 + t * 36;
      return {
        x: 50 + Math.cos(angle) * radius,
        y: 50 + Math.sin(angle) * radius,
      };
    }),
  },
  Star: {
    viewBox: "0 0 100 100",
    path: (() => {
      const pts: TracePoint[] = [];
      const outer = 42,
        inner = 18;
      for (let i = 0; i <= 10; i++) {
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        const r = i % 2 === 0 ? outer : inner;
        pts.push({ x: 50 + Math.cos(a) * r, y: 50 + Math.sin(a) * r });
      }
      return pts;
    })(),
  },
  Wave: {
    viewBox: "0 0 100 100",
    path: Array.from({ length: 60 }, (_, i) => {
      const t = i / 59;
      return {
        x: 8 + t * 84,
        y: 50 + Math.sin(t * Math.PI * 3) * 26,
      };
    }),
  },
  Heart: {
    viewBox: "0 0 100 100",
    path: Array.from({ length: 60 }, (_, i) => {
      const t = (i / 59) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y =
        13 * Math.cos(t) -
        5 * Math.cos(2 * t) -
        2 * Math.cos(3 * t) -
        Math.cos(4 * t);
      return { x: 50 + x * 2.2, y: 50 - y * 2.2 };
    }),
  },
  Lightning: {
    viewBox: "0 0 100 100",
    path: [
      { x: 55, y: 8 },
      { x: 28, y: 45 },
      { x: 48, y: 48 },
      { x: 30, y: 92 },
      { x: 72, y: 44 },
      { x: 52, y: 44 },
      { x: 62, y: 12 },
    ],
  },
  "Loop-the-loop": {
    viewBox: "0 0 100 100",
    path: (() => {
      const pts: TracePoint[] = [];
      for (let i = 0; i < 30; i++) {
        const t = i / 29;
        pts.push({ x: 18 + t * 30, y: 32 + Math.sin(t * Math.PI * 2) * 18 });
      }
      for (let i = 0; i < 30; i++) {
        const t = i / 29;
        pts.push({ x: 52 + t * 30, y: 68 + Math.sin(t * Math.PI * 2) * 18 });
      }
      return pts;
    })(),
  },
};

function getGuide(name: string | null) {
  if (!name) return TRACE_GUIDES.Wave;
  return TRACE_GUIDES[name] ?? TRACE_GUIDES.Wave;
}

function TraceSubmit({ submitted, game }: { submitted: boolean; game: GameCard }) {
  const { snapshot } = useRoomStore();
  const round = snapshot?.round;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [userPath, setUserPath] = useState<TracePoint[]>([]);
  const pathRef = useRef<TracePoint[]>([]);
  const activeRef = useRef<{ pointerId: number } | null>(null);
  const [score, setScore] = useState(0);
  const [accuracy, setAccuracy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedOnce, setSubmittedOnce] = useState(false);
  const startRef = useRef<number>(Date.now());
  const guide = getGuide(round?.prompt ?? null);

  useEffect(() => {
    startRef.current = Date.now();
    setUserPath([]);
    pathRef.current = [];
    setScore(0);
    setAccuracy(0);
    setSubmittedOnce(false);
  }, [round?.number, round?.gameId]);

  const endsAt = round?.phaseEndsAt ?? null;

  function toLocal(e: React.PointerEvent<SVGSVGElement>): TracePoint | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  }

  function rescore(points: TracePoint[]) {
    if (!points.length) {
      setScore(0);
      setAccuracy(0);
      return;
    }
    // Checkpoint-hit: for each guide point, check if the user traced within
    // threshold; accuracy = hits / total. Score = raw hit count + speed bonus.
    const threshold = 10; // viewBox units
    let hits = 0;
    for (const g of guide.path) {
      for (const p of points) {
        const dx = p.x - g.x;
        const dy = p.y - g.y;
        if (dx * dx + dy * dy <= threshold * threshold) {
          hits++;
          break;
        }
      }
    }
    const acc = Math.round((hits / guide.path.length) * 100);
    const elapsed = Math.max(1, Date.now() - startRef.current);
    // Faster → higher multiplier (up to ~1.5× if you finish in 4s).
    const speedFactor = Math.max(1, Math.min(1.5, 6000 / elapsed));
    const sc = Math.round(acc * 10 * speedFactor);
    setAccuracy(acc);
    setScore(sc);
  }

  function startStroke(e: React.PointerEvent<SVGSVGElement>) {
    const p = toLocal(e);
    if (!p) return;
    activeRef.current = { pointerId: e.pointerId };
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // not supported — fine
    }
    pathRef.current = [p];
    setUserPath([p]);
    startRef.current = Date.now();
  }

  function extendStroke(e: React.PointerEvent<SVGSVGElement>) {
    const active = activeRef.current;
    if (!active || active.pointerId !== e.pointerId) return;
    const p = toLocal(e);
    if (!p) return;
    const last = pathRef.current[pathRef.current.length - 1];
    if (last) {
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      if (dx * dx + dy * dy < 0.5) return;
    }
    pathRef.current = [...pathRef.current, p];
    setUserPath(pathRef.current);
    rescore(pathRef.current);
  }

  function endStroke(e: React.PointerEvent<SVGSVGElement>) {
    if (!activeRef.current || activeRef.current.pointerId !== e.pointerId) return;
    activeRef.current = null;
    rescore(pathRef.current);
  }

  function doSubmit() {
    if (submitting || submittedOnce) return;
    setSubmitting(true);
    setError(null);
    getSocket().emit(
      "player:submit",
      {
        text: JSON.stringify({
          score,
          accuracy,
          timeMs: Math.min(60_000, Date.now() - startRef.current),
        }),
      },
      (res) => {
        setSubmitting(false);
        if (!res.ok) setError(res.reason);
        else setSubmittedOnce(true);
      }
    );
  }

  // Auto-submit at phase end.
  useEffect(() => {
    if (!endsAt) return;
    const msLeft = endsAt - Date.now();
    if (msLeft <= 0) return;
    const t = setTimeout(() => doSubmit(), msLeft + 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt, score, accuracy]);

  if (!round) return null;
  const guidePath = guide.path
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`)
    .join(" ");
  const userPathD = userPath.length
    ? userPath.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ")
    : "";
  return (
    <div className="cc-card p-4">
      <SubmitHeader game={game} round={round} />
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="cc-chip">Accuracy {accuracy}%</span>
        <span className="cc-chip !bg-neon/20 !text-neon">Score {score}</span>
      </div>
      <div className="mt-3 rounded-2xl border border-white/10 bg-gradient-to-br from-neon/10 via-black to-sol/10 p-1">
        <svg
          ref={svgRef}
          viewBox={guide.viewBox}
          className="aspect-square w-full touch-none select-none rounded-xl"
          onPointerDown={startStroke}
          onPointerMove={extendStroke}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          role="img"
          aria-label={`Trace guide: ${round.prompt}`}
        >
          <path
            d={guidePath}
            stroke="rgba(124,248,208,0.45)"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray="3 2"
          />
          {userPathD && (
            <path
              d={userPathD}
              stroke="#7cf8d0"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          )}
        </svg>
      </div>
      {error && (
        <div role="alert" className="mt-2 text-sm text-ember">
          {error}
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => {
            pathRef.current = [];
            setUserPath([]);
            setScore(0);
            setAccuracy(0);
            startRef.current = Date.now();
          }}
          className="cc-btn-ghost flex-1 text-sm"
        >
          Retry
        </button>
        <button
          type="button"
          onClick={doSubmit}
          disabled={submitting || submittedOnce}
          className="cc-btn-primary flex-1 text-sm"
        >
          {submittedOnce || submitted ? "Banked" : "Bank trace"}
        </button>
      </div>
    </div>
  );
}

// Slider Wars — three RGB sliders. Target color is only visible on the TV;
// the player gets the name + a live preview of their own color and submits
// when they feel they've matched.
function ColorSubmit({ submitted, game }: { submitted: boolean; game: GameCard }) {
  const { snapshot } = useRoomStore();
  const round = snapshot?.round;
  const [rgb, setRgb] = useState({ r: 128, g: 128, b: 128 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRgb({ r: 128, g: 128, b: 128 });
  }, [round?.number, round?.gameId]);

  function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    getSocket().emit(
      "player:submit",
      { text: JSON.stringify(rgb) },
      (res) => {
        setBusy(false);
        if (!res.ok) setError(res.reason);
      }
    );
  }

  if (!round) return null;
  const hex = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
  return (
    <div className="cc-card p-5">
      <SubmitHeader game={game} round={round} />
      <div className="mt-2 text-xs uppercase tracking-widest text-mist/60">
        Target is on the big screen. Match it.
      </div>
      <div
        className="mt-4 h-32 w-full rounded-2xl border border-white/10 transition-colors"
        style={{ background: hex }}
        aria-label="Your current color"
      />
      <div className="mt-4 space-y-3">
        {(
          [
            { key: "r", label: "R", color: "#ff6c6c" },
            { key: "g", label: "G", color: "#7cf8d0" },
            { key: "b", label: "B", color: "#6fb3ff" },
          ] as const
        ).map(({ key, label, color }) => (
          <div key={key}>
            <div className="flex items-center justify-between text-sm">
              <span style={{ color }}>{label}</span>
              <span className="font-mono tabular-nums text-mist/70">{rgb[key]}</span>
            </div>
            <input
              type="range"
              min={0}
              max={255}
              step={1}
              value={rgb[key]}
              onChange={(e) =>
                setRgb((cur) => ({ ...cur, [key]: Number(e.target.value) }))
              }
              className="mt-1 w-full"
              style={{ accentColor: color }}
              aria-label={`${label} channel`}
            />
          </div>
        ))}
      </div>
      {submitted && (
        <div className="mt-3 rounded-xl bg-neon/15 p-3 text-sm text-neon">
          Color locked. Keep tweaking until time's up.
        </div>
      )}
      {error && (
        <div role="alert" className="mt-2 text-sm text-ember">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="cc-btn-primary mt-4 w-full"
      >
        {submitted ? "Update color" : "Lock in color"}
      </button>
    </div>
  );
}

function WaitingCard({ text }: { text: string }) {
  return (
    <div className="cc-card p-6 text-center">
      <div className="mx-auto mb-3 h-2 w-2 animate-pulseSoft rounded-full bg-neon" />
      <p className="text-sm text-mist/80">{text}</p>
    </div>
  );
}

function VoteCard({ game }: { game: GameCard | null }) {
  const { snapshot, session } = useRoomStore();
  const round = snapshot?.round;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const myId = session?.playerId;
  const alreadyVoted = useMemo(
    () => (myId && round ? round.votedVoterIds.includes(myId) : false),
    [round, myId]
  );
  const isFib = game?.scoring === "fib";
  // Solo test mode: if you're the only real player, you can self-vote so
  // the voting flow actually finishes.
  const soloMode =
    (snapshot?.players.filter((p) => !p.isAudience).length ?? 0) <= 1;

  function vote(submissionId: string | null, ownSubmission: boolean) {
    if (ownSubmission && !soloMode) {
      setError("You can't vote for your own answer.");
      return;
    }
    setBusy(true);
    setError(null);
    getSocket().emit(
      "player:vote",
      { submissionId: submissionId ?? "__truth__" },
      (res) => {
        setBusy(false);
        if (!res.ok) setError(res.reason);
      }
    );
  }

  if (!round || !game) return null;

  // Chain games (Stroke of Genius): vote for a chain by its origin.
  if (game.flow === "chain" && round.chains) {
    return (
      <div className="cc-card p-5">
        <div className="flex items-center justify-between text-xs text-mist/60">
          <span>Vote for the funniest chain</span>
          <Countdown endsAt={round.phaseEndsAt} />
        </div>
        <div className="mt-3 grid gap-2">
          {round.chains.map((c, i) => {
            // Chain id for voting is carried in reveal[i].submissionId (server
            // keeps the seed submission id as the vote target).
            const revealEntry = round.reveal[i];
            const submissionId = revealEntry?.submissionId ?? null;
            const authorId = revealEntry?.authorId ?? null;
            const mine = authorId && authorId === myId;
            const blockSelf = !!mine && !soloMode;
            return (
              <button
                key={submissionId ?? i}
                disabled={busy || alreadyVoted || blockSelf || !submissionId}
                onClick={() => submissionId && vote(submissionId, !!mine)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  blockSelf
                    ? "border-white/5 bg-white/5 text-mist/50"
                    : "border-white/10 bg-white/5 hover:border-ember hover:bg-ember/10"
                }`}
              >
                <div className="text-xs uppercase tracking-widest text-mist/50">
                  Chain {i + 1} • from {c.originPlayerName}
                  {mine ? " (yours)" : ""}
                </div>
                <div className="mt-1 text-sm italic text-mist/70">
                  &ldquo;{c.entries[0]?.text}&rdquo;
                </div>
                <div className="mt-1 text-xs text-mist/50">
                  → {c.entries.length} step{c.entries.length === 1 ? "" : "s"}
                </div>
              </button>
            );
          })}
        </div>
        {alreadyVoted && <div className="mt-3 text-sm text-neon">Vote locked in. Nice.</div>}
        {error && (
          <div role="alert" className="mt-2 text-sm text-ember">
            {error}
          </div>
        )}
      </div>
    );
  }

  // Combo games (Mash-Up Doodle): vote for icon+slogan combos.
  if (game.flow === "combo" && round.mashups) {
    return (
      <div className="cc-card p-5">
        <div className="flex items-center justify-between text-xs text-mist/60">
          <span>Vote for the best t-shirt</span>
          <Countdown endsAt={round.phaseEndsAt} />
        </div>
        <div className="mt-3 grid gap-3">
          {round.mashups.map((m) => {
            const icon = tryParseDrawing(m.iconText);
            const mine = m.iconAuthorId === myId || m.sloganAuthorId === myId;
            const blockSelf = mine && !soloMode;
            return (
              <button
                key={m.id}
                disabled={busy || alreadyVoted || blockSelf}
                onClick={() => vote(m.id, mine)}
                className={`w-full rounded-2xl border p-3 text-left transition ${
                  blockSelf
                    ? "border-white/5 bg-white/5 text-mist/50"
                    : "border-white/10 bg-white/5 hover:border-sol hover:bg-sol/10"
                }`}
              >
                {icon && (
                  <div>
                    <DrawingView drawing={icon} />
                  </div>
                )}
                <div className="mt-2 text-center text-base font-semibold">
                  &ldquo;{m.sloganText}&rdquo;
                </div>
                {mine && (
                  <div className="mt-1 text-center text-xs text-mist/50">
                    (one of yours)
                  </div>
                )}
              </button>
            );
          })}
        </div>
        {alreadyVoted && <div className="mt-3 text-sm text-neon">Vote locked in. Nice.</div>}
        {error && (
          <div role="alert" className="mt-2 text-sm text-ember">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="cc-card p-5">
      <div className="flex items-center justify-between text-xs text-mist/60">
        <span>
          {isFib
            ? "Pick the real answer"
            : round.criterionLabel
            ? `Vote for the ${round.criterionLabel.toLowerCase()}`
            : "Vote"}
        </span>
        <Countdown endsAt={round.phaseEndsAt} />
      </div>
      <h3 className="mt-2 text-base font-semibold text-mist/80">{round.prompt}</h3>
      <div className="mt-4 grid gap-2">
        {round.reveal.map((item, i) => {
          const mine = item.authorId && item.authorId === myId;
          const blockSelf = !!mine && !soloMode;
          const isDrawing = round.submissionKind === "DRAWING" && !item.isTruth;
          const drawing = isDrawing ? tryParseDrawing(item.text) : null;
          return (
            <button
              key={item.submissionId ?? `truth-${i}`}
              disabled={busy || alreadyVoted || blockSelf}
              onClick={() => vote(item.submissionId, blockSelf)}
              className={`w-full rounded-xl border p-3 text-left transition ${
                blockSelf
                  ? "border-white/5 bg-white/5 text-mist/50"
                  : "border-white/10 bg-white/5 hover:border-neon hover:bg-neon/10"
              }`}
            >
              <div className="text-xs text-mist/50">
                {isFib ? `Answer ${i + 1}` : `Entry ${i + 1}`}
                {mine ? " (yours)" : ""}
              </div>
              {drawing ? (
                <div className="mt-2">
                  <DrawingView drawing={drawing} />
                </div>
              ) : (
                <div className="mt-1 text-base">{item.text}</div>
              )}
            </button>
          );
        })}
      </div>
      {alreadyVoted && <div className="mt-3 text-sm text-neon">Vote locked in. Nice.</div>}
      {error && (
        <div role="alert" className="mt-2 text-sm text-ember">
          {error}
        </div>
      )}
    </div>
  );
}

function ScoreCard() {
  const { snapshot } = useRoomStore();
  if (!snapshot) return null;
  const leaderboard = [...snapshot.players].sort((a, b) => b.score - a.score);
  const isFinalRound =
    snapshot.round && snapshot.round.number === snapshot.round.total;
  return (
    <div className="cc-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Scores so far</h3>
        {isFinalRound && (
          <span className="cc-chip !bg-ember/20 !text-ember">2× round</span>
        )}
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {leaderboard.map((p, i) => (
          <li key={p.id} className="flex items-center justify-between rounded bg-white/5 p-2">
            <span className="flex items-center gap-2">
              <span className="w-4 text-center text-xs text-mist/50">{i + 1}</span>
              <span
                className="grid h-6 w-6 place-items-center rounded-full text-sm"
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
    </div>
  );
}

function EndCard() {
  const { snapshot } = useRoomStore();
  if (!snapshot) return null;
  const leaderboard = [...snapshot.players].sort((a, b) => b.score - a.score);
  const champ = leaderboard[0];
  return (
    <div className="cc-card p-6 text-center">
      {champ && (
        <div
          className="mx-auto grid h-20 w-20 place-items-center rounded-full text-3xl"
          style={{ background: champ.avatarColor }}
          aria-hidden
        >
          {champ.avatarEmoji}
        </div>
      )}
      <h3 className="mt-3 text-lg font-semibold">
        {champ ? `${champ.displayName} wins!` : "Match complete"}
      </h3>
      {champ && (
        <div className="mt-1 text-sm text-mist/70">
          Final score: <span className="font-mono text-neon">{champ.score}</span>
        </div>
      )}
      <p className="mt-2 text-xs text-mist/50">Watch the big screen for the highlight reel.</p>
    </div>
  );
}

function Loader() {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-6">
      <div className="cc-chip">
        <span className="h-1.5 w-1.5 animate-pulseSoft rounded-full bg-neon" />
        Reconnecting to room…
      </div>
    </main>
  );
}

function placeholderForGame(gameId: string, stage = 0): string {
  if (gameId === "stroke-of-genius") {
    if (stage === 0) return "e.g. A cat running for mayor";
    if (stage === 2) return "Type what the drawing shows…";
  }
  if (gameId === "mash-up-doodle" && stage === 1) {
    return "A punchy t-shirt slogan…";
  }
  const map: Record<string, string> = {
    "hot-take-hustle": "Drop your take…",
    "pitch-party": "Your one-sentence pitch…",
    "bad-advice-booth": "The worst possible advice…",
    "hype-machine": "Hype it up…",
    "scene-stealer": "The line that steals the scene…",
    "crowd-fibs": "Your fake answer (make it sound true)…",
    "caption-chaos": "Your caption…",
    "villain-origin": "The villain origin story…",
    "fortune-forge": "Your fortune…",
    "red-flag-rally": "Flip the flag…",
    "group-mentality": "The first word that comes to mind…",
  };
  return map[gameId] ?? "Type your answer…";
}

function labelForGame(gameId: string, stage = 0): string {
  if (gameId === "stroke-of-genius") {
    if (stage === 0) return "Seed phrase";
    if (stage === 2) return "What is this drawing?";
  }
  if (gameId === "mash-up-doodle" && stage === 1) {
    return "Your slogan";
  }
  const map: Record<string, string> = {
    "hot-take-hustle": "Your take",
    "pitch-party": "Your pitch",
    "bad-advice-booth": "Your advice",
    "hype-machine": "Your hype",
    "scene-stealer": "Your line",
    "crowd-fibs": "Your fake answer",
    "caption-chaos": "Your caption",
    "villain-origin": "Your origin",
    "fortune-forge": "Your fortune",
    "red-flag-rally": "Your flip",
    "group-mentality": "Your answer",
  };
  return map[gameId] ?? "Your answer";
}
