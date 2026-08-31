# The stack's TLS edge. **An image rather than a bind-mounted config**, because
# a mounted config is a host-path dependency and `docker compose up` has to work
# with no environment set. `openssl` is not in `nginx:alpine` and mints the pair.
FROM nginx:1.31-alpine@sha256:db35bfc6b2951e7f8a72db5db120288c127ffaeeb4a6d4b95a26fead017d5913

RUN apk add --no-cache openssl

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
# Outside `conf.d/`, which nginx includes wholesale into the http context -- a
# bare list of `proxy_*` directives there is a syntax error at startup.
COPY docker/nginx/ic-proxy.inc /etc/nginx/ic-proxy.inc

# Everything in this directory runs before nginx starts, so the certificate
# exists by the time the server reads it. `10-` orders it ahead of the base
# image's own envsubst step, which does not touch these files.
COPY docker/nginx/tls-entrypoint.sh /docker-entrypoint.d/10-ic-tls.sh
RUN chmod 755 /docker-entrypoint.d/10-ic-tls.sh
