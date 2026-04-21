"use client";

import { useEffect, useMemo, useRef } from "react";
import type { PublicPlayer } from "@/lib/types";
import { Avatar } from "./Avatar";

// Each connected player becomes a circle drifting around the container,
// bouncing off the walls and each other with perfectly elastic collisions.
// Positions are held in a ref and pushed straight into each node's
// `transform` on every animation frame — React never re-renders during
// motion, it only re-renders when the player list itself changes.
interface Ball {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  node?: HTMLDivElement | null;
}

export function PlayerOrbit({ players }: { players: PublicPlayer[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ballsRef = useRef<Map<string, Ball>>(new Map());
  const sizeRef = useRef({ w: 0, h: 0 });
  const rafRef = useRef<number | null>(null);

  // Keep a stable sorted copy of the player list for render. Sorting by id
  // means we don't thrash the DOM when snapshots change.
  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => a.id.localeCompare(b.id)),
    [players]
  );

  // Ball radius scales with how many players are in the room so a crowd
  // doesn't overflow the frame.
  function targetRadius(count: number): number {
    const { w, h } = sizeRef.current;
    if (!w || !h) return 56;
    const area = w * h;
    // Aim for roughly 10-14% of total area covered by balls.
    const perBall = (area * 0.12) / Math.max(1, count);
    const r = Math.sqrt(perBall / Math.PI);
    return Math.min(96, Math.max(36, Math.round(r)));
  }

  // Sync the ball set with the incoming player list. Preserve positions
  // and velocities for players that stayed; spawn fresh balls for new
  // joiners at a safe spot.
  useEffect(() => {
    const map = ballsRef.current;
    const radius = targetRadius(players.length);
    const { w, h } = sizeRef.current;
    const seenIds = new Set(players.map((p) => p.id));

    // Drop departed players.
    for (const id of map.keys()) {
      if (!seenIds.has(id)) map.delete(id);
    }

    // Resize existing balls + spawn new ones.
    for (const p of players) {
      const existing = map.get(p.id);
      if (existing) {
        existing.r = radius;
        continue;
      }
      const newBall: Ball = {
        id: p.id,
        r: radius,
        x: w ? radius + Math.random() * (w - 2 * radius) : 100,
        y: h ? radius + Math.random() * (h - 2 * radius) : 100,
        // Slow drift — pixels per second.
        vx: (Math.random() < 0.5 ? -1 : 1) * (25 + Math.random() * 30),
        vy: (Math.random() < 0.5 ? -1 : 1) * (25 + Math.random() * 30),
      };
      map.set(p.id, newBall);
    }
  }, [players]);

  // ResizeObserver keeps the physics bounds up-to-date when the TV window
  // shape changes (fullscreen toggles, window drags, etc.).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      sizeRef.current = { w: rect.width, h: rect.height };
      // Clamp any balls that are now out of bounds after a shrink.
      const map = ballsRef.current;
      for (const b of map.values()) {
        b.x = Math.max(b.r, Math.min(rect.width - b.r, b.x));
        b.y = Math.max(b.r, Math.min(rect.height - b.r, b.y));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Main animation loop. Integrates positions, bounces off walls, and
  // resolves pairwise elastic collisions with equal mass (swap the normal
  // component of velocity). Runs as long as the component is mounted.
  useEffect(() => {
    let last = performance.now();
    const step = (now: number) => {
      const dtMs = now - last;
      last = now;
      // Clamp dt so a background-tab return doesn't teleport everyone.
      const dt = Math.min(0.05, dtMs / 1000);
      const { w, h } = sizeRef.current;
      const balls = Array.from(ballsRef.current.values());

      for (const b of balls) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        // Wall bounces — simple inelastic-to-tangent, flipping the normal.
        if (b.x < b.r) {
          b.x = b.r;
          b.vx = Math.abs(b.vx);
        } else if (w && b.x > w - b.r) {
          b.x = w - b.r;
          b.vx = -Math.abs(b.vx);
        }
        if (b.y < b.r) {
          b.y = b.r;
          b.vy = Math.abs(b.vy);
        } else if (h && b.y > h - b.r) {
          b.y = h - b.r;
          b.vy = -Math.abs(b.vy);
        }
      }

      // Pairwise collisions — O(n²) is fine at ≤10 players.
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i];
          const c = balls[j];
          const dx = c.x - a.x;
          const dy = c.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = a.r + c.r;
          if (dist === 0 || dist >= minDist) continue;
          const nx = dx / dist;
          const ny = dy / dist;
          // Only resolve if they're actually moving toward each other.
          const aVel = a.vx * nx + a.vy * ny;
          const cVel = c.vx * nx + c.vy * ny;
          if (aVel - cVel > 0) {
            const delta = cVel - aVel;
            a.vx += delta * nx;
            a.vy += delta * ny;
            c.vx -= delta * nx;
            c.vy -= delta * ny;
          }
          // Push apart so they can't stay stuck overlapping.
          const overlap = (minDist - dist) / 2;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          c.x += nx * overlap;
          c.y += ny * overlap;
        }
      }

      // Paint positions directly to the DOM — skips React re-renders.
      for (const b of balls) {
        const el = b.node;
        if (!el) continue;
        // Translate the top-left of the node by (x-r, y-r) so (x, y) is
        // the ball's center.
        el.style.transform = `translate3d(${b.x - b.r}px, ${b.y - b.r}px, 0)`;
        const sizePx = `${b.r * 2}px`;
        if (el.style.width !== sizePx) {
          el.style.width = sizePx;
          el.style.height = sizePx;
        }
      }

      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const captureNode = (id: string) => (el: HTMLDivElement | null) => {
    const ball = ballsRef.current.get(id);
    if (ball) ball.node = el;
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-ember/10 via-transparent to-neon/10"
    >
      {sortedPlayers.length === 0 && (
        <div className="absolute inset-0 grid place-items-center text-center">
          <div className="max-w-md">
            <div className="text-4xl">📡</div>
            <div className="mt-3 text-xl font-semibold">
              Waiting for the first scan
            </div>
            <p className="mt-1 text-sm text-mist/60">
              Scan the QR to join. First in becomes host — and still plays.
            </p>
          </div>
        </div>
      )}
      {sortedPlayers.map((p) => (
        <div
          key={p.id}
          ref={captureNode(p.id)}
          className={`absolute left-0 top-0 flex select-none items-center justify-center ${
            p.connected ? "" : "opacity-50"
          }`}
          style={{
            width: 0,
            height: 0,
            willChange: "transform",
          }}
        >
          <div className="relative grid h-full w-full place-items-center">
            {/* Size-relative avatar — using a wrapper with padding keeps it
                comfortable inside the ball. */}
            <div className="grid h-[90%] w-[90%] place-items-center overflow-hidden rounded-full shadow-[0_0_40px_rgba(255,255,255,0.12)]">
              <Avatar
                player={p}
                size="xl"
                className="h-full w-full"
                rounded
              />
            </div>
            {p.isHost && (
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-neon/60 bg-black/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.25em] text-neon">
                Host
              </span>
            )}
            <span className="absolute left-1/2 top-full mt-1 max-w-[120px] -translate-x-1/2 truncate rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium text-mist">
              {p.displayName}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
