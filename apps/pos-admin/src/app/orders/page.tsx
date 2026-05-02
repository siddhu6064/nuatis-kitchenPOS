import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { OrdersList } from "@/components/orders/OrdersList";
import { listOrders, listLocations } from "@/lib/api/orders";
import { apiGet } from "@/lib/api-client";
import type { Order } from "@nuatis/pos-shared";

export default async function OrdersPage() {
  const session = await auth();
  const posJwt = session?.user?.posJwt ?? "";

  let initialOrders: Order[] = [];
  let locationId: string | undefined;

  try {
    const locations = await listLocations(posJwt);
    locationId = locations[0]?.id;
    if (locationId) {
      initialOrders = await listOrders(posJwt, {
        location_id: locationId,
        limit: 100,
      });
    } else {
      initialOrders = await listOrders(posJwt, { limit: 100 });
    }
  } catch {
    // Render with empty list — client will retry
  }

  void apiGet; // suppress unused import lint

  return (
    <DashboardShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="font-serif text-3xl font-bold text-slate-900">
            Orders
          </h1>
          <p className="mt-1 text-slate-500 text-sm">
            Active orders auto-refresh every 10 seconds.
          </p>
        </div>

        <OrdersList
          initialOrders={initialOrders}
          posJwt={posJwt}
          locationId={locationId}
        />
      </div>
    </DashboardShell>
  );
}
