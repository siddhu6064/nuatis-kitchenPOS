import { z } from "zod";

// ---------------------------------------------------------------------------
// Base field helpers
// ---------------------------------------------------------------------------
const uuid = z.string().uuid();
const softDeleted = z.string().datetime().nullable();
const createdAt = z.string().datetime();

// ---------------------------------------------------------------------------
// MenuCategory
// ---------------------------------------------------------------------------
export const MenuCategorySchema = z.object({
  id: uuid,
  tenant_id: uuid,
  name: z.string().min(1).max(100),
  sort_order: z.number().int().nonnegative(),
  deleted_at: softDeleted,
  created_at: createdAt,
});
export type MenuCategory = z.infer<typeof MenuCategorySchema>;

export const CreateMenuCategoryRequestSchema = z.object({
  name: z.string().min(1).max(100),
  sort_order: z.number().int().nonnegative().default(0),
});
export type CreateMenuCategoryRequest = z.infer<typeof CreateMenuCategoryRequestSchema>;

export const UpdateMenuCategoryRequestSchema = CreateMenuCategoryRequestSchema.partial();
export type UpdateMenuCategoryRequest = z.infer<typeof UpdateMenuCategoryRequestSchema>;

// ---------------------------------------------------------------------------
// MenuItem
// ---------------------------------------------------------------------------
export const MenuItemSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  category_id: uuid,
  name: z.string().min(1).max(120),
  price_cents: z.number().int().nonnegative().max(1_000_000),
  taxable: z.boolean(),
  image_url: z.string().url().nullable(),
  kitchen_station: z.string().nullable(),
  deleted_at: softDeleted,
  created_at: createdAt,
});
export type MenuItem = z.infer<typeof MenuItemSchema>;

export const CreateMenuItemRequestSchema = z.object({
  category_id: uuid,
  name: z.string().min(1).max(120),
  price_cents: z.number().int().nonnegative().max(1_000_000),
  taxable: z.boolean().default(true),
  image_url: z.string().url().nullable().optional(),
  kitchen_station: z.string().nullable().optional(),
});
export type CreateMenuItemRequest = z.infer<typeof CreateMenuItemRequestSchema>;

export const UpdateMenuItemRequestSchema = CreateMenuItemRequestSchema.partial();
export type UpdateMenuItemRequest = z.infer<typeof UpdateMenuItemRequestSchema>;

// ---------------------------------------------------------------------------
// ModifierGroup
// ---------------------------------------------------------------------------
export const ModifierGroupSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  name: z.string().min(1).max(100),
  min_select: z.number().int().min(0),
  max_select: z.number().int().min(1),
  required: z.boolean(),
  deleted_at: softDeleted,
  created_at: createdAt,
});
export type ModifierGroup = z.infer<typeof ModifierGroupSchema>;

export const CreateModifierGroupRequestSchema = z.object({
  name: z.string().min(1).max(100),
  min_select: z.number().int().min(0).default(0),
  max_select: z.number().int().min(1).default(1),
  required: z.boolean().default(false),
});
export type CreateModifierGroupRequest = z.infer<typeof CreateModifierGroupRequestSchema>;

export const UpdateModifierGroupRequestSchema = CreateModifierGroupRequestSchema.partial();
export type UpdateModifierGroupRequest = z.infer<typeof UpdateModifierGroupRequestSchema>;

// ---------------------------------------------------------------------------
// ModifierOption
// ---------------------------------------------------------------------------
export const ModifierOptionSchema = z.object({
  id: uuid,
  group_id: uuid,
  name: z.string().min(1).max(100),
  price_delta_cents: z.number().int(),
  sort_order: z.number().int().nonnegative(),
});
export type ModifierOption = z.infer<typeof ModifierOptionSchema>;

export const CreateModifierOptionRequestSchema = z.object({
  group_id: uuid,
  name: z.string().min(1).max(100),
  price_delta_cents: z.number().int().default(0),
  sort_order: z.number().int().nonnegative().default(0),
});
export type CreateModifierOptionRequest = z.infer<typeof CreateModifierOptionRequestSchema>;

export const UpdateModifierOptionRequestSchema = CreateModifierOptionRequestSchema.omit({ group_id: true }).partial();
export type UpdateModifierOptionRequest = z.infer<typeof UpdateModifierOptionRequestSchema>;

// ---------------------------------------------------------------------------
// MenuItemModifierGroup (junction)
// ---------------------------------------------------------------------------
export const MenuItemModifierGroupSchema = z.object({
  item_id: uuid,
  group_id: uuid,
  sort_order: z.number().int().nonnegative(),
});
export type MenuItemModifierGroup = z.infer<typeof MenuItemModifierGroupSchema>;

// ---------------------------------------------------------------------------
// MenuTree — full nested response shape for terminal consumption
// ---------------------------------------------------------------------------
export const MenuTreeResponseSchema = z.object({
  categories: z.array(
    MenuCategorySchema.extend({
      items: z.array(
        MenuItemSchema.extend({
          modifier_groups: z.array(
            ModifierGroupSchema.extend({
              options: z.array(ModifierOptionSchema),
            })
          ),
        })
      ),
    })
  ),
});
export type MenuTreeResponse = z.infer<typeof MenuTreeResponseSchema>;
