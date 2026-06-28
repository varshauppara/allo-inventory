"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { ProductWithStock } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [reserving, setReserving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selections, setSelections] = useState<
    Record<string, { warehouseId: string; quantity: number }>
  >({});

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((data) => {
        setProducts(data);
        const init: typeof selections = {};
        data.forEach((p: ProductWithStock) => {
          const first = p.stock.find((s) => s.available > 0);
          if (first) {
            init[p.id] = { warehouseId: first.warehouseId, quantity: 1 };
          }
        });
        setSelections(init);
        setLoading(false);
      });
  }, []);

  async function handleReserve(productId: string) {
    const sel = selections[productId];
    if (!sel) return;
    setReserving(productId);
    setError(null);

    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        warehouseId: sel.warehouseId,
        quantity: sel.quantity,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/checkout/${data.id}`);
    } else if (res.status === 409) {
      setError("Not enough stock available — someone else may have just reserved it.");
    } else {
      setError("Something went wrong. Please try again.");
    }
    setReserving(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-lg">
        Loading products…
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Products</h1>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((product) => {
          const sel = selections[product.id];
          const totalAvailable = product.stock.reduce((s, w) => s + w.available, 0);

          return (
            <div key={product.id} className="rounded-xl border bg-white shadow-sm overflow-hidden flex flex-col">
              {product.imageUrl && (
                <div className="relative h-48 bg-gray-100">
                  <Image
                    src={product.imageUrl}
                    alt={product.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
              )}
              <div className="p-5 flex flex-col gap-3 flex-1">
                <div>
                  <h2 className="font-semibold text-gray-900 text-lg">{product.name}</h2>
                  {product.description && (
                    <p className="text-sm text-gray-500 mt-1">{product.description}</p>
                  )}
                </div>

                <p className="text-2xl font-bold text-indigo-600">
                  ₹{product.price.toLocaleString("en-IN")}
                </p>

                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  <p className="font-medium text-gray-700 mb-2">Stock by warehouse</p>
                  {product.stock.map((s) => (
                    <div key={s.warehouseId} className="flex justify-between py-0.5">
                      <span className="text-gray-600">{s.warehouseName}</span>
                      <span className={s.available === 0 ? "text-red-500 font-medium" : "text-green-600 font-medium"}>
                        {s.available} available
                      </span>
                    </div>
                  ))}
                </div>

                {totalAvailable === 0 ? (
                  <button disabled className="mt-auto py-2 rounded-lg bg-gray-100 text-gray-400 font-medium cursor-not-allowed">
                    Out of stock
                  </button>
                ) : (
                  <div className="mt-auto flex flex-col gap-2">
                    <div className="flex gap-2">
                      <select
                        value={sel?.warehouseId ?? ""}
                        onChange={(e) =>
                          setSelections((prev) => ({
                            ...prev,
                            [product.id]: { ...prev[product.id], warehouseId: e.target.value },
                          }))
                        }
                        className="flex-1 border rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
                      >
                        {product.stock.filter((s) => s.available > 0).map((s) => (
                          <option key={s.warehouseId} value={s.warehouseId}>
                            {s.warehouseName}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        max={product.stock.find((s) => s.warehouseId === sel?.warehouseId)?.available ?? 1}
                        value={sel?.quantity ?? 1}
                        onChange={(e) =>
                          setSelections((prev) => ({
                            ...prev,
                            [product.id]: { ...prev[product.id], quantity: Math.max(1, Number(e.target.value)) },
                          }))
                        }
                        className="w-16 border rounded-lg px-3 py-2 text-sm text-center"
                      />
                    </div>
                    <button
                      onClick={() => handleReserve(product.id)}
                      disabled={reserving === product.id}
                      className="py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition disabled:opacity-60"
                    >
                      {reserving === product.id ? "Reserving…" : "Reserve"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}