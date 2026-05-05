import { createFileRoute, redirect } from "@tanstack/react-router";
import { getAuth } from "@workos/authkit-tanstack-react-start";
import { AppShell } from "../../components/AppShell";

export const Route = createFileRoute("/app")({
  beforeLoad: async ({ location }) => {
    const { user } = await getAuth();
    if (!user) {
      const returnPathname = encodeURIComponent(location.pathname);
      throw redirect({
        href: `/api/auth/sign-in?returnPathname=${returnPathname}`,
      });
    }
    return { user };
  },
  component: AppShell,
});
