# Changelog

All notable changes to this project will be documented in this file.

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
- **Automatic conflict detection**: Checks Merge Request conflicts in GitLab when feature is submitted
  - Displays conflict warnings in Mattermost thread if conflicts are detected
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

---

## [2.1.15] - Previous Version

*History of previous versions is not documented*
