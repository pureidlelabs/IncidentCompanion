# The proxying itself, included by every location that serves the app.
# **Shared so a header added for one path cannot be forgotten for another** --
# the locations differ only in their rate limits, and a header difference would
# be invisible until one route behaved differently.
proxy_pass http://app:8080;
proxy_http_version 1.1;

# **Overwrite, never append, and the app depends on it.** In production
# `auth.config.ts` sets `ipAddressHeaders: ['x-real-ip']`, so this line is the
# only reason that header cannot be forged -- a caller's value is discarded here
# rather than extended. Outside production the app trusts no header, because the
# dev loop has no proxy to do this.
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto https;

# **`$http_host`, not `$host` -- the difference is the port.** `$host` drops
# it, and `LiveGateway.sameOrigin` compares `Host` against an `Origin` that
# carries it, so on any published port but 443 every WebSocket upgrade is
# refused `403 cross-origin` while HTTP answers perfectly.
#
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
