<#
.SYNOPSIS
  Copies the production database into the staging Supabase project, so a
  migration can be tried on a faithful copy before it goes near the live one.

.DESCRIPTION
  Reads the production database (schema and data of the public schema, plus the
  sign-ins) with pg_dump and loads it into the staging project with psql.
  Production is only ever READ. Staging is only ever WRITTEN.

  It asks for two connection strings and never stores them: they live in
  memory for the run and are gone when it ends.

  Get each one from the Supabase dashboard: open the project, press Connect,
  choose "Session pooler" and copy the URI. It looks like
    postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
  Paste it as it is. The script then asks for the database password on its
  own and URL-encodes it, so a password with @ & ( ) in it needs no care.
  A URI that already has the password in it is accepted too.

  What is NOT copied: printers, POS terminals and print jobs (so a test can
  never reach a real printer), request logs and rate-limit counters.

.PARAMETER Refresh
  Staging already holds a copy: empty its public schema and its sign-ins
  first, then load a fresh copy. Without this the script stops if staging is
  not empty.

.PARAMETER DryRun
  Show what would run, with the passwords hidden, and change nothing.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\staging-clone.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\staging-clone.ps1 -Refresh
#>
[CmdletBinding()]
param(
  [switch]$Refresh,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# The live project. The script refuses to write to it, whatever it is given.
$ProductionRef = 'pyikrlqduampooncpzri'

# Tables whose rows stay behind. Their structure is still copied.
$SkipData = @(
  'public.printers',
  'public.pos_terminals',
  'public.print_jobs',
  'public.request_log',
  'public.api_rate_limits',
  'public.approval_email_verifications'
)

function Find-PgTool([string]$name) {
  $onPath = Get-Command $name -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Source }
  $root = 'C:\Program Files\PostgreSQL'
  if (Test-Path $root) {
    $found = Get-ChildItem $root -Directory | Sort-Object { [int]($_.Name -replace '\D', '0') } -Descending |
      ForEach-Object { Join-Path $_.FullName "bin\$name.exe" } | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($found) { return $found }
  }
  throw "Could not find $name. Install the PostgreSQL command line tools, or add their bin folder to PATH."
}

function Read-Secret([string]$prompt) {
  $secure = Read-Host -Prompt $prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Hide-Password([string]$uri) {
  # Greedy up to the last @, so a password with an @ in it is hidden whole.
  return ($uri -replace '(://[^:/@]+):.*@', '$1:****@')
}

# Asks for a project's Session pooler URI and, when it still carries the
# dashboard's [YOUR-PASSWORD] placeholder, for the password, which is then
# URL-encoded and put in place. Nothing secret is ever shown on screen.
function Read-ConnectionString([string]$label) {
  $uri = $null
  for ($try = 1; $try -le 3 -and -not $uri; $try++) {
    $typed = (Read-Secret "$label connection string (Session pooler URI)").Trim('"', "'", ' ')
    if ($typed -match '^postgres(ql)?://') { $uri = $typed; break }
    Write-Host "  That was $($typed.Length) characters and does not start with postgresql:// , so it looks like only the password." -ForegroundColor Yellow
    Write-Host '  Paste the whole URI from Connect > Session pooler, leaving [YOUR-PASSWORD] as it is.' -ForegroundColor Yellow
    Write-Host '  The password is asked for next, on its own.' -ForegroundColor Yellow
  }
  if (-not $uri) { throw "No connection string was given for $label. Nothing was done." }

  $placeholder = '\[YOUR[-_ ]?PASSWORD\]'
  if ($uri -match $placeholder) {
    $password = Read-Secret "$label database password (exactly as set in Supabase, no % codes)"
    if (-not $password) { throw "No password was given for $label. Nothing was done." }
    # Windows PowerShell's EscapeDataString leaves ! * ' ( ) alone; finish the job.
    # No $ survives the encoding, so the result is safe as a replacement.
    $encoded = [uri]::EscapeDataString($password)
    foreach ($ch in '!', '*', "'", '(', ')') { $encoded = $encoded.Replace($ch, ('%{0:X2}' -f [int][char]$ch)) }
    $uri = $uri -replace $placeholder, $encoded
  }
  Write-Host "  $label : $(Hide-Password $uri)" -ForegroundColor DarkGray
  return $uri
}

function Get-ProjectRef([string]$uri) {
  # postgres.<ref> as the user (pooler), or db.<ref>.supabase.co as the host (direct).
  if ($uri -match '://postgres\.([a-z0-9]{16,})[:@]') { return $Matches[1] }
  if ($uri -match '@db\.([a-z0-9]{16,})\.supabase\.co') { return $Matches[1] }
  return $null
}

function Invoke-Tool([string]$exe, [string[]]$toolArgs, [string]$what, [string]$logFile) {
  Write-Host "  $what" -ForegroundColor Cyan
  if ($DryRun) {
    $shown = $toolArgs | ForEach-Object { Hide-Password $_ }
    Write-Host "    $([IO.Path]::GetFileName($exe)) $($shown -join ' ')" -ForegroundColor DarkGray
    return
  }
  # Native tools write progress to stderr; that is not a failure by itself.
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    if ($logFile) { & $exe @toolArgs *> $logFile } else { & $exe @toolArgs }
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previous }
  if ($code -ne 0) {
    if ($logFile) { Write-Host "    See $logFile" -ForegroundColor Yellow }
    throw "$what failed (exit code $code)."
  }
}

