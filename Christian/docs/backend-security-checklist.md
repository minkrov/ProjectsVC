# Backend Security Checklist

## Completed Foundation

- [x] Added Supabase client dependency and environment placeholders.
- [x] Created a local `.env.example` using only the publishable frontend key.
- [x] Kept private keys and secret-role credentials out of the frontend.
- [x] Added a Supabase client wrapper that stays disabled if environment variables are missing.
- [x] Added backend API helpers for auth, profiles, home posts, comments, prayer wall, discussions, houses, Bible study logs, and Common Ground reviews.
- [x] Added database migrations for the prototype backend tables.
- [x] Enabled row-level security on all app tables in the public schema.
- [x] Added explicit grants for the Data API so new tables work with current Supabase API exposure rules.
- [x] Limited public profile column access so emails and roles are not exposed through normal profile reads.
- [x] Added user-owned write policies for posts, replies, house posts, discussions, study logs, and Common Ground reviews.
- [x] Added moderation/reporting tables with admin-only moderation access.
- [x] Added anonymous-prayer masking through a prayer feed view.
- [x] Added a profile-media storage bucket with uploads restricted to each user's own folder.
- [x] Removed broad public bucket listing after the Supabase security advisor flagged it.
- [x] Added foreign-key covering indexes flagged by the Supabase performance advisor.
- [x] Added a local `npm run backend:smoke` command to check public API access.

## Manual Dashboard Step

- [ ] Enable Supabase Auth leaked-password protection in the Supabase dashboard.

## Next Backend Integration Work

- [ ] Add the user-facing login/signup screen.
- [ ] Decide whether guest/local prototype mode should remain available after auth is live.
- [ ] Wire each UI flow to Supabase gradually, starting with profiles and home posts.
- [ ] Add authenticated write tests for posts, comments, prayers, and profile media.
- [ ] Add account deletion/session revocation workflow before public launch.
- [ ] Add rate limits and abuse protections for posting, comments, prayer requests, reports, and profile uploads.
- [ ] Add moderation tooling for reviewing reports.
- [ ] Add backup/export policies for user data.
- [ ] Add production deploy environment variables in the hosting platform.
