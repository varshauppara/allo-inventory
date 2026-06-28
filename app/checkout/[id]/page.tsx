"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ReservationDetail } from "@/lib/types";

function useCountdown(expiresAt: string | null) {
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => {
    if (!expiresAt) return;
    const calc = () => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(diff);
    };
    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  return { secondsLeft, display: `${minutes}:${seconds.toString().padStart(2, "0")}` };
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-700",
    CONFIRMED: "bg-green-100 text-green-700",
    RELEASED: "bg-gray-100 text-gray-600",
    EXPIRED: "bg-red-100 text-red-600",
  };
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${map[status] ?? ""}`}>
      {status}
    </span>
  );
}

export default function CheckoutPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [reservation, setReservation] = useState<ReservationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { secondsLeft, display } = useCountdown(reservation?.expiresAt ?? null);

  const fetchReservation = useCallback(async () => {
    const res = await fetch(`/api/reservations/${params.id}`);
    if (res.ok) {
      setReservation(await res.json());
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    fetchReservation();
  }, [fetchReservation]);

  useEffect(() => {
    if (secondsLeft === 0 && reservation?.status === "PENDING") {
      fetchReservation();
    }
  }, [secondsLeft, reservation?.status, fetchReservation]);

  async function handleConfirm() {
    setActionLoading(true);
    setError(null);
    const res = await fetch(`/api/reservations/${params.id}/confirm`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setReservation((prev) => prev ? { ...prev, status: data.status } : null);
    } else if (res.status === 410) {
      setError("Your reservation has expired. The items have been released.");
      fetchReservation();
    } else {
      const data = await res.json();
      setError(data.error ?? "Something went wrong.");
    }
    setActionLoading(false);
  }

  async function handleCancel() {
    setActionLoading(true);
    setError(null);
    const res = await fetch(`/api/reservations/${params.id}/release`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setReservation((prev) => prev ? { ...prev, status: data.status } : null);
    } else {
      const data = await res.json();
      setError(data.error ?? "Something went wrong.");
    }
    setActionLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-lg">
        Loading reservation…
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 text-lg">Reservation not found.</p>
        <button onClick={() => router.push("/")} className="mt-4 text-indigo-600 underline">
          Back to products
        </button>
      </div>
    );
  }

  const isExpired = new Date(reservation.expiresAt) < new Date();
  const isPending = reservation.status === "PENDING" && !isExpired;

  return (
    <div className="max-w-lg mx-auto">
      <button onClick={() => router.push("/")} className="text-sm text-indigo-600 hover:underline mb-6 inline-flex items-center gap-1">
        ← Back to products
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Checkout</h1>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 font-medium">
          {error}
        </div>
      )}

      <div className="rounded-xl border bg-white shadow-sm p-6 space-y-5">
        <div className="flex gap-4 items-start">
          {reservation.product.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={reservation.product.imageUrl} alt={reservation.product.name} className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
          )}
          <div>
            <h2 className="font-semibold text-gray-900 text-lg">{reservation.product.name}</h2>
            <p className="text-gray-500 text-sm mt-0.5">From: {reservation.warehouse.name}</p>
            <p className="text-indigo-600 font-bold text-xl mt-1">
              ₹{(reservation.product.price * reservation.quantity).toLocaleString("en-IN")}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600">Status</span>
          <StatusBadge status={isExpired && reservation.status === "PENDING" ? "EXPIRED" : reservation.status} />
        </div>

        {isPending && (
          <div className={`rounded-lg p-4 text-center ${secondsLeft < 60 ? "bg-red-50 border border-red-200" : "bg-amber-50 border border-amber-200"}`}>
            <p className="text-sm text-gray-600 mb-1">Reservation expires in</p>
            <p className={`text-4xl font-mono font-bold ${secondsLeft < 60 ? "text-red-600" : "text-amber-600"}`}>
              {display}
            </p>
          </div>
        )}

        {isPending && (
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleConfirm}
              disabled={actionLoading}
              className="flex-1 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold transition disabled:opacity-60"
            >
              {actionLoading ? "Processing…" : "✓ Confirm purchase"}
            </button>
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="flex-1 py-3 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 font-semibold transition disabled:opacity-60"
            >
              ✕ Cancel
            </button>
          </div>
        )}

        {reservation.status === "CONFIRMED" && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-center">
            <p className="text-green-700 font-semibold text-lg">🎉 Purchase confirmed!</p>
            <p className="text-green-600 text-sm mt-1">Your order has been placed successfully.</p>
            <button onClick={() => router.push("/")} className="mt-4 px-6 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition">
              Shop more
            </button>
          </div>
        )}

        {(reservation.status === "RELEASED" || (isExpired && reservation.status === "PENDING")) && (
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-center">
            <p className="text-gray-700 font-semibold text-lg">Reservation ended</p>
            <p className="text-gray-500 text-sm mt-1">
              {isExpired ? "Your reservation expired." : "This reservation was cancelled."} Units have been returned to stock.
            </p>
            <button onClick={() => router.push("/")} className="mt-4 px-6 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition">
              Back to products
            </button>
          </div>
        )}
      </div>
    </div>
  );
}