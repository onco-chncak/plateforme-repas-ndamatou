$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) {
  Write-Host "OpenSSL est introuvable." -ForegroundColor Red
  Write-Host "Installez OpenSSL ou Git for Windows, puis relancez ce script." -ForegroundColor Yellow
  exit 1
}

openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes `
  -keyout private-key.pem `
  -out digital-certificate.txt `
  -subj "/CN=CHNCAK QZ Local Signer/O=CHNCAK/OU=Restaurant"

Write-Host ""
Write-Host "Certificat cree :" -ForegroundColor Green
Write-Host " - $dir\digital-certificate.txt"
Write-Host " - $dir\private-key.pem"
Write-Host ""
Write-Host "IMPORTANT : ne partagez jamais private-key.pem." -ForegroundColor Yellow
