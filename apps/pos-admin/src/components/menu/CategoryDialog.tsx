"use client";

import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { MenuCategory, MenuTreeResponse } from "@nuatis/pos-shared";
import { CreateMenuCategoryRequestSchema } from "@nuatis/pos-shared";
import { ApiError } from "@/lib/api-client";

const CLIENT_API = "/api/v1";

interface Props {
  open: boolean;
  mode: "create" | "edit";
  category?: MenuCategory;
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

export function CategoryDialog({
  open,
  mode,
  category,
  posJwt,
  onClose,
  onSaved,
}: Props) {
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setName(category?.name ?? "");
      setSortOrder(category?.sort_order ?? 0);
      setError(null);
    }
  }, [open, category]);

  async function handleSave() {
    setError(null);
    const validation = CreateMenuCategoryRequestSchema.safeParse({
      name,
      sort_order: sortOrder,
    });
    if (!validation.success) {
      setError(validation.error.errors[0]?.message ?? "Invalid input");
      return;
    }

    setLoading(true);
    try {
      const isEdit = mode === "edit" && category;
      const url = isEdit
        ? `${CLIENT_API}/menu/categories/${category.id}`
        : `${CLIENT_API}/menu/categories`;

      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${posJwt}`,
        },
        body: JSON.stringify(validation.data),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new ApiError(
          res.status,
          "save_failed",
          body?.error?.message ?? `HTTP ${res.status}`
        );
      }

      const tree = await fetchTree(posJwt);
      onSaved(tree);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save category");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="font-serif text-xl font-semibold text-slate-900">
              {mode === "create" ? "New category" : "Edit category"}
            </Dialog.Title>
            <Dialog.Close className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                placeholder="e.g. Hot Drinks"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Sort order
              </label>
              <input
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
              />
            </div>

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
              {loading ? "Saving…" : "Save category"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
