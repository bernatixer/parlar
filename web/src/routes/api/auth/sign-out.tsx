import { createFileRoute } from "@tanstack/react-router";
import { signOut } from "@workos/authkit-tanstack-react-start";

export const Route = createFileRoute("/api/auth/sign-out")({
  server: {
    handlers: {
      GET: async () => {
        await signOut();
        // signOut() throws a redirect; this is unreachable.
        return new Response(null, { status: 307, headers: { Location: "/" } });
      },
    },
  },
});
