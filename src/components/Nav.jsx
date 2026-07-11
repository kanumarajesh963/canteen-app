import React, { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { ShoppingBasket, LayoutDashboard, Receipt, Wallet, UserCircle2, LogOut, Loader2 } from "lucide-react";
import { useStore } from "../lib/StoreContext";
import { clearRememberedSession } from "../lib/globalAuth";

// Top bar. Auth-wise it shows ONE thing: Logout — same for members and
// sellers. (You can only be here logged in; the shell redirects otherwise.)
// Logging out clears every session and returns to the first screen.
export default function Nav({ onCartClick }) {
  const { cart, isAdmin, isMember, company, walletBalance, customerId, logout, logoutMember } = useStore();
  const [loggingOut, setLoggingOut] = useState(false);
  const navigate = useNavigate();
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const base = `/${company.slug}`;

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
        <Link to={base} className="flex items-center gap-2 group">
          <span className="text-2xl leading-none">{company.emoji}</span>
          <div className="leading-tight">
            <div className="font-chalk text-xl sm:text-2xl tracking-wide">{company.name}</div>
            <div className="hidden sm:block text-[11px] font-mono text-turmeric-light/90 tracking-widest uppercase">
              Office Canteen
            </div>
          </div>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-4">
          {isMember && (
            <NavLink
              to={`${base}/wallet`}
              className={({ isActive }) =>
                `hidden sm:flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border transition ${
                  isActive ? "bg-turmeric text-ink border-turmeric" : "border-paper/25 text-paper/85 hover:border-paper/60"
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
                isActive ? "bg-turmeric text-ink border-turmeric" : "border-paper/25 text-paper/85 hover:border-paper/60"
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
                  isActive ? "bg-turmeric text-ink border-turmeric" : "border-paper/25 text-paper/85 hover:border-paper/60"
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
                  isActive ? "bg-turmeric text-ink border-turmeric" : "border-paper/25 text-paper/85 hover:border-paper/60"
                }`
              }
            >
              <LayoutDashboard size={16} />
              Dashboard
            </NavLink>
          )}

          <button
            onClick={onCartClick}
            className="relative flex items-center gap-2 bg-turmeric hover:bg-turmeric-dark text-ink font-semibold px-3.5 py-2 rounded-full transition"
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

          {/* The ONLY auth control up here: Logout — member or seller alike. */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border border-paper/25 text-paper/85 hover:border-brick hover:text-brick disabled:opacity-60 transition"
            title="Log out"
          >
            {loggingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
            <span className="hidden sm:inline">Logout</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
