$base = Join-Path (Get-Location) '.playwright-mcp'
@('snapshots', 'screenshots', 'logs') | ForEach-Object {
  New-Item -ItemType Directory -Force (Join-Path $base $_) | Out-Null
}
Get-ChildItem -Path $base -Filter '*.yml' | Where-Object { $_.DirectoryName -eq $base } | Move-Item -Destination (Join-Path $base 'snapshots') -Force
Get-ChildItem -Path $base -Filter '*.png' | Where-Object { $_.DirectoryName -eq $base } | Move-Item -Destination (Join-Path $base 'screenshots') -Force
Get-ChildItem -Path $base -Filter '*.log' | Where-Object { $_.DirectoryName -eq $base } | Move-Item -Destination (Join-Path $base 'logs') -Force
