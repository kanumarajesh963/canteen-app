import React, { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { CalendarCheck, Loader2, XCircle, CheckCircle2 } from "lucide-react";
import { supabase, supabaseConfigured } from "../lib/supabaseClient";

// Landing page for the morning email's "Yes I'm coming / Not today" buttons.
// URL: /checkin/<token>            → shows the question with two buttons
//      /checkin/<token>?answer=yes → auto-submits YES (charges daily amount)
//      /checkin/<token>?answer=no  → auto-submits NO
export default function CheckinPage() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const answerParam = searchParams.get("answer");

  const [info, setInfo] = useState(null);
  const [result, setResult] = useState(null); // { status, amount }
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const respond = useCallback(
    async (coming) => {
      setSubmitting(true);
      setError("");
      const { data, error: err } = await supabase.rpc("respond_checkin", {
        p_token: token,
        p_coming: coming,
      });
      setSubmitting(false);
      if (err) {
        setError(err.message);
        return;
      }
      setResult(data?.[0] || null);
    },
    [token]
  );

  useEffect(() => {
    (async () => {
      if (!supabaseConfigured) {
        setError("Backend not connected yet — see README.md → Backend setup.");
        setLoading(false);
        return;
      }
      const { data, error: err } = await supabase.rpc("get_checkin", { p_token: token });
      if (err || !data || !data[0]) {
        setError("This check-in link is invalid or has expired.");
        setLoading(false);
        return;
      }
      setInfo(data[0]);
      setLoading(false);
      // Auto-submit if the email button already carried the answer.
      if (data[0].status === "pending" && (answerParam === "yes" || answerParam === "no")) {
        respond(answerParam === "yes");
      } else if (data[0].status === "yes" || data[0].status === "no") {
        setResult({ status: data[0].status, amount: data[0].status === "yes" ? data[0].amount : 0 });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        <div className="w-14 h-14 rounded-2xl bg-board text-turmeric flex items-center justify-center mx-auto mb-4">
          <CalendarCheck size={24} />
        </div>

        {loading ? (
          <p className="font-mono text-steel text-sm animate-pulse">Checking your link…</p>
        ) : error ? (
          <>
            <XCircle size={32} className="text-brick mx-auto mb-2" />
            <h1 className="font-chalk text-2xl mb-2">Hmm, that didn't work</h1>
            <p className="text-steel text-sm">{error}</p>
          </>
        ) : result ? (
          <>
            <CheckCircle2 size={32} className="text-sage mx-auto mb-2" />
            {result.status === "yes" ? (
              <>
                <h1 className="font-chalk text-2xl mb-2">See you at the office! 🎉</h1>
                <p className="text-steel text-sm">
                  ₹{result.amount} has been recorded as today's canteen collection for{" "}
                  <b>{info?.member_name}</b> ({info?.company_name}).
                </p>
              </>
            ) : (
              <>
                <h1 className="font-chalk text-2xl mb-2">No problem 👍</h1>
                <p className="text-steel text-sm">
                  Marked as not coming today — nothing will be charged for <b>{info?.member_name}</b>.
                </p>
              </>
            )}
          </>
        ) : (
          <>
            <h1 className="font-chalk text-2xl mb-1">Hi, {info?.member_name}!</h1>
            <p className="text-steel text-sm mb-1">
              {info?.company_name} · Member #{info?.member_number}
            </p>
            <p className="font-semibold my-4">Are you coming to the office today?</p>
            <p className="text-xs text-steel mb-5">
              Tapping YES records ₹{info?.amount} as today's canteen collection for you.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => respond(true)}
                disabled={submitting}
                className="flex-1 bg-sage hover:opacity-90 disabled:opacity-60 text-paper font-semibold py-3 rounded-full transition flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 size={16} className="animate-spin" />}✅ Yes
              </button>
              <button
                onClick={() => respond(false)}
                disabled={submitting}
                className="flex-1 border border-ink/15 hover:bg-paper2 disabled:opacity-60 font-semibold py-3 rounded-full transition"
              >
                ❌ Not today
              </button>
            </div>
          </>
        )}

        <p className="text-center text-sm text-steel mt-8">
          <Link to="/" className="text-turmeric-dark font-medium hover:underline">
            Member login
          </Link>
        </p>
      </div>
    </div>
  );
}
