# Positive Masculinity

A hand-picked collection of YouTube Shorts, as a static Hugo site. The home page is a thumbnail grid (newest first). Tapping a short opens a full-screen swipe feed with a shuffle toggle and tag filtering. Hosted free on DigitalOcean App Platform.

## Add a short
In Claude Code, from this repo:

```
/add-short https://www.youtube.com/shorts/<id> [tag ...] [-- why I picked it]
```

It fetches the title and channel (YouTube oEmbed, no API key), picks tags, writes `content/shorts/<id>.md`, builds, then commits and pushes. DigitalOcean deploys on push.

Manual alternative: `hugo new shorts/<id>.md`, then fill in the front matter.

## Local dev
```
hugo server
```
To test on a phone, run `hugo server --bind 0.0.0.0 --baseURL http://<your-LAN-IP>:1313` and open that URL on the phone.

## One-time hosting setup
1. Create an empty GitHub repo and push: `git remote add origin git@github.com:<you>/positive-masculinity.git && git push -u origin main`
2. Replace `OWNER` in `.do/app.yaml` with your GitHub username.
3. DigitalOcean → Create App → GitHub → this repo. App Platform detects Hugo. Use output dir `public` and the env var `HUGO_VERSION=0.145.0`. Or run `doctl apps create --spec .do/app.yaml`.
4. Put the resulting `https://…ondigitalocean.app/` (or custom domain) in `baseURL` in `hugo.toml`, then commit and push.

## Layout
- `content/shorts/<videoId>.md`: one file per short (title, date, youtube_id, channel, channel_url, tags, note)
- `layouts/index.html`, `layouts/_default/term.html`: grids. `layouts/shorts/single.html`: the feed page
- `layouts/index.json`: `/index.json`, the data the feed loads
- `assets/js/feed.js`: scroll-snap feed with one lazy YouTube player and shuffle/sound/keyboard (↑↓ / j k, m, s, space)
