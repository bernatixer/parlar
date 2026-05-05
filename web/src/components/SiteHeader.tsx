import { Link, useRouter } from "@tanstack/react-router";
import { Logo } from "./Logo";
import { useAuth } from "../auth";

export function SiteHeader() {
  const { user, signIn, signOut } = useAuth();
  const router = useRouter();

  const handleSignIn = () => {
    signIn();
  };

  const handleSignOut = async () => {
    await signOut();
    void router.navigate({ to: "/" });
  };

  return (
    <header className="relative z-20">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          <a
            href="https://github.com/claymav/parlar"
            className="rounded-full px-3 py-1.5 text-sm text-ink-200 hover:text-ink-50"
          >
            GitHub
          </a>
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <button onClick={handleSignOut} className="btn-ghost">
                Sign out
              </button>
              <Link to="/app" className="btn-primary">
                Dashboard
              </Link>
            </>
          ) : (
            <>
              <button onClick={handleSignIn} className="btn-ghost">
                Sign in
              </button>
              <button onClick={handleSignIn} className="btn-primary">
                Get started
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