$pgDump = Find-PgTool 'pg_dump'
$psql = Find-PgTool 'psql'

Write-Host ''
Write-Host 'Grovit: copy production into staging' -ForegroundColor Green
Write-Host 'Production is only read. Staging is overwritten.'
Write-Host ''

Write-Host 'For each project: paste the Session pooler URI as the dashboard shows it,'
Write-Host 'with [YOUR-PASSWORD] left in. The password is asked for separately.'
Write-Host ''

$prodUri = Read-ConnectionString 'Production'
$stagingUri = Read-ConnectionString 'Staging'

if (-not $prodUri -or -not $stagingUri) { throw 'Both connection strings are needed.' }
if ($prodUri -notmatch '^postgres(ql)?://' -or $stagingUri -notmatch '^postgres(ql)?://') {
  throw 'A connection string starts with postgresql:// . Copy the URI from Connect > Session pooler.'
}
if ($prodUri -match '\[YOUR-PASSWORD\]' -or $stagingUri -match '\[YOUR-PASSWORD\]') {
  throw 'Replace [YOUR-PASSWORD] in the connection string with the database password.'
}

$prodRef = Get-ProjectRef $prodUri
$stagingRef = Get-ProjectRef $stagingUri
if ($prodRef -ne $ProductionRef) {
  throw "The first connection string is not the production project ($ProductionRef). Nothing was done."
}
if (-not $stagingRef) { throw 'Could not read the project ref from the staging connection string.' }
if ($stagingRef -eq $ProductionRef -or $stagingUri -match [regex]::Escape($ProductionRef)) {
  throw 'The staging connection string points at PRODUCTION. Nothing was done.'
}

Write-Host ''
Write-Host "  Read from : production $prodRef"
Write-Host "  Write to  : staging    $stagingRef"
Write-Host ''
if (-not $DryRun) {
  $typed = Read-Host "Type the staging project ref ($stagingRef) to continue"
  if ($typed.Trim() -ne $stagingRef) { throw 'That did not match. Nothing was done.' }
}

$work = Join-Path $env:TEMP "grovit-staging-$stagingRef"
New-Item -ItemType Directory -Force -Path $work | Out-Null
$schemaFile = Join-Path $work 'schema.sql'
$dataFile = Join-Path $work 'data.sql'
$authFile = Join-Path $work 'auth.sql'
$prepFile = Join-Path $work 'prepare.sql'
$loadLog = Join-Path $work 'load.log'

# --- 1. Read production ------------------------------------------------------
Write-Host ''
Write-Host '1. Reading production' -ForegroundColor Green
Invoke-Tool $pgDump @('--schema-only', '--schema=public', '--no-owner', "--file=$schemaFile", "--dbname=$prodUri") 'structure of the public schema' $null

$dataArgs = @('--data-only', '--schema=public', '--no-owner', "--file=$dataFile")
foreach ($table in $SkipData) { $dataArgs += "--exclude-table-data=$table" }
$dataArgs += "--dbname=$prodUri"
Invoke-Tool $pgDump $dataArgs 'rows of the public schema' $null

