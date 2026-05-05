import { WorkOsWidgets, UserProfile, UserSecurity } from "@workos-inc/widgets";
import { ShieldCheck, UserCircle2 } from "lucide-react";
import { Component, type ReactNode } from "react";
import { useAuth } from "../auth";

export function AccountWidgets() {
  const { user, getAccessToken, isLoading, signOut } = useAuth();

  if (!getAccessToken || isLoading || !user) {
    return (
      <div className="grid gap-4">
        <PlaceholderCard
          icon={UserCircle2}
          title="Profile"
          body="Sign in to manage your profile."
        />
        <PlaceholderCard
          icon={ShieldCheck}
          title="Security"
          body="Sign in to manage your password, MFA, and active sessions."
        />
      </div>
    );
  }

  return (
    <WorkOsWidgets
      theme={{
        appearance: "dark",
        accentColor: "cyan",
        radius: "large",
        hasBackground: false,
      }}
    >
      <div className="grid gap-4">
        <div className="card overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-white/8 px-5 py-3">
            <UserCircle2 className="h-4 w-4 text-beam-300" />
            <h3 className="text-sm font-semibold tracking-tight">Profile</h3>
          </div>
          <div className="p-1">
            <WidgetBoundary
              fallback={
                <FallbackBody
                  title="Profile unavailable right now"
                  body="We couldn't load your profile editor. Try again in a moment, or sign out and back in."
                  onSignOut={signOut}
                />
              }
            >
              <UserProfile authToken={getAccessToken} />
            </WidgetBoundary>
          </div>
        </div>
        <div className="card overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-white/8 px-5 py-3">
            <ShieldCheck className="h-4 w-4 text-amethyst-400" />
            <h3 className="text-sm font-semibold tracking-tight">Security</h3>
          </div>
          <div className="p-1">
            <WidgetBoundary
              fallback={
                <FallbackBody
                  title="Security panel unavailable right now"
                  body="We couldn't load password and session controls. Try again in a moment, or sign out and back in."
                  onSignOut={signOut}
                />
              }
            >
              <UserSecurity authToken={getAccessToken} />
            </WidgetBoundary>
          </div>
        </div>
      </div>
    </WorkOsWidgets>
  );
}

function PlaceholderCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof UserCircle2;
  title: string;
  body: string;
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-ink-300" />
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      </div>
      <p className="mt-3 text-sm text-ink-300">{body}</p>
    </div>
  );
}

function FallbackBody({
  title,
  body,
  onSignOut,
}: {
  title: string;
  body: string;
  onSignOut: () => Promise<void>;
}) {
  return (
    <div className="px-5 py-6">
      <p className="text-sm font-medium text-ink-50">{title}</p>
      <p className="mt-2 text-sm text-ink-300">{body}</p>
      <button
        type="button"
        onClick={() => void onSignOut()}
        className="btn-secondary mt-4"
      >
        Sign out
      </button>
    </div>
  );
}

class WidgetBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // swallow — fallback handles user-facing presentation
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
