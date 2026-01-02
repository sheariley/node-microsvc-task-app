#!/usr/bin/env pwsh
<#
Create development CA and service certificates under `./.certs`.

Usage: run this script from PowerShell in the repository root or execute the script directly.

It will create:
- ./.certs/ca/ca.key.pem and ca.cert.pem
- ./.certs/<service>/<service>.key.pem, .csr, .cert.pem and san.ext for each service

Services generated: oauth-service, task-service, web-ui

This script requires OpenSSL to be available on PATH.
#>

$ErrorActionPreference = 'Stop'

# Resolve paths
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = (Resolve-Path (Join-Path $scriptRoot '..')).Path
$certsRoot = Join-Path $repoRoot '.certs'

# Ensure OpenSSL is available
if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) {
  Write-Error "OpenSSL not found on PATH. Install OpenSSL or add it to PATH and re-run the script."
  exit 1
}

function New-DirectoryIfMissing([string]$p) {
    if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p | Out-Null }
}

New-DirectoryIfMissing $certsRoot

$caDir = Join-Path $certsRoot 'ca'
New-DirectoryIfMissing $caDir

$services = @('oauth-service','task-service','web-ui')
foreach ($s in $services) { New-DirectoryIfMissing (Join-Path $certsRoot $s) }

# Create CA if missing
$caKey = Join-Path $caDir 'ca.key.pem'
$caCert = Join-Path $caDir 'ca.cert.pem'
if (-not (Test-Path $caKey) -or -not (Test-Path $caCert)) {
  Write-Output "Creating CA key and certificate at $caDir"

  # Write a full OpenSSL config for the CA (includes v3_ca extensions)
  $caConfig = Join-Path $caDir 'ca.cnf'
  $caConfigContent = @"
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
"@
  Set-Content -Path $caConfig -Value $caConfigContent -Encoding Ascii

  openssl req -x509 -sha256 -nodes -days 3650 -newkey rsa:2048 `
    -keyout $caKey `
    -out $caCert `
    -config $caConfig `
    -extensions v3_ca
} else {
    Write-Output "CA key and cert already exist, skipping creation."
}

# Generate and sign service certs
foreach ($s in $services) {
    $svcDir = Join-Path $certsRoot $s
    $key = Join-Path $svcDir "$s.key.pem"
    $csr = Join-Path $svcDir "$s.csr"
    $cert = Join-Path $svcDir "$s.cert.pem"
    # Create an OpenSSL config for this service (includes SANs and v3_req)
    $svcConfig = Join-Path $svcDir "$s.cnf"
    $svcConfigContent = @"
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
"@
    Set-Content -Path $svcConfig -Value $svcConfigContent -Encoding Ascii

    Write-Output "Generating key and CSR for $s"
    openssl req -new -newkey rsa:2048 -nodes `
      -keyout $key `
      -out $csr `
      -config $svcConfig

    Write-Output "Signing CSR for $s with CA (embedding SANs)"
    openssl x509 -req -sha256 -days 3650 `
      -in $csr `
      -CA $caCert `
      -CAkey $caKey `
      -CAcreateserial `
      -out $cert `
      -extfile $svcConfig `
      -extensions v3_req

    Write-Output "Verification for $s (Subject and Subject Alternative Name):"
    openssl x509 -in $cert -noout -text | Select-String -Pattern "Subject:","X509v3 Subject Alternative Name" -Context 0,2
}

Write-Output "All certificates created under: $certsRoot"
