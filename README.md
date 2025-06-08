# Mattermost CaseOneBot

CaseOneBot is a multifunctional assistant for Mattermost. It began as a simple cron-based reminder tool and now manages duty rotations, channel invites, Yandex Calendar meetings, Jira helpers, message forwarding, and ChatGPT functions. Use it to automate routine tasks and keep your team organized.

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
* `!calendar-settings` - Alias for `!calendar` command.
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

### ChatGPT Functions
The bot can also perform various functions using the ChatGPT API. Please refer to the [wiki](https://github.com/deimosowen/Mattermost_CaseOneBot/wiki/Functions) for a detailed description of these functions.
### Miscellaneous
* `!ping` - Check the bot response.
* `!sendAs; [channel/message id]; [text]` - Post a message as admin.

### Jira Workflow Helpers
* `!review; [task-key]; [link]; [reviewer]` - Send a task to review and post details.
* `!reop; [comment]` - Reopen a task from review status with an optional comment.

### Duty Statistics
* `!stat` - Generate statistics for the current channel.


## Installation

1. Clone the repository to your server:  
   `git clone https://github.com/deimosowen/Mattermost_CaseOneBot.git`

2. Install all dependencies:  
   `npm install`

3. Create a `.env` file in the root folder of the project and specify the following environment variables:
```
API_BASE_URL=your_mattermost_url
BOT_TOKEN=your_bot_token
TEAM_CHANNEL_ID=your_team_channel_id
TEAM_CHANNEL_PREFIX=your_team_channel_prefix
INREVIEW_CHANNEL_IDS=channel_id_1,channel_id_2
ADMIN_ID=your_admin_id
TZ=your_time_zone
OPENAI_BASE_URL=your_openai_base_url
OPENAI_API_KEY=your_openai_api_key
OPENAI_API_MODEL=your_openai_api_model
OPENAI_API_TEMPERATURE=your_openai_api_temperature
OPENAI_API_TOP_P=your_openai_api_top_p
OPENAI_SESSION_TOKEN=your_openai_session_token
OPENAI_DALLE_API_KEY=your_dalle_api_key
HOST=your_host
PORT=your_port
JIRA_API_URL=your_jira_api_url
JIRA_HOST=your_jira_host
JIRA_ROOT_TASK_ID=your_jira_root_task_id
JIRA_BOT_USERNAME=your_jira_bot_username
JIRA_BOT_PASSWORD=your_jira_bot_password
INVITE_DAYS_THRESHOLD=30
ABSENCE_BASE_URL=your_absence_api_url
ABSENCE_API_TOKEN=your_absence_api_token
YANDEX_CLIENT_ID=your_yandex_client_id
YANDEX_CLIENT_SECRET=your_yandex_client_secret
YANDEX_REDIRECT_URI=your_yandex_redirect_uri
REDIS_HOST=your_redis_host
REDIS_PORT=your_redis_port
REDIS_PASSWORD=your_redis_password
```

- `API_BASE_URL`: Your Mattermost server URL.
- `BOT_TOKEN`: Bot token in Mattermost.
- `TEAM_CHANNEL_ID`: ID of the default channel for invites.
- `TEAM_CHANNEL_PREFIX`: Prefix used to filter team channels for invites.
- `INREVIEW_CHANNEL_IDS`: Comma-separated IDs of channels used for code review.
- `ADMIN_ID`: Mattermost user ID of the bot administrator.
- `TZ`: Timezone used for scheduling.
- `OPENAI_BASE_URL`: Base URL of the OpenAI API.
- `OPENAI_API_KEY`: API key for OpenAI.
- `OPENAI_API_MODEL`: Model of the OpenAI API to use.
- `OPENAI_API_TEMPERATURE`: Randomness factor for OpenAI responses.
- `OPENAI_API_TOP_P`: Nucleus sampling parameter for OpenAI.
- `OPENAI_SESSION_TOKEN`: Session token for ChatGPT API.
- `OPENAI_DALLE_API_KEY`: API key for DALL-E image generation.
- `HOST`: Hostname for the bot server.
- `PORT`: Port number for the bot server.
- `JIRA_API_URL`: URL of the Jira proxy service.
- `JIRA_HOST`: Hostname of your Jira instance.
- `JIRA_ROOT_TASK_ID`: ID of the root Jira task used for logging work.
- `JIRA_BOT_USERNAME`: Jira username for the bot.
- `JIRA_BOT_PASSWORD`: Jira password for the bot account.
- `INVITE_DAYS_THRESHOLD`: Days of inactivity to show a channel as inactive.
- `ABSENCE_BASE_URL`: Base URL of the absence tracking service.
- `ABSENCE_API_TOKEN`: API token for the absence service.
- `YANDEX_CLIENT_ID`: OAuth client ID for Yandex integrations.
- `YANDEX_CLIENT_SECRET`: OAuth client secret for Yandex.
- `YANDEX_REDIRECT_URI`: Redirect URI for Yandex OAuth.
- `REDIS_HOST`: Hostname of the Redis server.
- `REDIS_PORT`: Redis server port.
- `REDIS_PASSWORD`: Redis password.

4. Launch the bot:  
   `node index.js`

Please ensure your Mattermost server is set up to work with bots and you have obtained the appropriate token for your bot.

## Contributions

Suggestions and pull requests are welcomed!

## License

Mattermost CaseOneBot is distributed under the MIT License. See `LICENSE` for more information.
