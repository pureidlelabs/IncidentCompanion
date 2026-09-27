#!/bin/sh
# Decide the name the edge serves and the certificate it serves it with.
#
# `nginx:alpine` runs everything in /docker-entrypoint.d/ before starting, so
# this is a dropped-in script rather than an entrypoint override -- nothing has
# to know the base image's own startup sequence. This is the only place in the
# stack a certificate is produced, and the only place the served name is
# written, so the two cannot disagree.
set -eu

CERT_DIR="${IC_TLS_DIR:-/etc/nginx/certs}"
CERT="$CERT_DIR/cert.pem"
KEY="$CERT_DIR/key.pem"
# The fingerprint of the last certificate this script made. A pair whose
# fingerprint it holds is the install's own; anything else is the operator's.
MINTED="$CERT_DIR/minted"
SERVED=/etc/nginx/ic-name.inc
NAME="${IC_NAME:-}"

fail() {
  echo "tls-entrypoint: $1" >&2
  exit 1
}

# **Checked before anything is written**: the name goes into nginx's own
# configuration below, so this is the injection boundary as well as the
# operator's typo check.
if [ -n "$NAME" ]; then
  case "$NAME" in
    *[!0-9.]*)
      printf '%s' "$NAME" \
        | grep -Eqx '[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*' \
        || fail "IC_NAME=$NAME is not a host name or an IPv4 address"
      ;;
    *)
      printf '%s' "$NAME" | grep -Eqx '([0-9]{1,3}\.){3}[0-9]{1,3}' \
        || fail "IC_NAME=$NAME is not a host name or an IPv4 address"
      for octet in $(echo "$NAME" | tr . ' '); do
        [ "$octet" -le 255 ] || fail "IC_NAME=$NAME is not a host name or an IPv4 address"
      done
      ;;
  esac
  CHECKED="$NAME"
  SERVED_NAMES="$NAME"
else
  CHECKED=localhost
  SERVED_NAMES="localhost 127.0.0.1"
fi

# `-checkhost` never matches an IP and `-checkip` never matches a name, so a
# certificate carrying only one SAN kind must be asked the matching question.
case "$CHECKED" in
  *[!0-9.]*) CHECK_FLAG="-checkhost" SAN="DNS:$CHECKED" ;;
  *) CHECK_FLAG="-checkip" SAN="IP:$CHECKED" ;;
esac

fingerprint() {
  openssl x509 -in "$CERT" -noout -fingerprint -sha256 | cut -d= -f2
}

mkdir -p "$CERT_DIR"
echo "server_name $SERVED_NAMES;" > "$SERVED"

# A supplied pair is never minted over: replacing a trusted certificate with an
# untrusted self-signed one, silently, is the worst outcome available here. So
# a fault below stops here, on stderr, rather than falling through to a mint.
cert_supplied=false
key_supplied=false
[ -s "$CERT" ] && cert_supplied=true
[ -s "$KEY" ] && key_supplied=true

renamed=false
if [ "$cert_supplied" = true ] || [ "$key_supplied" = true ]; then
  if [ "$cert_supplied" != true ] || [ "$key_supplied" != true ]; then
    fail "only one of $CERT and $KEY was supplied -- refusing to mint the other half"
  fi

  # A copied-in pair keeps the copier's uid, and this root holds no
  # CAP_DAC_OVERRIDE, so it cannot read a 0600 key it does not own.
  chown 0:0 "$CERT" "$KEY" 2>/dev/null || true

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

  if openssl x509 -in "$CERT" -noout "$CHECK_FLAG" "$CHECKED" >/dev/null 2>&1; then
    exit 0
  fi
  [ -s "$MINTED" ] && [ "$(cat "$MINTED")" = "$(fingerprint)" ] \
    || fail "$CERT does not cover $CHECKED, which is what this install is reached at"
  renamed=true
fi

# The umask and the `chmod` below are not redundant: they cover the creation
# window and a re-mint over an existing file respectively.
umask 077

# **No $(hostname) in the SAN.** Inside a container that resolves to the
# container's own name, not the machine's.
if [ -n "$NAME" ]; then
  SANS="$SAN"
else
  SANS="DNS:localhost,IP:127.0.0.1,IP:::1"
fi
openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
  -keyout "$KEY" -out "$CERT" \
  -subj "/CN=$CHECKED" \
  -addext "subjectAltName=$SANS" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth" \
  > /dev/null 2>&1

chmod 600 "$KEY"
chmod 644 "$CERT"

# The fingerprint is what the operator checks in the browser, so it goes to
# stdout and only here -- printed every start, it trains them to scroll past it.
FINGERPRINT="$(fingerprint)"
printf '%s\n' "$FINGERPRINT" > "$MINTED"

if [ "$renamed" = true ]; then
  REASON="This install is now reached at $CHECKED, which the certificate it
  made before did not cover, so it made a new one. Show every analyst the
  new fingerprint: the one they trusted no longer applies."
else
  REASON="Your browser will warn that it is not trusted. That is expected: it is
  self-signed, and no certificate authority vouches for it."
fi

cat <<BANNER

  A new TLS certificate was generated for this install, for $CHECKED.

  $REASON

  Check that the fingerprint your browser shows matches this one before you
  continue.

    SHA-256  $FINGERPRINT

  This is printed on a mint and only on a mint.

BANNER
