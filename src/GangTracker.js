const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const puppeteer = require("puppeteer");

class GangTracker {
  constructor() {
    this.gangs = [];
    this.dailyXp = [];
    this.weeklyXp = [];
    this.monthlyXp = [];
    this.dataFile = path.join(__dirname, "..", "data", "gangs.json");
    this.dailyXpFile = path.join(__dirname, "..", "data", "daily_xp.json");
    this.weeklyXpFile = path.join(__dirname, "..", "data", "weekly_xp.json");
    this.monthlyXpFile = path.join(__dirname, "..", "data", "monthly_xp.json");
    this.apiUrl = "https://app.diamondrp.ir/api/tops/gangs";
    this.lastResetDate = null;
    this.lastWeeklyResetDate = null;
    this.lastMonthlyResetDate = null;

    this.loadData();
  }

  async loadData() {
    // Don't load any existing data - start fresh every time
    console.log("🔄 Starting fresh - no data loaded from storage");
    this.gangs = [];
    this.dailyXp = [];
    this.weeklyXp = [];
    this.monthlyXp = [];
    this.lastResetDate = null;
    this.lastWeeklyResetDate = null;
    this.lastMonthlyResetDate = null;
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Direct browser method - هر بار مستقیم از API بگیره (مثل کد قبلی)
  async fetchGangData() {
    console.log("🤖 Fetching gang data using browser method...");

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

      const baseUrl = "https://app.diamondrp.ir";

      // 1) Landing
      console.log("🌐 Landing on main site...");
      const resp = await page.goto(baseUrl, {
        waitUntil: "networkidle0",
        timeout: 60000,
      });
      console.log(`📊 Landing status: ${resp?.status()}`);

      // Small delay for any interstitials
      await this.delay(2500);

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
        console.log(
          "⏳ Interstitial detected. Waiting for redirect to complete..."
        );
        const start = Date.now();
        while (Date.now() - start < 20000) {
          // up to 20s
          await this.delay(1000);
          const txt = await page.evaluate(() =>
            document.body
              ? document.body.innerText || document.body.textContent || ""
              : ""
          );
          if (!txt.includes(transferPhrase)) {
            console.log("✅ Interstitial finished.");
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
          console.log(`🔁 Meta refresh detected: ${metaRefresh}`);
          const match = /url=([^;]+)$/i.exec(metaRefresh);
          if (match && match[1]) {
            let nextUrl = match[1].trim();
            if (nextUrl.startsWith("/")) nextUrl = `${baseUrl}${nextUrl}`;
            console.log(`➡️ Navigating to: ${nextUrl}`);
            const r2 = await page.goto(nextUrl, {
              waitUntil: "networkidle0",
              timeout: 60000,
            });
            console.log(`🌐 Post-refresh status: ${r2?.status()}`);
            await this.delay(1500);
          }
        }
      } catch {}

      // Log cookies to confirm clearance/session
      try {
        const cookies = await page.cookies();
        const cookieNames = cookies.map((c) => c.name);
        console.log("🍪 Cookies:", cookieNames.join(", "));
      } catch {}

      // 2A) In-page fetch
      console.log("📡 In-page fetch attempt...");
      const apiPath = "/api/tops/gangs";
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
        apiPath,
        baseUrl
      );

      await browser.close();

      if (result?.error) {
        throw new Error(`Fetch error in page: ${result.error}`);
      }

      // Parse the JSON response
      let data;
      try {
        data = JSON.parse(result.fullText || result.preview || "{}");
      } catch (parseError) {
        throw new Error("Invalid JSON response format");
      }

      // Validate the expected API structure
      if (!data || !data.tops || !Array.isArray(data.tops)) {
        throw new Error("Invalid API response structure");
      }

      const gangs = data.tops;

      // Sort gangs by XP in descending order and assign correct ranks
      const sortedGangs = gangs.sort((a, b) => b.xp - a.xp);
      sortedGangs.forEach((gang, index) => {
        gang.level = gang.rank; // Keep original API rank as level
        gang.rank = index + 1; // Calculate correct rank based on XP order
      });

      console.log(
        `🌐 Successfully fetched ${gangs.length} gangs and calculated ranks`
      );

      // Log first gang for debugging
      if (gangs.length > 0) {
        console.log(`📊 Sample gang data:`, {
          name: gangs[0].gang_name,
          xp: gangs[0].xp,
          rank: gangs[0].rank,
          level: gangs[0].level,
        });
      }

      return sortedGangs;
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  // باقی method های ضروری برای عملکرد bot
  async updateGangData() {
    try {
      const newGangs = await this.fetchGangData();
      const oldGangs = [...this.gangs];
      this.gangs = newGangs;

      await this.saveGangData();
      this.checkAllResets();

      if (oldGangs.length === 0) {
        console.log("🔄 First load - initializing daily XP data for all gangs");
        this.dailyXp = newGangs.map((gang) => ({
          gang_name: gang.gang_name,
          totalXp: 0,
          task1Completed: false,
          task2Completed: false,
          task1Xp: 0,
          task2Xp: 0,
        }));
        await this.saveDailyXpData();
        console.log(
          `✅ Initialized daily XP data for ${this.dailyXp.length} gangs`
        );
      }

      const changes = this.compareGangDataWithOld(newGangs, oldGangs);
      if (changes.length > 0) {
        console.log(
          `✅ Updated gang data. ${changes.length} changes detected.`
        );
        this.updateDailyXp(changes);
        this.updateWeeklyXp(changes);
        this.updateMonthlyXp(changes);
        return changes;
      } else {
        console.log("✅ Gang data updated, no changes detected.");
        return [];
      }
    } catch (error) {
      console.error("❌ Error updating gang data:", error);
      throw error;
    }
  }

  compareGangDataWithOld(newData, oldData) {
    const changes = [];
    if (oldData.length === 0) {
      console.log("📊 First data load - no changes to report");
      return changes;
    }

    newData.forEach((newGang) => {
      const oldGang = oldData.find(
        (gang) => gang.gang_name === newGang.gang_name
      );

      if (oldGang) {
        const xpChange = newGang.xp - oldGang.xp;
        const levelChange = newGang.level - oldGang.level;
        const rankChange = newGang.rank - oldGang.rank;

        if (xpChange !== 0 || levelChange !== 0 || rankChange !== 0) {
          changes.push({
            gang_name: newGang.gang_name,
            oldXp: oldGang.xp,
            newXp: newGang.xp,
            xpChange: xpChange,
            oldLevel: oldGang.level,
            newLevel: newGang.level,
            levelChange: levelChange,
            oldRank: oldGang.rank,
            newRank: newGang.rank,
            rankChange: rankChange,
            rank: newGang.rank,
          });
        }
      } else {
        changes.push({
          gang_name: newGang.gang_name,
          oldXp: 0,
          newXp: newGang.xp,
          xpChange: newGang.xp,
          oldLevel: 0,
          newLevel: newGang.level,
          levelChange: newGang.level,
          oldRank: 0,
          newRank: newGang.rank,
          rankChange: 0,
          rank: newGang.rank,
          isNew: true,
        });
      }
    });

    return changes;
  }

  checkAllResets() {
    const now = new Date();
    const iranTime = new Date(now.getTime() + 3.5 * 60 * 60 * 1000);
    console.log(`🕐 Current Iran time: ${iranTime.toLocaleString()}`);

    this.checkDailyReset();
    this.checkWeeklyReset();
    this.checkMonthlyReset();
  }

  checkDailyReset() {
    const now = new Date();
    const iranTime = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Tehran" })
    );

    if (!this.lastResetDate) {
      this.lastResetDate = iranTime;
      console.log("📅 First run - setting lastResetDate, no reset performed");
      return false;
    }

    const lastReset = new Date(this.lastResetDate);
    const lastResetIran = new Date(
      lastReset.toLocaleString("en-US", { timeZone: "Asia/Tehran" })
    );

    const shouldReset =
      iranTime.getHours() === 7 &&
      iranTime.getMinutes() === 0 &&
      (iranTime.getDate() !== lastResetIran.getDate() ||
        iranTime.getMonth() !== lastResetIran.getMonth() ||
        iranTime.getFullYear() !== lastResetIran.getFullYear());

    if (shouldReset) {
      console.log(
        `🕐 Daily reset triggered at Iran time: ${iranTime.toLocaleString()}`
      );

      this.dailyXp.forEach((gang) => {
        gang.totalXp = 0;
        gang.task1Completed = false;
        gang.task2Completed = false;
        gang.task1Xp = 0;
        gang.task2Xp = 0;
      });
      this.lastResetDate = iranTime;
      this.saveDailyXpData();
      console.log("🔄 Daily XP reset completed");
      return true;
    }

    return false;
  }

