# The stack's TLS edge. **An image rather than a bind-mounted config**, because
# a mounted config is a host-path dependency and `docker compose up` has to work
# with no environment set. `openssl` is not in `nginx:alpine` and mints the pair.
FROM nginx:1.31-alpine@sha256:72ba65eb42c10344912a84ff42408db7d34f2feb642204570ab8fc5ffd29f1d3

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
