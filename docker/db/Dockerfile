# The roles, as an image rather than a mount. **`COPY`, because the daemon
# cannot see this checkout**: a `docker-entrypoint-initdb.d` mount needs a host
# path the daemon can resolve, which a worktree under a container volume is
# not. An image carries the file across that boundary and needs no path.
#
# The same engine as the server it talks to, so `psql` and the wire protocol
# cannot disagree. Pinned to the minor; bump with `compose.yaml`.
FROM postgres:18.6-alpine@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2

COPY docker/db/roles.sql /roles.sql
COPY docker/db/role-passwords.sql /role-passwords.sql
