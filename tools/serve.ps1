# Minimal static file server for local testing (Windows PowerShell 5.1, no dependencies).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools\serve.ps1 [-Port 8770]
# Without -Port it uses the PORT environment variable when set (the preview picks a free port), else 8770.
# Keep this file ASCII.
param([int]$Port = $(if ($env:PORT) { [int]$env:PORT } else { 8770 }))
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'application/javascript; charset=utf-8'; '.mjs' = 'application/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json'; '.md' = 'text/plain; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'; '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'
  '.glb' = 'model/gltf-binary'; '.gltf' = 'model/gltf+json'; '.bin' = 'application/octet-stream'; '.ktx2' = 'image/ktx2'; '.hdr' = 'application/octet-stream'
  '.wasm' = 'application/wasm'; '.mp3' = 'audio/mpeg'; '.ogg' = 'audio/ogg'; '.wav' = 'audio/wav'
  '.woff' = 'font/woff'; '.woff2' = 'font/woff2'; '.ttf' = 'font/ttf'
}
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }
    $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if (-not $path.StartsWith($root) -or -not (Test-Path $path -PathType Leaf)) {
      $ctx.Response.StatusCode = 404; $b = [Text.Encoding]::UTF8.GetBytes("404 $rel")
    } else {
      $ext = [IO.Path]::GetExtension($path).ToLower()
      $ctx.Response.ContentType = $(if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' })
      $ctx.Response.Headers.Add('Cache-Control', 'no-store')
      $b = [IO.File]::ReadAllBytes($path)
    }
    $ctx.Response.ContentLength64 = $b.Length
    $ctx.Response.OutputStream.Write($b, 0, $b.Length)
  } catch { } finally { $ctx.Response.Close() }
}
