# 🏴‍☠️ DiamondRP Gang Tracker Bot

A powerful Discord bot that tracks gang data from DiamondRP API and provides real-time monitoring of gang XP, tasks, rankings, and performance statistics.

## ✨ Features

### 🎯 Core Functionality

- **Real-time Gang Monitoring**: Tracks 20+ gangs every 30 seconds
- **Multi-period XP Tracking**: Daily, Weekly, and Monthly XP monitoring
- **Intelligent Task Detection**: Automatically detects gang task completions (+500 XP)
- **Auto-updating Leaderboard**: `/gangs` messages update automatically every 30 seconds
- **Persistent Data Storage**: All data is saved and restored on restart
- **Comprehensive Reporting**: Daily, Weekly, and Monthly reports with detailed statistics

### 🕐 Automated Scheduling

- **Daily Reset**: Exactly at 7:00 AM Iran time (Asia/Tehran timezone)
- **Weekly Reset**: Every Sunday at 7:00 AM Iran time
- **Monthly Reset**: First day of each month at 7:00 AM Iran time
- **Cron Job Integration**: Reliable scheduling using node-cron with proper timezone support

### 📊 Advanced Analytics

- **Live Statistics**: Total gangs, active gangs, average XP, top performers
- **Task Progress Tracking**: Real-time task completion monitoring
- **Performance Metrics**: Top daily, weekly, and monthly performers
- **Completion Rates**: Task completion statistics and percentages

### 🔔 Smart Notifications

- **DM Reports**: Automatic daily/weekly/monthly reports sent to users
- **Rank Change Alerts**: Real-time notifications when gang ranks change
- **XP Change Monitoring**: Significant XP changes are tracked and reported
- **Error Handling**: Robust error handling with detailed logging

## 🎮 Commands

### `/gangs`

Display a comprehensive gang leaderboard with:

- Current rankings and XP totals
- Daily, Weekly, and Monthly XP breakdowns
- Task completion status (✅/❌)
- Live statistics and performance metrics
- Auto-updating every 30 seconds

### `/gangsupdate`

Control the auto-update functionality:

- **Enable**: Start automatic updates every 30 seconds
- **Disable**: Stop automatic updates (manual only)

## 🚀 Setup & Installation

### Prerequisites

- Node.js 16+
- Discord Bot Token
- Discord Application with proper permissions

### Quick Start

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd XP
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment**

   ```bash
   cp .env.example .env
   # Edit .env with your Discord bot token
   ```

4. **Start the bot**
   ```bash
   npm start
   ```

### Environment Variables

| Variable            | Description                   | Default  |
| ------------------- | ----------------------------- | -------- |
| `DISCORD_TOKEN`     | Discord bot token             | Required |
| `DISCORD_CLIENT_ID` | Discord application client ID | Required |
| `DISCORD_GUILD_ID`  | Discord server ID (optional)  | -        |
| `PORT`              | Express server port           | 10000    |

### Bot Permissions Required

- Send Messages
- Use Slash Commands
- Embed Links
- Attach Files
- Read Message History

## 🎯 Gang Task System

### Task Windows

- **Task 1**: 7:00 AM - 6:00 PM Iran time
- **Task 2**: 6:00 PM - 7:00 AM Iran time

### Task Detection

- Automatically detects when a gang gains exactly +500 XP
- Marks task as completed based on time window
- Tracks individual task XP separately
- Resets all task status daily at 7:00 AM

### Reset Schedule

- **Daily Reset**: 7:00 AM Iran time (exact minute)
- **Weekly Reset**: Sunday 7:00 AM Iran time
- **Monthly Reset**: 1st of month 7:00 AM Iran time

## 📁 Data Structure

### Files

- `data/gangs.json` - Main gang data and rankings
- `data/daily_xp.json` - Daily XP and task completion status
- `data/weekly_xp.json` - Weekly XP tracking
- `data/monthly_xp.json` - Monthly XP tracking
- `data/reports/` - Generated daily/weekly/monthly reports

### Data Format

```json
{
  "gang_name": "GangName",
  "totalXp": 1000,
  "task1Completed": true,
  "task2Completed": false,
  "task1Xp": 500,
  "task2Xp": 0
}
```

## 🔧 Technical Details

### Architecture

- **Modular Design**: Separate classes for tracking, monitoring, and bot functionality
- **Error Handling**: Comprehensive error handling with retry logic
- **Memory Management**: Efficient data structures and cleanup
- **Timezone Support**: Proper Iran timezone handling with DST support

### Performance

- **Update Frequency**: 30-second intervals for real-time updates
- **API Optimization**: Efficient API calls with timeout handling
- **Data Persistence**: Automatic data saving and loading
- **Memory Usage**: Optimized for long-running operation

### Monitoring

- **Health Checks**: Express server for uptime monitoring
- **Logging**: Detailed console logging for debugging
- **Error Recovery**: Automatic recovery from API failures
- **Status Tracking**: Real-time bot status monitoring

## 📊 Reporting System

### Daily Reports

- Generated every day at 7:00 AM before reset
- Includes daily XP rankings and task completion
- Sent via DM to users who used `/gangs` command
- Saved as both JSON and TXT files

### Weekly Reports

- Generated every Sunday at 7:00 AM
- Shows weekly performance rankings
- Comprehensive weekly statistics

### Monthly Reports

- Generated on the 1st of each month
- Long-term performance analysis
- Monthly trend tracking

## 🛠️ Development

### Project Structure

```
├── src/
│   ├── GangTracker.js    # Core tracking logic
│   └── GangMonitor.js    # Monitoring and alerts
├── data/                 # Data storage
├── index.js             # Main bot file
├── config.js            # Configuration
└── package.json         # Dependencies
```

### Key Classes

- **DiscordGangBot**: Main bot class with Discord integration
- **GangTracker**: Core data tracking and reset logic
- **GangMonitor**: Real-time monitoring and alerts

## 🐛 Troubleshooting

### Common Issues

1. **Bot not responding**: Check Discord token and permissions
2. **No data updates**: Verify API connectivity and rate limits
3. **Reset not working**: Check timezone settings and cron job
4. **DM not sending**: Ensure users have used `/gangs` command

### Debug Mode

Enable detailed logging by setting environment variable:

```bash
DEBUG=true npm start
```

## 📈 Future Enhancements

- [ ] Web dashboard for gang statistics
- [ ] Custom gang alerts and notifications
- [ ] Historical data analysis
- [ ] Gang comparison tools
- [ ] Mobile app integration

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 👨‍💻 Author

**Agha Dani** - Discord Gang Tracker Bot

---

_Built with ❤️ for the DiamondRP community_
