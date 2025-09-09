const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
} = require("discord.js");
const GangTracker = require("./src/GangTracker");
const GangMonitor = require("./src/GangMonitor");
const cron = require("cron");
const config = require("./config");
const express = require("express");

class DiscordGangBot {
  constructor() {
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    });

    this.gangTracker = new GangTracker();
    this.gangMonitor = new GangMonitor(this.client);
    this.commands = [];

    this.client.gangBot = this;
    this.gangsMessages = new Map();
    this.autoUpdateEnabled = true;
    this.setupCommands();
  }

  setupEventHandlers() {
    this.client.on("ready", () => {
      console.log(`🤖 Bot is online as ${this.client.user.tag}!`);
      this.client.user.setActivity("Gang Tracker", { type: "WATCHING" });
    });

    this.client.on("interactionCreate", async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      // Attempt to defer immediately to avoid token expiry on cold starts
      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply().catch((error) => {
            console.error("❌ Failed to defer reply:", error);
          });
        }
      } catch (err) {
        console.error("❌ Error during initial defer:", err);
      }

      try {
        switch (interaction.commandName) {
          case "gangs":
            await this.handleGangsCommand(interaction);
            break;
          case "gangsupdate":
            await this.handleGangsUpdateCommand(interaction);
            break;
          case "datamanager":
            await this.handleDataManagerCommand(interaction);
            break;
        }
      } catch (error) {
        console.error("❌ Error handling interaction:", error);
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: "❌ An error occurred while processing your command.",
              ephemeral: true,
            });
          }
        } catch (replyError) {
          console.error("❌ Error sending error reply:", replyError);
        }
      }
    });

    this.client.on("error", (error) => {
      console.error("❌ Discord client error:", error);
    });

    process.on("unhandledRejection", (reason, promise) => {
      console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
    });
  }

  setupCommands() {
    this.commands = [
      new SlashCommandBuilder()
        .setName("gangs")
        .setDescription("Display all gangs with their current data"),

      new SlashCommandBuilder()
        .setName("gangsupdate")
        .setDescription("Control auto-update of /gangs message")
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Start or stop auto-updating")
            .setRequired(true)
            .addChoices(
              { name: "Enable", value: "enable" },
              { name: "Disable", value: "disable" }
            )
        ),

      new SlashCommandBuilder()
        .setName("datamanager")
        .setDescription("Manage bot data and system health")
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Data management action")
            .setRequired(true)
            .addChoices(
              { name: "Health Check", value: "health" },
              { name: "Create Backup", value: "backup" },
              { name: "Validate Data", value: "validate" },
              { name: "Repair Data", value: "repair" },
              { name: "System Info", value: "info" }
            )
        ),
    ];
  }

  async registerCommands() {
    const rest = new REST({ version: "10" }).setToken(config.discord.token);

    try {
      console.log("🔄 Refreshing application (/) commands...");

      await rest.put(Routes.applicationCommands(config.discord.clientId), {
        body: this.commands,
      });

      console.log("✅ Successfully reloaded application (/) commands.");
    } catch (error) {
      console.error("❌ Error refreshing commands:", error);
      throw error;
    }
  }

  setupScheduling() {
    // Daily update at 7:00 AM
    const dailyJob = new cron.CronJob("0 7 * * *", async () => {
      console.log("🕐 Daily gang data update at 7:00 AM");
      try {
        await this.gangTracker.updateGangData();
        console.log("✅ Daily update completed");
      } catch (error) {
        console.error("❌ Daily update failed:", error);
      }
    });
    dailyJob.start();

    // Auto-update /gangs message every 30 seconds
    setInterval(async () => {
      await this.updateGangsMessage();
    }, 30000); // 30 seconds

    // Start monitoring after 10 seconds
    setTimeout(() => {
      this.gangMonitor.start();
    }, 10000);
  }

  async handleGangsCommand(interaction) {
    try {
      // Defer only if not already deferred by the global handler
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }

      // Show loading message
      const loadingEmbed = new EmbedBuilder()
        .setTitle("🔄 Loading Gang Data...")
        .setDescription(
          "```ansi\n" +
            "╔══════════════════════════════════════╗\n" +
            "║        🔄 FETCHING DATA... 🔄        ║\n" +
            "║     Please wait while we update      ║\n" +
            "║        the gang leaderboard          ║\n" +
            "╚══════════════════════════════════════╝\n" +
            "```"
        )
        .setColor(0x0099ff)
        .setFooter({ text: "By Agha Dani" });

      await interaction.editReply({ embeds: [loadingEmbed] });

      // Update gang data first
      await this.gangTracker.updateGangData();

      const gangs = this.gangTracker.getGangs();
      const embeds = this.createGangsEmbeds(gangs);

      const message = await interaction.editReply({ embeds: embeds });

      // Store the message for this specific channel
      this.gangsMessages.set(interaction.channelId, message);

      console.log(
        `📝 /gangs message stored for channel ${interaction.channelId}`
      );
    } catch (error) {
      console.error("❌ Error in handleGangsCommand:", error);

      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Error Loading Data")
        .setDescription(
          "```ansi\n" +
            "╔══════════════════════════════════════╗\n" +
            "║           ❌ ERROR OCCURRED ❌        ║\n" +
            "║     Failed to fetch gang data        ║\n" +
            "║     Please try again later           ║\n" +
            "╚══════════════════════════════════════╝\n" +
            "```"
        )
        .setColor(0xff0000)
        .addFields({
          name: "🔧 Troubleshooting",
          value:
            "• Check your internet connection\n• Verify the API is accessible\n• Try again in a few moments",
          inline: false,
        })
        .setFooter({ text: "By Agha Dani" });

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ embeds: [errorEmbed] });
        } else {
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
      } catch (replyError) {
        console.error("❌ Error sending error reply:", replyError);
      }
    }
  }

  async handleGangsUpdateCommand(interaction) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }

      const action = interaction.options.getString("action");

      if (action === "enable") {
        this.autoUpdateEnabled = true;
        const messageCount = this.gangsMessages.size;

        const embed = new EmbedBuilder()
          .setTitle("✅ Auto-Update Enabled")
          .setDescription(
            "Gang leaderboard will now update automatically every 30 seconds!"
          )
          .setColor(0x00ff00)
          .addFields(
            {
              name: "📊 Status",
              value: `**Active Messages:** ${messageCount}\n**Update Interval:** 30 seconds\n**Status:** 🟢 Enabled`,
              inline: true,
            },
            {
              name: "🔄 Features",
              value:
                "• Real-time XP tracking\n• Live task monitoring\n• Auto-refresh leaderboard\n• Performance statistics",
              inline: true,
            }
          )
          .setTimestamp()
          .setFooter({ text: "By Agha Dani" });

        await interaction.editReply({ embeds: [embed] });
      } else if (action === "disable") {
        this.autoUpdateEnabled = false;

        const embed = new EmbedBuilder()
          .setTitle("⏹️ Auto-Update Disabled")
          .setDescription(
            "Gang leaderboard will no longer update automatically."
          )
          .setColor(0xff0000)
          .addFields(
            {
              name: "📊 Status",
              value: `**Active Messages:** ${this.gangsMessages.size}\n**Update Interval:** Manual only\n**Status:** 🔴 Disabled`,
              inline: true,
            },
            {
              name: "ℹ️ Note",
              value: "Use `/gangs` command to manually update the leaderboard.",
              inline: true,
            }
          )
          .setTimestamp()
          .setFooter({ text: "By Agha Dani" });

        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error("❌ Error in handleGangsUpdateCommand:", error);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            content:
              "❌ Failed to control auto-update. Please try again later.",
          });
        } else {
          await interaction.reply({
            content:
              "❌ Failed to control auto-update. Please try again later.",
            ephemeral: true,
          });
        }
      } catch (replyError) {
        console.error("❌ Error sending error reply:", replyError);
      }
    }
  }

  async updateGangsMessage() {
    if (!this.autoUpdateEnabled || this.gangsMessages.size === 0) {
      return; // No messages to update or auto-update disabled
    }

    try {
      // Update gang data first
      await this.gangTracker.updateGangData();

      // Get updated data
      const gangs = this.gangTracker.getGangs();
      const embeds = this.createGangsEmbeds(gangs);

      // Update all stored messages
      for (const [channelId, message] of this.gangsMessages) {
        try {
          await message.edit({ embeds: embeds });
          console.log(`📝 /gangs message auto-updated in channel ${channelId}`);
        } catch (error) {
          console.error(
            `❌ Error updating message in channel ${channelId}:`,
            error
          );

          // If message is deleted or inaccessible, remove it from the map
          if (error.code === 10008 || error.code === 10003) {
            this.gangsMessages.delete(channelId);
            console.log(
              `🗑️ Removed invalid message reference for channel ${channelId}`
            );
          }
        }
      }
    } catch (error) {
      console.error("❌ Error updating gang data:", error);
    }
  }

  createGangsEmbeds(gangs) {
    const gangsWithDailyXp = this.gangTracker.getGangsWithDailyXp();
    const sortedGangs = gangsWithDailyXp.sort((a, b) => b.xp - a.xp);

    // Create clean and simple embed
    const embed = new EmbedBuilder()
      .setTitle("🏴‍☠️ DiamondRP Gang Leaderboard 🏴‍☠️")
      .setColor(0x00ff00)
      .setTimestamp()
      .setFooter({ text: "By Agha Dani" });

    // Create simple and clean leaderboard
    let description = "";

    sortedGangs.forEach((gang, index) => {
      const medal =
        index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "🏅";
      const task1Status = gang.task1Completed ? "✅" : "❌";
      const task2Status = gang.task2Completed ? "✅" : "❌";

      description += `${medal} **${gang.gang_name}**\n`;
      description += `   💎 Total XP: ${gang.xp.toLocaleString()} | Daily XP: ${gang.dailyXp.toLocaleString()} | Weekly XP: ${gang.weeklyXp.toLocaleString()}\n`;
      description += `   🎯 Tasks: ${task1Status} ${task2Status} | Level: ${gang.rank}\n\n`;
    });

    description +=
      "**🔄 Auto-updating every 30 seconds • Last updated:** <t:" +
      Math.floor(Date.now() / 1000) +
      ":R>";

    embed.setDescription(description);

    // Add beautiful statistics
    const stats = this.calculateStats(sortedGangs);
    embed.addFields(
      {
        name: "📊 Live Statistics",
        value: this.createStatsDisplay(stats),
        inline: true,
      },
      {
        name: "🎯 Task Progress",
        value: this.createTaskStats(sortedGangs),
        inline: true,
      },
      {
        name: "⚡ Performance",
        value: this.createPerformanceStats(sortedGangs),
        inline: true,
      }
    );

    return [embed];
  }

  calculateStats(gangs) {
    const totalGangs = gangs.length;
    const totalXp = gangs.reduce((sum, gang) => sum + gang.xp, 0);
    const avgXp = Math.round(totalXp / totalGangs);
    const topGang = gangs[0];
    const activeGangs = gangs.filter((gang) => gang.dailyXp > 0).length;

    return {
      totalGangs,
      totalXp,
      avgXp,
      topGang,
      activeGangs,
    };
  }

  createStatsDisplay(stats) {
    return (
      `🏆 **Total Gangs:** ${stats.totalGangs}\n` +
      `💎 **Total XP:** ${stats.totalXp.toLocaleString()}\n` +
      `📊 **Average XP:** ${stats.avgXp.toLocaleString()}\n` +
      `🔥 **Active Today:** ${stats.activeGangs}\n` +
      `👑 **Top Gang:** ${stats.topGang.gang_name}`
    );
  }

  createTaskStats(gangs) {
    const task1Completed = gangs.filter((gang) => gang.task1Completed).length;
    const task2Completed = gangs.filter((gang) => gang.task2Completed).length;
    const bothCompleted = gangs.filter(
      (gang) => gang.task1Completed && gang.task2Completed
    ).length;
    const completionRate = Math.round((bothCompleted / gangs.length) * 100);

    return (
      `🎯 **Task 1:** ${task1Completed}/${gangs.length}\n` +
      `🎯 **Task 2:** ${task2Completed}/${gangs.length}\n` +
      `🏆 **Both Tasks:** ${bothCompleted}/${gangs.length}\n` +
      `📈 **Completion Rate:** ${completionRate}%\n` +
      `⏰ **Last Update:** <t:${Math.floor(Date.now() / 1000)}:R>`
    );
  }

  createPerformanceStats(gangs) {
    const topDaily = gangs.reduce(
      (max, gang) => (gang.dailyXp > max.dailyXp ? gang : max),
      gangs[0]
    );
    const topWeekly = gangs.reduce(
      (max, gang) => (gang.weeklyXp > max.weeklyXp ? gang : max),
      gangs[0]
    );
    const avgDaily = Math.round(
      gangs.reduce((sum, gang) => sum + gang.dailyXp, 0) / gangs.length
    );
    const avgWeekly = Math.round(
      gangs.reduce((sum, gang) => sum + gang.weeklyXp, 0) / gangs.length
    );

    return (
      `📈 **Top Daily:** ${
        topDaily.gang_name
      } (${topDaily.dailyXp.toLocaleString()})\n` +
      `📊 **Top Weekly:** ${
        topWeekly.gang_name
      } (${topWeekly.weeklyXp.toLocaleString()})\n` +
      `📉 **Avg Daily:** ${avgDaily.toLocaleString()}\n` +
      `📊 **Avg Weekly:** ${avgWeekly.toLocaleString()}\n` +
      `🔄 **Update Rate:** Every 30 seconds`
    );
  }

  async start() {
    try {
      console.log("🚀 Starting Discord Gang Tracker Bot...");

      // Register commands with retry logic
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          await this.registerCommands();
          break;
        } catch (error) {
          retryCount++;
          console.log(
            `❌ Command registration failed (${retryCount}/${maxRetries}):`,
            error.message
          );

          if (retryCount < maxRetries) {
            console.log("⏳ Retrying in 5 seconds...");
            await new Promise((resolve) => setTimeout(resolve, 5000));
          } else {
            throw error;
          }
        }
      }

      // Setup event handlers
      this.setupEventHandlers();

      // Setup scheduling
      this.setupScheduling();

      // Login with retry logic
      retryCount = 0;
      while (retryCount < maxRetries) {
        try {
          await this.client.login(config.discord.token);
          break;
        } catch (error) {
          retryCount++;
          console.log(
            `❌ Login attempt failed (${retryCount}/${maxRetries}):`,
            error.message
          );

          if (retryCount < maxRetries) {
            console.log("⏳ Retrying in 15 seconds...");
            await new Promise((resolve) => setTimeout(resolve, 15000));
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      console.error("❌ Failed to start bot:", error);

      if (error.message.includes("Invalid Form Body")) {
        console.log("\n🔧 Troubleshooting Tips:");
        console.log("1. Check your Discord token in config.js");
        console.log("2. Make sure the bot is invited to your server");
        console.log("3. Verify the client ID is correct");
      } else if (
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("ECONNRESET")
      ) {
        console.log("\n🌐 Network Issues:");
        console.log("1. Check your internet connection");
        console.log("2. Try again in a few minutes");
        console.log("3. Check if Discord is accessible");
      }

      process.exit(1);
    }
  }

  async handleDataManagerCommand(interaction) {
    const action = interaction.options.getString("action");

    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      switch (action) {
        case "health":
          await this.handleHealthCheck(interaction);
          break;
        case "backup":
          await this.handleCreateBackup(interaction);
          break;
        case "validate":
          await this.handleValidateData(interaction);
          break;
        case "repair":
          await this.handleRepairData(interaction);
          break;
        case "info":
          await this.handleSystemInfo(interaction);
          break;
      }
    } catch (error) {
      console.error("❌ Error handling datamanager command:", error);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle("❌ Error")
                .setDescription(
                  "An error occurred while processing the request."
                )
                .setColor(0xff0000)
                .setFooter({ text: "By Agha Dani" }),
            ],
          });
        } else {
          await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle("❌ Error")
                .setDescription(
                  "An error occurred while processing the request."
                )
                .setColor(0xff0000)
                .setFooter({ text: "By Agha Dani" }),
            ],
            ephemeral: true,
          });
        }
      } catch (editError) {
        console.error("❌ Error editing reply:", editError);
      }
    }
  }

  async handleHealthCheck(interaction) {
    try {
      const healthStatus = await this.gangTracker.healthCheck();

      const embed = new EmbedBuilder()
        .setTitle("🏥 System Health Check")
        .setColor(healthStatus.status === "healthy" ? 0x00ff00 : 0xff0000)
        .addFields(
          {
            name: "📊 Status",
            value:
              healthStatus.status === "healthy" ? "✅ Healthy" : "❌ Unhealthy",
            inline: true,
          },
          {
            name: "⏱️ Response Time",
            value: healthStatus.responseTime
              ? `${healthStatus.responseTime}ms`
              : "N/A",
            inline: true,
          },
          {
            name: "🔍 Data Integrity",
            value: healthStatus.dataIntegrity.isValid
              ? "✅ Valid"
              : "❌ Invalid",
            inline: true,
          }
        )
        .setFooter({ text: "By Agha Dani" });

      if (healthStatus.error) {
        embed.addFields({
          name: "❌ Error",
          value: healthStatus.error,
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      throw error;
    }
  }

  async handleCreateBackup(interaction) {
    try {
      this.dataManager.createBackup();

      const embed = new EmbedBuilder()
        .setTitle("💾 Backup Created")
        .setDescription(
          "A new backup of all data has been created successfully."
        )
        .setColor(0x00ff00)
        .setFooter({ text: "By Agha Dani" });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      throw error;
    }
  }

  async handleValidateData(interaction) {
    try {
      const validation = this.dataManager.validateData();

      const embed = new EmbedBuilder()
        .setTitle("🔍 Data Validation")
        .setColor(validation.isValid ? 0x00ff00 : 0xff0000)
        .addFields({
          name: "📊 Status",
          value: validation.isValid
            ? "✅ All data is valid"
            : "❌ Data issues found",
          inline: false,
        })
        .setFooter({ text: "By Agha Dani" });

      if (!validation.isValid && validation.issues.length > 0) {
        embed.addFields({
          name: "⚠️ Issues Found",
          value: validation.issues.join("\n"),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      throw error;
    }
  }

  async handleRepairData(interaction) {
    try {
      this.dataManager.repairData();

      const embed = new EmbedBuilder()
        .setTitle("🔧 Data Repair")
        .setDescription("Data structure has been repaired successfully.")
        .setColor(0x00ff00)
        .setFooter({ text: "By Agha Dani" });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      throw error;
    }
  }

  async handleSystemInfo(interaction) {
    try {
      const systemInfo = this.dataManager.getSystemInfo();
      const gangs = this.dataManager.getGangs();
      const dailyStats = this.dataManager.getAllDailyStats();
      const weeklyStats = this.dataManager.getAllWeeklyStats();

      const embed = new EmbedBuilder()
        .setTitle("ℹ️ System Information")
        .setColor(0x0099ff)
        .addFields(
          {
            name: "📊 Data Statistics",
            value: `**Gangs:** ${gangs.length}\n**Daily Stats:** ${
              Object.keys(dailyStats).length
            }\n**Weekly Stats:** ${Object.keys(weeklyStats).length}`,
            inline: true,
          },
          {
            name: "🕒 Last Updates",
            value: `**Data:** ${
              systemInfo.lastUpdate
                ? new Date(systemInfo.lastUpdate).toLocaleString()
                : "Never"
            }\n**Daily Reset:** ${
              systemInfo.lastDailyReset
                ? new Date(systemInfo.lastDailyReset).toLocaleString()
                : "Never"
            }\n**Weekly Reset:** ${
              systemInfo.lastWeeklyReset
                ? new Date(systemInfo.lastWeeklyReset).toLocaleString()
                : "Never"
            }`,
            inline: true,
          },
          {
            name: "🔧 System",
            value: `**Version:** ${systemInfo.version}\n**Auto-Update:** ${
              this.autoUpdateEnabled ? "Enabled" : "Disabled"
            }\n**Active Channels:** ${this.gangsMessages.size}`,
            inline: true,
          }
        )
        .setFooter({ text: "By Agha Dani" });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      throw error;
    }
  }
}

// Start the bot
const bot = new DiscordGangBot();
bot.start();

// ==================== Express keep-alive server =====================
const app = express();
const port = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.send("✅ Discord Gang Tracker is running");
});

app.listen(port, "0.0.0.0", () => {
  console.log(`🌐 Express server listening on 0.0.0.0:${port}`);
});
