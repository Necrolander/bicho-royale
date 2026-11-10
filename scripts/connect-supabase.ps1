$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
$secure = Read-Host 'Senha do banco bicho-royale no Supabase' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  $encoded = [Uri]::EscapeDataString($password)
  $databaseUrl = 'postgresql://postgres.seqsdxnnnelofsaifmfi:' + $encoded + '@aws-1-sa-east-1.pooler.supabase.com:6543/postgres'
  $envPath = Join-Path $repo '.env.local'
  $lines = if (Test-Path -LiteralPath $envPath) { @(Get-Content -LiteralPath $envPath | Where-Object { $_ -notmatch '^DATABASE_URL=' }) } else { @() }
  $lines += 'DATABASE_URL=' + $databaseUrl
  [IO.File]::WriteAllLines($envPath, [string[]]$lines)
  $databaseUrl | npx --yes vercel@latest env add DATABASE_URL production --sensitive --yes --scope megatouroonline-6894s-projects --global-config (Join-Path $env:TEMP 'bicho-royale-vercel-auth')
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao configurar DATABASE_URL na Vercel' }
  Write-Host 'Conexao configurada localmente e na Vercel.'
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  Remove-Variable password, encoded, databaseUrl -ErrorAction SilentlyContinue
}
