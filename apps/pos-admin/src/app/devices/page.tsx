import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { DevicesList } from "@/components/devices/DevicesList";
import { listDevices, type TerminalReader } from "@/lib/api/devices";
import { listLocations, type Location } from "@/lib/api/orders";

const SERVER_API = process.env["POS_API_URL"] ?? "http://localhost:3002";

async function fetchDevicesServer(posJwt: string): Promise<TerminalReader[]> {
  try {
    const res = await fetch(`${SERVER_API}/v1/terminals`, {
      headers: { Authorization: `Bearer ${posJwt}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json() as Promise<TerminalReader[]>;
  } catch {
    return [];
  }
}

void listDevices; // suppress unused import

export default async function DevicesPage() {
  const session = await auth();
  const posJwt = session?.user?.posJwt ?? "";

  let initialDevices: TerminalReader[] = [];
  let locations: Location[] = [];

  try {
    [initialDevices, locations] = await Promise.all([
      fetchDevicesServer(posJwt),
      listLocations(posJwt),
    ]);
  } catch {
    // render with empty lists — client component will retry on mount
  }

  return (
    <DashboardShell>
      <div className="max-w-5xl mx-auto">
        <DevicesList
          initialDevices={initialDevices}
          posJwt={posJwt}
          locations={locations}
        />
      </div>
    </DashboardShell>
  );
}
