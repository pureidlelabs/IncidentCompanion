# The stack's TLS edge. **An image rather than a bind-mounted config**, because
# a mounted config is a host-path dependency and `docker compose up` has to work
# with no environment set. `openssl` is not in `nginx:alpine` and mints the pair.
FROM nginx:1.31-alpine@sha256:1ed1b0e1d7652937d6cbdaf4018c7b6fc009a7dd6c3047351e2eddda745de43f

# **The base image's IPv6 step goes**: it runs `apk manifest`, which fetches
# the package index over HTTPS on every start, since neither the base image nor
# `--no-cache` keeps one -- an outbound request from an install nobody pointed
# anywhere. `default.conf` is this project's, so the
# step had nothing to edit anyway.
RUN apk add --no-cache openssl \
 && rm /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh

# In `conf.d/`, so it lands in the http context the upstream needs.
COPY docker/nginx/upstream.conf /etc/nginx/conf.d/upstream.conf

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
# Outside `conf.d/`, which nginx includes wholesale into the http context -- a
# bare list of `proxy_*` directives there is a syntax error at startup.
COPY docker/nginx/ic-proxy.inc /etc/nginx/ic-proxy.inc

# Everything in this directory runs before nginx starts, so the certificate
# exists by the time the server reads it. `10-` orders it ahead of the base
# image's own envsubst step, which does not touch these files.
COPY docker/nginx/tls-entrypoint.sh /docker-entrypoint.d/10-ic-tls.sh
RUN chmod 755 /docker-entrypoint.d/10-ic-tls.sh
