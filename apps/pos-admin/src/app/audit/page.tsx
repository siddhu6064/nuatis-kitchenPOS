import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { AuditLogView } from "@/components/audit/AuditLogView";
import { getAuditLogServer, type AuditLogResponse } from "@/lib/api/audit-log";

const SERVER_API = process.env["POS_API_URL"] ?? "http://localhost:3002";

async function fetchStaff(
  posJwt: string
): Promise<Array<{ id: string; full_name: string; role: string }>> {
  try {
    const res = await fetch(`${SERVER_API}/v1/staff`, {
      headers: { Authorization: `Bearer ${posJwt}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json() as Promise<Array<{ id: string; full_name: string; role: string }>>;
  } catch {
    return [];
  }
}

interface AuditPageProps {
  searchParams: {
    action_type?: string;
    staff_id?: string;
    from?: string;
    to?: string;
    cursor?: string;
  };
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const session = await auth();
  const posJwt = session?.user?.posJwt ?? "";
  const userRole = (session?.user?.role ?? "manager") as "owner" | "manager";

  const params = {
    action_type: searchParams.action_type,
    staff_id: searchParams.staff_id,
    from: searchParams.from,
    to: searchParams.to,
    cursor: searchParams.cursor,
    limit: 50,
  };

  let auditData: AuditLogResponse = { entries: [], next_cursor: null, distinct_action_types: [] };
  let staffList: Array<{ id: string; full_name: string; role: string }> = [];

  try {
    [auditData, staffList] = await Promise.all([
      getAuditLogServer(posJwt, params),
      fetchStaff(posJwt),
    ]);
  } catch {
    // Render with empty data — no Supabase in dev
  }

  return (
    <DashboardShell>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>
          <p className="text-sm text-slate-500 mt-1">
            Staff actions and security events for your account
          </p>
        </div>

        <AuditLogView
          entries={auditData.entries}
          nextCursor={auditData.next_cursor}
          userRole={userRole}
          initialFilters={{
            action_type: searchParams.action_type ?? "",
            staff_id: searchParams.staff_id ?? "",
            from: searchParams.from ?? "",
            to: searchParams.to ?? "",
          }}
          staffList={staffList}
          distinctActionTypes={auditData.distinct_action_types}
          currentCursor={searchParams.cursor}
        />
      </div>
    </DashboardShell>
  );
}
