import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { ShoppingBasket, LayoutDashboard, Receipt, Wallet, UserCircle2, LogOut, Loader2, Sun, Moon } from "lucide-react";
import { useStore } from "../lib/StoreContext";
import { clearRememberedSession } from "../lib/globalAuth";
import { useTheme } from "../lib/ThemeContext.jsx";

function initialsFor(name) {
  const clean = (name || "").trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/);
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[1][0]).toUpperCase();
}

// Top bar. Auth-wise it shows ONE thing: Logout — same for members and
// sellers. (You can only be here logged in; the shell redirects otherwise.)
// Logging out clears every session and returns to the first screen.
export default function Nav({ onCartClick }) {
  const { cart, isAdmin, isMember, company, walletBalance, customerId, logout, logoutMember, memberInfo } = useStore();
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const { resolved, toggle } = useTheme();
  const isDark = resolved === "dark";
  const navigate = useNavigate();
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const base = `/${company.slug}`;
  const displayName = isMember ? memberInfo?.name || `Member #${memberInfo?.memberNumber}` : company.name;

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const handleLogout = async () => {
    setLoggingOut(true);
    // Clear whichever sessions exist — member, seller, or both.
    await Promise.allSettled([isMember ? logoutMember() : null, isAdmin ? logout() : null]);
    // Belt-and-braces: remove the tokens directly too. The StoreContext
    // effect that does this can be skipped if the provider unmounts in the
    // same render as the navigation — this guarantees a clean logout.
    localStorage.removeItem(`canteen_member_token_${company.slug}`);
    localStorage.removeItem(`canteen_member_token_${company.slug}_info`);
    localStorage.removeItem(`canteen_admin_token_${company.slug}`);
    clearRememberedSession();
    setLoggingOut(false);
    navigate("/", { replace: true }); // back to the first screen
  };

  return (
    <header className="sticky top-0 z-30 bg-board text-paper shadow-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link to={base} className="flex items-center gap-2 group min-w-0 mr-2">
          <span className="text-2xl leading-none shrink-0">{company.emoji}</span>
          <div className="leading-tight min-w-0">
            <div className="font-chalk text-lg sm:text-2xl tracking-wide truncate">{company.name}</div>
            <div className="hidden sm:block text-[11px] font-mono text-turmeric-light/90 tracking-widest uppercase">
              Office Canteen
            </div>
          </div>
        </Link>

        <nav className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {isMember && (
            <NavLink
              to={`${base}/wallet`}
              className={({ isActive }) =>
                `hidden sm:flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border transition ${
                  isActive ? "bg-turmeric text-onbrand border-turmeric" : "border-paper/25 text-paper/85 hover:border-paper/60"
                }`
              }
            >
              <Wallet size={16} />
              {customerId ? `₹${walletBalance}` : "Wallet"}
            </NavLink>
          )}

          <NavLink
            to={`${base}/orders`}
            className={({ isActive }) =>
              `flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border transition ${
                isActive ? "bg-turmeric text-onbrand border-turmeric" : "border-paper/25 text-paper/85 hover:border-paper/60"
              }`
            }
          >
            <Receipt size={16} />
            <span className="hidden sm:inline">My Orders</span>
          </NavLink>

          {isMember && (
            <NavLink
              to={`${base}/member`}
              className={({ isActive }) =>
                `hidden sm:flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border transition ${
                  isActive ? "bg-turmeric text-onbrand border-turmeric" : "border-paper/25 text-paper/85 hover:border-paper/60"
                }`
              }
            >
              <UserCircle2 size={16} />
              Member
            </NavLink>
          )}

          {isAdmin && (
            <NavLink
              to={`${base}/admin`}
              className={({ isActive }) =>
                `hidden sm:flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border transition ${
                  isActive ? "bg-turmeric text-onbrand border-turmeric" : "border-paper/25 text-paper/85 hover:border-paper/60"
                }`
              }
            >
              <LayoutDashboard size={16} />
              Dashboard
            </NavLink>
          )}

          <button
            onClick={onCartClick}
            className="relative flex items-center gap-2 bg-turmeric hover:bg-turmeric-dark text-onbrand font-semibold px-3.5 py-2 rounded-full transition"
          >
            <ShoppingBasket size={18} />
            <span className="hidden sm:inline">Cart</span>
            {cartCount > 0 && (
              <span
                key={cartCount}
                className="absolute -top-1.5 -right-1.5 bg-brick text-white text-[11px] font-mono w-5 h-5 rounded-full flex items-center justify-center animate-bump"
              >
                {cartCount}
              </span>
            )}
          </button>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="w-9 h-9 rounded-full bg-turmeric text-onbrand font-bold text-xs flex items-center justify-center hover:opacity-90 active:scale-95 transition"
              title={displayName}
            >
              {initialsFor(displayName)}
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-surface text-ink rounded-2xl border border-ink/10 shadow-lg overflow-hidden z-40">
                <div className="px-4 py-3 border-b border-ink/10">
                  <p className="font-semibold text-sm truncate">{displayName}</p>
                  <p className="text-xs text-steel truncate">{company.name}</p>
                </div>

                {/* Mobile-only quick nav. On ≥sm these live as pills in the
                    top bar; below sm the bar hides them, so surface them here
                    (this is how the admin Dashboard stays reachable on phones). */}
                <div className="sm:hidden border-b border-ink/10">
                  {isMember && (
                    <NavLink
                      to={`${base}/wallet`}
                      onClick={() => setMenuOpen(false)}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-paper2 transition"
                    >
                      <Wallet size={16} />
                      {customerId ? `Wallet · ₹${walletBalance}` : "Wallet"}
                    </NavLink>
                  )}
                  {isMember && (
                    <NavLink
                      to={`${base}/member`}
                      onClick={() => setMenuOpen(false)}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-paper2 transition"
                    >
                      <UserCircle2 size={16} />
                      Member
                    </NavLink>
                  )}
                  {isAdmin && (
                    <NavLink
                      to={`${base}/admin`}
                      onClick={() => setMenuOpen(false)}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-paper2 transition"
                    >
                      <LayoutDashboard size={16} />
                      Dashboard
                    </NavLink>
                  )}
                </div>

                <button
                  onClick={toggle}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-paper2 transition"
                >
                  {isDark ? <Sun size={16} /> : <Moon size={16} />}
                  {isDark ? "Light mode" : "Dark mode"}
                </button>
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-brick hover:bg-brick/10 disabled:opacity-60 transition"
                >
                  {loggingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
                  Logout
                </button>
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
