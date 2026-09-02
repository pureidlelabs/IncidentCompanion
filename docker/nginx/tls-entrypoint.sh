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
NAME="${IC_TLS_NAME:-localhost}"

mkdir -p "$CERT_DIR"

fail() {
  echo "tls-entrypoint: $1" >&2
  exit 1
}

# A supplied pair is never minted over: replacing a trusted certificate with an
# untrusted self-signed one, silently, is the worst outcome available here. So
# a fault below stops here, on stderr, rather than falling through to a mint.
cert_supplied=false
key_supplied=false
[ -s "$CERT" ] && cert_supplied=true
[ -s "$KEY" ] && key_supplied=true

if [ "$cert_supplied" = true ] || [ "$key_supplied" = true ]; then
  if [ "$cert_supplied" != true ] || [ "$key_supplied" != true ]; then
    fail "only one of $CERT and $KEY was supplied -- refusing to mint the other half"
  fi

  # Parsed before anything is asked of them: `-checkend` returns 1 for a file
  # it cannot read as well as for one that has expired, so checking expiry
  # first would call a malformed file an expired one.
  openssl x509 -in "$CERT" -noout -subject >/dev/null 2>&1 \
    || fail "$CERT is malformed"
  openssl pkey -in "$KEY" -noout >/dev/null 2>&1 \
    || fail "$KEY is malformed"

  openssl x509 -in "$CERT" -noout -checkend 0 >/dev/null 2>&1 \
    || fail "$CERT has expired"

  cert_pubkey="$(openssl x509 -in "$CERT" -noout -pubkey)"
  key_pubkey="$(openssl pkey -in "$KEY" -pubout)"
  [ "$cert_pubkey" = "$key_pubkey" ] \
    || fail "$KEY does not match the public key in $CERT"

  # A colon or an all-digits-and-dots value is an address; anything else is a
  # hostname -- `-checkhost` never matches an IP and `-checkip` never matches
  # a name, so a certificate carrying only one SAN kind must be asked the
  # matching question.
  case "$NAME" in
    *:*) check_flag="-checkip" ;;
    *[!0-9.]*) check_flag="-checkhost" ;;
    *) check_flag="-checkip" ;;
  esac
  openssl x509 -in "$CERT" -noout "$check_flag" "$NAME" >/dev/null 2>&1 \
    || fail "$CERT does not cover $NAME, which is what this install is reached at"

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
