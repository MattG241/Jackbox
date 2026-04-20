import { customAlphabet } from "nanoid";

// No look-alikes (no 0/O/1/I) to keep room codes readable on phones and TVs.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const generator = customAlphabet(ALPHABET, 4);

export function generateRoomCode(): string {
  return generator();
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== 4) return false;
  for (const ch of code) if (!ALPHABET.includes(ch)) return false;
  return true;
}
