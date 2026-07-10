import React, { useState } from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import Nav from "./components/Nav";
import CartDrawer from "./components/CartDrawer";
import Shop from "./pages/Shop";
import Checkout from "./pages/Checkout";
import Success from "./pages/Success";
import MyOrders from "./pages/MyOrders";
import WalletPage from "./pages/Wallet";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import Landing from "./pages/Landing";
import SellerLoginGlobal from "./pages/SellerLoginGlobal";
import MemberLoginGlobal from "./pages/MemberLoginGlobal";
import MemberHome from "./pages/MemberHome";
import { StoreProvider, useStore } from "./lib/StoreContext";
import { supabaseConfigured } from "./lib/supabaseClient";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/seller/login" element={<SellerLoginGlobal />} />
      <Route path="/member/login" element={<MemberLoginGlobal />} />
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
  const { loading, notFound, company } = useStore();
  const [cartOpen, setCartOpen] = useState(false);

  if (!supabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <p className="text-2xl mb-2">⚙️</p>
          <h1 className="font-chalk text-2xl mb-2">Backend not connected</h1>
          <p className="text-steel text-sm max-w-md">
            This build needs Supabase credentials. Copy <code>.env.example</code> to <code>.env</code>, fill in your
            project URL and anon key, then rebuild. See README.md → Backend setup.
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
            There's no company set up at this address yet. Check the link, or ask your admin to create it in
            Supabase (see supabase/schema.sql).
          </p>
        </div>
      </div>
    );
  }

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
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="*" element={<Navigate to="." replace />} />
        </Routes>
      </main>
      <footer className="text-center text-xs text-steel font-mono py-6">
        {company.name} · powered by The Canteen Counter
      </footer>
    </div>
  );
}
