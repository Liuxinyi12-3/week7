# ---------------------------------------------------------------
# Tiny static web server for this site (port 8643).
#
# Why this exists: opening projects.html directly from disk uses the
# file:// protocol. The UAPI weather API only allows real http(s)
# origins, so the browser blocks that request. Serving the folder
# over http makes the weather app work.
#
# Easiest way to use it: double-click "Start Site.bat".
# ---------------------------------------------------------------
$root = $PSScriptRoot
$port = 8643

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try {
  $listener.Start()
} catch {
  Write-Host ""
  Write-Host "  A server is already running on http://localhost:$port/ — just open that address."
  Write-Host ""
  Start-Sleep -Seconds 3
  exit
}

Write-Host ""
Write-Host "  Portfolio site is running at:  http://localhost:$port/projects.html"
Write-Host "  Keep this window open while you use the site."
Write-Host "  Press Ctrl+C to stop the server."
Write-Host ""

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".jpeg" = "image/jpeg"
  ".jpg"  = "image/jpeg"
  ".png"  = "image/png"
  ".svg"  = "image/svg+xml"
  ".csv"  = "text/csv"
  ".md"   = "text/markdown; charset=utf-8"
  ".pdf"  = "application/pdf"
}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $path = $ctx.Request.Url.LocalPath.TrimStart("/")
    if ([string]::IsNullOrEmpty($path)) { $path = "index.html" }
    $file = Join-Path $root ($path -replace "/", [IO.Path]::DirectorySeparatorChar)

    if (Test-Path $file -PathType Leaf) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $ctx.Response.ContentType = $(if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" })
      # Always serve fresh files — a cached page would hide updated scripts.
      $ctx.Response.Headers.Add("Cache-Control", "no-store, must-revalidate")
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
    $ctx.Response.OutputStream.Close()
  } catch {}
}
