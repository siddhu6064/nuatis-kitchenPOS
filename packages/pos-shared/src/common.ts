import { z } from "zod";

export const VERTICALS = [
  "restaurant",
  "cafe",
  "salon",
  "spa",
  "nail_bar",
  "tattoo",
  "pet_grooming",
  "car_wash",
  "laundry",
  "gym",
] as const;

export const VerticalSchema = z.enum(VERTICALS);
export type Vertical = z.infer<typeof VerticalSchema>;

export const DEFAULT_SALES_TAX_BPS = 825;

export const TIP_PRESETS = [18, 20, 25] as const;

export const SESSION_JWT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const TERMINAL_JWT_TTL_SECONDS = 60 * 60 * 4; // 4 hours

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export type ApiSuccess<T> = { data: T };
