# Discord Gang Tracker Bot

A Discord bot that tracks gang data from DiamondRP API and displays real-time information about gang XP, tasks, and rankings.

## Features

- **Real-time Gang Monitoring**: Tracks 20 gangs every 30 seconds
- **Daily XP Tracking**: Monitors XP gained from 7 AM to 7 AM daily
- **Weekly XP Tracking**: Tracks weekly XP gains (resets Monday 7 AM)
- **Gang Task Detection**: Detects when gangs complete tasks (+500 XP)
- **Auto-updating Messages**: `/gangs` messages update automatically
- **Persistent Data**: All data is saved and restored on restart

## Commands

- `/gangs` - Display all gangs with current data
- `/gangsupdate` - Control auto-update of `/gangs` messages

## Setup

### Option 1: Using Environment Variables (Recommended)

1. Copy `env.template` to `.env`
2. Fill in your Discord bot token and other configuration in `.env`
3. Run `npm install`
4. Run `npm start`

### Option 2: Using config.js

1. Copy `config.example.js` to `config.js`
2. Add your Discord bot token to `config.js`
3. Run `npm install`
4. Run `npm start`

### Environment Variables

The bot supports the following environment variables (all optional, with fallbacks to config.js):

- `DISCORD_TOKEN` - Your Discord bot token
- `DISCORD_CLIENT_ID` - Your Discord client ID
- `DISCORD_GUILD_ID` - Your Discord guild ID (optional)
- `API_URL` - API endpoint URL
- `API_TIMEOUT` - API request timeout in milliseconds
- `API_USER_AGENT` - User agent for API requests
- `MONITORING_CHECK_INTERVAL` - Gang monitoring interval in milliseconds
- `MONITORING_XP_THRESHOLD` - XP threshold for task detection
- `MONITORING_CHANNELS` - Comma-separated list of channel IDs for alerts
- `SCHEDULING_DAILY_UPDATE` - Cron expression for daily updates
- `SCHEDULING_FIRST_START` - First period start time
- `SCHEDULING_FIRST_END` - First period end time
- `SCHEDULING_SECOND_START` - Second period start time
- `SCHEDULING_SECOND_END` - Second period end time

## Gang Task System

- **Task 1**: 7 AM - 6 PM (✅ when +500 XP gained)
- **Task 2**: 6 PM - 7 AM (✅ when +500 XP gained)
- **Daily Reset**: 7 AM (all daily XP and tasks reset)
- **Weekly Reset**: Monday 7 AM (weekly XP resets)

## Data Files

- `data/gangs.json` - Main gang data
- `data/daily_xp.json` - Daily XP and task status
- `data/weekly_xp.json` - Weekly XP tracking

## Author

By Agha Dani
