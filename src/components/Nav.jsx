import React from "react";
import { Link, NavLink } from "react-router-dom";
import { ShoppingBasket, LayoutDashboard, Receipt } from "lucide-react";
import { useStore } from "../lib/StoreContext";

export default function Nav({ onCartClick }) {
  const { cart, isAdmin } = useStore();
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  return (
    <header className="sticky top-0 z-30 bg-board text-paper shadow-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <span className="text-2xl leading-none">🍱</span>
          <div className="leading-tight">
            <div className="font-chalk text-xl sm:text-2xl tracking-wide">The Canteen Counter</div>
            <div className="hidden sm:block text-[11px] font-mono text-turmeric-light/90 tracking-widest uppercase">
              Corporate Office Canteen
            </div>
          </div>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-4">
          <NavLink
            to="/orders"
            className={({ isActive }) =>
              `flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border transition ${
                isActive ? "bg-turmeric text-ink border-turmeric" : "border-paper/25 text-paper/85 hover:border-paper/60"
              }`
            }
          >
            <Receipt size={16} />
            <span className="hidden sm:inline">My Orders</span>
          </NavLink>

          <NavLink
            to={isAdmin ? "/admin" : "/admin/login"}
            className={({ isActive }) =>
              `hidden sm:flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border transition ${
                isActive ? "bg-turmeric text-ink border-turmeric" : "border-paper/25 text-paper/85 hover:border-paper/60"
              }`
            }
          >
            <LayoutDashboard size={16} />
            {isAdmin ? "Dashboard" : "Seller Login"}
          </NavLink>

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
        </nav>
      </div>
    </header>
  );
}
