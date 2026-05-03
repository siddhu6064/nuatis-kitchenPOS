import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { ReportsView } from "@/components/reports/ReportsView";
import {
  getEndOfDay,
  getDailyHistory,
  emptyReport,
  type EndOfDayReport,
  type DailyHistoryEntry,
} from "@/lib/api/reports";
import { listLocations } from "@/lib/api/orders";

interface ReportsPageProps {
  searchParams: { date?: string };
}

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA").format(new Date());
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const session = await auth();
  const posJwt = session?.user?.posJwt ?? "";
  const today = todayIso();
  const date = searchParams.date ?? today;

  let report: EndOfDayReport = emptyReport(date);
  let history: DailyHistoryEntry[] = [];

  try {
    const locations = await listLocations(posJwt);
    const locationId = locations[0]?.id;

    const [reportResult, historyResult] = await Promise.all([
      getEndOfDay(posJwt, date, locationId),
      getDailyHistory(posJwt, 30, locationId),
    ]);

    if (reportResult) report = reportResult;
    history = historyResult;
  } catch {
    // No Supabase in dev — render with empty/zero data
  }

  return (
    <DashboardShell>
      <ReportsView
        report={report}
        history={history}
        initialDate={date}
        today={today}
      />
    </DashboardShell>
  );
}
