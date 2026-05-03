import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { getSettingsServer } from "@/lib/api/settings";
import { getStripeStatusServer } from "@/lib/api/stripe";
import type { SettingsData } from "@/lib/api/settings";
import type { StripeStatus } from "@/lib/api/stripe";

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
  let stripeStatus: StripeStatus | null = null;

  await Promise.all([
    getSettingsServer(posJwt)
      .then((result) => { if (result) data = result; })
      .catch(() => undefined),
    getStripeStatusServer(posJwt)
      .then((result) => { stripeStatus = result; })
      .catch(() => undefined),
  ]);

  return (
    <DashboardShell>
      <SettingsPage
        data={data}
        posJwt={posJwt}
        userRole={userRole}
        stripeStatus={stripeStatus}
      />
    </DashboardShell>
  );
}
