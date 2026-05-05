param(
    [string]$ComfyUIUrl = "http://127.0.0.1:8188"
)

$url = "$ComfyUIUrl/object_info/CheckpointLoaderSimple"

try {
    $response = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 10
    $checkpoints = $response.CheckpointLoaderSimple.input.required.ckpt_name[0]

    if (-not $checkpoints -or $checkpoints.Count -eq 0) {
        Write-Host "ComfyUI is running, but it reports zero checkpoints." -ForegroundColor Yellow
        Write-Host "Put your checkpoint in the models/checkpoints folder used by the running ComfyUI instance."
        exit 0
    }

    Write-Host "ComfyUI checkpoints visible at ${ComfyUIUrl}:" -ForegroundColor Green
    $checkpoints | ForEach-Object { Write-Host "- $_" }
} catch {
    Write-Host "Could not read checkpoints from $url" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}
