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
