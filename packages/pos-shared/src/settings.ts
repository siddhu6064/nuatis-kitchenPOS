import { z } from "zod";
import { VerticalSchema } from "./common.js";

export const TimezoneSchema = z.enum([
  "America/Chicago",
  "America/New_York",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Denver",
  "Pacific/Honolulu",
  "America/Anchorage",
]);
export type Timezone = z.infer<typeof TimezoneSchema>;

export const TIMEZONE_LABELS: Record<Timezone, string> = {
  "America/Chicago": "Central (CT)",
  "America/New_York": "Eastern (ET)",
  "America/Los_Angeles": "Pacific (PT)",
  "America/Phoenix": "Arizona (MT no DST)",
  "America/Denver": "Mountain (MT)",
  "Pacific/Honolulu": "Hawaii (HT)",
  "America/Anchorage": "Alaska (AKT)",
};

export const TenantSettingsSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  vertical: VerticalSchema,
  timezone: TimezoneSchema,
  email_daily_report: z.boolean(),
  daily_report_recipient_email: z.string().email().nullable(),
});
export type TenantSettings = z.infer<typeof TenantSettingsSchema>;

export const LocationSettingsSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  sales_tax_bps: z.number().int().min(0).max(2000),
  business_hours: z.unknown().nullable(),
  address: z.unknown().nullable(),
});
export type LocationSettings = z.infer<typeof LocationSettingsSchema>;

export const UpdateTenantSettingsRequestSchema = TenantSettingsSchema.partial().omit({ id: true });
export type UpdateTenantSettingsRequest = z.infer<typeof UpdateTenantSettingsRequestSchema>;

export const UpdateLocationSettingsRequestSchema = LocationSettingsSchema.partial().omit({ id: true, tenant_id: true });
export type UpdateLocationSettingsRequest = z.infer<typeof UpdateLocationSettingsRequestSchema>;

export const SettingsResponseSchema = z.object({
  tenant: TenantSettingsSchema,
  locations: z.array(LocationSettingsSchema),
});
export type SettingsResponse = z.infer<typeof SettingsResponseSchema>;
