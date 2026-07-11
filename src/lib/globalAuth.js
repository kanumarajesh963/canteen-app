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