  checkWeeklyReset() {
    const now = new Date();
    const iranTime = new Date(now.getTime() + 3.5 * 60 * 60 * 1000);

    if (!this.lastWeeklyResetDate) {
      this.lastWeeklyResetDate = iranTime;
      return false;
    }

    const lastReset = new Date(this.lastWeeklyResetDate);
    const lastResetIran = new Date(lastReset.getTime() + 3.5 * 60 * 60 * 1000);

    const shouldReset =
      iranTime.getHours() === 7 &&
      iranTime.getMinutes() < 1 &&
      iranTime.getDay() === 0 &&
      Math.floor((iranTime - lastResetIran) / (1000 * 60 * 60 * 24)) >= 7;

    if (shouldReset) {
      console.log(
        `🕐 Weekly reset triggered at Iran time: ${iranTime.toLocaleString()}`
      );
      this.weeklyXp = [];
      this.lastWeeklyResetDate = iranTime;
      this.saveWeeklyXpData();
      console.log("🔄 Weekly XP reset completed");
      return true;
    }

    return false;
  }

  checkMonthlyReset() {
    const now = new Date();
    const iranTime = new Date(now.getTime() + 3.5 * 60 * 60 * 1000);

    if (!this.lastMonthlyResetDate) {
      this.lastMonthlyResetDate = iranTime;
      return false;
    }

    const lastReset = new Date(this.lastMonthlyResetDate);
    const lastResetIran = new Date(lastReset.getTime() + 3.5 * 60 * 60 * 1000);

    const shouldReset =
      iranTime.getHours() === 7 &&
      iranTime.getMinutes() < 1 &&
      iranTime.getDate() === 1 &&
      (iranTime.getMonth() !== lastResetIran.getMonth() ||
        iranTime.getFullYear() !== lastResetIran.getFullYear());

    if (shouldReset) {
      console.log(
        `🕐 Monthly reset triggered at Iran time: ${iranTime.toLocaleString()}`
      );
      this.monthlyXp = [];
      this.lastMonthlyResetDate = iranTime;
      this.saveMonthlyXpData();
      console.log("🔄 Monthly XP reset completed");
      return true;
    }

    return false;
  }

