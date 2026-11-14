# Privacy

SLAMLINE is a free game made for fun by Rehmoz Ayub. It collects as little as it can: no accounts, no cookies, no advertising, and nothing that identifies you.

This page covers the web version (https://rehmozayub.github.io/slamline/, and the same game on itch.io) and the Windows exe. Questions or requests: open an issue at https://github.com/RehmozAyub/slamline/issues.

## Play stats

To see how many people play, from which countries and how long, the game sends anonymous numbers to SLAMLINE's own small server (running on Cloudflare) every few minutes while it's open:

- the game version and the kind of device (browser on a computer, browser on a phone or tablet, on itch.io or not, or the Windows exe)
- how many seconds the game was open and how many of them you were actually playing
- races started, finished and quit, with the track, the mode (solo, split screen, online) and whether the track was mirrored
- for online play: rooms hosted, players per room and failed connections
- the average frame rate and the graphics level
- error messages from the game's code (with anything that looks like a file path removed)

There is no player ID. The game makes up a random number each time it starts, keeps it only in memory and forgets it when you close the game, so two play sessions can't be linked. The server only keeps daily totals, for example "Brazil, browser on a phone, 41 sessions, 12 hours". Nothing is stored on your device for the stats.

Your IP address reaches the server, as it does with any website. Cloudflare uses it to look up your country and to limit how often one connection can send, and then it's dropped: the server never stores or logs it. Cloudflare processes it for SLAMLINE under its standard data-processing terms; see https://www.cloudflare.com/privacypolicy/.

**To turn the stats off:** Settings → SHARE PLAY STATS → OFF. Nothing is sent after that.

## Feedback

The FEEDBACK button on the title screen sends what you type, plus the game version, the kind of device, the last track you raced, the graphics level and your country (from the IP address, which isn't stored). It's anonymous: there's no name or contact field, so there's no way to reply. Please don't type personal details; email addresses and phone numbers are removed automatically before anything is saved. Feedback is kept while it's useful for improving the game. If you sent something you want removed, open an issue quoting it.

If you want an answer, use GitHub Issues instead. Those are public and covered by GitHub's own privacy statement.

## Recording

RECORD in the pause menu saves the video on your device only (your Downloads, or Videos\SLAMLINE for the exe). Nothing is uploaded. Sharing it is up to you.

## Online play

Online races connect players' devices directly, so:

- the matchmaking service (the PeerJS project's public server) and the connection helpers (STUN servers run by Google and Cloudflare) see your IP address while they connect you
- the other players' devices in your room see your IP address, as with any direct connection
- the name you type is shown to everyone in the room

Nothing from online play is stored by SLAMLINE.

## On your device

Your settings, best laps, stars and unlocked paints are saved in your browser's storage (or the exe's own folder in %APPDATA%\Slamline). They never leave your device.

## Hosting

The web version and the downloads are hosted on GitHub, which keeps its own logs (see https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement). On itch.io the game is hosted by itch.io, which has its own privacy policy (https://itch.io/docs/legal/privacy-policy).

## Legal basis

The anonymous play stats and the limits on how often a connection can send are based on a legitimate interest in keeping the game running and improving it (GDPR Art. 6(1)(f)); you can turn the stats off at any time. Feedback is sent only when you choose to send it. As SLAMLINE can't tell who anyone is, it can't look up data about a particular person, but you can always ask questions through GitHub Issues.

Last updated: 14 November 2026.
