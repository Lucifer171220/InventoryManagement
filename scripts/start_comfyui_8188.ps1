param(
    [Parameter(Mandatory = $true)]
    [string]$ComfyUIPath,

    [string]$Python = "python"
)

$resolvedPath = Resolve-Path -LiteralPath $ComfyUIPath -ErrorAction Stop
$mainPath = Join-Path $resolvedPath "main.py"

if (-not (Test-Path -LiteralPath $mainPath)) {
    throw "Could not find main.py in $resolvedPath"
}

Set-Location -LiteralPath $resolvedPath
& $Python main.py --listen 0.0.0.0 --port 8188
