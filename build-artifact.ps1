# Builds dist/artifact.html - the body-only fragment that the Claude Artifact
# publisher expects - out of the standalone index.html, so there is only ever
# one copy of the page to maintain.
#
#   powershell -ExecutionPolicy Bypass -File .\build-artifact.ps1
#
# Keep this file ASCII-only: Windows PowerShell 5.1 reads .ps1 as ANSI.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$src  = Join-Path $root 'index.html'
$dist = Join-Path $root 'dist'
$out  = Join-Path $dist 'artifact.html'

$html = Get-Content -Path $src -Raw -Encoding utf8

function Slice([string]$text, [string]$from, [string]$to) {
    $a = $text.IndexOf($from)
    $b = $text.IndexOf($to)
    if ($a -lt 0) { throw "Marker not found: $from" }
    if ($b -lt 0) { throw "Marker not found: $to" }
    $a += $from.Length
    return $text.Substring($a, $b - $a)
}

$head = Slice $html '<!-- ARTIFACT:BEGIN -->' '<!-- ARTIFACT:SPLIT -->'
$body = Slice $html '<body>'                  '<!-- ARTIFACT:END -->'

if (-not (Test-Path $dist)) { New-Item -ItemType Directory -Path $dist | Out-Null }

$fragment = $head.Trim() + "`n`n" + $body.Trim() + "`n"
[System.IO.File]::WriteAllText($out, $fragment, (New-Object System.Text.UTF8Encoding($false)))

$kb = [math]::Round((Get-Item $out).Length / 1KB, 1)
Write-Output "dist/artifact.html written - $kb KB"
