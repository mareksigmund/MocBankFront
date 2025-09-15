import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { authStore } from "../lib/auth";

export default function Navbar() {
  const navigate = useNavigate();
  const isLoggedIn = !!authStore.token;
  const [open, setOpen] = useState(false);

  const link = ({ isActive }: { isActive: boolean }) =>
    ["nav-link", isActive && "nav-link-active"].filter(Boolean).join(" ");

  function handleLogout() {
    authStore.logout();
    setOpen(false);
    navigate("/login");
  }

  function closeMenu() {
    setOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface/70 backdrop-blur">
      {/* Desktop bar */}
      <nav className="mx-auto w-full max-w-6xl h-14 px-4 sm:px-6 flex items-center gap-3">
        {/* Brand */}
        <Link to="/" className="font-semibold leading-none">
          <span className="bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-400 bg-clip-text text-transparent">
            MockBank
          </span>
        </Link>

        {/* Links (desktop) */}
        <div className="hidden md:flex items-center gap-1">
          <NavLink to="/" className={link}>
            Home
          </NavLink>
          {isLoggedIn && (
            <NavLink to="/accounts" className={link}>
              Accounts
            </NavLink>
          )}
          {!isLoggedIn && (
            <>
              <NavLink to="/login" className={link}>
                Login
              </NavLink>
              <NavLink to="/register" className={link}>
                Register
              </NavLink>
            </>
          )}
        </div>

        {/* Right side */}
        <div className="ms-auto flex items-center gap-2">
          {isLoggedIn && (
            <button onClick={handleLogout} className="btn-primary">
              Wyloguj
            </button>
          )}

          {/* Hamburger (mobile) */}
          <button
            className="md:hidden rounded-lg border border-border bg-overlay/70 p-2"
            aria-label="Otwórz menu"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            {/* prosty ikonograf (3 paski) */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile panel */}
      {open && (
        <div
          id="mobile-menu"
          className="md:hidden border-t border-border bg-surface/95"
        >
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-3 flex flex-col gap-1">
            <NavLink to="/" className={link} onClick={closeMenu}>
              Home
            </NavLink>
            {isLoggedIn && (
              <NavLink to="/accounts" className={link} onClick={closeMenu}>
                Accounts
              </NavLink>
            )}
            {!isLoggedIn && (
              <>
                <NavLink to="/login" className={link} onClick={closeMenu}>
                  Login
                </NavLink>
                <NavLink to="/register" className={link} onClick={closeMenu}>
                  Register
                </NavLink>
              </>
            )}
            {isLoggedIn && (
              <button
                onClick={handleLogout}
                className="btn-primary w-full mt-2"
              >
                Wyloguj
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
