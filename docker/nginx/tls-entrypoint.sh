#!/bin/sh
# Mint the stack's certificate, on a mint and only on a mint.
#
# `nginx:alpine` runs everything in /docker-entrypoint.d/ before starting, so
# this is a dropped-in script rather than an entrypoint override -- nothing has
# to know the base image's own startup sequence. This is the only place in the
# stack a certificate is produced.
set -eu

CERT_DIR="${IC_TLS_DIR:-/etc/nginx/certs}"
CERT="$CERT_DIR/cert.pem"
KEY="$CERT_DIR/key.pem"

mkdir -p "$CERT_DIR"

# A supplied pair is never minted over: replacing a trusted certificate with an
# untrusted self-signed one, silently, is the worst outcome available here.
if [ -s "$CERT" ] && [ -s "$KEY" ]; then
  exit 0
fi

# The umask and the `chmod` below are not redundant: they cover the creation
# window and a re-mint over an existing file respectively.
umask 077

# **No $(hostname) in the SAN.** Inside a container that resolves to the
# container's own name, not the machine's -- and it is unnecessary anyway, since
# the stack publishes to 127.0.0.1 only, so these are every name it answers to.
openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
  -keyout "$KEY" -out "$CERT" \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth" \
  > /dev/null 2>&1

chmod 600 "$KEY"
chmod 644 "$CERT"

# The fingerprint is what the operator checks in the browser, so it goes to
# stdout and only here -- printed every start, it trains them to scroll past it.
FINGERPRINT="$(openssl x509 -in "$CERT" -noout -fingerprint -sha256 | cut -d= -f2)"
cat <<BANNER

  A new TLS certificate was generated for this install.

  Your browser will warn that it is not trusted. That is expected: it is
  self-signed, and no certificate authority vouches for it. Check that the
  fingerprint your browser shows matches this one before you continue.

    SHA-256  $FINGERPRINT

  This is printed on a mint and only on a mint.

BANNER
