import { useRouter } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { useAuth } from "../auth";

export function SignInButton({
  children,
  signedInChildren,
  className = "btn-primary",
}: {
  children: ReactNode;
  signedInChildren?: ReactNode;
  className?: string;
}) {
  const { signIn, user } = useAuth();
  const router = useRouter();

  const handleClick = () => {
    if (user) {
      void router.navigate({ to: "/app" });
      return;
    }
    signIn();
  };

  return (
    <button onClick={handleClick} className={className}>
      {user && signedInChildren ? signedInChildren : children}
    </button>
  );
}
