import { z } from 'zod';
export const workspacePreferences = z.object({
  role: z.enum(['customer', 'jeweller', 'auctioneer']).default('customer'), country: z.string().trim().max(80).default(''), phone: z.string().trim().max(40).default(''),
  saved: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/)).max(80).default([]),
}).strict();
export type WorkspacePreferences = z.infer<typeof workspacePreferences>;
export function readWorkspacePreferences(value: unknown): WorkspacePreferences {
  const parsed = workspacePreferences.safeParse(value); return parsed.success ? parsed.data : workspacePreferences.parse({});
}
export type SavedPiece = { assetId: string; name: string; href: string; image: string; price: string; origin: string };
