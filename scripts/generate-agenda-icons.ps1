param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\apps\smart-agenda\public\icons')
)

Add-Type -AssemblyName System.Drawing

function New-RoundedRectanglePath {
  param([float]$X, [float]$Y, [float]$Width, [float]$Height, [float]$Radius)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-AgendaIcon {
  param([int]$Size, [string]$FileName, [bool]$Maskable = $false)

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#071b40'))

  $scale = $Size / 512.0
  $inset = if ($Maskable) { 102 * $scale } else { 76 * $scale }
  $innerSize = $Size - (2 * $inset)
  $innerPath = New-RoundedRectanglePath $inset $inset $innerSize $innerSize (76 * $scale)
  $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.PointF]::new($inset, $inset),
    [System.Drawing.PointF]::new($Size - $inset, $Size - $inset),
    [System.Drawing.ColorTranslator]::FromHtml('#0066ff'),
    [System.Drawing.ColorTranslator]::FromHtml('#643bff'))
  $graphics.FillPath($gradient, $innerPath)

  $calendarInset = if ($Maskable) { 140 * $scale } else { 132 * $scale }
  $calendarWidth = $Size - (2 * $calendarInset)
  $calendarTop = if ($Maskable) { 154 * $scale } else { 168 * $scale }
  $calendarHeight = if ($Maskable) { 210 * $scale } else { 216 * $scale }
  $calendarPath = New-RoundedRectanglePath $calendarInset $calendarTop $calendarWidth $calendarHeight (40 * $scale)
  $penWidth = [Math]::Max(5, 28 * $scale)
  $whitePen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, $penWidth)
  $whitePen.StartCap = $whitePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawPath($whitePen, $calendarPath)
  $graphics.DrawLine($whitePen, $calendarInset + (40 * $scale), $calendarTop - (24 * $scale), $calendarInset + (40 * $scale), $calendarTop + (28 * $scale))
  $graphics.DrawLine($whitePen, $calendarInset + $calendarWidth - (40 * $scale), $calendarTop - (24 * $scale), $calendarInset + $calendarWidth - (40 * $scale), $calendarTop + (28 * $scale))
  $graphics.DrawLine($whitePen, $calendarInset + (12 * $scale), $calendarTop + (52 * $scale), $calendarInset + $calendarWidth - (12 * $scale), $calendarTop + (52 * $scale))

  $checkPen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, [Math]::Max(6, 30 * $scale))
  $checkPen.StartCap = $checkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $checkPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $graphics.DrawLines($checkPen, [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(208 * $scale, 286 * $scale),
    [System.Drawing.PointF]::new(242 * $scale, 320 * $scale),
    [System.Drawing.PointF]::new(312 * $scale, 244 * $scale)
  ))

  $target = Join-Path $OutputDirectory $FileName
  $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
  $checkPen.Dispose()
  $whitePen.Dispose()
  $gradient.Dispose()
  $innerPath.Dispose()
  $calendarPath.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
New-AgendaIcon 180 'apple-touch-icon.png'
New-AgendaIcon 192 'icon-192.png'
New-AgendaIcon 512 'icon-512.png'
New-AgendaIcon 512 'icon-maskable-512.png' $true
