import { z } from "zod";

export const createRoomSchema = z.object({
  hostName: z.string().min(1).max(20),
  familyMode: z.boolean().optional().default(false),
  streamerMode: z.boolean().optional().default(false),
});

export const joinRoomSchema = z.object({
  code: z.string().length(4),
  displayName: z.string().min(1).max(20),
  asAudience: z.boolean().optional().default(false),
});

export const submitAnswerSchema = z.object({
  text: z.string().min(1).max(140),
});

export const castVoteSchema = z.object({
  submissionId: z.string().min(1),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;
export type CastVoteInput = z.infer<typeof castVoteSchema>;
