#!/usr/bin/env bash
# Makes the Google Play upload key, once, and prints the four GitHub secrets
# that driver-apk.yml signs with.
#
# The key is written outside the repository (default ~/autotrack-upload-key)
# and must never be committed. Keep a copy somewhere safe: Play App Signing
# holds the real app-signing key, so a lost upload key can be reset through
# Play Console support -- but that takes days, and no update ships meanwhile.
#
#   bash mobile/tool/make-upload-key.sh [output-dir]
set -euo pipefail

dir="${1:-$HOME/autotrack-upload-key}"
store="$dir/upload.jks"
alias="upload"

if [ -e "$store" ]; then
  echo "$store already exists -- refusing to overwrite an upload key." >&2
  exit 1
fi

mkdir -p "$dir"
chmod 700 "$dir"

# PKCS12 keeps one password for the store and the key, so both secrets get it.
password="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"

if /usr/libexec/java_home >/dev/null 2>&1 || [ -n "${JAVA_HOME:-}" ]; then
  keytool -genkeypair -v \
    -keystore "$store" -storetype PKCS12 \
    -alias "$alias" -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$password" -keypass "$password" \
    -dname "CN=AutoTrack, O=AutoTrack, C=SA" >/dev/null
else
  # No Java here (macOS ships a keytool stub that only says so). openssl makes
  # the same thing: a PKCS12 store holding one RSA key and its self-signed
  # certificate, under the alias Gradle asks for. SHA1/3DES protection is what
  # keytool itself wrote for years, so every JDK reads it.
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' EXIT
  openssl req -x509 -newkey rsa:2048 -nodes -days 10000 \
    -subj "/CN=AutoTrack/O=AutoTrack/C=SA" \
    -keyout "$work/key.pem" -out "$work/cert.pem" 2>/dev/null
  openssl pkcs12 -export -name "$alias" \
    -inkey "$work/key.pem" -in "$work/cert.pem" \
    -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 \
    -passout "pass:$password" -out "$store"
fi

secrets="$dir/github-secrets.txt"
{
  echo "ANDROID_KEYSTORE_B64"
  base64 -i "$store" | tr -d '\n'
  echo
  echo
  echo "ANDROID_KEYSTORE_PASSWORD"
  echo "$password"
  echo
  echo "ANDROID_KEY_ALIAS"
  echo "$alias"
  echo
  echo "ANDROID_KEY_PASSWORD"
  echo "$password"
} > "$secrets"
chmod 600 "$store" "$secrets"

echo "Upload key:      $store"
echo "GitHub secrets:  $secrets"
echo
echo "Add each name/value in $secrets under"
echo "GitHub -> rased -> Settings -> Secrets and variables -> Actions,"
echo "then back up $dir somewhere safe and delete $secrets."
