import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useStore } from "../lib/StoreContext";
import { Wallet as WalletIcon, Phone, Loader2, ArrowDownLeft, ArrowUpRight, LogOut } from "lucide-react";

const RECHARGE_PRESETS = [100, 200, 500, 1000];

export default function Wallet() {
  const { company, customerId, customerPhone, walletBalance, loginCustomer, logoutCustomer, rechargeWallet, walletTransactions } =
    useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.redirectTo;

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [amount, setAmount] = useState("");
  const [recharging, setRecharging] = useState(false);
  const [rechargeMsg, setRechargeMsg] = useState("");

  const [txns, setTxns] = useState([]);

  useEffect(() => {
    if (customerId) walletTransactions().then(setTxns);
  }, [customerId, walletBalance, walletTransactions]);

  const submitLogin = async (e) => {
    e.preventDefault();
    if (!/^\d{10}$/.test(phone.replace(/\D/g, ""))) {
      setLoginError("Enter a 10-digit phone number.");
      return;
    }
    setLoggingIn(true);
    setLoginError("");
    const ok = await loginCustomer(phone.replace(/\D/g, ""), name.trim());
    setLoggingIn(false);
    if (!ok) {
      setLoginError("Couldn't log in — try again.");
      return;
    }
    if (redirectTo) navigate(`/${company.slug}${redirectTo}`);
  };

  const doRecharge = async (amt) => {
    if (!amt || amt <= 0) return;
    setRecharging(true);
    setRechargeMsg("");
    const res = await rechargeWallet(amt);
    setRecharging(false);
    if (res.ok) {
      setRechargeMsg(`Added ₹${amt}. New balance ₹${res.balance}.`);
      setAmount("");
    } else {
      setRechargeMsg(res.error || "Recharge failed.");
    }
  };

  if (!customerId) {
    return (
      <div className="max-w-sm mx-auto px-4 py-16">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-board text-turmeric flex items-center justify-center mx-auto mb-4">
            <WalletIcon size={24} />
          </div>
          <h1 className="font-chalk text-3xl">Canteen Wallet</h1>
          <p className="text-steel text-sm">Recharge once, pay instantly at checkout — no app-picking required.</p>
        </div>

        <form onSubmit={submitLogin} className="bg-white rounded-2xl border border-ink/5 p-5 space-y-4">
          <div>
            <label className="text-xs font-mono uppercase text-steel">Phone number</label>
            <div className="mt-1 flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-ink/15 focus-within:border-turmeric">
              <Phone size={16} className="text-steel" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98765 43210"
                className="flex-1 outline-none"
                autoFocus
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-mono uppercase text-steel">Name (optional)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="So the counter knows who's asking"
              className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-ink/15 focus:border-turmeric outline-none"
            />
          </div>
          {loginError && <p className="text-brick text-sm">{loginError}</p>}
          <button
            type="submit"
            disabled={loggingIn}
            className="w-full bg-turmeric hover:bg-turmeric-dark disabled:opacity-60 text-ink font-semibold py-3 rounded-full transition flex items-center justify-center gap-2"
          >
            {loggingIn ? <Loader2 size={16} className="animate-spin" /> : null}
            Continue
          </button>
          <p className="text-[11px] text-steel font-mono text-center">
            No OTP in this demo — this just remembers your wallet by phone number.
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-chalk text-3xl">Canteen Wallet</h1>
          <p className="text-steel text-sm font-mono">{customerPhone}</p>
        </div>
        <button
          onClick={logoutCustomer}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-ink/15 hover:bg-paper2"
        >
          <LogOut size={13} /> Switch number
        </button>
      </div>

      <div className="bg-board text-paper rounded-2xl p-6 mb-6">
        <p className="text-turmeric-light text-xs font-mono uppercase tracking-widest">Balance</p>
        <p className="text-4xl font-bold font-mono mt-1">₹{walletBalance}</p>
      </div>

      <div className="bg-white rounded-2xl border border-ink/5 p-4 sm:p-5 mb-6">
        <p className="text-sm font-semibold mb-3">Recharge</p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {RECHARGE_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => doRecharge(p)}
              disabled={recharging}
              className="py-2 rounded-xl border border-ink/15 text-sm font-mono hover:border-turmeric hover:bg-turmeric/10 transition disabled:opacity-50"
            >
              ₹{p}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Custom amount"
            className="flex-1 px-3.5 py-2 rounded-xl border border-ink/15 font-mono text-sm focus:border-turmeric outline-none"
          />
          <button
            onClick={() => doRecharge(Number(amount))}
            disabled={recharging || !amount}
            className="bg-sage hover:bg-sage/90 disabled:bg-steel/40 text-white font-semibold px-4 py-2 rounded-xl text-sm transition"
          >
            Add
          </button>
        </div>
        {rechargeMsg && <p className="text-xs font-mono text-steel mt-2">{rechargeMsg}</p>}
        <p className="text-[11px] text-steel font-mono mt-3">
          Demo recharge — credits instantly. Wire a real payment gateway before this touches real money.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-ink/5 p-4 sm:p-5">
        <p className="text-sm font-semibold mb-3">Recent activity</p>
        {txns.length === 0 ? (
          <p className="text-steel text-sm text-center py-6">No transactions yet.</p>
        ) : (
          <div className="space-y-2">
            {txns.map((t) => (
              <div key={t.id} className="flex items-center gap-3 text-sm">
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    t.amount > 0 ? "bg-sage/10 text-sage" : "bg-brick/10 text-brick"
                  }`}
                >
                  {t.amount > 0 ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                </span>
                <span className="flex-1 capitalize text-steel">{t.type.replace("_", " ")}</span>
                <span className="text-[11px] font-mono text-steel">
                  {new Date(t.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                </span>
                <span className={`font-mono font-semibold ${t.amount > 0 ? "text-sage" : "text-brick"}`}>
                  {t.amount > 0 ? "+" : ""}₹{Math.abs(t.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
