param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
$app = Get-Content -LiteralPath (Join-Path $root 'app.config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$app.version
if ($version -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') {
  throw "Expected a stable version in app.config.json, got '$version'."
}

$changelog = Get-Content -LiteralPath (Join-Path $root 'CHANGELOG.md') -Raw -Encoding UTF8
$versionSection = '(?ms)^## \[' + [regex]::Escape($version) + '\][^\r\n]*\r?\n(.*?)(?=^## |\z)'
$releaseNotes = [regex]::Match($changelog, $versionSection).Groups[1].Value.Trim()
if (-not $releaseNotes) { throw "CHANGELOG.md needs a release entry for $version." }

$commit = git -C $root rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $commit -cnotmatch '^[a-f0-9]{40}$') {
  throw 'Could not resolve the release commit.'
}
if ($env:GITHUB_SHA -and $env:GITHUB_SHA -ne $commit) {
  throw "Build checked out $commit instead of $env:GITHUB_SHA."
}

$tag = "v$version"
$name = "htmlapps-$($app.slug)-$tag"
$title = "$($app.name) $tag"
$dist = Join-Path $root 'dist'
$manifest = Get-Content -LiteralPath (Join-Path $dist 'dependency-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.app.version -ne $version) { throw 'The built HTML manifest has a different app version.' }

$output = New-Item -ItemType Directory -Path $OutputPath -Force
$bundle = New-Item -ItemType Directory -Path (Join-Path $output.FullName 'bundle')
$buildFiles = @('index.html', 'index.self-extract.html', 'dependency-manifest.json', 'self-extract-manifest.json')
foreach ($file in $buildFiles) {
  Copy-Item -LiteralPath (Join-Path $dist $file) -Destination $bundle.FullName
}
foreach ($file in @('README.md', 'README.ja.md', 'CHANGELOG.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'dependencies.json')) {
  Copy-Item -LiteralPath (Join-Path $root $file) -Destination $bundle.FullName
}

# Include the license notices linked by the release documentation.
foreach ($vendor in @('local-tts-engine', 'local-tts-phonemes')) {
  $source = Join-Path $root "vendor/$vendor"
  if (Test-Path -LiteralPath $source) {
    $destination = New-Item -ItemType Directory -Path (Join-Path $bundle.FullName "vendor/$vendor") -Force
    Get-ChildItem -LiteralPath $source -File |
      Where-Object { $_.Name -match 'LICENSE|NOTICE|COPYING' } |
      Copy-Item -Destination $destination.FullName
  }
}

$releaseManifest = [ordered]@{ version = $version; tag = $tag; commit = $commit }
$releaseManifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $bundle.FullName 'RELEASE.json') -Encoding utf8
$readable = Join-Path $output.FullName "$name.html"
$selfExtract = Join-Path $output.FullName "$name.self-extract.html"
$archive = Join-Path $output.FullName "$name.zip"
Copy-Item -LiteralPath (Join-Path $bundle.FullName 'index.html') -Destination $readable
Copy-Item -LiteralPath (Join-Path $bundle.FullName 'index.self-extract.html') -Destination $selfExtract
Compress-Archive -Path (Join-Path $bundle.FullName '*') -DestinationPath $archive

$checksums = foreach ($asset in @($readable, $selfExtract, $archive)) {
  $hash = (Get-FileHash -LiteralPath $asset -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $([IO.Path]::GetFileName($asset))"
}
$checksumFile = Join-Path $output.FullName 'SHA256SUMS.txt'
[IO.File]::WriteAllText($checksumFile, (($checksums -join "`n") + "`n"), [Text.Encoding]::ASCII)

$notes = @"
<!-- automated-release:$commit -->
$releaseNotes

### Downloads

- $name.html: standalone HTML.
- $name.self-extract.html: smaller, self-extracting HTML.
- $name.zip: HTML builds, manifests, and documentation.
- SHA256SUMS.txt: SHA-256 checksums.
"@
$notes.Replace("`r`n", "`n") | Set-Content -LiteralPath (Join-Path $output.FullName 'release-notes.md') -Encoding utf8 -NoNewline

if ($env:GITHUB_OUTPUT) {
  "tag=$tag", "title=$title" | Add-Content -LiteralPath $env:GITHUB_OUTPUT -Encoding utf8
}
Write-Host "Packaged $title from $commit."
