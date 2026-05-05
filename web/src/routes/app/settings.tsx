import { createFileRoute } from "@tanstack/react-router";
import { AccountWidgets } from "../../components/AccountWidgets";

export const Route = createFileRoute("/app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-ink-300">
          Manage your profile, password, and active sessions.
        </p>
      </div>
      <AccountWidgets />
    </div>
  );
}
