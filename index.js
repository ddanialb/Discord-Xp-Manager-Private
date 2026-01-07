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
    this.gangTracker.botInstance = this;
    this.gangMonitor = new GangMonitor(this.client);
    this.commands = [];

    this.client.gangBot = this;
    this.gangsMessages = new Map();
    this.autoUpdateEnabled = true;
    this.gangsUsers = new Set();
    this.setupCommands();
  }

  setupEventHandlers() {
    this.client.on("ready", () => {
      console.log(`🤖 Bot is online as ${this.client.user.tag}!`);
      this.client.user.setActivity("Gang Tracker", { type: "WATCHING" });
    });

    this.client.on("interactionCreate", async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

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
          case "list":
            await this.handleListCommand(interaction);
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
        .setName("list")
        .setDescription("List all gangs sorted by XP from highest to lowest"),

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

      const commandsJson = this.commands.map(cmd => cmd.toJSON());
      
      await rest.put(Routes.applicationCommands(config.discord.clientId), {
        body: commandsJson,
      });

      console.log("✅ Successfully reloaded application (/) commands.");
      console.log(`📝 Registered commands: ${commandsJson.map(c => c.name).join(", ")}`);
    } catch (error) {
      console.error("❌ Error refreshing commands:", error);
      throw error;
    }
  }

  setupScheduling() {
    setInterval(async () => {
      await this.updateGangsMessage();
    }, 30000);

    
    setInterval(async () => {
      try {
        if (!this.autoUpdateEnabled || this.gangsMessages.size === 0) {
          await this.gangTracker.updateGangData();
        }
      } catch (error) {
        console.error("❌ Error in fallback scheduler:", error);
      }
    }, 60000);

    
    try {
      const { CronJob } = cron;
      const job = new CronJob(
        "0 0 7 * * *",
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

    setTimeout(() => {
      this.gangMonitor.start();
    }, 10000);
  }

  async handleGangsCommand(interaction) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }

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

      await this.gangTracker.updateGangData();

      const gangs = this.gangTracker.getGangs();
      const embeds = this.createGangsEmbeds(gangs);

      const message = await interaction.editReply({ embeds: embeds });

      const channel = interaction.channel;
      const botMember = channel.guild?.members.cache.get(this.client.user.id);
      let hasPermissions = true;

      if (botMember) {
        const permissions = channel.permissionsFor(botMember);
        hasPermissions =
          permissions && permissions.has(["SendMessages", "ViewChannel"]);
      }

      if (hasPermissions) {
        this.gangsMessages.set(interaction.channelId, message);

        const channelName = interaction.channel.name || "Unknown";
        console.log(
          `📝 /gangs message stored for channel #${channelName} (${interaction.channelId})`
        );
      } else {
        console.log(
          `⚠️ Cannot store message for auto-update in channel #${interaction.channel.name} (${interaction.channelId}) - missing permissions`
        );
      }

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

  async handleListCommand(interaction) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }

      await this.gangTracker.updateGangData();

      const gangsWithXp = this.gangTracker.getGangsWithDailyXp();
      const sortedGangs = gangsWithXp.sort((a, b) => b.xp - a.xp);

      const embed = new EmbedBuilder()
        .setTitle("🏴‍☠️ Gang Rankings 🏴‍☠️")
        .setColor(0x9b59b6)
        .setThumbnail("https://cdn.discordapp.com/attachments/1269782244164374679/1458543433244475667/High-Gif.gif?ex=696005ec&is=695eb46c&hm=8c53cd675be6f6be2a2df3d3d368f6ee8f12fcf88fcf7b679275617265e8e69b&")
        .setTimestamp()
        .setFooter({ text: "By Agha Dani" });

      let description = "";
      const medals = ["👑", "🥈", "🥉"];

      sortedGangs.forEach((gang, index) => {
        const medal = index < 3 ? medals[index] : `**#${index + 1}**`;
        const gangEmoji = gang.gang_name === "DARK" ? "🖤 " : "";
        const task1 = gang.task1Completed ? "✅" : "❌";
        const task2 = gang.task2Completed ? "✅" : "❌";
        
        description += `${medal} **${gangEmoji}${gang.gang_name}**\n`;
        description += `💎 **Total XP: __${gang.xp.toLocaleString()}__** | Daily: ${gang.dailyXp.toLocaleString()} | Weekly: ${gang.weeklyXp?.toLocaleString() || 0}\n`;
        description += `Tasks: ${task1}${task2} | Level: ${gang.level}\n`;
        description += index < sortedGangs.length - 1 ? "───────────────────────\n" : "";
      });

      embed.setDescription(description);

      const totalXp = sortedGangs.reduce((sum, g) => sum + g.xp, 0);
      const totalDaily = sortedGangs.reduce((sum, g) => sum + g.dailyXp, 0);
      const activeGangs = sortedGangs.filter(g => g.dailyXp > 0).length;
      
      embed.addFields(
        {
          name: "🏆 Top Gang",
          value: `**${sortedGangs[0]?.gang_name || "N/A"}**\n💎 ${sortedGangs[0]?.xp.toLocaleString() || 0} XP`,
          inline: true,
        },
        {
          name: "📊 Server Stats",
          value: `**Total Gangs:** ${sortedGangs.length}\n**Combined XP:** ${totalXp.toLocaleString()}\n**Today's XP:** ${totalDaily.toLocaleString()}`,
          inline: true,
        },
        {
          name: "⚡ Activity",
          value: `**Active Today:** ${activeGangs}/${sortedGangs.length}\n**Updated:** <t:${Math.floor(Date.now() / 1000)}:R>`,
          inline: true,
        }
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("❌ Error in handleListCommand:", error);

      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Error Loading Data")
        .setDescription("Please try again in a few moments.")
        .setColor(0xff0000)
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
      return;
    }

    try {
      await this.gangTracker.updateGangData();

      const gangs = this.gangTracker.getGangs();
      const embeds = this.createGangsEmbeds(gangs);

      for (const [channelId, message] of this.gangsMessages) {
        try {
          const channel = this.client.channels.cache.get(channelId);
          if (!channel) {
            console.log(
              `🗑️ Channel ${channelId} not found, removing from tracking`
            );
            this.gangsMessages.delete(channelId);
            continue;
          }

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

          const channelName = channel ? channel.name : "Unknown";
          console.log(
            `📝 /gangs message auto-updated in channel #${channelName} (${channelId})`
          );
        } catch (error) {
          console.error(
            `❌ Error updating message in channel ${channelId}:`,
            error
          );

          if (error.code === 10008 || error.code === 10003) {
            this.gangsMessages.delete(channelId);
            console.log(
              `🗑️ Removed invalid message reference for channel ${channelId} (message/channel not found)`
            );
          } else if (error.code === 50001) {
            this.gangsMessages.delete(channelId);
            const channel = this.client.channels.cache.get(channelId);
            const channelName = channel ? channel.name : "Unknown";
            console.log(
              `🗑️ Removed message reference for channel #${channelName} (${channelId}) - missing permissions`
            );
          } else if (error.code === 50013) {
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

    const embed = new EmbedBuilder()
      .setTitle("🏴‍☠️ DiamondRP Gang Leaderboard 🏴‍☠️")
      .setColor(0x2f3136)
      .setThumbnail("https://cdn.discordapp.com/attachments/1269782244164374679/1458543433244475667/High-Gif.gif?ex=696005ec&is=695eb46c&hm=8c53cd675be6f6be2a2df3d3d368f6ee8f12fcf88fcf7b679275617265e8e69b&")
      .setTimestamp()
      .setFooter({ text: "🔄 Auto-update: 30s • By Agha Dani" });

    let description = "";
    
    const medals = ["👑", "🥈", "🥉"];
    
    sortedGangs.slice(0, 3).forEach((gang, index) => {
      const task1 = gang.task1Completed ? "✅" : "❌";
      const task2 = gang.task2Completed ? "✅" : "❌";
      const gangEmoji = gang.gang_name === "DARK" ? "🖤 " : "";
      
      description += `${medals[index]} **${gangEmoji}${gang.gang_name}**\n`;
      description += `💎 **Total XP: __${gang.xp.toLocaleString()}__** | Daily XP: ${gang.dailyXp.toLocaleString()} | Weekly XP: ${gang.weeklyXp?.toLocaleString() || 0} | Monthly XP: ${gang.monthlyXp?.toLocaleString() || 0}\n`;
      description += `Tasks: ${task1}${task2} | Rank: #${index + 1} | Level: ${gang.level}\n\n`;
    });

    if (sortedGangs.length > 3) {
      description += "**━━━━━━ Other Gangs ━━━━━━**\n\n";
      
      sortedGangs.slice(3).forEach((gang, index) => {
        const rank = index + 4;
        const task1 = gang.task1Completed ? "✅" : "❌";
        const task2 = gang.task2Completed ? "✅" : "❌";
        const gangEmoji = gang.gang_name === "DARK" ? "🖤 " : "";
        
        description += `**${gangEmoji}${gang.gang_name}**\n`;
        description += `💎 **Total XP: __${gang.xp.toLocaleString()}__** | Daily XP: ${gang.dailyXp.toLocaleString()} | Weekly XP: ${gang.weeklyXp?.toLocaleString() || 0} | Monthly XP: ${gang.monthlyXp?.toLocaleString() || 0}\n`;
        description += `Tasks: ${task1}${task2} | Rank: #${rank} | Level: ${gang.level}\n\n`;
      });
    }

    description += `\n**🔄 Last Update:** <t:${Math.floor(Date.now() / 1000)}:R>`;

    embed.setDescription(description);

    const stats = this.calculateStats(sortedGangs);
    
    embed.addFields(
      {
        name: "📊 Live Stats",
        value: 
          `🏆 **Total Gangs:** ${stats.totalGangs}\n` +
          `⚡ **Total XP:** ${stats.totalXp.toLocaleString()}\n` +
          `📈 **Average:** ${stats.avgXp.toLocaleString()}\n` +
          `🔥 **Active Today:** ${stats.activeGangs}`,
        inline: true,
      },
      {
        name: "🎯 Task Status",
        value: this.createTaskStats(sortedGangs),
        inline: true,
      },
      {
        name: "⚡ Top Performers",
        value: this.createTopPerformers(sortedGangs),
        inline: true,
      }
    );

    return [embed];
  }

  createProgressBar(current, max) {
    const percentage = Math.min(current / max, 1);
    const filled = Math.round(percentage * 8);
    const empty = 8 - filled;
    return "█".repeat(filled) + "░".repeat(empty);
  }

  createTopPerformers(gangs) {
    const topDaily = gangs.reduce(
      (max, gang) => (gang.dailyXp > max.dailyXp ? gang : max),
      gangs[0]
    );
    const topWeekly = gangs.reduce(
      (max, gang) => (gang.weeklyXp > max.weeklyXp ? gang : max),
      gangs[0]
    );
    
    return (
      `📈 **Daily:** ${topDaily?.gang_name || "N/A"}\n` +
      `└ ${topDaily?.dailyXp.toLocaleString() || 0} XP\n` +
      `📊 **Weekly:** ${topWeekly?.gang_name || "N/A"}\n` +
      `└ ${topWeekly?.weeklyXp.toLocaleString() || 0} XP`
    );
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
      `🏆 **Both:** ${bothCompleted}/${gangs.length}\n` +
      `📈 **Rate:** ${completionRate}%`
    );
  }

  async start() {
    try {
      console.log("🚀 Starting Discord Gang Tracker Bot...");

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

      this.setupEventHandlers();

      this.setupScheduling();

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

      let successCount = 0;
      let failCount = 0;

      for (const userId of this.gangsUsers) {
        try {
          const user = await this.client.users.fetch(userId);
          if (user) {
            await user.send({ embeds: [reportEmbed] });

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

      let successCount = 0;
      let failCount = 0;

      for (const userId of this.gangsUsers) {
        try {
          const user = await this.client.users.fetch(userId);
          if (user) {
            await user.send({ embeds: [reportEmbed] });

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

      let successCount = 0;
      let failCount = 0;

      for (const userId of this.gangsUsers) {
        try {
          const user = await this.client.users.fetch(userId);
          if (user) {
            await user.send({ embeds: [reportEmbed] });

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

const bot = new DiscordGangBot();
bot.start();

const app = express();
const port = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.send("✅ Discord Gang Tracker is running");
});

app.listen(port, "0.0.0.0", () => {
  console.log(`🌐 Express server listening on 0.0.0.0:${port}`);
});
