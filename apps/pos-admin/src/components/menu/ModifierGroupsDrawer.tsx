"use client";

import { useState, useEffect, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Checkbox from "@radix-ui/react-checkbox";
import { Check, X, Plus, Trash2, Pencil, ChevronDown } from "lucide-react";
import type {
  MenuTreeResponse,
  ModifierGroup,
  ModifierOption,
} from "@nuatis/pos-shared";
import { ApiError } from "@/lib/api-client";

const CLIENT_API = "/api/v1";

type GroupWithOptions = ModifierGroup & { options: ModifierOption[] };

interface Props {
  open: boolean;
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

async function fetchGroups(posJwt: string): Promise<GroupWithOptions[]> {
  const res = await fetch(`${CLIENT_API}/menu/modifier-groups`, {
    headers: { Authorization: `Bearer ${posJwt}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { groups?: GroupWithOptions[] };
  return data.groups ?? [];
}

function priceDeltaLabel(cents: number): string {
  if (cents === 0) return "free";
  const sign = cents > 0 ? "+" : "";
  return `${sign}$${(cents / 100).toFixed(2)}`;
}

export function ModifierGroupsDrawer({
  open,
  posJwt,
  onClose,
  onSaved,
}: Props) {
  const [groups, setGroups] = useState<GroupWithOptions[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New group form
  const [newGroupFields, setNewGroupFields] = useState({
    name: "",
    min_select: 0,
    max_select: 1,
    required: false,
  });
  const [showNewGroup, setShowNewGroup] = useState(false);

  // New option form (per group)
  const [newOptionFields, setNewOptionFields] = useState<
    Record<string, { name: string; price_delta_dollars: string }>
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const gs = await fetchGroups(posJwt);
      setGroups(gs);
    } catch {
      setError("Failed to load modifier groups");
    } finally {
      setLoading(false);
    }
  }, [posJwt]);

  useEffect(() => {
    if (open) {
      void load();
    }
  }, [open, load]);

  async function createGroup() {
    if (!newGroupFields.name.trim()) {
      setError("Group name is required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${CLIENT_API}/menu/modifier-groups`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${posJwt}`,
        },
        body: JSON.stringify(newGroupFields),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new ApiError(
          res.status,
          "create_failed",
          b?.error?.message ?? `HTTP ${res.status}`
        );
      }
      setNewGroupFields({ name: "", min_select: 0, max_select: 1, required: false });
      setShowNewGroup(false);
      await load();
      const tree = await fetchTree(posJwt);
      onSaved(tree);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create group"
      );
    } finally {
      setLoading(false);
    }
  }

  async function deleteGroup(id: string) {
    if (!confirm("Delete this modifier group?")) return;
    setLoading(true);
    try {
      await fetch(`${CLIENT_API}/menu/modifier-groups/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${posJwt}` },
      });
      await load();
      const tree = await fetchTree(posJwt);
      onSaved(tree);
    } catch {
      setError("Failed to delete group");
    } finally {
      setLoading(false);
    }
  }

  async function addOption(groupId: string) {
    const f = newOptionFields[groupId];
    if (!f?.name?.trim()) {
      setError("Option name is required");
      return;
    }
    const delta = Math.round(parseFloat(f.price_delta_dollars ?? "0") * 100);
    if (isNaN(delta)) {
      setError("Enter a valid price delta");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${CLIENT_API}/menu/modifier-options`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${posJwt}`,
        },
        body: JSON.stringify({
          group_id: groupId,
          name: f.name.trim(),
          price_delta_cents: delta,
        }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new ApiError(
          res.status,
          "add_option_failed",
          b?.error?.message ?? `HTTP ${res.status}`
        );
      }
      setNewOptionFields((prev) => ({
        ...prev,
        [groupId]: { name: "", price_delta_dollars: "" },
      }));
      await load();
      const tree = await fetchTree(posJwt);
      onSaved(tree);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add option"
      );
    } finally {
      setLoading(false);
    }
  }

  async function deleteOption(groupId: string, optionId: string) {
    setLoading(true);
    try {
      await fetch(
        `${CLIENT_API}/menu/modifier-options/${optionId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${posJwt}` },
        }
      );
      await load();
      const tree = await fetchTree(posJwt);
      onSaved(tree);
    } catch {
      setError("Failed to delete option");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/20" />
        <Dialog.Content className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col focus:outline-none">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <Dialog.Title className="font-serif text-xl font-semibold text-slate-900">
              Modifier Groups
            </Dialog.Title>
            <Dialog.Close className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                {error}
                <button
                  onClick={() => setError(null)}
                  className="ml-2 underline text-xs"
                >
                  dismiss
                </button>
              </div>
            )}

            {loading && groups.length === 0 && (
              <p className="text-sm text-slate-400">Loading…</p>
            )}

            {!loading && groups.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">
                No modifier groups yet. Create one below.
              </p>
            )}

            {groups.map((g) => (
              <div
                key={g.id}
                className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden"
              >
                {/* Group header */}
                <div className="flex items-center gap-2 px-4 py-3">
                  <button
                    onClick={() =>
                      setExpandedId(expandedId === g.id ? null : g.id)
                    }
                    className="flex-1 flex items-center gap-2 text-left"
                  >
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                        expandedId === g.id ? "rotate-180" : ""
                      }`}
                    />
                    <span className="text-sm font-semibold text-slate-800">
                      {g.name}
                    </span>
                    <span className="text-xs text-slate-400">
                      {g.options.length} option
                      {g.options.length !== 1 ? "s" : ""}
                    </span>
                    {g.required && (
                      <span className="ml-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        required
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => deleteGroup(g.id)}
                    className="p-1 rounded text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {expandedId === g.id && (
                  <div className="px-4 pb-4 space-y-2">
                    {/* Group meta */}
                    <div className="flex gap-4 text-xs text-slate-500">
                      <span>Min: {g.min_select}</span>
                      <span>Max: {g.max_select}</span>
                    </div>

                    {/* Options list */}
                    {g.options.map((opt) => (
                      <div
                        key={opt.id}
                        className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-200"
                      >
                        <span className="text-sm text-slate-700">{opt.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-tabular text-xs text-slate-500">
                            {priceDeltaLabel(opt.price_delta_cents)}
                          </span>
                          <button
                            onClick={() => deleteOption(g.id, opt.id)}
                            className="p-0.5 rounded text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Add option inline */}
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="text"
                        placeholder="Option name"
                        value={newOptionFields[g.id]?.name ?? ""}
                        onChange={(e) =>
                          setNewOptionFields((prev) => ({
                            ...prev,
                            [g.id]: {
                              ...prev[g.id],
                              name: e.target.value,
                            },
                          }))
                        }
                        className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                      />
                      <div className="relative w-20">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                          $
                        </span>
                        <input
                          type="number"
                          step={0.01}
                          placeholder="0.00"
                          value={newOptionFields[g.id]?.price_delta_dollars ?? ""}
                          onChange={(e) =>
                            setNewOptionFields((prev) => ({
                              ...prev,
                              [g.id]: {
                                ...prev[g.id],
                                price_delta_dollars: e.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-lg border border-slate-300 pl-5 pr-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                        />
                      </div>
                      <button
                        onClick={() => addOption(g.id)}
                        disabled={loading}
                        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Create new group */}
            {showNewGroup ? (
              <div className="rounded-xl border border-brand/30 bg-brand/5 p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-800">
                  New modifier group
                </p>
                <input
                  type="text"
                  placeholder="e.g. Milk options"
                  value={newGroupFields.name}
                  onChange={(e) =>
                    setNewGroupFields((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  autoFocus
                />
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 mb-1 block">
                      Min
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={newGroupFields.min_select}
                      onChange={(e) =>
                        setNewGroupFields((prev) => ({
                          ...prev,
                          min_select: parseInt(e.target.value, 10) || 0,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 mb-1 block">
                      Max
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={newGroupFields.max_select}
                      onChange={(e) =>
                        setNewGroupFields((prev) => ({
                          ...prev,
                          max_select: parseInt(e.target.value, 10) || 1,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox.Root
                    checked={newGroupFields.required}
                    onCheckedChange={(v) =>
                      setNewGroupFields((prev) => ({
                        ...prev,
                        required: v === true,
                      }))
                    }
                    className="h-4 w-4 rounded border border-slate-300 bg-white data-[state=checked]:bg-brand data-[state=checked]:border-brand focus:outline-none"
                  >
                    <Checkbox.Indicator>
                      <Check className="h-3 w-3 text-white" />
                    </Checkbox.Indicator>
                  </Checkbox.Root>
                  <span className="text-sm text-slate-700">Required</span>
                </label>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setShowNewGroup(false)}
                    className="flex-1 rounded-lg px-3 py-2 text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createGroup}
                    disabled={loading}
                    className="flex-1 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60 transition-colors"
                  >
                    {loading ? "Creating…" : "Create group"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowNewGroup(true)}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 hover:border-brand hover:text-brand transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add modifier group
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
