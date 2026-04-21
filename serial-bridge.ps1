param(
    [string]$PortName = "COM3",
    [int]$BaudRate = 38400,
    [string]$ApiUrl = "http://127.0.0.1:8080/api/telemetry",
    [int]$ReconnectDelayMs = 2000
)

Add-Type -AssemblyName System.IO.Ports

function Write-Status {
    param([string]$Message)
    $time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$time] $Message"
}

while ($true) {
    $serialPort = $null

    try {
        Write-Status "Opening $PortName at $BaudRate baud"

        $serialPort = New-Object System.IO.Ports.SerialPort(
            $PortName,
            $BaudRate,
            [System.IO.Ports.Parity]::None,
            8,
            [System.IO.Ports.StopBits]::One
        )
        $serialPort.NewLine = "`r`n"
        $serialPort.ReadTimeout = 3000
        $serialPort.DtrEnable = $false
        $serialPort.RtsEnable = $false
        $serialPort.Open()

        Write-Status "Serial bridge connected. Forwarding telemetry to $ApiUrl"

        while ($serialPort.IsOpen) {
            try {
                $line = $serialPort.ReadLine().Trim()

                if ([string]::IsNullOrWhiteSpace($line)) {
                    continue
                }

                Write-Status "UART > $line"

                Invoke-RestMethod `
                    -Uri $ApiUrl `
                    -Method Post `
                    -ContentType "text/plain" `
                    -Body $line | Out-Null
            }
            catch [System.TimeoutException] {
                continue
            }
        }
    }
    catch {
        Write-Status "Bridge error: $($_.Exception.Message)"
    }
    finally {
        if ($serialPort -and $serialPort.IsOpen) {
            $serialPort.Close()
        }
    }

    Write-Status "Disconnected. Reconnecting in $ReconnectDelayMs ms"
    Start-Sleep -Milliseconds $ReconnectDelayMs
}
