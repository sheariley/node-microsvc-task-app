#!/usr/bin/env bash
set -euo pipefail

# create-dev-certs.sh
# Create a development CA and service certificates under ./.certs
# Usage: ./dev-setup/create-dev-certs.sh [--services svc1,svc2] [--test]
# Requires: openssl on PATH

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CERTS_ROOT="$REPO_ROOT/.certs"

SERVICES_DEFAULT=(admin mongo rabbitmq otel-collector jaeger opensearch opensearch-dashboards prometheus oauth-service task-service notification-service web-ui)

# Parse args
SERVICES=()
TEST_MODE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --services|-s)
      if [[ -n "${2-}" && ${2:0:1} != "-" ]]; then
        IFS=',' read -r -a parts <<< "$2"
        for p in "${parts[@]}"; do
          # also split on spaces inside each part
          for q in $p; do
            SERVICES+=("$q")
          done
        done
        shift 2
      else
        echo "--services requires an argument" >&2
        exit 1
      fi
      ;;
    --test)
      TEST_MODE=1
      shift
      ;;
    *)
      # accept bare service names as positional args
      SERVICES+=("$1")
      shift
      ;;
  esac
done

if [[ $TEST_MODE -eq 1 ]]; then
  CERTS_ROOT="$CERTS_ROOT/test"
  echo "Test mode enabled — certificates will be created under: $CERTS_ROOT"
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "OpenSSL not found on PATH. Install OpenSSL or add it to PATH and re-run the script." >&2
  exit 1
fi

mkdir -p "$CERTS_ROOT"
CA_DIR="$CERTS_ROOT/ca"
mkdir -p "$CA_DIR"

# Normalize services
if [[ ${#SERVICES[@]} -eq 0 ]]; then
  SERVICES=("${SERVICES_DEFAULT[@]}")
fi

echo "Creating certificates for services: ${SERVICES[*]}"
for s in "${SERVICES[@]}"; do
  mkdir -p "$CERTS_ROOT/$s"
done

CA_KEY="$CA_DIR/ca.key.pem"
CA_CERT="$CA_DIR/ca.cert.pem"
CA_PEM="$CA_DIR/ca.pem"

if [[ ! -f "$CA_KEY" || ! -f "$CA_CERT" ]]; then
  echo "Creating CA key and certificate at $CA_DIR"
  CA_CONFIG="$CA_DIR/ca.cnf"
  cat > "$CA_CONFIG" <<'EOF'
[ req ]
default_bits        = 2048
distinguished_name  = dn
x509_extensions     = v3_ca
prompt              = no

[ dn ]
CN = LocalDevCA

[ v3_ca ]
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer
basicConstraints = critical, CA:true
keyUsage = critical, digitalSignature, cRLSign, keyCertSign
EOF

  openssl req -x509 -sha256 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "$CA_KEY" \
    -out "$CA_CERT" \
    -config "$CA_CONFIG" \
    -extensions v3_ca
else
  echo "CA key and cert already exist, skipping creation."
fi

if [[ ! -f "$CA_PEM" ]]; then
  if [[ -f "$CA_KEY" && -f "$CA_CERT" ]]; then
    echo "Creating combined CA PEM (private key + certificate) at: $CA_PEM"
    cat "$CA_KEY" > "$CA_PEM"
    cat "$CA_CERT" >> "$CA_PEM"
  else
    echo "Cannot create combined CA PEM; CA key or cert missing."
  fi
fi

# Generate and sign service certs
for s in "${SERVICES[@]}"; do
  svcDir="$CERTS_ROOT/$s"
  key="$svcDir/$s.key.pem"
  csr="$svcDir/$s.csr"
  cert="$svcDir/$s.cert.pem"
  svcConfig="$svcDir/$s.cnf"

  cat > "$svcConfig" <<EOF
[ req ]
default_bits       = 2048
distinguished_name = dn
req_extensions     = v3_req
prompt             = no

[ dn ]
CN = $s

[ v3_req ]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth, clientAuth
subjectAltName = @alt_names

[ alt_names ]
DNS.1 = localhost
DNS.2 = $s
IP.1 = 127.0.0.1
EOF

  echo "Generating key and CSR for $s"
  openssl req -new -newkey rsa:2048 -nodes \
    -keyout "$key" \
    -out "$csr" \
    -config "$svcConfig"

  echo "Signing CSR for $s with CA (embedding SANs)"
  openssl x509 -req -sha256 -days 3650 \
    -in "$csr" \
    -CA "$CA_CERT" \
    -CAkey "$CA_KEY" \
    -CAcreateserial \
    -out "$cert" \
    -extfile "$svcConfig" \
    -extensions v3_req

  echo "Verification for $s (Subject and Subject Alternative Name):"
  openssl x509 -in "$cert" -noout -text | grep -E "Subject:|X509v3 Subject Alternative Name" -n -A 2 || true

  pem="$svcDir/$s.pem"
  echo "Creating combined PEM (private key + certificate) at: $pem"
  cat "$key" > "$pem"
  cat "$cert" >> "$pem"

  echo " - private key: $key"
  echo " - certificate: $cert"
  echo " - combined PEM: $pem"

  p12="$svcDir/$s.p12"
  echo "Creating PKCS#12 keystore at: $p12 (no password)"
  openssl pkcs12 -export -out "$p12" -inkey "$key" -in "$cert" -certfile "$CA_CERT" -passout pass:

done

echo "All certificates created under: $CERTS_ROOT"
