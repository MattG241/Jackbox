// Original, conservative banned-word filter. Keeps it short and focused on slurs
// and sexual content that should never appear regardless of mode. This is not a
// substitute for a managed moderation service, but covers the most common abuse.
const BANNED = [
  "nazi",
  "heil hitler",
  "kkk",
  "slur1",
  "slur2",
  // Placeholder entries intentionally vague — swap with your own list in production.
];

// Spicier words filtered additionally in family mode.
const FAMILY_EXTRA = ["sex", "sexy", "drunk", "beer", "whiskey", "damn", "hell"];

export type ModerationResult =
  | { ok: true; cleaned: string }
  | { ok: false; reason: string };

function normalize(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

export function moderateText(
  input: string,
  opts: { familyMode: boolean; maxLen?: number } = { familyMode: false }
): ModerationResult {
  const maxLen = opts.maxLen ?? 140;
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, reason: "Please write something." };
  if (trimmed.length > maxLen)
    return { ok: false, reason: `Keep it under ${maxLen} characters.` };

  const norm = normalize(trimmed);
  for (const term of BANNED) {
    if (norm.includes(term)) return { ok: false, reason: "That doesn't fly here." };
  }
  if (opts.familyMode) {
    for (const term of FAMILY_EXTRA) {
      const re = new RegExp(`(^|[^a-z])${term}([^a-z]|$)`, "i");
      if (re.test(norm)) return { ok: false, reason: "Family mode is on — keep it gentle." };
    }
  }
  return { ok: true, cleaned: trimmed };
}

export function isDisplayNameOk(name: string, familyMode: boolean): ModerationResult {
  const res = moderateText(name, { familyMode, maxLen: 20 });
  if (!res.ok) return res;
  if (!/^[\p{L}\p{N}_\-\s']+$/u.test(res.cleaned))
    return { ok: false, reason: "Letters, numbers, spaces only." };
  return res;
}
