import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { MenuManager } from "@/components/menu/MenuManager";
import { apiGet } from "@/lib/api-client";
import type { MenuTreeResponse } from "@nuatis/pos-shared";

export default async function MenuPage() {
  const session = await auth();

  let initialTree: MenuTreeResponse | null = null;
  let fetchError: string | null = null;

  try {
    initialTree = await apiGet<MenuTreeResponse>("/v1/menu/tree", session);
  } catch (err: unknown) {
    fetchError =
      err instanceof Error ? err.message : "Failed to load menu data";
  }

  return (
    <DashboardShell>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-serif text-3xl font-bold text-slate-900">
              Menu
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage your categories, items, and modifier groups
            </p>
          </div>
        </div>

        {fetchError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
            Could not load menu data: {fetchError}
          </div>
        ) : (
          <MenuManager
            initialTree={initialTree ?? { categories: [] }}
            posJwt={session?.user?.posJwt ?? ""}
          />
        )}
      </div>
    </DashboardShell>
  );
}
