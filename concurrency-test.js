const API_URL = "http://localhost:3000/api/reservations";
const PRODUCT_ID = "cmqxm9jec0003hscqw2tb4be5";;
const WAREHOUSE_ID = "cmqxm9j1k0000hscq2ut72x1y";

async function reserve(i) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: PRODUCT_ID, warehouseId: WAREHOUSE_ID, quantity: 1 }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`Request ${i}: status=${res.status}`, body);
  return res.status;
}

async function main() {
  const N = 15;
  const results = await Promise.all(Array.from({ length: N }, (_, i) => reserve(i)));
  const successes = results.filter((s) => s === 200 || s === 201).length;
  const conflicts = results.filter((s) => s === 409).length;
  console.log(`\nSuccesses: ${successes}, Conflicts (409): ${conflicts}`);
}

main();