  updateDailyXp(changes) {
    changes.forEach((change) => {
      if (change.xpChange > 0) {
        let gangDailyXp = this.dailyXp.find(
          (gang) => gang.gang_name === change.gang_name
        );

        if (!gangDailyXp) {
          gangDailyXp = {
            gang_name: change.gang_name,
            totalXp: 0,
            task1Completed: false,
            task2Completed: false,
            task1Xp: 0,
            task2Xp: 0,
          };
          this.dailyXp.push(gangDailyXp);
        }

        gangDailyXp.totalXp += change.xpChange;

        const now = new Date();
        const iranTime = new Date(now.getTime() + 3.5 * 60 * 60 * 1000);
        const hour = iranTime.getHours();

        if (hour >= 7 && hour < 18) {
          if (!gangDailyXp.task1Completed && change.xpChange === 500) {
            gangDailyXp.task1Completed = true;
            gangDailyXp.task1Xp = 500;
            console.log(
              `✅ Task 1 completed for ${
                change.gang_name
              } at Iran time: ${iranTime.toLocaleString()}`
            );
          }
        } else {
          if (!gangDailyXp.task2Completed && change.xpChange === 500) {
            gangDailyXp.task2Completed = true;
            gangDailyXp.task2Xp = 500;
            console.log(
              `✅ Task 2 completed for ${
                change.gang_name
              } at Iran time: ${iranTime.toLocaleString()}`
            );
          }
        }
      }
    });

    this.saveDailyXpData();
  }

