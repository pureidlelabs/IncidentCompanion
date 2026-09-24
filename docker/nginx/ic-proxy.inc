# The proxying itself, included by every location that serves the app.
# **Shared so a header added for one path cannot be forgotten for another** --
# the locations differ only in their rate limits, and a header difference would
# be invisible until one route behaved differently.
proxy_pass http://ic_app;
proxy_http_version 1.1;

# **Overwrite, never append.** The app believes this chain only from the edge
# and walks it from the right, so a caller's own value is discarded here rather
# than extended. -> `server/src/wire/caller-address.ts`
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto https;

# Passing the client's own `Host` through is safe only because the
# `default_server` block answers an unrecognised one with 444. Re-check this
# line if that block is ever softened.
proxy_set_header Host $http_host;

# Websockets carry presence, claims and the report CRDT. Without these the
# upgrade is answered as a plain request and every case screen silently stops
# repainting for the other analyst.
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;

# A CRDT frame is worth nothing batched: buffering holds a caret update until
# the buffer fills, which reads as the other analyst freezing.
proxy_buffering off;
proxy_read_timeout 1h;
