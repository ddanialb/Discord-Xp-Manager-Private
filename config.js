// Load environment variables
require("dotenv").config();

module.exports = {
  // Discord Bot Configuration
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID, // Optional: for testing
  },

  // API Configuration
  api: {
    url: process.env.API_URL,
    timeout: parseInt(process.env.API_TIMEOUT, 10),
    userAgent: process.env.API_USER_AGENT,
  },

  // Monitoring Configuration
  monitoring: {
    checkInterval: parseInt(process.env.MONITORING_CHECK_INTERVAL, 10), // 30 seconds
    xpThreshold: parseInt(process.env.MONITORING_XP_THRESHOLD, 10), // Alert when gang gains 500+ XP
    channels: process.env.MONITORING_CHANNELS
      ? process.env.MONITORING_CHANNELS.split(",").map((id) => id.trim())
      : [], // Add channel IDs for gang alerts
  },

  // Scheduling Configuration
  scheduling: {
    dailyUpdate: process.env.SCHEDULING_DAILY_UPDATE, // 7:00 AM daily
    resetPeriods: {
      first: {
        start: process.env.SCHEDULING_FIRST_START,
        end: process.env.SCHEDULING_FIRST_END,
      },
      second: {
        start: process.env.SCHEDULING_SECOND_START,
        end: process.env.SCHEDULING_SECOND_END,
      },
    },
  },
};
