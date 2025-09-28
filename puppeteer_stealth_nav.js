// puppeteer_stealth_nav.js
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

const BASE_URL = "https://app.diamondrp.ir";
const API_PATH = "/api/tops/gangs";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Set to true to suppress all logs except the raw API body
const QUIET = true;

async function run() {
  if (!QUIET) {
    console.log(
      "\n🔄 Method 2: Direct Navigation via Browser Context (Stealth)"
    );
    console.log("-".repeat(40));
  }

  puppeteer.use(StealthPlugin());

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(true);
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
    await page.setViewport({ width: 1366, height: 768 });

    // 1) Landing
    const resp = await page.goto(BASE_URL, {
      waitUntil: "networkidle0",
      timeout: 60000,
    });
    if (!QUIET) console.log(`🌐 Landing status: ${resp?.status()}`);

    // Small delay for any interstitials
    await delay(2500);

    // Detect Persian interstitial text and wait until it's gone
    const transferPhrase = "در حال انتقال به سایت مورد نظر هستید";
    let interstitialPresent = false;
    try {
      const bodyText = await page.evaluate(() =>
        document.body
          ? document.body.innerText || document.body.textContent || ""
          : ""
      );
      interstitialPresent = bodyText.includes(transferPhrase);
    } catch {}
    if (interstitialPresent) {
      if (!QUIET) {
        console.log(
          "⏳ Interstitial detected. Waiting for redirect to complete..."
        );
      }
      const start = Date.now();
      while (Date.now() - start < 20000) {
        // up to 20s
        await delay(1000);
        const txt = await page.evaluate(() =>
          document.body
            ? document.body.innerText || document.body.textContent || ""
            : ""
        );
        if (!txt.includes(transferPhrase)) {
          if (!QUIET) console.log("✅ Interstitial finished.");
          break;
        }
      }
    }

    // Handle meta refresh if exists
    try {
      const metaRefresh = await page.evaluate(() => {
        const m = document.querySelector('meta[http-equiv="refresh" i]');
        return m ? m.getAttribute("content") : null;
      });
      if (metaRefresh) {
        if (!QUIET) console.log(`🔁 Meta refresh detected: ${metaRefresh}`);
        const match = /url=([^;]+)$/i.exec(metaRefresh);
        if (match && match[1]) {
          let nextUrl = match[1].trim();
          if (nextUrl.startsWith("/")) nextUrl = `${BASE_URL}${nextUrl}`;
          if (!QUIET) console.log(`➡️ Navigating to: ${nextUrl}`);
          const r2 = await page.goto(nextUrl, {
            waitUntil: "networkidle0",
            timeout: 60000,
          });
          if (!QUIET) console.log(`🌐 Post-refresh status: ${r2?.status()}`);
          await delay(1500);
        }
      }
    } catch {}

    // Log cookies to confirm clearance/session
    try {
      if (!QUIET) {
        const cookies = await page.cookies();
        const cookieNames = cookies.map((c) => c.name);
        console.log("🍪 Cookies:", cookieNames.join(", "));
      }
    } catch {}

    // 2A) In-page fetch
    if (!QUIET) console.log("📡 In-page fetch attempt (stealth)...");
    const result = await page.evaluate(
      async (apiPath, baseUrl) => {
        async function attempt() {
          const res = await fetch(apiPath + `?_=${Date.now()}`, {
            method: "GET",
            headers: {
              Accept: "application/json, text/plain, */*",
              "X-Requested-With": "XMLHttpRequest",
              Referer: baseUrl + "/",
              Origin: baseUrl,
            },
            credentials: "include",
          });
          const text = await res.text();
          return {
            status: res.status,
            length: text.length,
            preview: text.slice(0, 300),
            contentType: res.headers.get("content-type") || "",
            fullText: text,
          };
        }

        try {
          let out = await attempt();
          // If looks like HTML interstitial, retry a couple times with small waits
          const looksHtml =
            (out.contentType || "").includes("text/html") ||
            (out.preview || "").startsWith("<!DOCTYPE html");
          if (looksHtml) {
            for (let i = 0; i < 2; i++) {
              await new Promise((r) => setTimeout(r, 1500));
              out = await attempt();
              const ok =
                (out.contentType || "").includes("application/json") ||
                out.preview.trim().startsWith("{");
              if (ok) break;
            }
          }
          return out;
        } catch (e) {
          return { error: String(e) };
        }
      },
      API_PATH,
      BASE_URL
    );

    if (result?.error) {
      // In quiet mode, print nothing on error
      if (!QUIET) console.log(`❌ Fetch error in page: ${result.error}`);
    } else {
      // Only print the raw body
      console.log(result.fullText || result.preview || "");
      return; // stop here to avoid any extra logs
    }

    // If we reached here, skip direct navigation fallback to keep output minimal
  } catch (e) {
    if (!QUIET)
      console.error("❌ Puppeteer (stealth) flow failed:", e?.message || e);
  } finally {
    await browser.close();
  }
}

run();
