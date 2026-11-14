# Run the Table

Static site in `public/` plus one Netlify Function (`netlify/functions/api.mjs`) that stores the
global leaderboard, Run the Grid pick counts and player accounts in Netlify Blobs.

Deploy by connecting this repo to the Netlify site. No build command is needed; Netlify installs
`@netlify/blobs` from package.json and publishes `public/`.

## Player accounts

Players can sign in with Google, Apple or Discord (and link more than one to the same account).
Their stats (seasons, Perfect Run, rings, daily results, fantasy seasons, daily grids) sync to the
account and follow them to any device. Code: `netlify/auth.mjs` (server) and `public/account.js` (browser).

Each sign-in button turns on once its environment variables are set in Netlify
(Project configuration > Environment variables), followed by a redeploy. Until then it shows as "coming soon".

| Provider | Variables | Redirect URL to register with the provider |
| --- | --- | --- |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `https://runthetablenfl.com/api/auth/callback/google` |
| Discord | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | `https://runthetablenfl.com/api/auth/callback/discord` |
| Apple | `APPLE_CLIENT_ID` (Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (contents of the .p8 file) | `https://runthetablenfl.com/api/auth/callback/apple` |

Optional: `SESSION_SECRET` (any long random string). If it is not set, a key is generated once and kept in Blobs.
