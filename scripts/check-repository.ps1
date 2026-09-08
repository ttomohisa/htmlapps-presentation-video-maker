param(
  [switch]$ForceDownload
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

$required = @(
  "APP_SPEC.md",
  "app.config.json",
  "assets\favicon.svg",
  "dependencies.json",
  "dependencies.lock.json",
  ".github\workflows\dependency-updates.yml",
  "docs\ARCHITECTURE.md",
  "docs\DEPENDENCIES.md",
  "docs\DEPENDENCIES.ja.md",
  "docs\RELEASE_CHECKLIST.md",
  "src\index.template.html",
  "build-standalone.ps1",
  "scripts\build-self-extract.ps1",
  "scripts\check-powershell-syntax.ps1",
  "scripts\dependency-tools.ps1",
  "scripts\check-dependency-updates.ps1",
  "scripts\sync-dependency-lock.ps1",
  "scripts\update-dependency.ps1",
  "scripts\verify-standalone.ps1",
  "scripts\verify-self-extract.ps1",
  "README.md",
  "README.ja.md",
  "LICENSE",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md",
  "VERIFY_OFFLINE.md",
  "schemas\app-config.schema.json",
  "schemas\dependencies.schema.json",
  "schemas\dependencies-lock.schema.json",
  "vendor\ffmpeg-video-compressor-v1.6.0\browser-ffmpeg.js",
  "vendor\ffmpeg-video-compressor-v1.6.0\ffmpeg.js.gz",
  "vendor\ffmpeg-video-compressor-v1.6.0\ffmpeg.wasm.gz",
  "vendor\ffmpeg-video-compressor-v1.6.0\manifest.json"
)

foreach ($relative in $required) {
  $path = Join-Path $Root $relative
  if (-not (Test-Path $path)) { throw "Required repository file is missing: $relative" }
}

& (Join-Path $Root "scripts\check-powershell-syntax.ps1") -RootPath $Root


$dependencyConfig = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "dependencies.json") | ConvertFrom-Json
$dependencyLock = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "dependencies.lock.json") | ConvertFrom-Json
if ([int]$dependencyLock.schemaVersion -ne 1) { throw "dependencies.lock.json must use schemaVersion 1." }
$configIds = @($dependencyConfig.dependencies | ForEach-Object { [string]$_.id })
$lockIds = @($dependencyLock.dependencies | ForEach-Object { [string]$_.id })
if ($configIds.Count -ne $lockIds.Count) { throw "dependencies.lock.json must contain exactly one entry for every dependency." }
foreach ($dependency in @($dependencyConfig.dependencies)) {
  $matches = @($dependencyLock.dependencies | Where-Object { [string]$_.id -eq [string]$dependency.id })
  if ($matches.Count -ne 1) { throw "dependencies.lock.json must contain exactly one lock entry for '$([string]$dependency.id)'." }
  if ([string]$matches[0].package -ne [string]$dependency.package -or [string]$matches[0].version -ne [string]$dependency.version) {
    throw "dependencies.lock.json does not match dependencies.json for '$([string]$dependency.id)'."
  }
}


$sourceText = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "src\index.template.html")
if (-not $sourceText.Contains("__EMBEDDED_ASSET_BUNDLE_JSON__")) { throw "src\index.template.html must embed the asset bundle JSON directly." }
if ($sourceText.Contains("__EMBEDDED_ASSET_BUNDLE_BASE64__")) { throw "Legacy double-Base64 asset bundle placeholder must not return." }
$iconPlaceholderCount = ([regex]::Matches($sourceText, [regex]::Escape("__APP_ICON_DATA_URI__"))).Count
if ($iconPlaceholderCount -ne 2) { throw "src\index.template.html must use __APP_ICON_DATA_URI__ exactly twice: favicon and header icon." }
if (-not $sourceText.Contains('id="appBrandIcon"')) { throw "src\index.template.html is missing the canonical header brand icon marker." }
foreach ($token in @("bytesAsync", "blobUrlAsync", "outputFilename", "window.AppToast", "SpeechSynthesisUtterance", "getDisplayMedia", "getUserMedia", "MediaRecorder", "foreignObjectRendering:false", "composeIntermediateWebm", "transcodeToMp4", "requestFrame", "requestData")) {
  if (-not $sourceText.Contains($token)) { throw "src\index.template.html is missing required Presentation Video Maker behavior marker: $token" }
}

$builderText = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "build-standalone.ps1")
foreach ($token in @("compressionSetting", "Compress-GzipBytes", "build-size-report.json", "sizeBudget", "DependencyLockPath", "tarballSha256", "__EMBEDDED_ASSET_BUNDLE_JSON__", "AppIconPath", "__APP_ICON_DATA_URI__")) {
  if (-not $builderText.Contains($token)) { throw "build-standalone.ps1 is missing required asset pipeline marker: $token" }
}
if ($builderText.Contains("__EMBEDDED_ASSET_BUNDLE_BASE64__")) { throw "build-standalone.ps1 must not wrap the full asset bundle in Base64." }

