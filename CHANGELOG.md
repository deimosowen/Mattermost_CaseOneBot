# Changelog

All notable changes to this project will be documented in this file.

## [2.2.7]

### Added

#### Authentication System
- **Yandex OAuth authentication**: Added user authentication via Yandex OAuth using Passport.js
  - Session-based authentication with SQLite storage
  - Automatic redirect to home page for unauthorized users
  - User information display in navigation bar (name, email, avatar)
  - Logout functionality
- **Email domain restriction**: Configurable allowed email domains for authentication
  - Default: `pravo.tech`
  - Configurable via `ALLOWED_EMAIL_DOMAINS` environment variable (comma-separated list)
  - Users with unauthorized email domains cannot authenticate
- **Home page**: New landing page with bot information and navigation
  - Information about bot capabilities for unauthorized users
  - Quick access cards to all available features for authorized users
  - Responsive design with color-coded feature cards
- **Duty list page**: New page displaying all active duties across channels
  - Shows current duty person for each channel
  - Displays schedule frequency (cron description)
  - Channel names instead of IDs
  - Quick access to duty settings for each channel
- **GitHub link**: Added GitHub project link in bottom-right corner of all pages
  - Fixed position, non-intrusive design
  - Theme-aware styling (adapts to dark/light theme)

### Changed

#### Logging System
- **Environment-based log levels**: Different log levels for production and development
  - **Production** (`NODE_ENV=production`): Only `warn` and `error` levels
  - **Development**: All levels including `info` and `debug`
  - Reduces log noise in production while maintaining full debugging in development

#### UI/UX Improvements
- **Navigation bar**: Enhanced with user information and theme support
  - User dropdown menu with email/username and logout option
  - Theme-aware navbar styling (dark/light mode)
  - Login button for unauthorized users
- **Layout improvements**: Better spacing and responsive design
  - Footer removed in favor of corner GitHub link
  - Improved container spacing

### Security

- **Route protection**: All routes (except public ones) now require authentication
- **Public routes**: Configurable list of public routes that don't require authentication
  - `/healthz` - health check endpoint
  - `/oauth/yandexAuthCallback` - OAuth callback (supports both user auth and calendar SDK)
  - `/calendar/auth` - Calendar token storage endpoint
  - `/gitlab/webhook` - GitLab webhook endpoint
  - `/jira/api/tasks` and `/jira/api/review` - API endpoints with custom authorization

### Database

#### Session Storage
- **SQLite session storage**: User sessions stored in SQLite database
  - Automatic session table creation via `connect-sqlite3`
  - 30-day session expiration
  - Secure cookie settings (httpOnly, secure in production)

### Technical Details

- Added `passport` and `passport-yandex` for OAuth authentication
- Added `express-session` and `connect-sqlite3` for session management
- Created `server/middleware/passport.js` for Passport configuration
- Created `server/middleware/auth.js` for route protection with whitelist support
- Created `server/middleware/userData.js` for passing user data to templates
- Created `server/controllers/authController.js` for authentication endpoints
- Updated `server/controllers/oauthController.js` to handle both OAuth callback scenarios:
  - User authentication (with `code` parameter)
  - Calendar SDK callback (without `code` parameter)
- Created `server/views/home.ejs` - new home page
- Created `server/views/dutyList.ejs` - duty list page
- Created `server/views/authError.ejs` - authentication error page
- Updated `server/views/layout.ejs` with user information and theme support
- Added `getAllChannelsWithCurrentDuty()` function to `db/models/duty.js`
- Updated `logger/index.js` with environment-based log levels
- Added `ALLOWED_EMAIL_DOMAINS` and `SESSION_SECRET` to `config/index.js`

---

## [2.2.6]

### Added

#### TeamCity Build Notifications System
- **New feature**: Automatic notifications about TeamCity build statuses in Mattermost
- **Web UI for configuration**: Added web interface for managing build notification settings
  - Access via `/teamcity` endpoint
  - Create, edit, and delete notification configurations
  - View all active notification settings in a table
- **Build monitoring**: Automatic monitoring of TeamCity builds via cron job
  - Checks build status every 5 minutes
  - Sends notifications when builds complete
  - Tracks last processed build to avoid duplicate notifications
