import { DashboardShell } from "@/components/dashboard-shell";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <DashboardShell>
      <div className="max-w-5xl mx-auto">
        <h1 className="font-serif text-3xl font-bold text-slate-900 mb-2">Settings</h1>
        <ComingSoon
          icon={<Settings className="h-12 w-12 text-slate-300" />}
          title="Settings coming soon"
          description="This screen will let you manage business details, location settings, tax rates, receipt configuration, and integrations."
        />
      </div>
    </DashboardShell>
  );
}

function ComingSoon({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="mt-12 flex flex-col items-center justify-center text-center gap-4 py-16 rounded-2xl border-2 border-dashed border-slate-200">
      {icon}
      <h2 className="font-serif text-xl font-semibold text-slate-700">{title}</h2>
      <p className="max-w-sm text-sm text-slate-400 leading-relaxed">{description}</p>
      <span className="mt-2 inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-700">
        Coming soon
      </span>
    </div>
  );
}