  updateWeeklyXp(changes) {
    this.checkWeeklyReset();

    changes.forEach((change) => {
      if (change.xpChange > 0) {
        let gangWeeklyXp = this.weeklyXp.find(
          (gang) => gang.gang_name === change.gang_name
        );

        if (!gangWeeklyXp) {
          gangWeeklyXp = { gang_name: change.gang_name, totalXp: 0 };
          this.weeklyXp.push(gangWeeklyXp);
        }

        gangWeeklyXp.totalXp += change.xpChange;
      }
    });

    this.saveWeeklyXpData();
  }

  updateMonthlyXp(changes) {
    this.checkMonthlyReset();

    changes.forEach((change) => {
      if (change.xpChange > 0) {
        let gangMonthlyXp = this.monthlyXp.find(
          (gang) => gang.gang_name === change.gang_name
        );

        if (!gangMonthlyXp) {
          gangMonthlyXp = { gang_name: change.gang_name, totalXp: 0 };
          this.monthlyXp.push(gangMonthlyXp);
        }

        gangMonthlyXp.totalXp += change.xpChange;
      }
    });

    this.saveMonthlyXpData();
  }

  // Save methods
  async saveGangData() {
    try {
      const data = {
        gangs: this.gangs,
        lastResetDate: this.lastResetDate,
        lastUpdate: new Date().toISOString(),
      };
      await fs.writeJson(this.dataFile, data, { spaces: 2 });
      console.log("💾 Gang data saved successfully");
    } catch (error) {
      console.error("❌ Error saving gang data:", error);
    }
  }

  async saveDailyXpData() {
    try {
      const data = {
        dailyXp: this.dailyXp,
        lastUpdate: new Date().toISOString(),
      };
      await fs.writeJson(this.dailyXpFile, data, { spaces: 2 });
      console.log("💾 Daily XP data saved successfully");
    } catch (error) {
      console.error("❌ Error saving daily XP data:", error);
    }
  }

  async saveWeeklyXpData() {
    try {
      const data = {
        weeklyXp: this.weeklyXp,
        lastUpdate: new Date().toISOString(),
      };
      await fs.writeJson(this.weeklyXpFile, data, { spaces: 2 });
      console.log("💾 Weekly XP data saved successfully");
    } catch (error) {
      console.error("❌ Error saving weekly XP data:", error);
    }
  }

  async saveMonthlyXpData() {
    try {
      const data = {
        monthlyXp: this.monthlyXp,
        lastMonthlyResetDate: this.lastMonthlyResetDate,
        lastUpdate: new Date().toISOString(),
      };
      await fs.writeJson(this.monthlyXpFile, data, { spaces: 2 });
      console.log("💾 Monthly XP data saved successfully");
    } catch (error) {
      console.error("❌ Error saving monthly XP data:", error);
    }
  }

  // Getter methods
  getGangs() {
    return this.gangs;
  }

  getGangsWithDailyXp() {
    return this.gangs.map((gang) => {
      const dailyXpData = this.dailyXp.find(
        (d) => d.gang_name === gang.gang_name
      );
      const weeklyXpData = this.weeklyXp.find(
        (w) => w.gang_name === gang.gang_name
      );
      const monthlyXpData = this.monthlyXp.find(
        (m) => m.gang_name === gang.gang_name
      );

      return {
        ...gang,
        dailyXp: dailyXpData ? dailyXpData.totalXp : 0,
        weeklyXp: weeklyXpData ? weeklyXpData.totalXp : 0,
        monthlyXp: monthlyXpData ? monthlyXpData.totalXp : 0,
        task1Completed: dailyXpData ? dailyXpData.task1Completed : false,
        task2Completed: dailyXpData ? dailyXpData.task2Completed : false,
        task1Xp: dailyXpData ? dailyXpData.task1Xp : 0,
        task2Xp: dailyXpData ? dailyXpData.task2Xp : 0,
      };
    });
  }
}

module.exports = GangTracker;