- **Notification filtering**: Configurable notification triggers
  - `all` - notify about all builds (successful and failed)
  - `success` - notify only about successful builds
  - `failure` - notify only about failed builds
- **Build information in notifications**:
  - Build status (successful/failed)
  - Link to build in TeamCity
  - Build completion time (in UTC)
  - Test statistics (passed, failed, ignored, muted tests)
- **Post ID tracking**: Saves Mattermost post ID for each notification
  - Enables future thread updates and additional information
  - Stored in `post_id` field for each notification configuration
- **TeamCity API integration**: 
  - Service for interacting with TeamCity REST API
  - Automatic retrieval of build details and test statistics
  - Support for Basic authentication
- **Date handling**: All dates stored and displayed in UTC format
  - Uses `moment-timezone` for date operations
  - Explicit UTC indication in all date displays

### Changed

#### Performance Optimization
- **Optimized build checking**: Smart checking logic to reduce API load
  - Skips checking if build was recently checked
  - Updates check time even for unfinished builds
  - Prevents unnecessary API calls

### Database

#### New Migrations
- **20251113120000-teamcity-build-notifications.js**: Creation of table for TeamCity build notifications
  - `teamcity_build_notifications` - notification settings with build configuration, channel, and filtering options
  - Includes `post_id` field for tracking Mattermost post IDs

### Technical Details

- Created `services/teamcityService.js` for TeamCity API integration
- Added `cron/teamcityBuildCronService.js` for automatic build status monitoring
- Implemented `db/models/teamcityBuildNotifications.js` for database operations
- Added `server/controllers/teamcityController.js` with endpoints for UI management
- Created `server/views/teamcitySettings.ejs` and `server/views/teamcityForm.ejs` for web interface
- Integrated TeamCity cron service into `cron/cronManager.js`
- Added TeamCity configuration variables to `config/index.js`:
  - `TEAMCITY_BASE_URL` - TeamCity server URL
  - `TEAMCITY_USERNAME` - Username for API authentication
  - `TEAMCITY_PASSWORD` - Password for API authentication
- Test statistics parsing from TeamCity API with multiple fallback methods:
  - Primary: Statistics from build properties
  - Fallback: Parsing from statusText
  - Final fallback: API queries with locators

---

## [2.2.5]

### Added

#### Automatic Reviewer Distribution System
- **New feature**: Automatic reviewer distribution by queue for channels
- **Command `!review-settings`**: Management of automatic reviewer distribution settings
  - `!review-settings enable [manual|queue]` - enable automatic distribution
  - `!review-settings disable` - disable automatic distribution
  - `!review-settings status` - show current channel settings
  - `!review-settings add @username` - add user to reviewer queue
  - `!review-settings remove <id>` - remove reviewer from queue
  - `!review-settings list` - show reviewer queue
  - `!review-settings clear` - clear reviewer queue
- **Review types**:
  - `manual` - manual assignment (default, current behavior)
  - `queue` - automatic distribution by queue from channel reviewer list
- **Integration with `!review` command**: Automatic reviewer assignment when creating a task if enabled for the channel
- **Vacation check**: Automatic availability check of reviewers via `absenceService` with result caching
- **Caching**: Optimization of availability checks via `cacheService` (TTL 24 hours) to reduce API load

#### Feature Ready System
- **New web form**: Added web form for "Feature is ready" notifications
  - Integration with Jira API for task autocomplete using Tom Select
  - Automatic task name population when task is selected
  - Support for Back-End, Front-End, and AQA Merge Request links
  - Merge task IDs field (supports multiple tasks)
  - Optional description/comment field
- **Automatic conflict detection and resolution**: Checks Merge Request conflicts in GitLab when feature is submitted
  - Displays conflict warnings in Mattermost thread if conflicts are detected
  - **Automatic conflict resolution for Back-End MRs**: Automatically resolves `FrontendVersion` conflicts in `.csproj` files
    - Only processes conflicts in `Sites/CaseMap.Core/CaseMap.Core.csproj` and `Sites/CaseMapStart.Core/CaseMapStart.Core.csproj`
    - Only resolves conflicts if conflict is exclusively in `FrontendVersion` property
    - Automatically chooses version from current branch (not develop) and commits the resolution
    - Sends notification in Mattermost thread about resolved conflicts
- **Mattermost integration**:
  - Creates formatted message in dedicated channel
  - Automatically pins the post
  - Sends status updates in thread when MRs are merged or closed
