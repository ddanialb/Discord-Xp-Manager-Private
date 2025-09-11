const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

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
    await this.loadGangData();
    await this.loadDailyXpData();
    await this.loadWeeklyXpData();
    await this.loadMonthlyXpData();
  }

  async loadGangData() {
    try {
      if (await fs.pathExists(this.dataFile)) {
        const data = await fs.readJson(this.dataFile);
        this.gangs = data.gangs || [];
        this.lastResetDate = data.lastResetDate || null;
        console.log(`📁 Loaded ${this.gangs.length} gangs from storage`);
      } else {
        console.log("📁 No existing gang data found");
      }
    } catch (error) {
      console.error("❌ Error loading gang data:", error);
      this.gangs = [];
    }
  }

  async loadDailyXpData() {
    try {
      if (await fs.pathExists(this.dailyXpFile)) {
        const data = await fs.readJson(this.dailyXpFile);
        this.dailyXp = data.dailyXp || [];
        console.log(`📁 Loaded daily XP data for ${this.dailyXp.length} gangs`);
      } else {
        console.log("📁 No existing daily XP data found");
      }
    } catch (error) {
      console.error("❌ Error loading daily XP data:", error);
      this.dailyXp = [];
    }
  }

  async loadWeeklyXpData() {
    try {
      if (await fs.pathExists(this.weeklyXpFile)) {
        const data = await fs.readJson(this.weeklyXpFile);
        this.weeklyXp = data.weeklyXp || [];
        console.log(
          `📁 Loaded weekly XP data for ${this.weeklyXp.length} gangs`
        );
      } else {
        console.log("📁 No existing weekly XP data found");
      }
    } catch (error) {
      console.error("❌ Error loading weekly XP data:", error);
      this.weeklyXp = [];
    }
  }

  async loadMonthlyXpData() {
    try {
      if (await fs.pathExists(this.monthlyXpFile)) {
        const data = await fs.readJson(this.monthlyXpFile);
        this.monthlyXp = data.monthlyXp || [];
        this.lastMonthlyResetDate = data.lastMonthlyResetDate || null;
        console.log(
          `📁 Loaded monthly XP data for ${this.monthlyXp.length} gangs`
        );
      } else {
        console.log("📁 No existing monthly XP data found");
      }
    } catch (error) {
      console.error("❌ Error loading monthly XP data:", error);
      this.monthlyXp = [];
    }
  }

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

  async fetchGangData() {
    try {
      console.log("📡 Fetching gang data...");
      const response = await axios.get(this.apiUrl, {
        timeout: 10000,
        headers: {
          "User-Agent": "Discord Gang Tracker Bot",
          Accept: "application/json",
        },
      });

      if (
        !response.data ||
        !response.data.tops ||
        !Array.isArray(response.data.tops)
      ) {
        throw new Error("Invalid API response format");
      }

      const gangs = response.data.tops;
      console.log(`🌐 Successfully fetched ${gangs.length} gangs`);
      return gangs;
    } catch (error) {
      console.error("❌ Error fetching gang data:", error);
      throw error;
    }
  }

  async updateGangData() {
    try {
      const newGangs = await this.fetchGangData();
      const oldGangs = [...this.gangs];
      this.gangs = newGangs;

      await this.saveGangData();

      // Always check for resets, regardless of changes
      this.checkAllResets();

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

  compareGangData(newData) {
    const changes = [];

    // Don't report changes on first load
    if (this.gangs.length === 0) {
      console.log("📊 First data load - no changes to report");
      return changes;
    }

    newData.forEach((newGang) => {
      const oldGang = this.gangs.find(
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
        // New gang detected
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
          rankChange: newGang.rank,
          rank: newGang.rank,
          isNew: true,
        });
      }
    });

    return changes;
  }

  compareGangDataWithOld(newData, oldData) {
    const changes = [];

    // Don't report changes on first load
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
        // New gang detected
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
          rankChange: newGang.rank,
          rank: newGang.rank,
          isNew: true,
        });
      }
    });

    return changes;
  }

  checkAllResets() {
    // Log current Iran time for debugging
    const now = new Date();
    const iranTime = new Date(now.getTime() + 3.5 * 60 * 60 * 1000);
    console.log(`🕐 Current Iran time: ${iranTime.toLocaleString()}`);

    // Check all types of resets
    this.checkDailyReset();
    this.checkWeeklyReset();
    this.checkMonthlyReset();
  }

  checkDailyReset() {
    // Get Iran time (UTC+3:30)
    const now = new Date();
    const iranTime = new Date(now.getTime() + 3.5 * 60 * 60 * 1000); // UTC+3:30

    if (!this.lastResetDate) {
      this.lastResetDate = iranTime;
      return false; // Don't reset on first run
    }

    const lastReset = new Date(this.lastResetDate);
    const lastResetIran = new Date(lastReset.getTime() + 3.5 * 60 * 60 * 1000);

    // Check if it's 7 AM Iran time and a new day
    const shouldReset =
      iranTime.getHours() === 7 &&
      iranTime.getMinutes() < 1 && // Only reset in the first minute of 7 AM
      (iranTime.getDate() !== lastResetIran.getDate() ||
        iranTime.getMonth() !== lastResetIran.getMonth() ||
        iranTime.getFullYear() !== lastResetIran.getFullYear());

    if (shouldReset) {
      console.log(
        `🕐 Daily reset triggered at Iran time: ${iranTime.toLocaleString()}`
      );

      // Generate daily report before reset
      this.generateDailyReport();

      // Reset all daily XP data including task-specific counters
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
    // Get Iran time (UTC+3:30)
    const now = new Date();
    const iranTime = new Date(now.getTime() + 3.5 * 60 * 60 * 1000); // UTC+3:30

    if (!this.lastWeeklyResetDate) {
      this.lastWeeklyResetDate = iranTime;
      return false; // Don't reset on first run
    }

    const lastReset = new Date(this.lastWeeklyResetDate);
    const lastResetIran = new Date(lastReset.getTime() + 3.5 * 60 * 60 * 1000);

    // Check if it's Sunday 7 AM Iran time and a new week
    const shouldReset =
      iranTime.getHours() === 7 &&
      iranTime.getMinutes() < 1 && // Only reset in the first minute of 7 AM
      iranTime.getDay() === 0 && // Sunday
      Math.floor((iranTime - lastResetIran) / (1000 * 60 * 60 * 24)) >= 7;

    if (shouldReset) {
      console.log(
        `🕐 Weekly reset triggered at Iran time: ${iranTime.toLocaleString()}`
      );

      // Generate weekly report before reset
      this.generateWeeklyReport();

      this.weeklyXp = [];
      this.lastWeeklyResetDate = iranTime;
      this.saveWeeklyXpData();
      console.log("🔄 Weekly XP reset completed");
      return true;
    }

    return false;
  }

  checkMonthlyReset() {
    // Get Iran time (UTC+3:30)
    const now = new Date();
    const iranTime = new Date(now.getTime() + 3.5 * 60 * 60 * 1000); // UTC+3:30

    if (!this.lastMonthlyResetDate) {
      this.lastMonthlyResetDate = iranTime;
      return false; // Don't reset on first run
    }

    const lastReset = new Date(this.lastMonthlyResetDate);
    const lastResetIran = new Date(lastReset.getTime() + 3.5 * 60 * 60 * 1000);

    // Check if it's 1st of month 7 AM Iran time
    const shouldReset =
      iranTime.getHours() === 7 &&
      iranTime.getMinutes() < 1 && // Only reset in the first minute of 7 AM
      iranTime.getDate() === 1 && // First day of month
      (iranTime.getMonth() !== lastResetIran.getMonth() ||
        iranTime.getFullYear() !== lastResetIran.getFullYear());

    if (shouldReset) {
      console.log(
        `🕐 Monthly reset triggered at Iran time: ${iranTime.toLocaleString()}`
      );

      // Generate monthly report before reset
      this.generateMonthlyReport();

      this.monthlyXp = [];
      this.lastMonthlyResetDate = iranTime;
      this.saveMonthlyXpData();
      console.log("🔄 Monthly XP reset completed");
      return true;
    }

    return false;
  }

  updateDailyXp(changes) {
    // Note: Reset checks are now handled in checkAllResets() in updateGangData()

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
            // Accumulators to avoid missing split gains across polls
            task1AccumXp: 0,
            task2AccumXp: 0,
          };
          this.dailyXp.push(gangDailyXp);
        }

        gangDailyXp.totalXp += change.xpChange;

        // Check task completion based on time and XP amount
        const now = new Date();
        const iranTime = new Date(now.getTime() + 3.5 * 60 * 60 * 1000);
        const hour = iranTime.getHours();

        // Task completion logic - cumulative within period (avoid missing due to polling)
        if (hour >= 7 && hour < 18) {
          // Task 1 window
          if (!gangDailyXp.task1Completed) {
            gangDailyXp.task1AccumXp =
              (gangDailyXp.task1AccumXp || 0) + change.xpChange;
            if (gangDailyXp.task1AccumXp >= 500) {
              gangDailyXp.task1Completed = true;
              // Record exactly 500 as the task XP credit
              gangDailyXp.task1Xp = 500;
              console.log(
                `✅ Task 1 completed for ${change.gang_name} (cumulative ${
                  gangDailyXp.task1AccumXp
                }) at Iran time: ${iranTime.toLocaleString()}`
              );
            }
          }
        } else {
          // Task 2 window
          if (!gangDailyXp.task2Completed) {
            gangDailyXp.task2AccumXp =
              (gangDailyXp.task2AccumXp || 0) + change.xpChange;
            if (gangDailyXp.task2AccumXp >= 500) {
              gangDailyXp.task2Completed = true;
              // Record exactly 500 as the task XP credit
              gangDailyXp.task2Xp = 500;
              console.log(
                `✅ Task 2 completed for ${change.gang_name} (cumulative ${
                  gangDailyXp.task2AccumXp
                }) at Iran time: ${iranTime.toLocaleString()}`
              );
            }
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
          gangWeeklyXp = {
            gang_name: change.gang_name,
            totalXp: 0,
          };
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
          gangMonthlyXp = {
            gang_name: change.gang_name,
            totalXp: 0,
          };
          this.monthlyXp.push(gangMonthlyXp);
        }

        gangMonthlyXp.totalXp += change.xpChange;
      }
    });

    this.saveMonthlyXpData();
  }

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

  getDailyStats(gangName) {
    const dailyXpData = this.dailyXp.find((d) => d.gang_name === gangName);
    return (
      dailyXpData || {
        totalXp: 0,
        task1Completed: false,
        task2Completed: false,
        task1Xp: 0,
        task2Xp: 0,
      }
    );
  }

  getWeeklyStats(gangName) {
    const weeklyXpData = this.weeklyXp.find((w) => w.gang_name === gangName);
    return (
      weeklyXpData || {
        totalXp: 0,
      }
    );
  }

  getMonthlyStats(gangName) {
    const monthlyXpData = this.monthlyXp.find((m) => m.gang_name === gangName);
    return (
      monthlyXpData || {
        totalXp: 0,
      }
    );
  }

  getAllDailyStats() {
    return this.dailyXp;
  }

  getAllWeeklyStats() {
    return this.weeklyXp;
  }

  getAllMonthlyStats() {
    return this.monthlyXp;
  }

  generateDailyReport() {
    try {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      const reportData = {
        date: yesterday.toISOString().split("T")[0], // YYYY-MM-DD format
        generatedAt: now.toISOString(),
        dailyStats: this.dailyXp.map((gang) => ({
          gang_name: gang.gang_name,
          totalXp: gang.totalXp,
          task1Completed: gang.task1Completed,
          task2Completed: gang.task2Completed,
          task1Xp: gang.task1Xp || 0,
          task2Xp: gang.task2Xp || 0,
        })),
        weeklyStats: this.weeklyXp.map((gang) => ({
          gang_name: gang.gang_name,
          totalXp: gang.totalXp,
        })),
        summary: {
          totalGangs: this.dailyXp.length,
          activeGangs: this.dailyXp.filter((g) => g.totalXp > 0).length,
          totalDailyXp: this.dailyXp.reduce((sum, g) => sum + g.totalXp, 0),
          totalWeeklyXp: this.weeklyXp.reduce((sum, g) => sum + g.totalXp, 0),
          task1Completed: this.dailyXp.filter((g) => g.task1Completed).length,
          task2Completed: this.dailyXp.filter((g) => g.task2Completed).length,
          bothTasksCompleted: this.dailyXp.filter(
            (g) => g.task1Completed && g.task2Completed
          ).length,
        },
      };

      // Save report to file
      this.saveDailyReportToFile(reportData);

      // Store report data for DM sending
      this.lastDailyReport = reportData;

      // Trigger daily report sending via bot
      if (this.botInstance && this.botInstance.sendDailyReportToUsers) {
        this.botInstance.sendDailyReportToUsers();
      }

      console.log("📊 Daily report generated successfully");
    } catch (error) {
      console.error("❌ Error generating daily report:", error);
    }
  }

  saveDailyReportToFile(reportData) {
    try {
      const fs = require("fs-extra");
      const path = require("path");

      // Create reports directory if it doesn't exist
      const reportsDir = path.join(__dirname, "..", "data", "reports");
      fs.ensureDirSync(reportsDir);

      // Save JSON file
      const jsonFile = path.join(
        reportsDir,
        `daily-report-${reportData.date}.json`
      );
      fs.writeJsonSync(jsonFile, reportData, { spaces: 2 });

      // Save TXT file
      const txtFile = path.join(
        reportsDir,
        `daily-report-${reportData.date}.txt`
      );
      const txtContent = this.formatReportAsText(reportData);
      fs.writeFileSync(txtFile, txtContent, "utf8");

      console.log(`📄 Daily report saved to files: ${jsonFile}, ${txtFile}`);
    } catch (error) {
      console.error("❌ Error saving daily report to file:", error);
    }
  }

  formatReportAsText(reportData) {
    let content = `🏴‍☠️ DIAMONDRP GANG DAILY REPORT 🏴‍☠️\n`;
    content += `📅 Date: ${reportData.date}\n`;
    content += `⏰ Generated: ${new Date(
      reportData.generatedAt
    ).toLocaleString()}\n`;
    content += `\n${"=".repeat(50)}\n\n`;

    // Summary
    content += `📊 SUMMARY:\n`;
    content += `• Total Gangs: ${reportData.summary.totalGangs}\n`;
    content += `• Active Gangs: ${reportData.summary.activeGangs}\n`;
    content += `• Total Daily XP: ${reportData.summary.totalDailyXp.toLocaleString()}\n`;
    content += `• Total Weekly XP: ${reportData.summary.totalWeeklyXp.toLocaleString()}\n`;
    content += `• Task 1 Completed: ${reportData.summary.task1Completed}\n`;
    content += `• Task 2 Completed: ${reportData.summary.task2Completed}\n`;
    content += `• Both Tasks Completed: ${reportData.summary.bothTasksCompleted}\n\n`;

    // Daily Stats
    content += `📊 DAILY XP RANKING:\n`;
    const sortedDaily = [...reportData.dailyStats].sort(
      (a, b) => b.totalXp - a.totalXp
    );
    sortedDaily.forEach((gang, index) => {
      const medal =
        index === 0 ? "🏆" : index === 1 ? "🥈" : index === 2 ? "🥉" : "🎖️";
      const task1Status = gang.task1Completed ? "✅" : "❌";
      const task2Status = gang.task2Completed ? "✅" : "❌";

      content += `${medal} ${
        gang.gang_name
      }: ${gang.totalXp.toLocaleString()} XP\n`;
      content += `   Tasks: ${task1Status} ${task2Status} | Task1: ${gang.task1Xp} | Task2: ${gang.task2Xp}\n\n`;
    });

    // Weekly Stats
    content += `📊 WEEKLY XP RANKING:\n`;
    const sortedWeekly = [...reportData.weeklyStats].sort(
      (a, b) => b.totalXp - a.totalXp
    );
    sortedWeekly.forEach((gang, index) => {
      const medal =
        index === 0 ? "🏆" : index === 1 ? "🥈" : index === 2 ? "🥉" : "🎖️";
      content += `${medal} ${
        gang.gang_name
      }: ${gang.totalXp.toLocaleString()} XP\n`;
    });

    content += `\n${"=".repeat(50)}\n`;
    content += `🤖 Generated by DiamondRP Gang Tracker Bot\n`;
    content += `👨‍💻 By Agha Dani\n`;

    return content;
  }

  getLastDailyReport() {
    return this.lastDailyReport;
  }

  generateWeeklyReport() {
    try {
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay()); // Start of current week (Sunday)

      const reportData = {
        weekStart: weekStart.toISOString().split("T")[0],
        weekEnd: now.toISOString().split("T")[0],
        generatedAt: now.toISOString(),
        weeklyStats: this.weeklyXp.map((gang) => ({
          gang_name: gang.gang_name,
          totalXp: gang.totalXp,
        })),
        summary: {
          totalGangs: this.weeklyXp.length,
          activeGangs: this.weeklyXp.filter((g) => g.totalXp > 0).length,
          totalWeeklyXp: this.weeklyXp.reduce((sum, g) => sum + g.totalXp, 0),
        },
      };

      // Save report to file
      this.saveWeeklyReportToFile(reportData);

      // Store report data for DM sending
      this.lastWeeklyReport = reportData;

      // Trigger weekly report sending via bot
      if (this.botInstance && this.botInstance.sendWeeklyReportToUsers) {
        this.botInstance.sendWeeklyReportToUsers();
      }

      console.log("📊 Weekly report generated successfully");
    } catch (error) {
      console.error("❌ Error generating weekly report:", error);
    }
  }

  generateMonthlyReport() {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const reportData = {
        month: now.toLocaleString("default", {
          month: "long",
          year: "numeric",
        }),
        monthStart: monthStart.toISOString().split("T")[0],
        monthEnd: now.toISOString().split("T")[0],
        generatedAt: now.toISOString(),
        monthlyStats: this.monthlyXp.map((gang) => ({
          gang_name: gang.gang_name,
          totalXp: gang.totalXp,
        })),
        summary: {
          totalGangs: this.monthlyXp.length,
          activeGangs: this.monthlyXp.filter((g) => g.totalXp > 0).length,
          totalMonthlyXp: this.monthlyXp.reduce((sum, g) => sum + g.totalXp, 0),
        },
      };

      // Save report to file
      this.saveMonthlyReportToFile(reportData);

      // Store report data for DM sending
      this.lastMonthlyReport = reportData;

      // Trigger monthly report sending via bot
      if (this.botInstance && this.botInstance.sendMonthlyReportToUsers) {
        this.botInstance.sendMonthlyReportToUsers();
      }

      console.log("📊 Monthly report generated successfully");
    } catch (error) {
      console.error("❌ Error generating monthly report:", error);
    }
  }

  saveWeeklyReportToFile(reportData) {
    try {
      const fs = require("fs-extra");
      const path = require("path");

      // Create reports directory if it doesn't exist
      const reportsDir = path.join(__dirname, "..", "data", "reports");
      fs.ensureDirSync(reportsDir);

      // Save JSON file
      const jsonFile = path.join(
        reportsDir,
        `weekly-report-${reportData.weekStart}-to-${reportData.weekEnd}.json`
      );
      fs.writeJsonSync(jsonFile, reportData, { spaces: 2 });

      // Save TXT file
      const txtFile = path.join(
        reportsDir,
        `weekly-report-${reportData.weekStart}-to-${reportData.weekEnd}.txt`
      );
      const txtContent = this.formatWeeklyReportAsText(reportData);
      fs.writeFileSync(txtFile, txtContent, "utf8");

      console.log(`📄 Weekly report saved to files: ${jsonFile}, ${txtFile}`);
    } catch (error) {
      console.error("❌ Error saving weekly report to file:", error);
    }
  }

  saveMonthlyReportToFile(reportData) {
    try {
      const fs = require("fs-extra");
      const path = require("path");

      // Create reports directory if it doesn't exist
      const reportsDir = path.join(__dirname, "..", "data", "reports");
      fs.ensureDirSync(reportsDir);

      // Save JSON file
      const jsonFile = path.join(
        reportsDir,
        `monthly-report-${reportData.month.replace(" ", "-")}.json`
      );
      fs.writeJsonSync(jsonFile, reportData, { spaces: 2 });

      // Save TXT file
      const txtFile = path.join(
        reportsDir,
        `monthly-report-${reportData.month.replace(" ", "-")}.txt`
      );
      const txtContent = this.formatMonthlyReportAsText(reportData);
      fs.writeFileSync(txtFile, txtContent, "utf8");

      console.log(`📄 Monthly report saved to files: ${jsonFile}, ${txtFile}`);
    } catch (error) {
      console.error("❌ Error saving monthly report to file:", error);
    }
  }

  formatWeeklyReportAsText(reportData) {
    let content = `🏴‍☠️ DIAMONDRP GANG WEEKLY REPORT 🏴‍☠️\n`;
    content += `📅 Week: ${reportData.weekStart} to ${reportData.weekEnd}\n`;
    content += `⏰ Generated: ${new Date(
      reportData.generatedAt
    ).toLocaleString()}\n`;
    content += `\n${"=".repeat(50)}\n\n`;

    // Summary
    content += `📊 SUMMARY:\n`;
    content += `• Total Gangs: ${reportData.summary.totalGangs}\n`;
    content += `• Active Gangs: ${reportData.summary.activeGangs}\n`;
    content += `• Total Weekly XP: ${reportData.summary.totalWeeklyXp.toLocaleString()}\n\n`;

    // Weekly Stats
    content += `📊 WEEKLY XP RANKING:\n`;
    const sortedWeekly = [...reportData.weeklyStats].sort(
      (a, b) => b.totalXp - a.totalXp
    );
    sortedWeekly.forEach((gang, index) => {
      const medal =
        index === 0 ? "🏆" : index === 1 ? "🥈" : index === 2 ? "🥉" : "🎖️";
      content += `${medal} ${
        gang.gang_name
      }: ${gang.totalXp.toLocaleString()} XP\n`;
    });

    content += `\n${"=".repeat(50)}\n`;
    content += `🤖 Generated by DiamondRP Gang Tracker Bot\n`;
    content += `👨‍💻 By Agha Dani\n`;

    return content;
  }

  formatMonthlyReportAsText(reportData) {
    let content = `🏴‍☠️ DIAMONDRP GANG MONTHLY REPORT 🏴‍☠️\n`;
    content += `📅 Month: ${reportData.month}\n`;
    content += `📅 Period: ${reportData.monthStart} to ${reportData.monthEnd}\n`;
    content += `⏰ Generated: ${new Date(
      reportData.generatedAt
    ).toLocaleString()}\n`;
    content += `\n${"=".repeat(50)}\n\n`;

    // Summary
    content += `📊 SUMMARY:\n`;
    content += `• Total Gangs: ${reportData.summary.totalGangs}\n`;
    content += `• Active Gangs: ${reportData.summary.activeGangs}\n`;
    content += `• Total Monthly XP: ${reportData.summary.totalMonthlyXp.toLocaleString()}\n\n`;

    // Monthly Stats
    content += `📊 MONTHLY XP RANKING:\n`;
    const sortedMonthly = [...reportData.monthlyStats].sort(
      (a, b) => b.totalXp - a.totalXp
    );
    sortedMonthly.forEach((gang, index) => {
      const medal =
        index === 0 ? "🏆" : index === 1 ? "🥈" : index === 2 ? "🥉" : "🎖️";
      content += `${medal} ${
        gang.gang_name
      }: ${gang.totalXp.toLocaleString()} XP\n`;
    });

    content += `\n${"=".repeat(50)}\n`;
    content += `🤖 Generated by DiamondRP Gang Tracker Bot\n`;
    content += `👨‍💻 By Agha Dani\n`;

    return content;
  }

  getLastWeeklyReport() {
    return this.lastWeeklyReport;
  }

  getLastMonthlyReport() {
    return this.lastMonthlyReport;
  }

  // Test method to manually trigger daily reset (for testing purposes)
  forceDailyReset() {
    console.log("🧪 Force triggering daily reset for testing...");

    // Generate daily report before reset
    this.generateDailyReport();

    // Reset all daily XP data including task-specific counters
    this.dailyXp.forEach((gang) => {
      gang.totalXp = 0;
      gang.task1Completed = false;
      gang.task2Completed = false;
      gang.task1Xp = 0;
      gang.task2Xp = 0;
    });

    const now = new Date();
    const iranTime = new Date(now.getTime() + 3.5 * 60 * 60 * 1000);
    this.lastResetDate = iranTime;
    this.saveDailyXpData();

    console.log("🔄 Daily XP reset completed (forced)");
    return true;
  }
}

module.exports = GangTracker;
