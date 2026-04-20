# CrowdCircuit

An original browser-based multiplayer party game platform. One host screen, phones as controllers, 3–10 players plus unlimited audience. Ships with the first original mini-game, **Hot Take Hustle**.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS for styling
- Framer-Motion-ready (Tailwind animations used for the MVP)
- Prisma ORM + PostgreSQL
- Socket.IO for realtime (attached to a custom Node server)
- Zod for validation
- Zustand for client state

## Architecture at a glance

- `server.ts` — custom Node entry that starts Next.js and attaches the Socket.IO server on the same HTTP listener.
- `src/server/roomManager.ts` — in-memory room state, server-authoritative phase timers, and the full Hot Take Hustle game engine.
- `src/server/socketServer.ts` — Socket.IO event handlers (auth resume, host controls, submissions, votes, reports).
- `src/app/api/rooms/*` — REST endpoints for creating rooms and joining rooms.
- `src/components/HostView.tsx` — host TV/monitor layout for each phase (LOBBY → SUBMIT → REVEAL → VOTE → SCORE → MATCH_END).
- `src/components/PlayerView.tsx` — phone-first controller layout for each phase.
- `src/lib/types.ts` — shared client/server types.
- `prisma/schema.prisma` — Room, Player, Match, Round, Prompt, Criterion, Submission, Vote, ScoreEvent, ModerationFlag.
- `prisma/seed.ts` — seeds an original prompt + criterion pack.

Timers, scoring, and phase transitions are all decided on the server. Client UI always renders from the latest `room:state` snapshot.

## Run it locally

```bash
# 1. install deps
npm install

# 2. copy env
cp .env.example .env
# edit DATABASE_URL to point at your Postgres instance

# 3. create schema + seed prompts
npm run db:migrate -- --name init
npm run db:seed

# 4. start the dev server (Next.js + Socket.IO on one port)
npm run dev
```

Open the host view on your TV/laptop by going to `http://localhost:3000`, hit **Create room**, copy the 4-letter code. Players open the same URL (or `/play`) on their phones, paste the code, go.

## Hot Take Hustle — how it plays

1. Each round, every player gets the same silly prompt.
2. 45 seconds to submit a take (≤ 140 chars). Family-mode and banned-word filters apply.
3. Takes are revealed anonymously on the host screen.
4. The **secret criterion** (e.g. *Pettiest*, *Most Cursed*, *Most Marketable*) is revealed at voting time.
5. 20 seconds to vote. You can't vote for yourself. Audience votes are weighted lighter (`0.35` by default).
6. Scoring:
   - +50 participation for submitting
   - +100 per vote received (capped at +500)
   - +1000 for the top take
   - +200 for voters who picked the top take (*sharp voting*)
7. Five rounds per match, then the leaderboard reveals a winner.

## Feature matrix

- [x] Landing page with create + join forms
- [x] Create room API with host session
- [x] Join room API with audience fallback and name collision prevention
- [x] Lobby with live player list and ready states
- [x] Host display with streamer-mode toggle
- [x] Phone-first player controller with phase-aware UI
- [x] Audience mode with weighted voting
- [x] Reconnect handling via localStorage session tokens + 10s disconnect grace
- [x] Server-authoritative timers for submit/reveal/vote/score phases
- [x] Duplicate-vote and duplicate-submission protection (Prisma upserts w/ unique indices)
- [x] Family mode + banned-word filter + report button
- [x] Seed pack with 24 prompts and 12 criteria
- [x] Accessibility pass (focus rings, `prefers-reduced-motion`, aria-live countdowns)

## Manual QA checklist

1. Open two browsers (laptop + phone). Create a room on the laptop — confirm the 4-letter room code appears.
2. Join from phone. See your name appear in the host lobby within a second.
3. Toggle family mode on the host — the seed filters to `FAMILY` prompts on next round.
4. Join a third phone (or extra browser tab) to reach 3 players. Start match.
5. Watch the host display flip through SUBMIT → REVEAL → VOTE → SCORE. Secret criterion only shows in VOTE.
6. Refresh a player phone mid-round. Session should resume automatically; score and submit state preserved.
7. Disconnect a player (close the tab). After ~10 seconds the lobby shows them offline.
8. Exceed 10 players — the 11th is offered audience mode.
9. Let the vote timer run out with only partial votes. SCORE phase still triggers and the leaderboard updates.
10. End match on host. Confirm leaderboard ⇒ lobby transition and that a new match can start.

## Known limitations (MVP scope)

- Reconnect state lives in server memory — a restart ends an in-flight match (DB still has history).
- No Redis pub/sub yet; horizontal scale past a single node requires wiring Socket.IO to a Redis adapter.
- No rate limiting on submissions beyond schema validation.
- Moderation flags are captured but not surfaced in an admin UI.
- No CSRF on the REST endpoints (state-changing flows require the socket session; add CSRF before public exposure).
- Seed list is intentionally short and generic; production should replace it with a curated, rated prompt pack.

## Next recommended improvements

- Redis adapter for Socket.IO and a stateless game-engine snapshot.
- Admin dashboard over `ModerationFlag` and banned-word list.
- Second mini-game with shared game-registry contract.
- Soundtrack + SFX layer, with streamer-safe licensing.
- Host persona skin system.
- i18n pass with translated prompts.
- E2E tests (Playwright) against the real Socket.IO server.
