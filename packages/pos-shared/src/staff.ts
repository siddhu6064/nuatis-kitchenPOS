import { z } from "zod";

export const StaffRoleSchema = z.enum(["owner", "manager", "cashier"]);
export type StaffRole = z.infer<typeof StaffRoleSchema>;

export const PinSchema = z
  .string()
  .regex(/^\d{4}$/, "PIN must be exactly 4 digits");

export const EmailSchema = z.string().email().toLowerCase();

export const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters");

// ---------------------------------------------------------------------------
// Staff response (safe — excludes password_hash and pin_hash)
// ---------------------------------------------------------------------------

export const StaffResponseSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  full_name: z.string(),
  email: z.string().nullable(),
  role: StaffRoleSchema,
  active: z.boolean(),
  location_ids: z.array(z.string().uuid()).nullable(),
  has_pin: z.boolean(),
  created_at: z.string(),
});
export type StaffResponse = z.infer<typeof StaffResponseSchema>;

// ---------------------------------------------------------------------------
// Invite / Update request schemas
// ---------------------------------------------------------------------------

export const InviteStaffRequestSchema = z.object({
  full_name: z.string().min(1).max(100),
  email: EmailSchema.optional(),
  role: StaffRoleSchema,
  pin: PinSchema.optional(),
  location_ids: z.array(z.string().uuid()).min(1).optional(),
});
export type InviteStaffRequest = z.infer<typeof InviteStaffRequestSchema>;

export const UpdateStaffRequestSchema = InviteStaffRequestSchema.partial().extend({
  active: z.boolean().optional(),
});
export type UpdateStaffRequest = z.infer<typeof UpdateStaffRequestSchema>;
