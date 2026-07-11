import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase, supabaseConfigured } from "./supabaseClient";
import { getDeviceId } from "./identity";

export const paymentApps = [
  { id: "wallet", name: "Canteen Wallet", emoji: "👛" },
  { id: "gpay", name: "Google Pay", emoji: "🟢" },
  { id: "phonepe", name: "PhonePe", emoji: "🟣" },
  { id: "paytm", name: "Paytm", emoji: "🔵" },
  { id: "card", name: "Debit / Credit Card", emoji: "💳" },
  { id: "cash", name: "Pay at Counter (Cash)", emoji: "💵" },
];

const StoreContext = createContext(null);

export function StoreProvider({ companySlug, children }) {
  const deviceId = useMemo(() => getDeviceId(), []);
  const custKey = `canteen_customer_${companySlug}`;
  const cartKey = `canteen_cart_${companySlug}`;
  const myOrdersKey = `canteen_my_orders_${companySlug}`;
  const adminKey = `canteen_admin_token_${companySlug}`;
  const memberKey = `canteen_member_token_${companySlug}`;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [company, setCompany] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]); // admin sees all; buyer's own list is derived
  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(cartKey)) || {};
    } catch {
      return {};
    }
  });
  const [customerId, setCustomerId] = useState(() => localStorage.getItem(custKey + "_id"));
  const [customerPhone, setCustomerPhone] = useState(() => localStorage.getItem(custKey + "_phone"));
  const [walletBalance, setWalletBalance] = useState(0);
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem(adminKey));
  const [memberToken, setMemberToken] = useState(() => localStorage.getItem(memberKey));
  const [memberInfo, setMemberInfo] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(memberKey + "_info")) || null;
    } catch {
      return null;
    }
  });
  const [myOrderIds, setMyOrderIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(myOrdersKey)) || [];
    } catch {
      return [];
    }
  });

  const companyIdRef = useRef(null);

  // ---------- persist small bits of local state ----------
  useEffect(() => {
    localStorage.setItem(cartKey, JSON.stringify(cart));
  }, [cart, cartKey]);
  useEffect(() => {
    localStorage.setItem(myOrdersKey, JSON.stringify(myOrderIds));
  }, [myOrderIds, myOrdersKey]);
  useEffect(() => {
    if (adminToken) localStorage.setItem(adminKey, adminToken);
    else localStorage.removeItem(adminKey);
  }, [adminToken, adminKey]);
  useEffect(() => {
    if (memberToken) localStorage.setItem(memberKey, memberToken);
    else localStorage.removeItem(memberKey);
  }, [memberToken, memberKey]);
  useEffect(() => {
    if (memberInfo) localStorage.setItem(memberKey + "_info", JSON.stringify(memberInfo));
    else localStorage.removeItem(memberKey + "_info");
  }, [memberInfo, memberKey]);

  // ---------- initial load: resolve company, products, orders ----------
  const loadAll = useCallback(async () => {
    setLoading(true);
    const { data: companyRow, error: companyErr } = await supabase
      .from("companies")
      .select("id, slug, name, emoji")
      .eq("slug", companySlug)
      .maybeSingle();

    if (companyErr || !companyRow) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setCompany(companyRow);
    companyIdRef.current = companyRow.id;

    const [{ data: productRows }, { data: orderRows }] = await Promise.all([
      supabase.from("products").select("*").eq("company_id", companyRow.id).order("category"),
      supabase.from("orders").select("*").eq("company_id", companyRow.id).order("created_at", { ascending: false }).limit(300),
    ]);
    setProducts(productRows || []);
    setOrders(orderRows || []);
    setLoading(false);
  }, [companySlug]);

  useEffect(() => {
    if (supabaseConfigured) loadAll();
    else setLoading(false);
  }, [loadAll]);

  // ---------- validate stored sessions once per visit ----------
  // Tokens live in localStorage but expire server-side (12h). If a stored
  // token is dead, clear it so the auth gate sends the user back to the
  // Sign In screen instead of rendering an empty, broken app.
  useEffect(() => {
    if (!supabaseConfigured) return;
    (async () => {
      const admin = localStorage.getItem(adminKey);
      if (admin) {
        const { data, error } = await supabase.rpc("admin_session_valid", { p_token: admin });
        // Only clear on a definite "false" — network errors or a not-yet-run
        // migration must never log people out.
        if (!error && data === false) setAdminToken(null);
      }
      const member = localStorage.getItem(memberKey);
      if (member) {
        const { data, error } = await supabase.rpc("member_session_valid", { p_token: member });
        if (!error && data === false) {
          setMemberToken(null);
          setMemberInfo(null);
        }
      }
    })();
    // Run once per company mount — keys are stable for a given slug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey, memberKey]);

  // ---------- realtime: products + orders for this company ----------
  useEffect(() => {
    if (!company) return;
    const channel = supabase
      .channel(`company-${company.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products", filter: `company_id=eq.${company.id}` },
        (payload) => {
          setProducts((prev) => {
            if (payload.eventType === "DELETE") return prev.filter((p) => p.id !== payload.old.id);
            const exists = prev.some((p) => p.id === payload.new.id);
            return exists ? prev.map((p) => (p.id === payload.new.id ? payload.new : p)) : [...prev, payload.new];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `company_id=eq.${company.id}` },
        (payload) => {
          setOrders((prev) => {
            if (payload.eventType === "DELETE") return prev.filter((o) => o.id !== payload.old.id);
            const exists = prev.some((o) => o.id === payload.new.id);
            return exists ? prev.map((o) => (o.id === payload.new.id ? payload.new : o)) : [payload.new, ...prev];
          });
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [company]);

  // ---------- wallet balance ----------
  const refreshWallet = useCallback(
    async (custId) => {
      const id = custId || customerId;
      if (!id) return;
      const { data } = await supabase.rpc("get_wallet_balance", { p_customer_id: id });
      if (typeof data === "number") setWalletBalance(data);
    },
    [customerId]
  );

  useEffect(() => {
    if (customerId) refreshWallet(customerId);
  }, [customerId, refreshWallet]);

  // ---------- buyer identity ----------
  const loginCustomer = useCallback(
    async (phone, name) => {
      const { data, error } = await supabase.rpc("get_or_create_customer", {
        p_company_slug: companySlug,
        p_phone: phone,
        p_name: name || null,
        p_device_id: deviceId,
      });
      if (error || !data || !data[0]) return false;
      const row = data[0];
      setCustomerId(row.customer_id);
      setCustomerPhone(phone);
      setWalletBalance(row.balance);
      localStorage.setItem(custKey + "_id", row.customer_id);
      localStorage.setItem(custKey + "_phone", phone);
      return true;
    },
    [companySlug, deviceId, custKey]
  );

  const logoutCustomer = useCallback(() => {
    setCustomerId(null);
    setCustomerPhone(null);
    setWalletBalance(0);
    localStorage.removeItem(custKey + "_id");
    localStorage.removeItem(custKey + "_phone");
  }, [custKey]);

  const rechargeWallet = useCallback(
    async (amount) => {
      if (!customerId) return { ok: false, error: "Log in with your phone number first." };
      const { data, error } = await supabase.rpc("wallet_recharge", { p_customer_id: customerId, p_amount: amount });
      if (error) return { ok: false, error: error.message };
      setWalletBalance(data);
      return { ok: true, balance: data };
    },
    [customerId]
  );

  const walletTransactions = useCallback(async () => {
    if (!customerId) return [];
    const { data } = await supabase.rpc("get_wallet_transactions", { p_customer_id: customerId });
    return data || [];
  }, [customerId]);

  // ---------- cart ----------
  const addToCart = useCallback((productId, qty = 1) => {
    setCart((prev) => ({ ...prev, [productId]: (prev[productId] || 0) + qty }));
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

  // ---------- orders (buyer) ----------
  const canFulfill = useCallback(
    (items) =>
      items.every((it) => {
        const p = products.find((x) => x.id === it.productId);
        return p && p.stock >= it.qty;
      }),
    [products]
  );

  const placeOrder = useCallback(
    async ({ items, paymentMethod, source = "online" }) => {
      const { data, error } = await supabase.rpc("place_order", {
        p_company_slug: companySlug,
        p_items: items,
        p_payment_method: paymentMethod,
        p_source: source,
        p_customer_id: customerId || null,
        p_device_id: deviceId,
      });
      if (error) return { order: null, error: error.message };
      const order = data;
      setOrders((prev) => [order, ...prev.filter((o) => o.id !== order.id)]);
      if (source === "online") setMyOrderIds((prev) => [order.id, ...prev]);
      if (paymentMethod === "Wallet") refreshWallet();
      return { order, error: null };
    },
    [companySlug, customerId, deviceId, refreshWallet]
  );

  const reorderItems = useCallback(
    (order) => {
      const additions = {};
      for (const it of order.items) {
        const p = products.find((x) => x.id === it.productId);
        if (p && p.stock > 0) additions[it.productId] = Math.min(it.qty, p.stock);
      }
      setCart((prev) => {
        const next = { ...prev };
        for (const [id, qty] of Object.entries(additions)) next[id] = (next[id] || 0) + qty;
        return next;
      });
      return Object.keys(additions).length;
    },
    [products]
  );

  const myOrders = useMemo(() => {
    const byId = orders.filter((o) => myOrderIds.includes(o.id));
    const byCustomer = customerId ? orders.filter((o) => o.customer_id === customerId) : [];
    const merged = [...byId, ...byCustomer];
    const seen = new Set();
    return merged
      .filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [orders, myOrderIds, customerId]);

  // ---------- admin ----------
  const isAdmin = Boolean(adminToken);

  const login = useCallback(
    async (password) => {
      const { data, error } = await supabase.rpc("admin_login", { p_slug: companySlug, p_password: password });
      if (error || !data) return false;
      setAdminToken(data);
      return true;
    },
    [companySlug]
  );

  const logout = useCallback(async () => {
    if (adminToken) await supabase.rpc("admin_logout", { p_token: adminToken });
    setAdminToken(null);
  }, [adminToken]);

  const addProduct = useCallback(
    async (product) => {
      await supabase.rpc("admin_upsert_product", {
        p_token: adminToken,
        p_id: null,
        p_name: product.name,
        p_category: product.category,
        p_emoji: product.emoji,
        p_price: product.price,
        p_cost: product.cost,
        p_stock: product.stock,
        p_low_stock_threshold: product.lowStockThreshold ?? 5,
        p_unit: product.unit,
      });
    },
    [adminToken]
  );

  const updateProduct = useCallback(
    async (id, patch) => {
      const existing = products.find((p) => p.id === id);
      const merged = { ...existing, ...patch };
      await supabase.rpc("admin_upsert_product", {
        p_token: adminToken,
        p_id: id,
        p_name: merged.name,
        p_category: merged.category,
        p_emoji: merged.emoji,
        p_price: merged.price,
        p_cost: merged.cost,
        p_stock: merged.stock,
        p_low_stock_threshold: merged.low_stock_threshold ?? merged.lowStockThreshold ?? 5,
        p_unit: merged.unit,
      });
    },
    [adminToken, products]
  );

  const deleteProduct = useCallback(
    async (id) => {
      await supabase.rpc("admin_delete_product", { p_token: adminToken, p_id: id });
      setProducts((prev) => prev.filter((p) => p.id !== id));
    },
    [adminToken]
  );

  const setStock = useCallback(
    async (id, stock) => {
      await supabase.rpc("admin_set_stock", { p_token: adminToken, p_id: id, p_stock: stock });
    },
    [adminToken]
  );

  const adjustStock = useCallback(
    async (id, delta) => {
      const p = products.find((x) => x.id === id);
      if (!p) return;
      await setStock(id, Math.max(0, p.stock + delta));
    },
    [products, setStock]
  );

  const setOrderStatus = useCallback(
    async (orderId, status) => {
      await supabase.rpc("admin_set_order_status", { p_token: adminToken, p_order_id: orderId, p_status: status });
    },
    [adminToken]
  );

  const lowStockProducts = useMemo(
    () => products.filter((p) => p.stock <= (p.low_stock_threshold ?? 5)),
    [products]
  );

  // ---------- seller login (used by the global /seller/login page, which already
  // resolved the company slug via the seller_login RPC before navigating here) ----------
  const loginAdminWithToken = useCallback((token) => {
    setAdminToken(token);
  }, []);

  // ---------- member (buyer) session ----------
  const isMember = Boolean(memberToken);

  const loginMemberWithSession = useCallback((session) => {
    setMemberToken(session.token);
    setMemberInfo({
      memberId: session.member_id,
      memberNumber: session.member_number,
      name: session.member_name,
    });
  }, []);

  const logoutMember = useCallback(async () => {
    if (memberToken) await supabase.rpc("member_logout", { p_token: memberToken });
    setMemberToken(null);
    setMemberInfo(null);
  }, [memberToken]);

  const myAttendance = useCallback(async () => {
    if (!memberToken) return [];
    const { data } = await supabase.rpc("get_my_attendance", { p_token: memberToken });
    return data || [];
  }, [memberToken]);

  // ---------- member: profile, email, password, daily check-in, tickets ----------
  const myProfile = useCallback(async () => {
    if (!memberToken) return null;
    const { data } = await supabase.rpc("get_my_profile", { p_token: memberToken });
    return data?.[0] || null;
  }, [memberToken]);

  const setMyEmail = useCallback(
    async (email) => {
      const { error } = await supabase.rpc("member_set_email", { p_token: memberToken, p_email: email });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    [memberToken]
  );

  const changeMyPassword = useCallback(
    async (oldPassword, newPassword) => {
      const { error } = await supabase.rpc("member_change_password", {
        p_token: memberToken,
        p_old: oldPassword,
        p_new: newPassword,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    [memberToken]
  );

  const checkinStatusToday = useCallback(async () => {
    if (!memberToken) return null;
    const { data } = await supabase.rpc("member_checkin_status", { p_token: memberToken });
    return data?.[0] || null; // { status: 'none'|'pending'|'yes'|'no', amount }
  }, [memberToken]);

  const checkinToday = useCallback(
    async (coming) => {
      const { data, error } = await supabase.rpc("member_checkin_today", {
        p_token: memberToken,
        p_coming: coming,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, ...data?.[0] };
    },
    [memberToken]
  );

  const raiseMyTicket = useCallback(
    async (subject, message) => {
      const { error } = await supabase.rpc("member_raise_ticket", {
        p_token: memberToken,
        p_subject: subject,
        p_message: message,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    [memberToken]
  );

  const listMyTickets = useCallback(async () => {
    if (!memberToken) return [];
    const { data } = await supabase.rpc("member_list_tickets", { p_token: memberToken });
    return data || [];
  }, [memberToken]);

  // ---------- seller: tickets + login stats ----------
  const listTickets = useCallback(async () => {
    if (!adminToken) return [];
    const { data } = await supabase.rpc("admin_list_tickets", { p_token: adminToken });
    return data || [];
  }, [adminToken]);

  const setTicketStatus = useCallback(
    async (id, status) => {
      await supabase.rpc("admin_set_ticket_status", { p_token: adminToken, p_id: id, p_status: status });
    },
    [adminToken]
  );

  const replyTicket = useCallback(
    async (id, reply) => {
      const { error } = await supabase.rpc("admin_reply_ticket", { p_token: adminToken, p_id: id, p_reply: reply });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    [adminToken]
  );

  // ---------- password reset via emailed OTP (no login required) ----------
  const requestPasswordOtp = useCallback(async (email) => {
    if (!supabaseConfigured) return { ok: false, error: "Backend not connected yet." };
    const { data, error } = await supabase.functions.invoke("send-password-otp", { body: { email } });
    if (error) return { ok: false, error: error.message || "Couldn't send the code. Try again." };
    if (data?.error) return { ok: false, error: data.error };
    return { ok: true };
  }, []);

  const resetPasswordWithOtp = useCallback(async (email, otp, newPassword) => {
    const { error } = await supabase.rpc("verify_and_reset_password", {
      p_email: email,
      p_otp: otp,
      p_new_password: newPassword,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, []);

  const loginStats = useCallback(async () => {
    if (!adminToken) return null;
    const { data } = await supabase.rpc("admin_login_stats", { p_token: adminToken });
    return data?.[0] || null;
  }, [adminToken]);

  const allCompanyLoginCounts = useCallback(async () => {
    if (!adminToken) return [];
    const { data } = await supabase.rpc("admin_all_company_login_counts", { p_token: adminToken });
    return data || [];
  }, [adminToken]);

  // ---------- seller: member roster management ----------
  const listMembers = useCallback(async () => {
    if (!adminToken) return [];
    const { data, error } = await supabase.rpc("admin_list_members", { p_token: adminToken });
    if (error) return [];
    return data || [];
  }, [adminToken]);

  const upsertMember = useCallback(
    async (member) => {
      const { data, error } = await supabase.rpc("admin_upsert_member", {
        p_token: adminToken,
        p_id: member.id || null,
        p_member_number: member.memberNumber,
        p_name: member.name || null,
        p_email: member.email || null,
        p_password: member.password || null,
        p_daily_amount: member.dailyAmount ?? 250,
        p_active: member.active ?? true,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, member: data };
    },
    [adminToken]
  );

  const deleteMember = useCallback(
    async (id) => {
      await supabase.rpc("admin_delete_member", { p_token: adminToken, p_id: id });
    },
    [adminToken]
  );

  // ---------- seller: khata (credit tab) ----------
  const khataSummary = useCallback(async () => {
    if (!adminToken) return [];
    const { data, error } = await supabase.rpc("admin_khata_summary", { p_token: adminToken });
    if (error) return [];
    return data || [];
  }, [adminToken]);

  const khataEntriesFor = useCallback(
    async (memberId) => {
      if (!adminToken) return [];
      const { data, error } = await supabase.rpc("admin_khata_entries", { p_token: adminToken, p_member_id: memberId });
      if (error) return [];
      return data || [];
    },
    [adminToken]
  );

  const addKhataEntry = useCallback(
    async (memberId, productName, price, qty = 1, note = null) => {
      const { data, error } = await supabase.rpc("admin_add_khata_entry", {
        p_token: adminToken,
        p_member_id: memberId,
        p_product_name: productName,
        p_price: price,
        p_qty: qty,
        p_note: note,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, entry: data };
    },
    [adminToken]
  );

  const settleKhata = useCallback(
    async (memberId) => {
      const { data, error } = await supabase.rpc("admin_settle_khata", { p_token: adminToken, p_member_id: memberId });
      if (error) return { ok: false, error: error.message };
      return { ok: true, settledCount: data };
    },
    [adminToken]
  );

  // ---------- member: my own khata tab ----------
  const myKhata = useCallback(async () => {
    if (!memberToken) return { due_total: 0, entries: [] };
    const { data, error } = await supabase.rpc("get_my_khata", { p_token: memberToken });
    if (error || !data?.[0]) return { due_total: 0, entries: [] };
    return { due_total: Number(data[0].due_total) || 0, entries: data[0].entries || [] };
  }, [memberToken]);

  // ---------- seller: attendance / daily collection ----------
  const markAttendance = useCallback(
    async (date, memberNumbers) => {
      const { data, error } = await supabase.rpc("mark_attendance", {
        p_token: adminToken,
        p_date: date,
        p_member_numbers: memberNumbers,
      });
      if (error || !data || !data[0]) return { ok: false, error: error?.message };
      return { ok: true, ...data[0] };
    },
    [adminToken]
  );

  const unmarkAttendance = useCallback(
    async (date, memberNumber) => {
      await supabase.rpc("admin_unmark_attendance", { p_token: adminToken, p_date: date, p_member_number: memberNumber });
    },
    [adminToken]
  );

  const attendanceForDate = useCallback(
    async (date) => {
      if (!adminToken) return [];
      const { data } = await supabase.rpc("admin_attendance_for_date", { p_token: adminToken, p_date: date });
      return data || [];
    },
    [adminToken]
  );

  const getAttendanceRecords = useCallback(
    async (days = 400) => {
      if (!adminToken) return [];
      const { data } = await supabase.rpc("admin_get_attendance", { p_token: adminToken, p_days: days });
      return data || [];
    },
    [adminToken]
  );

  const value = useMemo(
    () => ({
      loading,
      notFound,
      company,
      products,
      orders,
      myOrders,
      cart,
      isAdmin,
      customerId,
      customerPhone,
      walletBalance,
      lowStockProducts,
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
      reorderItems,
      login,
      logout,
      loginAdminWithToken,
      loginCustomer,
      logoutCustomer,
      rechargeWallet,
      walletTransactions,
      refreshWallet,
      setOrderStatus,
      isMember,
      memberInfo,
      loginMemberWithSession,
      logoutMember,
      myAttendance,
      myProfile,
      setMyEmail,
      changeMyPassword,
      checkinStatusToday,
      checkinToday,
      raiseMyTicket,
      listMyTickets,
      listTickets,
      setTicketStatus,
      replyTicket,
      requestPasswordOtp,
      resetPasswordWithOtp,
      loginStats,
      allCompanyLoginCounts,
      listMembers,
      upsertMember,
      deleteMember,
      markAttendance,
      unmarkAttendance,
      attendanceForDate,
      getAttendanceRecords,
      khataSummary,
      khataEntriesFor,
      addKhataEntry,
      settleKhata,
      myKhata,
    }),
    [
      loading, notFound, company, products, orders, myOrders, cart, isAdmin, customerId, customerPhone,
      walletBalance, lowStockProducts, addToCart, setCartQty, clearCart, addProduct, updateProduct,
      deleteProduct, setStock, adjustStock, placeOrder, canFulfill, reorderItems, login, logout,
      loginAdminWithToken, loginCustomer, logoutCustomer, rechargeWallet, walletTransactions, refreshWallet,
      setOrderStatus, isMember, memberInfo, loginMemberWithSession, logoutMember, myAttendance, listMembers,
      upsertMember, deleteMember, markAttendance, unmarkAttendance, attendanceForDate, getAttendanceRecords,
      myProfile, setMyEmail, changeMyPassword, checkinStatusToday, checkinToday, raiseMyTicket,
      listMyTickets, listTickets, setTicketStatus, replyTicket, requestPasswordOtp, resetPasswordWithOtp,
      loginStats, allCompanyLoginCounts, khataSummary, khataEntriesFor, addKhataEntry, settleKhata, myKhata,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
