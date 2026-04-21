import { z } from "zod";
import { AVATAR_COLORS, AVATAR_EMOJIS } from "./avatars";

const avatarColorValues = AVATAR_COLORS.map((c) => c.color) as [string, ...string[]];
const avatarEmojiValues = AVATAR_EMOJIS as unknown as [string, ...string[]];

export const createRoomSchema = z.object({
  // All fields are optional — the TV is display-only and has no host
  // Player. The first person to scan the join QR becomes the room's host.
  familyMode: z.boolean().optional().default(false),
  streamerMode: z.boolean().optional().default(false),
  // Legacy fields kept for older clients; ignored by the current server.
  hostName: z.string().min(1).max(20).optional(),
  avatarColor: z.enum(avatarColorValues).optional(),
  avatarEmoji: z.enum(avatarEmojiValues).optional(),
  hostIsAudience: z.boolean().optional().default(false),
});

export const joinRoomSchema = z.object({
  code: z.string().length(4),
  displayName: z.string().min(1).max(20),
  asAudience: z.boolean().optional().default(false),
  avatarColor: z.enum(avatarColorValues).optional(),
  avatarEmoji: z.enum(avatarEmojiValues).optional(),
});

export const submitAnswerSchema = z.object({
  text: z.string().min(1).max(140),
});

export const castVoteSchema = z.object({
  submissionId: z.string().min(1),
});

export const remoteJoinSchema = z.object({
  token: z.string().min(8).max(120),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;
export type CastVoteInput = z.infer<typeof castVoteSchema>;
export type RemoteJoinInput = z.infer<typeof remoteJoinSchema>;