- **Cron job for MR monitoring**: Automatically tracks Merge Request statuses
  - Polls MR status every minute
  - Sends notifications when MR reaches final status (merged/closed)
  - Adds reaction emoji to indicate completion
- **URL validation**: Client-side validation for Merge Request URLs
  - Ensures URLs are properly formatted
  - Prevents submission of invalid URLs
- **Form protection**: Prevents duplicate form submissions
  - Button blocking after form submission
  - Visual feedback during processing

#### Duty Management Interface Improvements
- **"Change" button**: Added button to change duty person next to "Shift" button
  - "Change" - move to next duty person in queue
  - "Shift" - makes current duty person unscheduled and changes to next one
- **Button blocking**: All form buttons are blocked after submission to prevent duplicate clicks
  - Visual feedback: button text changes to "Sending..." during processing

### Changed

#### Bug Fixes in Duty System
- **Fixed counter reset bug**: Counter no longer resets when duty person goes on vacation
  - System now uses full user list from database to determine position
  - Correct queue order is maintained even when duty persons are temporarily absent
  - Cyclic transitions through users on vacation are handled correctly
- **Fixed error when creating duty**: Fixed error "Cannot read properties of undefined (reading 'toLowerCase')" when executing `!duty` command
  - Fixed parameter passing in `addJob`: now correctly passes `cron_schedule` instead of `schedule`
  - Added `use_working_days` parameter with default value `false`
  - Added parameter validation before creating cron job
  - Duty now works correctly without requiring application restart

#### Performance Optimization
- **Availability check caching**: Vacation check results are cached for 24 hours
  - API requests are made only for users not in cache
  - Partial cache usage - only new data is requested

### Database

#### New Migrations
- **20251031120000-review-distribution.js**: Creation of tables for automatic reviewer distribution
  - `channel_review_settings` - review type settings for channels
  - `review_queue` - reviewer queue in channel with status support (active/on vacation)
  - `review_current` - current reviewer in channel for tracking queue position
- **20251011063610-feature-ready.js**: Creation of tables for Feature Ready system
  - `feature_ready` - feature notifications with task information
  - `feature_merge_requests` - relationship between features and Merge Requests with role tracking

### Tests

#### Test Coverage
- **Tests for reviewDistributionService**: Added 17 tests covering main scenarios
  - Getting next reviewer
  - Automatic reviewer assignment
  - Availability caching
  - Settings management
- **Tests for dutyService**: Added 9 tests for duty system verification
  - Fix for counter reset bug when going on vacation
  - Correct handling of users on vacation
  - Cyclic transitions
  - Filtering and reactivation of users
- **Tests for conflictResolver**: Added 18 tests covering conflict resolution scenarios
  - Conflict detection in specific properties
  - Automatic conflict resolution logic
  - File update and error handling
  - Multiple file processing

### Technical Details

- Added parser for `!review-settings` command in `commands/parser.js`
- Created `services/reviewDistributionService.js` service for reviewer distribution management
- Integrated `reviewDistributionService` into `cron/reviewCronService.js` for automatic assignment
- Added endpoint `/duty/change-next` in `server/controllers/dutyController.js`
- Improved form handling in `server/views/dutySettings.ejs` with button blocking
- Fixed parameter passing in `commands/duty/duty.js` when creating duty
- Added validation and protection against `undefined` in `cron/dutyCronService.js`
- Created `services/featureService.js` for Feature Ready functionality
- Added `server/controllers/featureController.js` with `/feature/ready` endpoint
- Implemented `cron/featureReadyCronService.js` for Merge Request status monitoring
- Added `db/models/featureReady.js` for database operations
- Integrated Tom Select for Jira task autocomplete in `server/views/featureForm.ejs`
- Added URL validation and form submission protection in Feature Ready form
- Created `services/gitlabService/conflictResolver.js` for automatic conflict resolution
- Added GitLab API methods for file operations (`getFileContent`, `updateFile`, `getMergeRequestInfo`)
- Fixed `merge_tasks` storage: now saves as JSON instead of string to prevent `[object Object]` issue
- Added automatic closing of merge tasks in Jira when corresponding MR is merged

---

## [2.1.15] - Previous Version

*History of previous versions is not documented*