$selfExtractBuilderPath = Join-Path $Root "scripts\build-self-extract.ps1"
$selfExtractBuilderBytes = [System.IO.File]::ReadAllBytes($selfExtractBuilderPath)
$selfExtractBuilderStart = 0
if (
  $selfExtractBuilderBytes.Length -ge 3 -and
  $selfExtractBuilderBytes[0] -eq 0xef -and
  $selfExtractBuilderBytes[1] -eq 0xbb -and
  $selfExtractBuilderBytes[2] -eq 0xbf
) {
  $selfExtractBuilderStart = 3
}
for ($index = $selfExtractBuilderStart; $index -lt $selfExtractBuilderBytes.Length; $index += 1) {
  if ($selfExtractBuilderBytes[$index] -gt 0x7f) {
    throw "scripts\build-self-extract.ps1 must contain ASCII text only so Windows PowerShell 5.1 cannot corrupt loader text."
  }
}

$buildCompatibilityFiles = @(
  "build-standalone.ps1",
  "scripts\build-self-extract.ps1",
  "scripts\check-powershell-syntax.ps1",
  "scripts\verify-standalone.ps1",
  "scripts\verify-self-extract.ps1",
  "scripts\dependency-tools.ps1",
  "scripts\check-dependency-updates.ps1",
  "scripts\sync-dependency-lock.ps1",
  "scripts\update-dependency.ps1"
)
foreach ($relative in $buildCompatibilityFiles) {
  $compatibilityPath = Join-Path $Root $relative
  $compatibilityText = Get-Content -Raw -Encoding UTF8 $compatibilityPath
  if ($compatibilityText -match '(?i)\bGet-FileHash\b') {
    throw "$relative must not depend on Get-FileHash; use the .NET SHA-256 helper for broader Windows PowerShell compatibility."
  }
  if ($compatibilityText -match '::new\s*\(') {
    throw "$relative must not use ::new(); use New-Object or older-compatible .NET construction syntax."
  }
}

# Regression check: dependency update reporting must handle both zero dependencies and one disabled dependency without network access.
$dependencyUpdateCheckPath = Join-Path $Root "scripts\check-dependency-updates.ps1"
$dependencyUpdateTestRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("single-html-template-dependency-check-" + [Guid]::NewGuid().ToString("N"))
$dependencyUpdateCases = @(
  @{
    Name = "empty"
    Json = '{"dependencies":[]}'
    DependencyCount = 0
    CheckedCount = 0
    DisabledCount = 0
  },
  @{
    Name = "single-disabled"
    Json = '{"dependencies":[{"id":"fixture","package":"fixture-package","version":"1.0.0","updates":{"enabled":false,"policy":"manual"}}]}'
    DependencyCount = 1
    CheckedCount = 0
    DisabledCount = 1
  }
)
try {
  New-Item -ItemType Directory -Force -Path $dependencyUpdateTestRoot | Out-Null
  foreach ($case in $dependencyUpdateCases) {
    $caseRoot = Join-Path $dependencyUpdateTestRoot ([string]$case.Name)
    New-Item -ItemType Directory -Force -Path $caseRoot | Out-Null
    $caseDependenciesPath = Join-Path $caseRoot "dependencies.json"
    $caseJsonOutput = Join-Path $caseRoot "report.json"
    $caseMarkdownOutput = Join-Path $caseRoot "report.md"
    [System.IO.File]::WriteAllText($caseDependenciesPath, [string]$case.Json, (New-Object System.Text.UTF8Encoding($false)))
    & $dependencyUpdateCheckPath -DependenciesPath $caseDependenciesPath -JsonOutput $caseJsonOutput -MarkdownOutput $caseMarkdownOutput
    $caseReport = Get-Content -Raw -Encoding UTF8 $caseJsonOutput | ConvertFrom-Json
    if ([int]$caseReport.dependencyCount -ne [int]$case.DependencyCount) { throw "Dependency update regression '$($case.Name)' reported an unexpected dependencyCount." }
    if ([int]$caseReport.checkedCount -ne [int]$case.CheckedCount) { throw "Dependency update regression '$($case.Name)' reported an unexpected checkedCount." }
    if ([int]$caseReport.disabledCount -ne [int]$case.DisabledCount) { throw "Dependency update regression '$($case.Name)' reported an unexpected disabledCount." }
    if ([int]$caseReport.updateCount -ne 0) { throw "Dependency update regression '$($case.Name)' must not report updates." }
  }
} finally {
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $dependencyUpdateTestRoot
}

# Regression check: runtime identifiers like __APP_INTERNAL_STATE__ are not build placeholders.
$verifyPath = Join-Path $Root "scripts\verify-standalone.ps1"
$tempVerifyPath = Join-Path ([System.IO.Path]::GetTempPath()) ("single-html-template-verify-" + [Guid]::NewGuid().ToString("N") + ".html")
$syntheticHtml = @'
<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'none'">
</head><body><script>const __APP_INTERNAL_STATE__ = 1;</script></body></html>
'@
try {
  [System.IO.File]::WriteAllText($tempVerifyPath, $syntheticHtml, (New-Object System.Text.UTF8Encoding($false)))
  & $verifyPath -Path $tempVerifyPath -RequireNetworkBlock $true -RequireCanonicalIcon $false
} finally {
  Remove-Item -Force -ErrorAction SilentlyContinue $tempVerifyPath
}

$app = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "app.config.json") | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace([string]$app.name)) { throw "app.config.json: name is required" }
if ([string]::IsNullOrWhiteSpace([string]$app.slug)) { throw "app.config.json: slug is required" }
if ([string]::IsNullOrWhiteSpace([string]$app.version)) { throw "app.config.json: version is required" }

$buildArguments = @{}
if ($ForceDownload) { $buildArguments.ForceDownload = $true }
& (Join-Path $Root "build-standalone.ps1") @buildArguments

Write-Host "[OK] Repository check passed." -ForegroundColor Green


