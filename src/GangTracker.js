const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

class GangTracker {
  constructor() {
    this.gangs = [];
    this.dailyXp = [];
    this.weeklyXp = [];
    this.dataFile = path.join(__dirname, "..", "data", "gangs.json");
    this.dailyXpFile = path.join(__dirname, "..", "data", "daily_xp.json");
    this.weeklyXpFile = path.join(__dirname, "..", "data", "weekly_xp.json");
    this.apiUrl = "https://app.diamondrp.ir/api/tops/gangs";
    this.lastResetDate = null;
    this.lastWeeklyResetDate = null;

    this.loadData();
  }

  async loadData() {
    await this.loadGangData();
    await this.loadDailyXpData();
    await this.loadWeeklyXpData();
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

      const changes = this.compareGangDataWithOld(newGangs, oldGangs);
      if (changes.length > 0) {
        console.log(
          `✅ Updated gang data. ${changes.length} changes detected.`
        );
        this.updateDailyXp(changes);
        this.updateWeeklyXp(changes);
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

  checkDailyReset() {
    const now = new Date();
    if (!this.lastResetDate) {
      this.lastResetDate = now;
      return true;
    }

    const lastReset = new Date(this.lastResetDate);
    const shouldReset =
      now.getHours() >= 7 &&
      (now.getDate() !== lastReset.getDate() ||
        now.getMonth() !== lastReset.getMonth() ||
        now.getFullYear() !== lastReset.getFullYear());

    if (shouldReset) {
      // Reset all daily XP data including task-specific counters
      this.dailyXp.forEach((gang) => {
        gang.totalXp = 0;
        gang.task1Completed = false;
        gang.task2Completed = false;
        gang.task1Xp = 0;
        gang.task2Xp = 0;
      });
      this.lastResetDate = now;
      this.saveDailyXpData();
      console.log("🔄 Daily XP reset");
      return true;
    }

    return false;
  }

  checkWeeklyReset() {
    const now = new Date();
    if (!this.lastWeeklyResetDate) {
      this.lastWeeklyResetDate = now;
      return true;
    }

    const lastReset = new Date(this.lastWeeklyResetDate);
    const daysSinceReset = Math.floor(
      (now - lastReset) / (1000 * 60 * 60 * 24)
    );
    const shouldReset =
      daysSinceReset >= 7 && now.getHours() >= 7 && now.getDay() === 1; // Monday

    if (shouldReset) {
      this.weeklyXp = [];
      this.lastWeeklyResetDate = now;
      this.saveWeeklyXpData();
      console.log("🔄 Weekly XP reset");
      return true;
    }

    return false;
  }

  updateDailyXp(changes) {
    this.checkDailyReset();

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

        // Check task completion based on time and exact XP amount
        const now = new Date();
        const hour = now.getHours();

        if (change.xpChange === 500) {
          if (hour >= 7 && hour < 18) {
            // Task 1 time (7 AM - 6 PM) - exactly 500 XP
            gangDailyXp.task1Xp += change.xpChange;
            gangDailyXp.task1Completed = true;
          } else {
            // Task 2 time (6 PM - 7 AM) - exactly 500 XP
            gangDailyXp.task2Xp += change.xpChange;
            gangDailyXp.task2Completed = true;
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

      return {
        ...gang,
        dailyXp: dailyXpData ? dailyXpData.totalXp : 0,
        weeklyXp: weeklyXpData ? weeklyXpData.totalXp : 0,
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

  getAllDailyStats() {
    return this.dailyXp;
  }

  getAllWeeklyStats() {
    return this.weeklyXp;
  }
}

module.exports = GangTracker;
