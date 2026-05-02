import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getSupabaseClient } from "../../lib/supabase.js";
import type {
  MenuCategory,
  MenuItem,
  ModifierGroup,
  ModifierOption,
  MenuItemModifierGroup,
} from "@nuatis/pos-shared";

export const treeRouter: IRouter = Router();

// GET /v1/menu/tree — full nested menu for terminal consumption
treeRouter.get(
  "/",
  requireAuth(),
  async (req: Request, res: Response): Promise<void> => {
    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({ error: { code: "service_unavailable", message: "DB not configured" } });
      return;
    }

    const tenantId = req.auth!.tenant_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any;

    // Parallel fetch — all active records for tenant
    const [catRes, itemRes, groupRes, optRes, linkRes] = await Promise.all([
      db.from("menu_categories").select("*").eq("tenant_id", tenantId).is("deleted_at", null).order("sort_order"),
      db.from("menu_items").select("*").eq("tenant_id", tenantId).is("deleted_at", null).order("name"),
      db.from("modifier_groups").select("*").eq("tenant_id", tenantId).is("deleted_at", null).order("name"),
      db.from("modifier_options").select("*").order("sort_order"),
      db.from("menu_item_modifier_groups").select("*"),
    ]);

    if (catRes.error || itemRes.error || groupRes.error || optRes.error || linkRes.error) {
      const err = catRes.error ?? itemRes.error ?? groupRes.error ?? optRes.error ?? linkRes.error;
      res.status(500).json({ error: { code: "internal_error", message: (err as { message: string }).message ?? "Query failed" } });
      return;
    }

    const categories: MenuCategory[] = catRes.data ?? [];
    const items: MenuItem[] = itemRes.data ?? [];
    const groups: ModifierGroup[] = groupRes.data ?? [];
    const options: ModifierOption[] = optRes.data ?? [];
    const links: MenuItemModifierGroup[] = linkRes.data ?? [];

    // Build lookup maps
    const optsByGroup = new Map<string, ModifierOption[]>();
    for (const opt of options) {
      const list = optsByGroup.get(opt.group_id) ?? [];
      list.push(opt);
      optsByGroup.set(opt.group_id, list);
    }

    const groupMap = new Map<string, ModifierGroup & { options: ModifierOption[] }>(
      groups.map((g) => [g.id, { ...g, options: optsByGroup.get(g.id) ?? [] }])
    );

    // Links: item_id → sorted list of groups
    const groupsByItem = new Map<string, Array<ModifierGroup & { options: ModifierOption[] }>>();
    for (const link of [...links].sort((a, b) => a.sort_order - b.sort_order)) {
      const g = groupMap.get(link.group_id);
      if (!g) continue;
      const list = groupsByItem.get(link.item_id) ?? [];
      list.push(g);
      groupsByItem.set(link.item_id, list);
    }

    // Items with modifier_groups embedded
    const itemsWithGroups = new Map(
      items.map((item) => [item.id, { ...item, modifier_groups: groupsByItem.get(item.id) ?? [] }])
    );

    // Assemble tree
    const tree = categories.map((cat) => ({
      ...cat,
      items: items
        .filter((item) => item.category_id === cat.id)
        .map((item) => itemsWithGroups.get(item.id)!),
    }));

    res.json({ categories: tree });
  }
);
