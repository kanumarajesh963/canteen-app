import { supabase } from "./supabaseClient";

// Seller logs in with just a username + password (no company name needed) —
// the backend looks up which company that username belongs to.
export async function sellerLoginGlobal(username, password) {
  const { data, error } = await supabase.rpc("seller_login", {
    p_username: username,
    p_password: password,
  });
  if (error || !data || !data[0] || !data[0].token) return null;
  return data[0]; // { token, company_slug, company_name }
}

// Member (buyer) logs in with ONLY email + password — the backend finds
// which company the email belongs to automatically.
export async function memberLoginGlobal(email, password) {
  const { data, error } = await supabase.rpc("member_login_v2", {
    p_email: email,
    p_password: password,
  });
  if (error || !data || !data[0] || !data[0].token) return null;
  return data[0]; // { token, member_id, member_number, member_name, company_slug, company_name }
}

// ---------------------------------------------------------------------
// Seller self-signup: create a brand-new company + its first seller login.
// ---------------------------------------------------------------------

// Whether signup currently requires an emailed OTP before creating the
// company (toggled in Supabase → app_config, off by default).
export async function isOtpRequired() {
  const { data, error } = await supabase.rpc("get_signup_settings");
  if (error || !data || !data[0]) return false;
  return Boolean(data[0].otp_required);
}

// Sends a 6-digit verification code to `email` for the given purpose via the
// send-seller-signup-otp Edge Function (which emails it through Resend).
export async function sendOtp(email, _purpose = "seller_signup") {
  const { data, error } = await supabase.functions.invoke("send-seller-signup-otp", { body: { email } });
  if (error) return { ok: false, error: error.message || "Couldn't send the code. Try again." };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true };
}

// Creates the company + seller account. `otp` is only checked server-side
// when isOtpRequired() is true — safe to pass undefined otherwise.
export async function sellerSignup(email, password, companyName, otp) {
  const { data, error } = await supabase.rpc("seller_signup", {
    p_email: email,
    p_password: password,
    p_company_name: companyName,
    p_otp: otp || null,
  });
  if (error) return { ok: false, error: error.message };
  const row = data?.[0];
  if (!row?.token) return { ok: false, error: "Something went wrong — try again." };
  return {
    ok: true,
    token: row.token,
    company_slug: row.company_slug,
    company_name: row.company_name,
    company_code: row.company_code,
  };
}

// Persists a freshly-created admin session to localStorage using the exact
// same key StoreContext reads on mount (`canteen_admin_token_<slug>`), so
// navigating straight to `/${slug}/admin` after login/signup picks it up.
export function storeAdminSession(session) {
  if (!session?.company_slug || !session?.token) return;
  localStorage.setItem(`canteen_admin_token_${session.company_slug}`, session.token);
}

// ---------------------------------------------------------------------
// Member self-signup: email + password + company code + emailed OTP.
// ---------------------------------------------------------------------
export async function memberSignup(email, password, name, companyCode, otp) {
  const { data, error } = await supabase.rpc("member_self_signup", {
    p_email: email,
    p_password: password,
    p_name: name || null,
    p_company_code: companyCode,
    p_otp: otp,
  });
  if (error) return { ok: false, error: error.message };
  const row = data?.[0];
  if (!row?.token) return { ok: false, error: "Something went wrong — try again." };
  return { ok: true, ...row };
}

// Persists a member session to localStorage using the exact keys
// StoreContext reads on mount, so `/${slug}/member` picks it up directly.
export function storeMemberSession(session) {
  if (!session?.company_slug || !session?.token) return;
  localStorage.setItem(`canteen_member_token_${session.company_slug}`, session.token);
  localStorage.setItem(
    `canteen_member_token_${session.company_slug}_info`,
    JSON.stringify({ memberId: session.member_id, memberNumber: session.member_number, name: session.member_name })
  );
}

// ---------------------------------------------------------------------
// "Remember where I belong" — so the auth page can bounce returning,
// still-logged-in users straight to their home screen, and show only
// Sign In (not Sign Up) to devices that already have an account.
// ---------------------------------------------------------------------
const LAST_SESSION_KEY = "canteen_last_session_v1";
const HAS_ACCOUNT_KEY = "canteen_has_account_v1";

export function rememberSession(role, companySlug) {
  localStorage.setItem(LAST_SESSION_KEY, JSON.stringify({ role, companySlug }));
  localStorage.setItem(HAS_ACCOUNT_KEY, "1");
}

export function hasAccountOnThisDevice() {
  return localStorage.getItem(HAS_ACCOUNT_KEY) === "1";
}

// Returns { role: 'member'|'seller', companySlug } if a live session token
// exists in localStorage, else null. Checks the remembered session first,
// then scans for any canteen token as a fallback.
export function findActiveSession() {
  try {
    const last = JSON.parse(localStorage.getItem(LAST_SESSION_KEY) || "null");
    if (last?.companySlug) {
      const key =
        last.role === "seller"
          ? `canteen_admin_token_${last.companySlug}`
          : `canteen_member_token_${last.companySlug}`;
      if (localStorage.getItem(key)) return last;
    }
  } catch { /* fall through to scan */ }
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    let m = /^canteen_admin_token_(.+)$/.exec(key);
    if (m && localStorage.getItem(key)) return { role: "seller", companySlug: m[1] };
    m = /^canteen_member_token_([^_]+(?:-[^_]+)*)$/.exec(key);
    if (m && !key.endsWith("_info") && localStorage.getItem(key)) return { role: "member", companySlug: m[1] };
  }
  return null;
}

export function clearRememberedSession() {
  localStorage.removeItem(LAST_SESSION_KEY);
}

// ---------------------------------------------------------------------
// Forgot password (OTP flow) — standalone, needs NO StoreProvider.
// (Previously lived in StoreContext, which crashed the /forgot page
// because that route is mounted outside the provider.)
// ---------------------------------------------------------------------
export async function requestPasswordOtp(email) {
  const { data, error } = await supabase.functions.invoke("send-password-otp", { body: { email } });
  if (error) return { ok: false, error: error.message || "Couldn't send the code. Try again." };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true };
}

export async function resetPasswordWithOtp(email, otp, newPassword) {
  const { error } = await supabase.rpc("verify_and_reset_password", {
    p_email: email,
    p_otp: otp,
    p_new_password: newPassword,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
