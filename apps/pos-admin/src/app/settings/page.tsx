import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { getSettingsServer } from "@/lib/api/settings";
import type { SettingsData } from "@/lib/api/settings";

const EMPTY_SETTINGS: SettingsData = {
  tenant: {
    id: "",
    name: "—",
    vertical: "cafe",
    timezone: "America/Chicago",
    email_daily_report: false,
    daily_report_recipient_email: null,
  },
  locations: [],
};

export default async function SettingsPageRoute() {
  const session = await auth();
  const posJwt = session?.user?.posJwt ?? "";
  const userRole = (session?.user?.role ?? "manager") as "owner" | "manager";

  let data: SettingsData = EMPTY_SETTINGS;

  try {
    const result = await getSettingsServer(posJwt);
    if (result) data = result;
  } catch {
    // render with empty
  }

  return (
    <DashboardShell>
      <SettingsPage data={data} posJwt={posJwt} userRole={userRole} />
    </DashboardShell>
  );
}
