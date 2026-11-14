# Run the Table

Static site in `public/` plus one Netlify Function (`netlify/functions/api.mjs`) that stores the
global leaderboard and Run the Grid pick counts in Netlify Blobs.

Deploy by connecting this repo to the Netlify site. No build command is needed; Netlify installs
`@netlify/blobs` from package.json and publishes `public/`.
