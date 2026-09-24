# The roles, as an image rather than a mount. **`COPY`, because the daemon
# cannot see this checkout**: a `docker-entrypoint-initdb.d` mount needs a host
# path the daemon can resolve, which a worktree under a container volume is
# not. An image carries the file across that boundary and needs no path.
#
# The same engine as the server it talks to, so `psql` and the wire protocol
# cannot disagree. Pinned to the minor; bump with `compose.yaml`.
FROM postgres:18.6-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873

COPY docker/db/roles.sql /roles.sql
COPY docker/db/role-passwords.sql /role-passwords.sql
