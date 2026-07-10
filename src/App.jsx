import React, { useState } from "react";
import { Routes, Route } from "react-router-dom";
import Nav from "./components/Nav";
import CartDrawer from "./components/CartDrawer";
import Shop from "./pages/Shop";
import Checkout from "./pages/Checkout";
import Success from "./pages/Success";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import { Navigate } from "react-router-dom";

export default function App() {
  const [cartOpen, setCartOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <Nav onCartClick={() => setCartOpen(true)} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Shop />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/success/:orderId" element={<Success />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="text-center text-xs text-steel font-mono py-6">
        Built for your office canteen · Demo app
      </footer>
    </div>
  );
}
