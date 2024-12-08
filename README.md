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

### Yandex Calendar Integration
* `!calendar` - Initiates the Yandex Calendar integration process. Upon invocation, the user will receive a link to grant the bot access to their Yandex Calendar data.
* `!calendar-remove` - Removes the Yandex Calendar integration for the current user. This action will revoke the bot's permission to access the user's Yandex Calendar.
* `!meet` - Creates a Yandex meeting. Variants:
   - `!meet` - Creates a quick meeting with default settings.
   - `!meet; [user-list]` - Creates a meeting with specified users.
   - `!meet; [user-list]; [meeting title]` - Creates a meeting with a title and specified users.
   - `!meet; [user-list]; [meeting title]; [60m|1h]` - Additionally, set the duration of the meeting using 'm' for minutes or 'h' for hours. Defaults to 15 minutes if no duration is specified.
   -  The `!meet` command also supports alternative syntax to provide flexibility in how meeting details are specified:
      + `!meet Meeting @username1 @username2 @username3`: Creates a meeting titled "Meeting" with specified users and sets the duration. This format allows you to place the meeting title directly after the `!meet` command.
      + `!meet @username1 @username2 @username3 Meeting 15m`: Similar functionality as above, but the meeting title "Meeting" is placed after the user list. This format is useful when you want to list all participants first before specifying the meeting title.

### Jira Time Logging
* `!jira` - Initiates the process for logging work time in Jira using calendar data. Upon using this command, you'll receive a link to a page where you can easily log your hours based on calendar events you've attended. Authentication with Jira is required, but rest assured, your credentials are not stored or logged on our server—they remain secure on your end.

### Message Forwarding
- `!forward; [id source channel]; [id target channel]; [message]; [thread-message]` - Sets up message forwarding from source to target channel with an optional message and an optional thread message. For more details on tags used in `[message]`, see the [wiki](https://github.com/deimosowen/Mattermost_CaseOneBot/wiki/Tags).
- `!forward-list` - Displays a list of all forwarding configurations.
- `!forward-remove; [id]` - Removes a specific forwarding configuration based on its ID.
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
ADMIN_ID=your_admin_id
TZ=your_time_zone
HOST=your_host
PORT=your_port
OPENAI_API_KEY=your_openai_api_key
OPENAI_API_MODEL=your_openai_api_model
OPENAI_API_TEMPERATURE=your_openai_api_temperature
OPENAI_API_TOP_P=your_openai_api_top_p
```

- `API_BASE_URL`: Your Mattermost server URL (e.g., "my-mattermost-server.com")
- `BOT_TOKEN`: Your bot token in Mattermost.
- `TZ`: Your timezone. Defaults to "UTC".
- `ADMIN_ID`: Mattermost user ID of the bot administrator.
- `HOST`: Hostname for the bot server (e.g., "localhost").
- `PORT`: Port number for the bot server (e.g., 3000).
- `OPENAI_API_KEY`: API key for OpenAI, used for generating responses.
- `OPENAI_API_MODEL`: The model of OpenAI API to use (e.g., "text-davinci-003").
- `OPENAI_API_TEMPERATURE`: Controls randomness in OpenAI's response. Range from 0 to 1.
- `OPENAI_API_TOP_P`: Nucleus sampling parameter for OpenAI's response generation.

4. Launch the bot:  
   `node index.js`

Please ensure your Mattermost server is set up to work with bots and you have obtained the appropriate token for your bot.

## Contributions

Suggestions and pull requests are welcomed!

## License

Mattermost CaseOneBot is distributed under the MIT License. See `LICENSE` for more information.
