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
    this.gangTracker.botInstance = this; // Set bot instance reference
    this.gangMonitor = new GangMonitor(this.client);
    this.commands = [];

    this.client.gangBot = this;
    this.gangsMessages = new Map();
    this.autoUpdateEnabled = true;
    this.gangsUsers = new Set(); // Track users who used /gangs command
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
    // Auto-update /gangs message every 30 seconds
    // This will also handle daily/weekly/monthly resets when needed
    setInterval(async () => {
      await this.updateGangsMessage();
    }, 30000); // 30 seconds

    // Fallback scheduler: ensure resets/reports run even without stored /gangs messages
    setInterval(async () => {
      try {
        if (!this.autoUpdateEnabled || this.gangsMessages.size === 0) {
          await this.gangTracker.updateGangData();
        }
      } catch (error) {
        console.error("❌ Error in fallback scheduler:", error);
      }
    }, 60000); // 1 minute

    // Exact 7:00 AM Tehran time daily reset + DM via cron
    try {
      const { CronJob } = cron;
      const job = new CronJob(
        "0 0 7 * * *", // second minute hour day month dayOfWeek
        async () => {
          try {
            console.log("⏰ Cron: Triggering exact 7:00 AM Tehran daily reset");
            await this.gangTracker.forceDailyReset();
          } catch (err) {
            console.error("❌ Error during cron daily reset:", err);
          }
        },
        null,
        true,
        "Asia/Tehran"
      );

      job.start();
      console.log("🗓️ Cron job scheduled for 7:00 AM Asia/Tehran daily reset");
    } catch (error) {
      console.error("❌ Failed to schedule 7:00 AM cron job:", error);
    }

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
            "║       🔄 FETCHING DATA... 🔄        ║\n" +
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

      // Check if bot has permission to send messages in this channel before storing
      const channel = interaction.channel;
      const botMember = channel.guild?.members.cache.get(this.client.user.id);
      let hasPermissions = true;

      if (botMember) {
        const permissions = channel.permissionsFor(botMember);
        hasPermissions =
          permissions && permissions.has(["SendMessages", "ViewChannel"]);
      }

      if (hasPermissions) {
        // Store the message for this specific channel
        this.gangsMessages.set(interaction.channelId, message);

        // Get channel name for better logging
        const channelName = interaction.channel.name || "Unknown";
        console.log(
          `📝 /gangs message stored for channel #${channelName} (${interaction.channelId})`
        );
      } else {
        console.log(
          `⚠️ Cannot store message for auto-update in channel #${interaction.channel.name} (${interaction.channelId}) - missing permissions`
        );
      }

      // Track user who used /gangs command
      this.gangsUsers.add(interaction.user.id);
    } catch (error) {
      console.error("❌ Error in handleGangsCommand:", error);

      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Error Loading Data")
        .setDescription(
          "```ansi\n" +
            "╔══════════════════════════════════════╗\n" +
            "║         ❌ ERROR OCCURRED ❌        ║\n" +
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
          // Check if bot has permission to send messages in this channel
          const channel = this.client.channels.cache.get(channelId);
          if (!channel) {
            console.log(
              `🗑️ Channel ${channelId} not found, removing from tracking`
            );
            this.gangsMessages.delete(channelId);
            continue;
          }

          // Check bot permissions in the channel
          const botMember = channel.guild?.members.cache.get(
            this.client.user.id
          );
          if (botMember) {
            const permissions = channel.permissionsFor(botMember);
            if (
              !permissions ||
              !permissions.has(["SendMessages", "ViewChannel"])
            ) {
              console.log(
                `❌ Missing permissions in channel #${channel.name} (${channelId}), removing from tracking`
              );
              this.gangsMessages.delete(channelId);
              continue;
            }
          }

          await message.edit({ embeds: embeds });

          // Get channel name for better logging
          const channelName = channel ? channel.name : "Unknown";
          console.log(
            `📝 /gangs message auto-updated in channel #${channelName} (${channelId})`
          );
        } catch (error) {
          console.error(
            `❌ Error updating message in channel ${channelId}:`,
            error
          );

          // Handle different error types
          if (error.code === 10008 || error.code === 10003) {
            // Message not found or channel not found
            this.gangsMessages.delete(channelId);
            console.log(
              `🗑️ Removed invalid message reference for channel ${channelId} (message/channel not found)`
            );
          } else if (error.code === 50001) {
            // Missing access/permissions
            this.gangsMessages.delete(channelId);
            const channel = this.client.channels.cache.get(channelId);
            const channelName = channel ? channel.name : "Unknown";
            console.log(
              `🗑️ Removed message reference for channel #${channelName} (${channelId}) - missing permissions`
            );
          } else if (error.code === 50013) {
            // Missing permissions
            this.gangsMessages.delete(channelId);
            const channel = this.client.channels.cache.get(channelId);
            const channelName = channel ? channel.name : "Unknown";
            console.log(
              `🗑️ Removed message reference for channel #${channelName} (${channelId}) - insufficient permissions`
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
      const displayRank = index + 1; // Use the sorted position as rank

      description += `${medal} **${gang.gang_name}**\n`;
      description += `   💎 Total XP: ${gang.xp.toLocaleString()} | Daily XP: ${gang.dailyXp.toLocaleString()} | Weekly XP: ${gang.weeklyXp.toLocaleString()} | Monthly XP: ${gang.monthlyXp.toLocaleString()}\n`;
      description += `   🎯 Tasks: ${task1Status} ${task2Status} | Rank: #${displayRank} | Level: ${gang.level}\n\n`;
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
    const topMonthly = gangs.reduce(
      (max, gang) => (gang.monthlyXp > max.monthlyXp ? gang : max),
      gangs[0]
    );
    const avgDaily = Math.round(
      gangs.reduce((sum, gang) => sum + gang.dailyXp, 0) / gangs.length
    );
    const avgWeekly = Math.round(
      gangs.reduce((sum, gang) => sum + gang.weeklyXp, 0) / gangs.length
    );
    const avgMonthly = Math.round(
      gangs.reduce((sum, gang) => sum + gang.monthlyXp, 0) / gangs.length
    );

    return (
      `📈 **Top Daily:** ${
        topDaily.gang_name
      } (${topDaily.dailyXp.toLocaleString()})\n` +
      `📊 **Top Weekly:** ${
        topWeekly.gang_name
      } (${topWeekly.weeklyXp.toLocaleString()})\n` +
      `📅 **Top Monthly:** ${
        topMonthly.gang_name
      } (${topMonthly.monthlyXp.toLocaleString()})\n` +
      `📉 **Avg Daily:** ${avgDaily.toLocaleString()}\n` +
      `📊 **Avg Weekly:** ${avgWeekly.toLocaleString()}\n` +
      `📅 **Avg Monthly:** ${avgMonthly.toLocaleString()}\n` +
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

  async sendDailyReportToUsers() {
    try {
      const report = this.gangTracker.getLastDailyReport();
      if (!report) {
        console.log("📊 No daily report available to send");
        return;
      }

      if (this.gangsUsers.size === 0) {
        console.log("📊 No users to send daily report to");
        return;
      }

      console.log(`📤 Sending daily report to ${this.gangsUsers.size} users`);

      // Create embed for the report
      const reportEmbed = new EmbedBuilder()
        .setTitle("📊 Daily Gang Report")
        .setDescription(
          `**Date:** ${report.date}\n**Generated:** <t:${Math.floor(
            new Date(report.generatedAt).getTime() / 1000
          )}:R>`
        )
        .setColor(0x00ff00)
        .addFields(
          {
            name: "📈 Summary",
            value: `**Total Gangs:** ${
              report.summary.totalGangs
            }\n**Active Gangs:** ${
              report.summary.activeGangs
            }\n**Total Daily XP:** ${report.summary.totalDailyXp.toLocaleString()}\n**Total Weekly XP:** ${report.summary.totalWeeklyXp.toLocaleString()}`,
            inline: true,
          },
          {
            name: "🎯 Task Progress",
            value: `**Task 1:** ${report.summary.task1Completed}/${report.summary.totalGangs}\n**Task 2:** ${report.summary.task2Completed}/${report.summary.totalGangs}\n**Both Tasks:** ${report.summary.bothTasksCompleted}/${report.summary.totalGangs}`,
            inline: true,
          }
        )
        .setTimestamp()
        .setFooter({ text: "By Agha Dani" });

      // Add top 3 daily performers
      const topDaily = report.dailyStats
        .sort((a, b) => b.totalXp - a.totalXp)
        .slice(0, 3);

      if (topDaily.length > 0) {
        let topPerformers = "";
        topDaily.forEach((gang, index) => {
          const medal = index === 0 ? "🏆" : index === 1 ? "🥈" : "🥉";
          topPerformers += `${medal} **${
            gang.gang_name
          }**: ${gang.totalXp.toLocaleString()} XP\n`;
        });

        reportEmbed.addFields({
          name: "🏆 Top Daily Performers",
          value: topPerformers,
          inline: false,
        });
      }

      // Send to all tracked users
      let successCount = 0;
      let failCount = 0;

      for (const userId of this.gangsUsers) {
        try {
          const user = await this.client.users.fetch(userId);
          if (user) {
            // Send the embed
            await user.send({ embeds: [reportEmbed] });

            // Also send the text file as attachment
            const fs = require("fs-extra");
            const path = require("path");
            const txtFile = path.join(
              __dirname,
              "data",
              "reports",
              `daily-report-${report.date}.txt`
            );

            if (await fs.pathExists(txtFile)) {
              await user.send({
                content: "📄 **Detailed Report File:**",
                files: [
                  {
                    attachment: txtFile,
                    name: `daily-report-${report.date}.txt`,
                  },
                ],
              });
            }

            successCount++;
            console.log(`📤 Daily report sent to ${user.tag} (${userId})`);
          }
        } catch (error) {
          failCount++;
          console.error(
            `❌ Failed to send daily report to user ${userId}:`,
            error.message
          );

          // If user blocked the bot or doesn't allow DMs, remove from tracking
          if (error.code === 50007 || error.code === 50013) {
            this.gangsUsers.delete(userId);
            console.log(
              `🗑️ Removed user ${userId} from tracking (blocked DMs)`
            );
          }
        }
      }

      console.log(
        `📊 Daily report sending completed: ${successCount} success, ${failCount} failed`
      );
    } catch (error) {
      console.error("❌ Error sending daily report to users:", error);
    }
  }

  async sendWeeklyReportToUsers() {
    try {
      const report = this.gangTracker.getLastWeeklyReport();
      if (!report) {
        console.log("📊 No weekly report available to send");
        return;
      }

      if (this.gangsUsers.size === 0) {
        console.log("📊 No users to send weekly report to");
        return;
      }

      console.log(`📤 Sending weekly report to ${this.gangsUsers.size} users`);

      // Create embed for the report
      const reportEmbed = new EmbedBuilder()
        .setTitle("📊 Weekly Gang Report")
        .setDescription(
          `**Week:** ${report.weekStart} to ${
            report.weekEnd
          }\n**Generated:** <t:${Math.floor(
            new Date(report.generatedAt).getTime() / 1000
          )}:R>`
        )
        .setColor(0x0099ff)
        .addFields({
          name: "📈 Summary",
          value: `**Total Gangs:** ${
            report.summary.totalGangs
          }\n**Active Gangs:** ${
            report.summary.activeGangs
          }\n**Total Weekly XP:** ${report.summary.totalWeeklyXp.toLocaleString()}`,
          inline: true,
        })
        .setTimestamp()
        .setFooter({ text: "By Agha Dani" });

      // Add top 5 weekly performers
      const topWeekly = report.weeklyStats
        .sort((a, b) => b.totalXp - a.totalXp)
        .slice(0, 5);

      if (topWeekly.length > 0) {
        let topPerformers = "";
        topWeekly.forEach((gang, index) => {
          const medal =
            index === 0 ? "🏆" : index === 1 ? "🥈" : index === 2 ? "🥉" : "🎖️";
          topPerformers += `${medal} **${
            gang.gang_name
          }**: ${gang.totalXp.toLocaleString()} XP\n`;
        });

        reportEmbed.addFields({
          name: "🏆 Top Weekly Performers",
          value: topPerformers,
          inline: false,
        });
      }

      // Send to all tracked users
      let successCount = 0;
      let failCount = 0;

      for (const userId of this.gangsUsers) {
        try {
          const user = await this.client.users.fetch(userId);
          if (user) {
            // Send the embed
            await user.send({ embeds: [reportEmbed] });

            // Also send the text file as attachment
            const fs = require("fs-extra");
            const path = require("path");
            const txtFile = path.join(
              __dirname,
              "data",
              "reports",
              `weekly-report-${report.weekStart}-to-${report.weekEnd}.txt`
            );

            if (await fs.pathExists(txtFile)) {
              await user.send({
                content: "📄 **Detailed Weekly Report File:**",
                files: [
                  {
                    attachment: txtFile,
                    name: `weekly-report-${report.weekStart}-to-${report.weekEnd}.txt`,
                  },
                ],
              });
            }

            successCount++;
            console.log(`📤 Weekly report sent to ${user.tag} (${userId})`);
          }
        } catch (error) {
          failCount++;
          console.error(
            `❌ Failed to send weekly report to user ${userId}:`,
            error.message
          );

          // If user blocked the bot or doesn't allow DMs, remove from tracking
          if (error.code === 50007 || error.code === 50013) {
            this.gangsUsers.delete(userId);
            console.log(
              `🗑️ Removed user ${userId} from tracking (blocked DMs)`
            );
          }
        }
      }

      console.log(
        `📊 Weekly report sending completed: ${successCount} success, ${failCount} failed`
      );
    } catch (error) {
      console.error("❌ Error sending weekly report to users:", error);
    }
  }

  async sendMonthlyReportToUsers() {
    try {
      const report = this.gangTracker.getLastMonthlyReport();
      if (!report) {
        console.log("📊 No monthly report available to send");
        return;
      }

      if (this.gangsUsers.size === 0) {
        console.log("📊 No users to send monthly report to");
        return;
      }

      console.log(`📤 Sending monthly report to ${this.gangsUsers.size} users`);

      // Create embed for the report
      const reportEmbed = new EmbedBuilder()
        .setTitle("📊 Monthly Gang Report")
        .setDescription(
          `**Month:** ${report.month}\n**Period:** ${report.monthStart} to ${
            report.monthEnd
          }\n**Generated:** <t:${Math.floor(
            new Date(report.generatedAt).getTime() / 1000
          )}:R>`
        )
        .setColor(0xff6600)
        .addFields({
          name: "📈 Summary",
          value: `**Total Gangs:** ${
            report.summary.totalGangs
          }\n**Active Gangs:** ${
            report.summary.activeGangs
          }\n**Total Monthly XP:** ${report.summary.totalMonthlyXp.toLocaleString()}`,
          inline: true,
        })
        .setTimestamp()
        .setFooter({ text: "By Agha Dani" });

      // Add top 5 monthly performers
      const topMonthly = report.monthlyStats
        .sort((a, b) => b.totalXp - a.totalXp)
        .slice(0, 5);

      if (topMonthly.length > 0) {
        let topPerformers = "";
        topMonthly.forEach((gang, index) => {
          const medal =
            index === 0 ? "🏆" : index === 1 ? "🥈" : index === 2 ? "🥉" : "🎖️";
          topPerformers += `${medal} **${
            gang.gang_name
          }**: ${gang.totalXp.toLocaleString()} XP\n`;
        });

        reportEmbed.addFields({
          name: "🏆 Top Monthly Performers",
          value: topPerformers,
          inline: false,
        });
      }

      // Send to all tracked users
      let successCount = 0;
      let failCount = 0;

      for (const userId of this.gangsUsers) {
        try {
          const user = await this.client.users.fetch(userId);
          if (user) {
            // Send the embed
            await user.send({ embeds: [reportEmbed] });

            // Also send the text file as attachment
            const fs = require("fs-extra");
            const path = require("path");
            const txtFile = path.join(
              __dirname,
              "data",
              "reports",
              `monthly-report-${report.month.replace(" ", "-")}.txt`
            );

            if (await fs.pathExists(txtFile)) {
              await user.send({
                content: "📄 **Detailed Monthly Report File:**",
                files: [
                  {
                    attachment: txtFile,
                    name: `monthly-report-${report.month.replace(
                      " ",
                      "-"
                    )}.txt`,
                  },
                ],
              });
            }

            successCount++;
            console.log(`📤 Monthly report sent to ${user.tag} (${userId})`);
          }
        } catch (error) {
          failCount++;
          console.error(
            `❌ Failed to send monthly report to user ${userId}:`,
            error.message
          );

          // If user blocked the bot or doesn't allow DMs, remove from tracking
          if (error.code === 50007 || error.code === 50013) {
            this.gangsUsers.delete(userId);
            console.log(
              `🗑️ Removed user ${userId} from tracking (blocked DMs)`
            );
          }
        }
      }

      console.log(
        `📊 Monthly report sending completed: ${successCount} success, ${failCount} failed`
      );
    } catch (error) {
      console.error("❌ Error sending monthly report to users:", error);
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

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    bot_status: bot.client.isReady() ? "connected" : "disconnected"
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`🌐 Express server listening on 0.0.0.0:${port}`);
});
