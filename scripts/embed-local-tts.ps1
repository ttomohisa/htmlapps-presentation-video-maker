param([Parameter(Mandatory = $true)][string]$Root)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Read-Utf8([string]$RelativePath) {
  return [IO.File]::ReadAllText((Join-Path $Root $RelativePath), [Text.Encoding]::UTF8)
}

function Get-ScriptTag([string]$Id, [string]$Type, [string]$SourceText) {
  if ($SourceText -match '</script') { throw "Unexpected script terminator in embedded TTS asset: $Id" }
  return '<script id="' + $Id + '" type="' + $Type + '">' + $SourceText + '</script>'
}

$engineDir = 'vendor/local-tts-engine'
$phonemeDir = 'vendor/local-tts-phonemes'
$tags = @(
  Get-ScriptTag 'local-tts-ort' 'text/plain' (Read-Utf8 "$engineDir/ort.wasm.bundle.min.mjs")
  Get-ScriptTag 'local-tts-wasm' 'text/plain' ([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $Root "$engineDir/ort-wasm.wasm.gz"))))
  Get-ScriptTag 'local-tts-phonemes' 'text/plain' ((Read-Utf8 "$phonemeDir/runtime.js") + "`n" + (Read-Utf8 'src/local-tts-phonemes.js'))
  Get-ScriptTag 'local-tts-worker' 'text/plain' (Read-Utf8 'src/local-tts-worker.js')
  Get-ScriptTag 'local-tts-engine' 'text/javascript' (Read-Utf8 'src/local-tts-engine.js')
)

$notices = @((Read-Utf8 'THIRD_PARTY_NOTICES.md'))
foreach ($relative in @($engineDir, $phonemeDir)) {
  $noticeFiles = Get-ChildItem -LiteralPath (Join-Path $Root $relative) -Recurse -File |
    Where-Object { $_.Name -match '(?i)license|notice|copying|copyright|attribution' } | Sort-Object FullName
  if (-not $noticeFiles) { throw "Missing TTS distribution notices in $relative" }
  foreach ($file in $noticeFiles) {
    $notices += $file.Name + "`n" + [IO.File]::ReadAllText($file.FullName, [Text.Encoding]::UTF8)
  }
}
$tags += Get-ScriptTag 'local-tts-notices' 'text/plain' ($notices -join "`n`n")
return $tags -join "`n"
