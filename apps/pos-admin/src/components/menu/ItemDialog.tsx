"use client";

import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Checkbox from "@radix-ui/react-checkbox";
import { Check, X } from "lucide-react";
import type { MenuTreeResponse, ModifierGroup } from "@nuatis/pos-shared";
import { ApiError } from "@/lib/api-client";

const CLIENT_API = "/api/v1";

type CategoryWithItems = MenuTreeResponse["categories"][number];
type ItemWithGroups = CategoryWithItems["items"][number];

interface Props {
  open: boolean;
  mode: "create" | "edit";
  item?: ItemWithGroups;
  selectedCategoryId: string | null;
  categories: CategoryWithItems[];
  allGroups: ModifierGroup[];
  posJwt: string;
  onClose: () => void;
  onSaved: (tree: MenuTreeResponse) => void;
}

async function fetchTree(posJwt: string): Promise<MenuTreeResponse> {
  const res = await fetch(`${CLIENT_API}/menu/tree`, {
    headers: { Authorization: `Bearer ${posJwt}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<MenuTreeResponse>;
}

// Deduplicate modifier groups by id (they appear per-item in the tree)
function dedupeGroups(groups: ModifierGroup[]): ModifierGroup[] {
  const seen = new Set<string>();
  return groups.filter((g) => {
    if (seen.has(g.id)) return false;
    seen.add(g.id);
    return true;
  });
}

export function ItemDialog({
  open,
  mode,
  item,
  selectedCategoryId,
  categories,
  allGroups,
  posJwt,
  onClose,
  onSaved,
}: Props) {
  const [fields, setFields] = useState({
    name: "",
    priceDollars: "",
    category_id: selectedCategoryId ?? "",
    taxable: true,
    kitchen_station: "",
    image_url: "",
  });
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const uniqueGroups = dedupeGroups(allGroups);

  useEffect(() => {
    if (open) {
      setError(null);
      if (mode === "edit" && item) {
        setFields({
          name: item.name,
          priceDollars: (item.price_cents / 100).toFixed(2),
          category_id: item.category_id,
          taxable: item.taxable,
          kitchen_station: item.kitchen_station ?? "",
          image_url: item.image_url ?? "",
        });
        setSelectedGroupIds(item.modifier_groups.map((g) => g.id));
      } else {
        setFields({
          name: "",
          priceDollars: "",
          category_id: selectedCategoryId ?? categories[0]?.id ?? "",
          taxable: true,
          kitchen_station: "",
          image_url: "",
        });
        setSelectedGroupIds([]);
      }
    }
  }, [open, mode, item, selectedCategoryId, categories]);

  function set<K extends keyof typeof fields>(k: K, v: (typeof fields)[K]) {
    setFields((prev) => ({ ...prev, [k]: v }));
  }

  function toggleGroup(id: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    setError(null);

    const priceCents = Math.round(parseFloat(fields.priceDollars) * 100);
    if (isNaN(priceCents) || priceCents < 0) {
      setError("Enter a valid price");
      return;
    }
    if (!fields.name.trim()) {
      setError("Name is required");
      return;
    }
    if (!fields.category_id) {
      setError("Select a category");
      return;
    }

    setLoading(true);
    try {
      const isEdit = mode === "edit" && item;
      const url = isEdit
        ? `${CLIENT_API}/menu/items/${item.id}`
        : `${CLIENT_API}/menu/items`;

      const body: Record<string, unknown> = {
        name: fields.name.trim(),
        price_cents: priceCents,
        category_id: fields.category_id,
        taxable: fields.taxable,
        ...(fields.kitchen_station
          ? { kitchen_station: fields.kitchen_station }
          : {}),
        ...(fields.image_url ? { image_url: fields.image_url } : {}),
      };

      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${posJwt}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new ApiError(
          res.status,
          "save_failed",
          b?.error?.message ?? `HTTP ${res.status}`
        );
      }

      const savedItem = (await res.json()) as { id: string };

      // Sync modifier group assignments if any changed
      if (isEdit) {
        // Detach removed groups
        const removedGroups = item.modifier_groups.filter(
          (g) => !selectedGroupIds.includes(g.id)
        );
        for (const g of removedGroups) {
          await fetch(
            `${CLIENT_API}/menu/items/${item.id}/modifier-groups/${g.id}`,
            {
              method: "DELETE",
              headers: { Authorization: `Bearer ${posJwt}` },
            }
          );
        }
        // Attach new groups
        const addedGroups = selectedGroupIds.filter(
          (id) => !item.modifier_groups.some((g) => g.id === id)
        );
        for (const groupId of addedGroups) {
          await fetch(
            `${CLIENT_API}/menu/items/${item.id}/modifier-groups`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${posJwt}`,
              },
              body: JSON.stringify({ group_id: groupId }),
            }
          );
        }
      } else {
        // Attach all selected groups to new item
        for (const groupId of selectedGroupIds) {
          await fetch(
            `${CLIENT_API}/menu/items/${savedItem.id}/modifier-groups`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${posJwt}`,
              },
              body: JSON.stringify({ group_id: groupId }),
            }
          );
        }
      }

      const tree = await fetchTree(posJwt);
      onSaved(tree);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save item");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="font-serif text-xl font-semibold text-slate-900">
              {mode === "create" ? "New item" : "Edit item"}
            </Dialog.Title>
            <Dialog.Close className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Name
              </label>
              <input
                type="text"
                value={fields.name}
                onChange={(e) => set("name", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                placeholder="e.g. Flat White"
                autoFocus
              />
            </div>

            {/* Price */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Price (USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                  $
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={fields.priceDollars}
                  onChange={(e) => set("priceDollars", e.target.value)}
                  className="w-full rounded-lg border border-slate-300 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  placeholder="4.50"
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Category
              </label>
              <select
                value={fields.category_id}
                onChange={(e) => set("category_id", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-white"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Taxable */}
            <label className="flex items-center gap-2.5 cursor-pointer">
              <Checkbox.Root
                checked={fields.taxable}
                onCheckedChange={(v) => set("taxable", v === true)}
                className="h-4 w-4 rounded border border-slate-300 bg-white data-[state=checked]:bg-brand data-[state=checked]:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                <Checkbox.Indicator>
                  <Check className="h-3 w-3 text-white" />
                </Checkbox.Indicator>
              </Checkbox.Root>
              <span className="text-sm text-slate-700">Taxable</span>
            </label>

            {/* Kitchen station */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Kitchen station{" "}
                <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={fields.kitchen_station}
                onChange={(e) => set("kitchen_station", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                placeholder="e.g. bar"
              />
            </div>

            {/* Image URL */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Image URL{" "}
                <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="url"
                value={fields.image_url}
                onChange={(e) => set("image_url", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                placeholder="https://..."
              />
            </div>

            {/* Modifier groups */}
            {uniqueGroups.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Modifier groups
                </label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {uniqueGroups.map((g) => (
                    <label
                      key={g.id}
                      className="flex items-center gap-2.5 cursor-pointer py-1 px-1 rounded hover:bg-slate-50"
                    >
                      <Checkbox.Root
                        checked={selectedGroupIds.includes(g.id)}
                        onCheckedChange={() => toggleGroup(g.id)}
                        className="h-4 w-4 shrink-0 rounded border border-slate-300 bg-white data-[state=checked]:bg-brand data-[state=checked]:border-brand focus:outline-none"
                      >
                        <Checkbox.Indicator>
                          <Check className="h-3 w-3 text-white" />
                        </Checkbox.Indicator>
                      </Checkbox.Root>
                      <span className="text-sm text-slate-700">{g.name}</span>
                      {g.required && (
                        <span className="ml-auto text-[10px] text-slate-400">
                          required
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60 transition-colors"
            >
              {loading ? "Saving…" : "Save item"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
