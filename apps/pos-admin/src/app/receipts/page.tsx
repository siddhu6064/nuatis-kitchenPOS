import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { ReceiptsHistory } from "@/components/receipts/ReceiptsHistory";
import { getReceiptsHistoryServer } from "@/lib/api/receipts-history";
import type { ReceiptHistoryEntry } from "@/lib/api/receipts-history";

const PAGE_SIZE = 50;

interface ReceiptsPageProps {
  searchParams: {
    page?: string;
    channel?: string;
    status?: string;
  };
}

export default async function ReceiptsPage({ searchParams }: ReceiptsPageProps) {
  const session = await auth();
  const posJwt = session?.user?.posJwt ?? "";

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const channel = (searchParams.channel ?? "") as "email" | "sms" | "";
  const status = (searchParams.status ?? "") as "queued" | "sent" | "failed" | "bounced" | "";

  let initialEntries: ReceiptHistoryEntry[] = [];
  let initialTotal = 0;

  try {
    const result = await getReceiptsHistoryServer(posJwt, {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      channel: channel || undefined,
      status: status || undefined,
    });
    if (result) {
      initialEntries = result.entries;
      initialTotal = result.total_count;
    }
  } catch {
    // render with empty
  }

  return (
    <DashboardShell>
      <div className="max-w-5xl mx-auto">
        <ReceiptsHistory
          initialEntries={initialEntries}
          initialTotal={initialTotal}
          posJwt={posJwt}
          page={page}
          channel={channel}
          status={status}
        />
      </div>
    </DashboardShell>
  );
}
