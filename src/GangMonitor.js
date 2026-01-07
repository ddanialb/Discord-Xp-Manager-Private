const { EmbedBuilder } = require("discord.js");
const GangTracker = require("./GangTracker");

class GangMonitor {
  constructor(client) {
    this.client = client;
    this.gangTracker = new GangTracker();
    this.isRunning = false;
    this.checkInterval = 15000; // 15 seconds (increased from 10 to reduce API load)
    this.intervalId = null;
    this.xpThreshold = 500; // Minimum XP change to report
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 5;
  }

  start() {
    if (this.isRunning) {
      console.log("⚠️ Monitoring is already running");
      return;
    }

    console.log("🔄 Starting gang monitoring...");
    this.isRunning = true;

    // Start monitoring loop
    this.intervalId = setInterval(async () => {
      await this.checkForChanges();
    }, this.checkInterval);

    console.log("✅ Gang monitoring started (checking every 15 seconds)");
  }

  stop() {
    if (!this.isRunning) {
      console.log("⚠️ Monitoring is not running");
      return;
    }

    console.log("⏹️ Stopping gang monitoring...");
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log("✅ Gang monitoring stopped");
  }

  async checkForChanges() {
    try {
      const changes = await this.gangTracker.updateGangData();
      
      // Reset error counter on success
      this.consecutiveErrors = 0;

      if (changes.length > 0) {
        console.log(`📊 Detected ${changes.length} gang changes`);

        // Filter for significant XP changes
        const significantChanges = changes.filter(
          (change) => Math.abs(change.xpChange) >= this.xpThreshold
        );

        if (significantChanges.length > 0) {
          console.log(
            `🚨 ${significantChanges.length} significant XP changes detected!`
          );
        }

        // Check for rank changes (only send alerts when rank actually changes)
        const rankChanges = changes.filter((change) => change.rankChange !== 0);

        if (rankChanges.length > 0) {
          console.log(`📈 ${rankChanges.length} rank changes detected!`);

          // Send rank change alerts
          for (const change of rankChanges) {
            await this.sendRankChangeAlert(change);
          }
        }
      }
    } catch (error) {
      this.consecutiveErrors++;
      console.error(`❌ Error checking for changes (${this.consecutiveErrors}/${this.maxConsecutiveErrors}):`, error.message || error);
      
      // If too many consecutive errors, increase interval temporarily
      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        console.log("⚠️ Too many errors, backing off for 60 seconds...");
        this.stop();
        setTimeout(() => {
          this.consecutiveErrors = 0;
          this.start();
        }, 60000);
      }
    }
  }

  async sendRankChangeAlert(change) {
    try {
      const { EmbedBuilder } = require("discord.js");

      const isUp = change.rankChange < 0; // Negative rank change means going up (better rank)
      const direction = isUp ? "📈" : "📉";
      const directionText = isUp ? "صعود کرد" : "نزول کرد";
      const color = isUp ? 0x00ff00 : 0xff0000;
      const emoji = isUp ? "🎉" : "😔";

      const embed = new EmbedBuilder()
        .setTitle(`${emoji} ${direction} تغییر XP گنگ ${direction}`)
        .setDescription(`**${change.gang_name}** ${directionText}!`)
        .setColor(color)
        .addFields(
          {
            name: "💎 تغییرات XP",
            value: `**قبل:** ${change.oldXp.toLocaleString()}\n**بعد:** ${change.newXp.toLocaleString()}\n**تغییر:** ${
              change.xpChange > 0 ? "+" : ""
            }${change.xpChange.toLocaleString()}`,
            inline: true,
          },
          {
            name: "🏆 رنک",
            value: `**قبل:** #${change.oldRank}\n**بعد:** #${
              change.newRank
            }\n**تغییر:** ${change.rankChange > 0 ? "+" : ""}${
              change.rankChange
            }`,
            inline: true,
          },
          {
            name: "⏰ زمان",
            value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
            inline: true,
          }
        )
        .setTimestamp()
        .setFooter({ text: "By Agha Dani" });

      // Send alert to all channels where /gangs was used
      const gangBot = this.client.gangBot;
      if (gangBot && gangBot.gangsMessages) {
        for (const [channelId, messageData] of gangBot.gangsMessages) {
          try {
            const channel = this.client.channels.cache.get(channelId);
            if (
              channel &&
              channel.permissionsFor(this.client.user).has("SendMessages")
            ) {
              // Send ephemeral message (only visible to the user who used /gangs)
              await channel.send({
                embeds: [embed],
                ephemeral: true,
              });
              console.log(
                `📢 Sent XP change alert for ${change.gang_name} in channel ${channelId}`
              );
            }
          } catch (error) {
            console.log(
              `❌ Error sending XP alert to channel ${channelId}:`,
              error.message
            );
          }
        }
      }
    } catch (error) {
      console.error("❌ Error sending XP change alert:", error);
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      checkInterval: this.checkInterval,
      xpThreshold: this.xpThreshold,
    };
  }

  setXpThreshold(threshold) {
    this.xpThreshold = threshold;
    console.log(`🔧 XP threshold set to ${threshold}`);
  }

  setCheckInterval(interval) {
    this.checkInterval = interval;
    console.log(`🔧 Check interval set to ${interval}ms`);

    // Restart monitoring if running
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }
}

module.exports = GangMonitor;
