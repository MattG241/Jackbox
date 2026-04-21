// Visual identity for players — every lobby entrant picks a color + emoji.
// Tiny, self-contained module so both server (validation) and client (picker)
// share the canonical list.

export const AVATAR_COLORS: { name: string; color: string }[] = [
  { name: "Ember", color: "#ff4f7b" },
  { name: "Sol", color: "#ffd36e" },
  { name: "Neon", color: "#7cf8d0" },
  { name: "Sky", color: "#6fb3ff" },
  { name: "Orchid", color: "#b080ff" },
  { name: "Moss", color: "#6fd67a" },
  { name: "Coral", color: "#ff8a5b" },
  { name: "Mist", color: "#e9e6ff" },
];

export const AVATAR_EMOJIS = [
  "🎲", "🚀", "🦄", "🐙", "🌮", "🪩", "🔥", "⚡",
  "🌈", "🍕", "🐸", "👾", "🎸", "🥑", "🧃", "🛸",
];

export function isValidAvatarColor(color: string): boolean {
  return AVATAR_COLORS.some((c) => c.color === color);
}

export function isValidAvatarEmoji(emoji: string): boolean {
  return AVATAR_EMOJIS.includes(emoji);
}

// Deterministic fallback pick based on a seed string (e.g. playerId) — used
// for pre-avatar players during in-place schema migration.
export function pickDefaultAvatar(seed: string): { color: string; emoji: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const c = AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length].color;
  const e = AVATAR_EMOJIS[Math.abs(h >> 3) % AVATAR_EMOJIS.length];
  return { color: c, emoji: e };
}
