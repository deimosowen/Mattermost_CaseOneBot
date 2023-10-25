# Mattermost CaseOneBot

More than just reminders. This robust bot was designed initially for cron-based reminders within your Mattermost team. As it grew, features like duty scheduling, channel invitations, and calendar integrations were incorporated. Enhance your team's productivity and streamline your Mattermost experience with CaseOneBot

## Key Commands

### Reminders
* `!reminder; [cron-schedule]; [message]` - Sets a reminder with the specified message based on the cron schedule.
* `!reminder-remove; [id]` - Removes the reminder with the specified ID.
* `!reminder-list` - Displays a list of all set reminders.
* `!reminder-help` - Shows all available commands for the bot's reminder functionality.

### Duty Scheduling
* `!duty; [cron-schedule]; [user-list]` - Sets a duty schedule. The user-list should be comma-separated.
* `!duty-remove` - Removes the duty schedule for the current channel.
* `!duty-current` - Displays the current duty user for the channel.
* `!duty-next` - Transitions to the next user in the duty list for the current channel.
* `!duty-help` - Displays all available commands for the bot's duty scheduling functionality.

### Invite to Channel
* `!invite; [channel-link/channel-name]` - Invites the user to the specified channel. You can use either a channel link or a channel name.
   Examples:
   - Using the channel name: `!invite; general`
   - Using the channel link: `!invite; https://your-mattermost-server.com/teamname/channels/general`

### Google Calendar Integration
* `!calendar` - Initiates the Google Calendar integration process. Upon invocation, the user will receive a link to grant the bot access to their Google Calendar data (read-only).
* `!calendar-remove` - Removes the Google Calendar integration for the current user. This action will revoke the bot's permission to access the user's Google Calendar.

### Message Forwarding
- `!forward ; [id source channel] ; [id target channel] ; [message] ; [thread-message]` - Sets up message forwarding from source to target channel with an optional message and an optional thread message. For more details on tags used in `[message]`, see the [wiki](https://github.com/deimosowen/Mattermost_CaseOneBot/wiki/Tags).
- `!forward-list` - Displays a list of all forwarding configurations.
- `!forward-remove ; [id]` - Removes a specific forwarding configuration based on its ID.
- `!forward-help` - Shows all available commands for the bot's forwarding functionality.

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

Mattermost CaseOneBot is distributed under the MIT License. See `LICENSE` for more information.
