# Minimal static file server for local preview - no Node, no Python needed.
#
#   powershell -ExecutionPolicy Bypass -File .\serve.ps1
#   powershell -ExecutionPolicy Bypass -File .\serve.ps1 -Port 9000
#
# Then open http://localhost:8123/ . Ctrl+C to stop.
# Keep this file ASCII-only: Windows PowerShell 5.1 reads .ps1 as ANSI.

param([int]$Port = 8123)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$types = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.webp' = 'image/webp'
    '.ico'  = 'image/x-icon'
    '.woff2'= 'font/woff2'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")

try { $listener.Start() }
catch { Write-Output "Could not bind port $Port. Try another: -Port 9000"; exit 1 }

Write-Output "ScanInbox serving $root"
Write-Output "http://localhost:$Port/  (Ctrl+C to stop)"

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }

    $path = Join-Path $root $rel
    $full = [System.IO.Path]::GetFullPath($path)

    # Never serve outside the project directory.
    if (-not $full.StartsWith([System.IO.Path]::GetFullPath($root), 'OrdinalIgnoreCase')) {
        $ctx.Response.StatusCode = 403
        $ctx.Response.Close()
        continue
    }

    if (Test-Path -LiteralPath $full -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
        $ctx.Response.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
        $ctx.Response.Headers.Add('Cache-Control', 'no-store')
        $bytes = [System.IO.File]::ReadAllBytes($full)
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        Write-Output ("200 /" + $rel)
    } else {
        $ctx.Response.StatusCode = 404
        $body = [System.Text.Encoding]::UTF8.GetBytes('404')
        $ctx.Response.OutputStream.Write($body, 0, $body.Length)
        Write-Output ("404 /" + $rel)
    }
    $ctx.Response.Close()
}
