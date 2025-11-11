// -----------------------------
// WooCommerce Product Importer – Multi-Vendor + Auto Category Sync
// -----------------------------

const importBtn = document.getElementById("importBtn");
const uploadBtn = document.getElementById("uploadBtn");
const toast = document.getElementById("toast");

function showToast(message) {
  if (!toast) return console.log("Toast:", message);
  toast.innerText = message;
  toast.style.opacity = 1;
  setTimeout(() => (toast.style.opacity = 0), 4000);
}

let allItems = [];
let wooCategories = [];

const UNSPLASH_KEY = "D5LVeLM5MZKOJNhrIkjJE72QA20KOhpCk71l1R99Guw";
const WC_API_BASE = "https://bidbarn.bid/wp-json/wc/v3";
const CONSUMER_KEY = "ck_d55a9ed6d41a3d9a81ca11c768784466e295d2ff";
const CONSUMER_SECRET = "cs_e758596896402d908099ff144cb09bd158ca4d21";

// --- Helpers ---
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// -----------------------------
// 1️⃣  Load existing WooCommerce categories
// -----------------------------
async function loadWooCategories() {
  try {
    const res = await fetch(`${WC_API_BASE}/products/categories?per_page=100`, {
      headers: {
        Authorization: "Basic " + btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`),
      },
    });
    const data = await res.json();
    wooCategories = Array.isArray(data) ? data : [];
    console.log("Loaded WooCommerce categories:", wooCategories.map((c) => c.name));
  } catch (err) {
    console.warn("⚠️ Could not fetch Woo categories:", err);
  }
}

// -----------------------------
// 2️⃣  Create a new category if not found
// -----------------------------
async function ensureCategory(name) {
  const existing = wooCategories.find(
    (c) => c.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) return existing.id;

  console.log("🆕 Creating new category:", name);
  try {
    const res = await fetch(`${WC_API_BASE}/products/categories`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to create category");
    wooCategories.push(data);
    return data.id;
  } catch (err) {
    console.warn("❌ Category creation failed for", name, err);
    return null;
  }
}

// -----------------------------
// 3️⃣  Detect category by keywords
// -----------------------------
function detectCategory(desc = "") {
  const d = desc.toLowerCase();
  if (d.includes("vanity") || d.includes("bath") || d.includes("toilet")) return "Bath";
  if (d.includes("sink") || d.includes("kitchen") || d.includes("faucet")) return "Kitchen";
  if (d.includes("light") || d.includes("chandelier") || d.includes("lamp")) return "Lighting";
  if (d.includes("washer") || d.includes("dryer") || d.includes("fridge")) return "Appliances";
  if (d.includes("drill") || d.includes("tool") || d.includes("saw")) return "Tools";
  if (d.includes("chair") || d.includes("sofa") || d.includes("table")) return "Furniture";
  return "General Merchandise";
}

// -----------------------------
// 4️⃣  CSV Importer
// -----------------------------
importBtn.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const text = ev.target.result;
    const rows = text.split("\n").map((r) => r.split(","));
    const headers = rows[0];
    allItems = rows.slice(1).map((r) => {
      let obj = {};
      headers.forEach((h, i) => (obj[h.trim()] = r[i]?.trim() ?? ""));
      return obj;
    });
    console.log("Imported items:", allItems.length, allItems);
    showToast(`Imported ${allItems.length} items`);
  };
  reader.readAsText(file);
});

// -----------------------------
// 5️⃣  Fetch Unsplash image
// -----------------------------
async function fetchUnsplashImage(query) {
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&client_id=${UNSPLASH_KEY}`
    );
    const data = await res.json();
    return data.results?.[0]?.urls?.regular || null;
  } catch (err) {
    console.warn("Unsplash fetch failed for", query, err);
    return null;
  }
}

// -----------------------------
// 6️⃣  Upload image to WP Media
// -----------------------------
async function uploadImageToWP(imageUrl, fileName = "photo.jpg") {
  try {
    const imgRes = await fetch(imageUrl);
    const blob = await imgRes.blob();
    const formData = new FormData();
    formData.append("file", blob, fileName);

    const uploadRes = await fetch(`${WC_API_BASE}/media`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`),
      },
      body: formData,
    });

    const data = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(data.message);
    return data.id;
  } catch (err) {
    console.warn("⚠️ WP upload failed:", err);
    return null;
  }
}

// -----------------------------
// 7️⃣  Create product in WooCommerce
// -----------------------------
async function createWooProduct(item) {
  const title =
    item["Item Description"] || item["Description"] || item["Product Name"] || "Untitled";

  const sku =
    item["SKU"] || item["Sku"] || item["Item #"] || item["Item ID"] || "";

  const cost = parseFloat(
    item["Price"]?.replace(/[^0-9.]/g, "") ||
      item["Cost"]?.replace(/[^0-9.]/g, "") ||
      "0"
  );

  const catName = detectCategory(title);
  const catId = await ensureCategory(catName);

  let imageUrl =
    item["Image"] || item["Image URL"] || item["Photo"] || "";

  if (!imageUrl || !imageUrl.startsWith("http")) {
    const q = title.split(" ").slice(0, 5).join(" ");
    imageUrl = await fetchUnsplashImage(q);
  }

  const imageId = imageUrl ? await uploadImageToWP(imageUrl, `${sku || title}.jpg`) : null;

  const payload = {
    name: title,
    type: "auction",
    regular_price: cost.toFixed(2),
    description: `Auction starting at cost $${cost.toFixed(2)}`,
    categories: catId ? [{ id: catId }] : [],
    images: imageId ? [{ id: imageId }] : [],
    sku,
  };

  try {
    const res = await fetch(`${WC_API_BASE}/products`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    console.log(`✅ Uploaded: ${title} [${catName}]`);
  } catch (err) {
    console.error("❌ Product upload failed:", err);
  }
}

// -----------------------------
// 8️⃣  Upload button handler
// -----------------------------
uploadBtn.addEventListener("click", async () => {
  if (!allItems.length) return showToast("No items imported");
  await loadWooCategories();

  showToast(`Uploading ${allItems.length} products...`);
  for (const [i, item] of allItems.entries()) {
    await createWooProduct(item);
    console.log(`[${i + 1}/${allItems.length}] done`);
    await delay(1500);
  }
  showToast("✅ Upload complete!");
});
