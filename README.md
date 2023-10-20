# Mattermost CaseOneBot

Mattermost CaseOneBot is a handy tool designed to offer reminder functionality within your Mattermost team. This bot is equipped with features to set reminders via a cron schedule.

## Key Commands

* `!reminder; [cron-schedule]; [message]` - Sets a reminder with the specified message based on the cron schedule.
* `!reminder-remove; [id]` - Removes the reminder with the specified ID.
* `!reminder-list` - Displays a list of all set reminders.
* `!reminder-help` - Shows all available commands for the bot.

## Installation

1. Clone the repository to your server:  
   `git clone https://github.com/deimosowen/Mattermost_CaseOneBot.git`

2. Install all dependencies:  
   `npm install`

3. Create a `.env` file in the root folder of the project and specify the following environment variables:

```
API_BASE_URL=your_mattermost_url
BOT_TOKEN=your_bot_token
TZ=your_time_zone
```

- `API_BASE_URL`: Your Mattermost server URL (e.g., "my-mattermost-server.com")
- `BOT_TOKEN`: Your bot token in Mattermost.
- `TZ`: Your timezone. Defaults to "UTC".

4. Launch the bot:  
   `node index.js`

Please ensure your Mattermost server is set up to work with bots and you have obtained the appropriate token for your bot.

## Contributions

Suggestions and pull requests are welcomed!

## License

Mattermost EchoBot is distributed under the MIT License. See `LICENSE` for more information.
