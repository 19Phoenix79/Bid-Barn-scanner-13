// -----------------------------
// WooCommerce CSV Exporter App
// -----------------------------

// === Selectors ===
const exportBtn = document.getElementById("exportBtn");
const toast = document.getElementById("toast");

// === Toast notifications ===
function showToast(message) {
  if (!toast) {
    console.log("Toast:", message);
    return;
  }
  toast.innerText = message;
  toast.style.opacity = 1;
  setTimeout(() => (toast.style.opacity = 0), 4000);
}

// === Dummy item data (replace this with your real list) ===
let allItems = [
  { sku: "1010438319", name: "S7A WASHLET ELONGATED ELECTRIC HEATE", brand: "TOTO", price: 650 },
  { sku: "1005437420", name: "Merryfield 49 in. Sink Vanity", brand: "Home Decorators", price: 999 },
  { sku: "19112-VS49-DG", name: "Dark Grey Vanity", brand: "Vanity Co.", price: 875 },
];

// -----------------------------
// Fetch stock photo (placeholder)
// -----------------------------
const fetchStockPhoto = async (sku, desc, brand) => {
  try {
    const safeText = encodeURIComponent(desc?.slice(0, 60) || brand || sku);
    return `https://via.placeholder.com/600x600.png?text=${safeText}`;
  } catch (e) {
    console.warn("Image fetch failed for", sku, e);
    return `https://via.placeholder.com/600x600.png?text=${encodeURIComponent(sku)}`;
  }
};

// -----------------------------
// Delay helper (prevents spammy fetches)
// -----------------------------
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// -----------------------------
// CSV Export Function
// -----------------------------
function exportToCSV(items) {
  if (!items.length) {
    showToast("No items to export!");
    return;
  }

  const headers = Object.keys(items[0]);
  const csvRows = [headers.join(",")];

  for (const item of items) {
    const values = headers.map((h) => `"${(item[h] ?? "").toString().replace(/"/g, '""')}"`);
    csvRows.push(values.join(","));
  }

  const csvString = csvRows.join("\n");
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `WooCommerce_Export_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// -----------------------------
// Export button logic
// -----------------------------
exportBtn.addEventListener("click", async () => {
  if (!allItems.length) {
    showToast("No items to export");
    return;
  }

  showToast("Starting image lookup (this may take a moment)...");
  console.log("Export: fetching images for", allItems.length, "items...");

  const enrichedItems = [];

  for (const item of allItems) {
    const imageUrl = await fetchStockPhoto(item.sku, item.name, item.brand);
    enrichedItems.push({ ...item, imageUrl });
    await delay(300);
  }

  showToast("Image lookup complete. Generating CSV...");
  console.log("Image lookup complete:", enrichedItems);

  exportToCSV(enrichedItems);
  showToast("WooCommerce CSV exported successfully!");
});
