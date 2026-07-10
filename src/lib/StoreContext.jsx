import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { seedProducts } from "./seed";

const DB_KEY = "canteen_db_v1";
const CART_KEY = "canteen_cart_v1";
const AUTH_KEY = "canteen_admin_auth_v1";

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to load canteen data", e);
  }
  return { products: seedProducts, orders: [], nextToken: 1 };
}

function saveDB(db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {
    console.error("Failed to save canteen data", e);
  }
}

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [db, setDB] = useState(loadDB);
  const [cart, setCart] = useState(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem(AUTH_KEY) === "true");

  useEffect(() => saveDB(db), [db]);
  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (e) {
      console.error(e);
    }
  }, [cart]);

  // ---------- Cart ----------
  const addToCart = useCallback((productId, qty = 1) => {
    setCart((prev) => {
      const current = prev[productId] || 0;
      return { ...prev, [productId]: current + qty };
    });
  }, []);

  const setCartQty = useCallback((productId, qty) => {
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[productId];
      else next[productId] = qty;
      return next;
    });
  }, []);

  const clearCart = useCallback(() => setCart({}), []);

  // ---------- Products ----------
  const addProduct = useCallback((product) => {
    setDB((prev) => ({
      ...prev,
      products: [...prev.products, { ...product, id: "p" + Date.now() }],
    }));
  }, []);

  const updateProduct = useCallback((id, patch) => {
    setDB((prev) => ({
      ...prev,
      products: prev.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }, []);

  const deleteProduct = useCallback((id) => {
    setDB((prev) => ({ ...prev, products: prev.products.filter((p) => p.id !== id) }));
  }, []);

  const setStock = useCallback((id, stock) => {
    setDB((prev) => ({
      ...prev,
      products: prev.products.map((p) => (p.id === id ? { ...p, stock: Math.max(0, stock) } : p)),
    }));
  }, []);

  const adjustStock = useCallback((id, delta) => {
    setDB((prev) => ({
      ...prev,
      products: prev.products.map((p) =>
        p.id === id ? { ...p, stock: Math.max(0, p.stock + delta) } : p
      ),
    }));
  }, []);

  // ---------- Orders ----------
  // items: [{ productId, qty }]
  const placeOrder = useCallback(
    ({ items, paymentMethod, source = "online" }) => {
      let createdOrder = null;
      setDB((prev) => {
        const productsById = Object.fromEntries(prev.products.map((p) => [p.id, p]));
        // validate stock
        for (const it of items) {
          const p = productsById[it.productId];
          if (!p || p.stock < it.qty) return prev; // silently abort, caller should check first
        }
        const orderItems = items.map((it) => {
          const p = productsById[it.productId];
          return {
            productId: p.id,
            name: p.name,
            emoji: p.emoji,
            qty: it.qty,
            price: p.price,
            cost: p.cost,
          };
        });
        const total = orderItems.reduce((s, it) => s + it.price * it.qty, 0);
        const profit = orderItems.reduce((s, it) => s + (it.price - it.cost) * it.qty, 0);
        const order = {
          id: "ord_" + Date.now(),
          token: prev.nextToken,
          date: new Date().toISOString(),
          items: orderItems,
          total,
          profit,
          paymentMethod,
          source,
          status: "paid",
        };
        createdOrder = order;
        const updatedProducts = prev.products.map((p) => {
          const match = items.find((it) => it.productId === p.id);
          return match ? { ...p, stock: p.stock - match.qty } : p;
        });
        return {
          ...prev,
          products: updatedProducts,
          orders: [order, ...prev.orders],
          nextToken: prev.nextToken + 1,
        };
      });
      return createdOrder;
    },
    []
  );

  const canFulfill = useCallback(
    (items) => {
      return items.every((it) => {
        const p = db.products.find((x) => x.id === it.productId);
        return p && p.stock >= it.qty;
      });
    },
    [db.products]
  );

  // ---------- Admin auth (demo only, NOT secure — for real deployment wire up real auth) ----------
  const login = useCallback((password) => {
    if (password === "canteen123") {
      localStorage.setItem(AUTH_KEY, "true");
      setIsAdmin(true);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_KEY);
    setIsAdmin(false);
  }, []);

  const resetDemoData = useCallback(() => {
    const fresh = { products: seedProducts, orders: [], nextToken: 1 };
    setDB(fresh);
    setCart({});
  }, []);

  const value = useMemo(
    () => ({
      products: db.products,
      orders: db.orders,
      cart,
      isAdmin,
      addToCart,
      setCartQty,
      clearCart,
      addProduct,
      updateProduct,
      deleteProduct,
      setStock,
      adjustStock,
      placeOrder,
      canFulfill,
      login,
      logout,
      resetDemoData,
    }),
    [db, cart, isAdmin, addToCart, setCartQty, clearCart, addProduct, updateProduct, deleteProduct, setStock, adjustStock, placeOrder, canFulfill, login, logout, resetDemoData]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
