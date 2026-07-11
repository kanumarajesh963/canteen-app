import React, { useState } from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import Nav from "./components/Nav";
import CartDrawer from "./components/CartDrawer";
import Shop from "./pages/Shop";
import Checkout from "./pages/Checkout";
import Success from "./pages/Success";
import MyOrders from "./pages/MyOrders";
import WalletPage from "./pages/Wallet";
import AdminDashboard from "./pages/AdminDashboard";
import AuthPage from "./pages/AuthPage";
import MemberHome from "./pages/MemberHome";
import ForgotPassword, { ForgotPasswordAskSeller } from "./pages/ForgotPassword";
import CheckinPage from "./pages/CheckinPage";
import { StoreProvider, useStore } from "./lib/StoreContext";
import { supabaseConfigured } from "./lib/supabaseClient";

export default function App() {
  return (
    <Routes>
      {/* The FIRST SCREEN: all sign in / sign up / OTP lives here. */}
      <Route path="/" element={<AuthPage />} />
      <Route path="/login" element={<Navigate to="/" replace />} />

      {/* Forgot password (own screen, linked from Sign In) */}
      <Route path="/forgot" element={<ForgotPassword />} />
      <Route path="/forgot/ask-seller" element={<ForgotPasswordAskSeller />} />

      {/* Old bookmarked auth URLs → the unified auth page */}
      <Route path="/member/login" element={<Navigate to="/" replace />} />
      <Route path="/seller/login" element={<Navigate to="/" replace />} />
      <Route path="/seller/signup" element={<Navigate to="/" replace />} />
      <Route path="/member/forgot" element={<Navigate to="/forgot" replace />} />
      <Route path="/member/forgot/ask-seller" element={<Navigate to="/forgot/ask-seller" replace />} />

      {/* Public by design: opened from the daily check-in email's secret token */}
      <Route path="/checkin/:token" element={<CheckinPage />} />

      <Route path="/:companySlug/*" element={<CompanyApp />} />
    </Routes>
  );
}

function CompanyApp() {
  const { companySlug } = useParams();
  return (
    <StoreProvider companySlug={companySlug}>
      <CompanyShell />
    </StoreProvider>
  );
}

function CompanyShell() {
  const { loading, notFound, company, isAdmin, isMember } = useStore();
  const [cartOpen, setCartOpen] = useState(false);

  if (!supabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <p className="text-2xl mb-2">⚙️</p>
          <h1 className="font-chalk text-2xl mb-2">Backend not connected</h1>
          <p className="text-steel text-sm max-w-md">
            This build needs Supabase credentials. Set <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> in Vercel → Settings → Environment Variables (one-time setup by
            the site owner) and redeploy. See README.md → Backend setup.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-mono text-steel text-sm animate-pulse">Loading the counter…</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <p className="text-4xl mb-2">🔍</p>
          <h1 className="font-chalk text-3xl mb-2">No canteen here</h1>
          <p className="text-steel text-sm max-w-sm">
            There's no company set up at this address. Check the link, or sign up as a seller to create one.
          </p>
        </div>
      </div>
    );
  }

  // ---- AUTH GATE: no browsing without an account. Members and sellers only.
  // Logged-out visitors (including anyone who just logged out) always land
  // back on the first screen.
  if (!isAdmin && !isMember) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen flex flex-col">
      <Nav onCartClick={() => setCartOpen(true)} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Shop />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/success/:orderId" element={<Success />} />
          <Route path="/orders" element={<MyOrders />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/member" element={<MemberHome />} />
          {/* Old per-company admin login → unified auth page */}
          <Route path="/admin/login" element={<Navigate to="/" replace />} />
          <Route path="/admin" element={isAdmin ? <AdminDashboard /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="." replace />} />
        </Routes>
      </main>
      <footer className="text-center text-xs text-steel font-mono py-6">
        {company.name} · powered by The Canteen Counter
      </footer>
    </div>
  );
}
