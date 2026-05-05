param(
    [int[]]$Ports = @(8000, 8188, 5173, 11434)
)

foreach ($port in $Ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if (-not $connections) {
        [PSCustomObject]@{
            Port = $port
            State = "free"
            PID = ""
            ProcessName = ""
        }
        continue
    }

    $connections |
        Select-Object -Unique LocalPort, OwningProcess, State |
        ForEach-Object {
            $process = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
            [PSCustomObject]@{
                Port = $_.LocalPort
                State = $_.State
                PID = $_.OwningProcess
                ProcessName = if ($process) { $process.ProcessName } else { "" }
            }
        }
}
