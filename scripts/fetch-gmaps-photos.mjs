/**
 * One-off: collect Google Maps listing photo URLs (lh3.googleusercontent.com) and save to assets/office/.
 * Run: node scripts/fetch-gmaps-photos.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "assets", "office");

// Prefer /photos so the gallery loads more thumbnails
const url =
  "https://www.google.com/maps/place/Ultimate+Smile/@40.7053931,-73.6543139,17z/data=!3m1!4b1!4m6!3m5!1s0x89c26332d931565f:0x524679f8ab5b9289!8m2!3d40.7053931!4d-73.6543139!16s%2Fg%2F1tj2jtq5/photos?entry=ttu";

function normalizePhotoUrl(u) {
  if (!u || typeof u !== "string") return null;
  if (!u.includes("googleusercontent.com")) return null;
  // Request a consistent size for the site (good quality, not huge)
  const base = u.split("=")[0];
  return `${base}=w800-h600-k-no`;
}

async function collectUrls(page) {
  return page.evaluate(() => {
    const out = new Set();
    document.querySelectorAll("img[src]").forEach((img) => {
      const s = img.getAttribute("src") || "";
      if (s.includes("googleusercontent.com")) out.add(s);
    });
    document.querySelectorAll("[style*='googleusercontent']").forEach((el) => {
      const m = el.getAttribute("style")?.match(/url\(["']?([^"')]+)/);
      if (m?.[1]?.includes("googleusercontent.com")) out.add(m[1]);
    });
    return [...out];
  });
}

const networkUrls = new Set();
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
page.on("response", async (res) => {
  try {
    const u = res.url();
    const ct = res.headers()["content-type"] || "";
    if (!u.includes("lh3.googleusercontent.com") && !u.includes("lh4.googleusercontent.com")) return;
    if (!ct.includes("image") && !u.match(/\.(jpg|jpeg|png|webp)(\?|$)/i)) return;
    // Skip tiny UI assets
    if (u.includes("favicon") || u.includes("icon")) return;
    networkUrls.add(u.split("=")[0]);
  } catch (_) {}
});
await page.setViewport({ width: 1400, height: 900 });
await page.setUserAgent(
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
);
await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });
await new Promise((r) => setTimeout(r, 4000));

// Open Photos tab if we landed on overview (English UI)
await page.evaluate(() => {
  const candidates = [...document.querySelectorAll("button, a, [role='tab']")];
  const photos = candidates.find(
    (el) => /^\s*photos\s*$/i.test(el.textContent?.trim() || "") || el.getAttribute("aria-label")?.toLowerCase().includes("photo")
  );
  if (photos) photos.click();
});
await new Promise((r) => setTimeout(r, 3000));

// Click first large listing image to open viewer (more img[src] load)
await page.evaluate(() => {
  const imgs = [...document.querySelectorAll("img[src*='googleusercontent.com']")];
  const big = imgs.find((im) => (im.naturalWidth || im.width) > 120);
  if (big) big.click();
});
await new Promise((r) => setTimeout(r, 2000));

// Scroll sidebar / gallery to lazy-load thumbnails
for (let i = 0; i < 8; i++) {
  await page.evaluate(() => {
    const scrollables = document.querySelectorAll("[role='main'], [role='region'], .m6QErb");
    scrollables.forEach((el) => {
      try {
        el.scrollTop += 400;
      } catch (_) {}
    });
    window.scrollBy(0, 300);
  });
  await new Promise((r) => setTimeout(r, 600));
}

let urls = await collectUrls(page);
for (const u of networkUrls) urls.push(u);

// Dedupe by path prefix (same photo, different size params)
const seen = new Set();
const unique = [];
for (const u of urls) {
  const key = u.split("googleusercontent.com")[1]?.split("=")[0] || u;
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(u);
}

// Prefer listing photos (often /p/ or gps-cs-s); drop tiny icons if any
const filtered = unique.filter((u) => {
  if (u.includes("gstatic.com")) return false;
  return true;
});

await browser.close();

const normalized = filtered.map(normalizePhotoUrl).filter(Boolean).slice(0, 8);

console.error("Found URLs:", normalized.length);
normalized.forEach((u, i) => console.error(i + 1, u.slice(0, 90) + "…"));

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (let i = 0; i < normalized.length; i++) {
  const u = normalized[i];
  const dest = path.join(outDir, `office-gmaps-${String(i + 1).padStart(2, "0")}.jpg`);
  const res = await fetch(u, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: "https://www.google.com/",
    },
  });
  if (!res.ok) {
    console.error("Failed", res.status, u);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  console.error("Wrote", dest, buf.length);
}

if (normalized.length === 0) {
  console.error("No photos collected — check Maps UI or run with headless: false to debug.");
  process.exit(1);
}
