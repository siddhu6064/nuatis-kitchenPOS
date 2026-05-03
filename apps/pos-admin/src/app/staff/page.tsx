import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { StaffList } from "@/components/staff/StaffList";
import { getStaff as getStaffServer } from "@/lib/api/staff";
import { listLocations } from "@/lib/api/orders";
import type { StaffMember } from "@/lib/api/staff";
import type { Location } from "@/lib/api/orders";

const SERVER_API = process.env["POS_API_URL"] ?? "http://localhost:3002";

async function getStaffServer2(posJwt: string): Promise<StaffMember[]> {
  try {
    const res = await fetch(`${SERVER_API}/v1/staff`, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${posJwt}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json() as Promise<StaffMember[]>;
  } catch {
    return [];
  }
}

void getStaffServer; // imported for type

export default async function StaffPage() {
  const session = await auth();
  const posJwt = session?.user?.posJwt ?? "";
  const userRole = (session?.user?.role ?? "manager") as "owner" | "manager";
  const userId = session?.user?.id ?? "";

  let initialStaff: StaffMember[] = [];
  let locations: Location[] = [];

  try {
    [initialStaff, locations] = await Promise.all([
      getStaffServer2(posJwt),
      listLocations(posJwt),
    ]);
  } catch {
    // render with empty
  }

  return (
    <DashboardShell>
      <div className="max-w-5xl mx-auto">
        <StaffList
          initialStaff={initialStaff}
          posJwt={posJwt}
          locations={locations}
          userRole={userRole}
          userId={userId}
        />
      </div>
    </DashboardShell>
  );
}
