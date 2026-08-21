# Regenerates 96px avatar thumbnails into .opencode/experts/<team>/avatars/thumb/.
# Originals are kept untouched for large-format usage. Run from repo root:
#   powershell -ExecutionPolicy Bypass -File packages/app-cmcc/scripts/generate-avatar-thumbs.ps1
# Requires Windows (System.Drawing). Re-run after adding or replacing avatars.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$expertsRoot = Join-Path $PSScriptRoot "..\..\..\.opencode\experts"
$size = 96

$avatars = Get-ChildItem -LiteralPath $expertsRoot -Recurse -Filter *.png | Where-Object { $_.Directory.Name -ne "thumb" }
$generated = 0
$skipped = 0
$totalSaved = 0

foreach ($avatar in $avatars) {
    $thumbDir = Join-Path $avatar.Directory.FullName "thumb"
    $thumbPath = Join-Path $thumbDir $avatar.Name
    if ((Test-Path -LiteralPath $thumbPath) -and ((Get-Item -LiteralPath $thumbPath).LastWriteTime -ge $avatar.LastWriteTime)) {
        $skipped++
        continue
    }

    $image = [System.Drawing.Image]::FromFile($avatar.FullName)
    try {
        $side = [Math]::Min($image.Width, $image.Height)
        $cropX = [int](($image.Width - $side) / 2)
        $cropY = [int](($image.Height - $side) / 2)

        $bitmap = New-Object System.Drawing.Bitmap $size, $size
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $graphics.DrawImage($image, (New-Object System.Drawing.Rectangle 0, 0, $size, $size), (New-Object System.Drawing.Rectangle $cropX, $cropY, $side, $side), [System.Drawing.GraphicsUnit]::Pixel)
            } finally {
                $graphics.Dispose()
            }
            New-Item -ItemType Directory -Force -Path $thumbDir | Out-Null
            $bitmap.Save($thumbPath, [System.Drawing.Imaging.ImageFormat]::Png)
        } finally {
            $bitmap.Dispose()
        }
    } finally {
        $image.Dispose()
    }

    $thumbSize = (Get-Item -LiteralPath $thumbPath).Length
    $totalSaved += $avatar.Length - $thumbSize
    $generated++
    Write-Host ("{0}  {1:N0} KB -> {2:N0} KB" -f $thumbPath.Replace((Get-Location).Path + '\', ''), ($avatar.Length / 1KB), ($thumbSize / 1KB))
}

Write-Host ""
Write-Host ("generated: {0}, skipped: {1}, saved: {2:N0} KB" -f $generated, $skipped, ($totalSaved / 1KB))
