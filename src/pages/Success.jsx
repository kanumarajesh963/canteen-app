import React from "react";
import { useParams, Link } from "react-router-dom";
import { useStore } from "../lib/StoreContext";
import TokenReceipt from "../components/TokenReceipt";

export default function Success() {
  const { orderId } = useParams();
  const { orders, company } = useStore();
  const order = orders.find((o) => o.id === orderId);

  if (!order) {
    return (
      <div className="max-w-md mx-auto text-center py-24 px-4">
        <p className="text-steel mb-4">We couldn't find that order.</p>
        <Link to={`/${company.slug}`} className="text-sage font-semibold underline">Back to the counter</Link>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-10">
      <div className="text-center mb-6">
        <span className="inline-block text-5xl mb-2 animate-pop-in">✅</span>
        <h1 className="font-chalk font-bold text-3xl sm:text-4xl animate-fade-in-up" style={{ animationDelay: "100ms" }}>
          Booking confirmed!
        </h1>
        <p className="text-steel text-sm animate-fade-in-up" style={{ animationDelay: "160ms" }}>
          Keep this token handy — the status below updates live as the counter prepares it.
        </p>
      </div>

      <TokenReceipt order={order} />

      <div className="text-center mt-8">
        <Link
          to={`/${company.slug}`}
          className="inline-block bg-board text-paper font-semibold px-6 py-3 rounded-full hover:bg-board-light transition"
        >
          Book something else
        </Link>
      </div>
    </div>
  );
}