Invoke-Tool $pgDump @('--data-only', '--table=auth.users', '--table=auth.identities', '--no-owner', "--file=$authFile", "--dbname=$prodUri") 'sign-ins' $null

# --- 2. Prepare staging ------------------------------------------------------
Write-Host ''
Write-Host '2. Preparing staging' -ForegroundColor Green

if (-not $DryRun) {
  $existing = (& $psql "--dbname=$stagingUri" '--tuples-only' '--no-align' '--command' "select count(*) from pg_tables where schemaname = 'public'") | Select-Object -First 1
  if ($LASTEXITCODE -ne 0) { throw 'Could not connect to staging. Check its connection string and password.' }
  if ([int]$existing -gt 0 -and -not $Refresh) {
    throw "Staging already has $existing tables. Run again with -Refresh to replace them."
  }
}

$prepare = ''
if ($Refresh) {
  $prepare += @'
-- A fresh start: the old copy goes, then the public schema is put back the
-- way a new Supabase project has it. Dropping the schema takes pg_trgm with
-- it, which is why the extensions are created afterwards.
DELETE FROM auth.identities;
DELETE FROM auth.users;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, service_role;

'@
}
$prepare += @'
-- What the application's schema leans on, each in the schema production has
-- it in: the ledger's search indexes name public.gin_trgm_ops.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
'@
Set-Content -Path $prepFile -Value $prepare -Encoding ascii
Invoke-Tool $psql @("--dbname=$stagingUri", '--set', 'ON_ERROR_STOP=1', '--quiet', "--file=$prepFile") 'extensions and a clean public schema' $null

# --- 3. Load staging ---------------------------------------------------------
Write-Host ''
Write-Host '3. Loading staging' -ForegroundColor Green
# Triggers and foreign-key checks are switched off for the session, so rows can
# arrive in any order and the audit triggers do not write a second history.
# Errors do not stop the load: a grant to a role staging does not have is
# expected and harmless. Everything is in load.log for review.
Invoke-Tool $psql @(
  "--dbname=$stagingUri", '--quiet',
  '--command', 'SET session_replication_role = replica',
  "--file=$schemaFile",
  "--file=$authFile",
  "--file=$dataFile"
) 'structure, sign-ins and rows' $loadLog

if (-not $DryRun) {
  $errors = @(Select-String -Path $loadLog -Pattern 'ERROR:' -SimpleMatch)
  $tables = (& $psql "--dbname=$stagingUri" '--tuples-only' '--no-align' '--command' "select count(*) from pg_tables where schemaname = 'public'") | Select-Object -First 1
  $bills = (& $psql "--dbname=$stagingUri" '--tuples-only' '--no-align' '--command' 'select count(*) from public.bills') | Select-Object -First 1
  $users = (& $psql "--dbname=$stagingUri" '--tuples-only' '--no-align' '--command' 'select count(*) from auth.users') | Select-Object -First 1
  # Staging must never print: no printers came across, and none may be left from an earlier copy.
  & $psql "--dbname=$stagingUri" '--quiet' '--command' 'DELETE FROM public.print_jobs; DELETE FROM public.printers; DELETE FROM public.pos_terminals;' | Out-Null

  Write-Host ''
  Write-Host 'Done.' -ForegroundColor Green
  Write-Host "  Staging $stagingRef now has $tables tables, $bills bills and $users sign-ins."
  Write-Host "  $($errors.Count) messages in the load log: $loadLog"
  Write-Host ''
  Write-Host 'Sign in to staging with the same email and password as production.'
  Write-Host 'Next: tell Claude that staging is cloned, with this project ref:' -NoNewline
  Write-Host " $stagingRef" -ForegroundColor Yellow
  Write-Host 'Claude then checks the copy, applies the new migrations to staging only, and points the local app at it.'
  Write-Host ''
  Write-Host "The dump files hold real data. They are in $work ; delete that folder when you are done." -ForegroundColor Yellow
} else {
  Write-Host ''
  Write-Host 'Dry run: nothing was read or written.' -ForegroundColor Yellow
}
