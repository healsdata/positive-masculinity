---
name: add-short
description: Add a YouTube Short to the Hugo site. Takes a YouTube Shorts/watch/youtu.be URL, fetches title and channel via oEmbed, picks tags, writes content/shorts/<id>.md, builds with Hugo, then commits and pushes (which triggers the DigitalOcean deploy). Use when the user says "add this short", "/add-short <url>", or pastes a YouTube Shorts link to add.
argument-hint: <youtube-url> [tag ...] [-- note]
---

# Add a short

Arguments: `$ARGUMENTS`. Format: `<url> [tag ...] [-- optional note text]`.

Work from the repo root. Do the steps in order and stop with a clear message on any failure.

## 1. Parse the video ID
Extract the 11-character ID (`[A-Za-z0-9_-]{11}`) from any of:
- `https://www.youtube.com/shorts/<id>` (also `m.youtube.com`, with or without `?si=…`)
- `https://youtu.be/<id>`
- `https://www.youtube.com/watch?v=<id>`
- `https://www.youtube.com/embed/<id>`
- a bare 11-char ID

Ignore any query string or fragment on any of these forms, e.g. the `?si=…` share-tracking param, `&t=`, `&feature=` or `&pp=` (except `v=` on `watch` URLs). Only the ID is used from here on. Never store, echo into files or commit the original URL.

If nothing matches, stop and say the URL wasn't recognized. IDs are case-sensitive, so never change their case.

## 2. Duplicate check
If `content/shorts/<id>.md` already exists, show its title and tags and stop. Don't overwrite it.

## 3. Fetch metadata (no API key needed)
```bash
curl -s -w "\nHTTP %{http_code}" "https://www.youtube.com/oembed?url=https://www.youtube.com/shorts/<id>&format=json"
```
The JSON body is printed first and the status code is on the last line. Don't save the response into the repo.
- **200**: read `title`, `author_name` (→ `channel`), `author_url` (→ `channel_url`).
- **401 / 403**: the creator disabled embedding, so it can't play on the site. Stop and tell the user.
- **404 / 400**: private, deleted or invalid. Stop.
- Anything else: report the code and stop.

Clean up the title: trim whitespace and strip trailing hashtag runs like `#shorts #motivation`. Keep the creator's wording otherwise.

## 4. Choose tags
- Collect existing tags: grep the `tags:` lines in `content/shorts/*.md`.
- If the user passed tags, use them. Otherwise propose 1–3 from the title and the existing tag list. **Prefer existing tags**; only invent a new one when nothing fits.
- Tags are lowercase kebab-case (`self-discipline`, not `Self Discipline`).
- Note: text after `--` in the arguments. Otherwise leave `note` empty (don't invent one).

## 5. Write the file and confirm once
Create `content/shorts/<id>.md`:
```yaml
---
title: "<title, with \" escaped>"
date: <now, ISO 8601 with local UTC offset, e.g. 2026-11-14T10:00:00-05:00>
youtube_id: "<id>"
channel: "<author_name>"
channel_url: "<author_url>"
tags: ["tag-one", "tag-two"]
note: "<note or empty>"
---
```
Get the timestamp with `date +%Y-%m-%dT%H:%M:%S%:z` (Bash) or `Get-Date -Format "yyyy-MM-ddTHH:mm:sszzz"` (PowerShell).

Show the user the file contents and ask once (AskUserQuestion) whether to commit as-is or adjust tags/note. Apply any edits.

## 6. Build check
```bash
hugo --gc --minify
```
It must exit 0 with no `ERROR`. Also `public/shorts/<id>/index.html` must exist, and `public/index.json` must contain the ID. If the build fails, fix the content file (usually a quoting problem) and retry. Don't touch layouts unless the user asks.

## 7. Commit and push
```bash
git add content/shorts/<id>.md
git commit -m "Add short: <title>"
git push
```
End the commit message with the attribution trailer required by the session. If `git push` fails because no remote is configured, tell the user. The commit stays local and they need to add the GitHub remote.

## 8. Report
One or two lines: the title, the tags, and the live URL `<baseURL>shorts/<id>/` (baseURL from `hugo.toml`). DigitalOcean usually finishes deploying in a minute or two.
