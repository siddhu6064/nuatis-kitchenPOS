import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { CashSessionView } from "@/components/cash/CashSessionView";
import { listLocations } from "@/lib/api/orders";
import { getCurrentSession } from "@/lib/api/cash";
import { Banknote } from "lucide-react";

export default async function CashPage() {
  const session = await auth();
  const posJwt = session?.user?.posJwt ?? "";

  let locationId: string | undefined;
  let cashSession = null;
  let fetchError: string | null = null;

  try {
    const locations = await listLocations(posJwt);
    locationId = locations[0]?.id;
    if (locationId) {
      cashSession = await getCurrentSession(posJwt, locationId);
    }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Failed to load";
  }

  return (
    <DashboardShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="font-serif text-3xl font-bold text-slate-900">
            Cash Drawer
          </h1>
          <p className="mt-1 text-slate-500 text-sm">
            Current shift balance and event timeline.
          </p>
        </div>

        {fetchError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-600">
            {fetchError}
          </div>
        )}

        {!fetchError && !cashSession && (
          <NoCashSession />
        )}

        {!fetchError && cashSession && (
          <CashSessionView
            initialSession={cashSession}
            posJwt={posJwt}
          />
        )}
      </div>
    </DashboardShell>
  );
}

function NoCashSession() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 rounded-2xl border-2 border-dashed border-slate-200 text-center">
      <Banknote className="h-12 w-12 text-slate-300" />
      <h2 className="font-serif text-xl font-semibold text-slate-700">
        No active shift
      </h2>
      <p className="max-w-sm text-sm text-slate-400 leading-relaxed">
        There is no open cash drawer shift for this location. Start a shift
        from the cashier terminal to begin recording cash events.
      </p>
    </div>
  );
}
