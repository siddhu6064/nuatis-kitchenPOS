"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MenuTreeResponse, MenuCategory, MenuItem } from "@nuatis/pos-shared";
import { Pencil, Trash2, Plus } from "lucide-react";
import { CategoryDialog } from "./CategoryDialog";
import { ItemDialog } from "./ItemDialog";
import { ModifierGroupsDrawer } from "./ModifierGroupsDrawer";
import { ApiError } from "@/lib/api-client";

// All client-side API calls go through the Next.js proxy at /api/v1/*
// which forwards server-to-server to POS_API_URL
const CLIENT_API = "/api/v1";

type CategoryWithItems = MenuTreeResponse["categories"][number];
type ItemWithGroups = CategoryWithItems["items"][number];

async function deleteResource(path: string, posJwt: string) {
  const res = await fetch(`${CLIENT_API}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${posJwt}` },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new ApiError(
      res.status,
      "delete_failed",
      body?.error?.message ?? `HTTP ${res.status}`
    );
  }
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface Props {
  initialTree: MenuTreeResponse;
  posJwt: string;
}

export function MenuManager({ initialTree, posJwt }: Props) {
  const qc = useQueryClient();
  const [tree, setTree] = useState<MenuTreeResponse>(initialTree);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    initialTree.categories[0]?.id ?? null
  );

  // Dialog / drawer state
  const [categoryDialog, setCategoryDialog] = useState<{
    open: boolean;
    mode: "create" | "edit";
    category?: MenuCategory;
  }>({ open: false, mode: "create" });

  const [itemDialog, setItemDialog] = useState<{
    open: boolean;
    mode: "create" | "edit";
    item?: ItemWithGroups;
  }>({ open: false, mode: "create" });

  const [modifierDrawerOpen, setModifierDrawerOpen] = useState(false);

  function refreshTree(newTree: MenuTreeResponse) {
    setTree(newTree);
    void qc.invalidateQueries({ queryKey: ["menu-tree"] });
  }

  // Delete category
  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) =>
      deleteResource(`/v1/menu/categories/${id}`, posJwt),
    onSuccess: (_, id) => {
      const updated = {
        categories: tree.categories.filter((c) => c.id !== id),
      };
      setTree(updated);
      if (selectedCategoryId === id) {
        setSelectedCategoryId(updated.categories[0]?.id ?? null);
      }
    },
  });

  // Delete item
  const deleteItemMutation = useMutation({
    mutationFn: (id: string) =>
      deleteResource(`/v1/menu/items/${id}`, posJwt),
    onSuccess: (_, id) => {
      const updated = {
        categories: tree.categories.map((c) => ({
          ...c,
          items: c.items.filter((i) => i.id !== id),
        })),
      };
      setTree(updated);
    },
  });

  const selectedCategory =
    tree.categories.find((c) => c.id === selectedCategoryId) ?? null;

  return (
    <div className="flex gap-6 h-[calc(100vh-10rem)]">
      {/* ── Categories column ── */}
      <aside className="w-64 shrink-0 flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Categories</span>
          <span className="text-xs text-slate-400">{tree.categories.length}</span>
        </div>

        <ul className="flex-1 overflow-y-auto py-1">
          {tree.categories.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-slate-400">
              No categories yet
            </li>
          ) : (
            tree.categories.map((cat) => (
              <li key={cat.id}>
                <button
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`w-full text-left flex items-center justify-between px-4 py-2.5 text-sm transition-colors group ${
                    selectedCategoryId === cat.id
                      ? "bg-brand/10 text-brand font-medium"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="truncate">
                    {cat.name}
                    <span className="ml-1.5 text-xs text-slate-400">
                      ({cat.items.length})
                    </span>
                  </span>
                  <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCategoryDialog({ open: true, mode: "edit", category: cat });
                      }}
                      className="p-1 rounded hover:text-brand"
                      aria-label="Edit category"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete category "${cat.name}"?`)) {
                          deleteCategoryMutation.mutate(cat.id);
                        }
                      }}
                      className="p-1 rounded hover:text-red-500"
                      aria-label="Delete category"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="p-3 border-t border-slate-100">
          <button
            onClick={() => setCategoryDialog({ open: true, mode: "create" })}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-brand hover:text-brand transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add category
          </button>
        </div>
      </aside>

      {/* ── Items area ── */}
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold text-slate-700">
              {selectedCategory ? selectedCategory.name : "Items"}
            </span>
            {selectedCategory && (
              <span className="ml-2 text-xs text-slate-400">
                {selectedCategory.items.length} items
              </span>
            )}
          </div>
          <button
            onClick={() => setModifierDrawerOpen(true)}
            className="text-xs text-slate-500 hover:text-brand underline underline-offset-2 transition-colors"
          >
            Manage modifier groups
          </button>
        </div>

        {!selectedCategory ? (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
            Select a category to view items
          </div>
        ) : selectedCategory.items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
            <p className="text-slate-400 text-sm">
              Your menu is empty. Click &quot;+ Add item&quot; to get started.
            </p>
            <button
              onClick={() => setItemDialog({ open: true, mode: "create" })}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add item
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {selectedCategory.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onEdit={() =>
                    setItemDialog({ open: true, mode: "edit", item })
                  }
                  onDelete={() => {
                    if (confirm(`Delete item "${item.name}"?`)) {
                      deleteItemMutation.mutate(item.id);
                    }
                  }}
                />
              ))}

              {/* Add item card */}
              <button
                onClick={() => setItemDialog({ open: true, mode: "create" })}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 p-4 text-sm text-slate-400 hover:border-brand hover:text-brand transition-colors min-h-[100px]"
              >
                <Plus className="h-5 w-5" />
                Add item
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Dialogs / Drawers ── */}
      <CategoryDialog
        open={categoryDialog.open}
        mode={categoryDialog.mode}
        category={categoryDialog.category}
        posJwt={posJwt}
        onClose={() =>
          setCategoryDialog((prev) => ({ ...prev, open: false }))
        }
        onSaved={(newTree) => {
          refreshTree(newTree);
          setCategoryDialog((prev) => ({ ...prev, open: false }));
        }}
      />

      <ItemDialog
        open={itemDialog.open}
        mode={itemDialog.mode}
        item={itemDialog.item}
        selectedCategoryId={selectedCategoryId}
        categories={tree.categories}
        allGroups={tree.categories.flatMap((c) =>
          c.items.flatMap((i) => i.modifier_groups)
        )}
        posJwt={posJwt}
        onClose={() => setItemDialog((prev) => ({ ...prev, open: false }))}
        onSaved={(newTree) => {
          refreshTree(newTree);
          setItemDialog((prev) => ({ ...prev, open: false }));
        }}
      />

      <ModifierGroupsDrawer
        open={modifierDrawerOpen}
        posJwt={posJwt}
        onClose={() => setModifierDrawerOpen(false)}
        onSaved={(newTree) => refreshTree(newTree)}
      />
    </div>
  );
}

function ItemCard({
  item,
  onEdit,
  onDelete,
}: {
  item: ItemWithGroups;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300 hover:shadow-sm transition">
      <div className="flex items-start justify-between gap-1">
        <span className="text-sm font-medium text-slate-800 leading-tight">
          {item.name}
        </span>
        <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={onEdit}
            className="p-1 rounded hover:text-brand text-slate-400 transition-colors"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded hover:text-red-500 text-slate-400 transition-colors"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </span>
      </div>

      <div className="flex items-center justify-between">
        <span className="font-tabular text-base font-semibold text-slate-900">
          {formatPrice(item.price_cents)}
        </span>
        {item.modifier_groups.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
            {item.modifier_groups.length} mod
            {item.modifier_groups.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {!item.taxable && (
        <span className="text-[10px] text-slate-400">No tax</span>
      )}
    </div>
  );
}
