# Water Level Dashboard API

This project now includes a small local API and static server for the UART water level dashboard.

## Start

```powershell
node server.js
```

Then open:

- `http://127.0.0.1:8080`
- `http://127.0.0.1:8080/api/health`
- `http://127.0.0.1:8080/api/telemetry`

## Telemetry format

The API accepts either JSON or the same UART line format your STM32 firmware already sends.

Example raw text:

```text
WL=68.0% Dist=9.6cm Motor=OFF Sensor=OK MotorHealth=STOP
```

Example JSON:

```json
{
  "WL": 68.0,
  "Dist": 9.6,
  "Motor": "OFF",
  "Sensor": "OK",
  "MotorHealth": "STOP"
}
```

## POST telemetry

PowerShell example:

```powershell
Invoke-RestMethod `
  -Uri http://127.0.0.1:8080/api/telemetry `
  -Method Post `
  -ContentType "text/plain" `
  -Body "WL=72.4% Dist=8.3cm Motor=OFF Sensor=OK MotorHealth=STOP"
```

JSON example:

```powershell
Invoke-RestMethod `
  -Uri http://127.0.0.1:8080/api/telemetry `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"WL":72.4,"Dist":8.3,"Motor":"OFF","Sensor":"OK","MotorHealth":"STOP"}'
```

## Notes

- The dashboard auto-polls `/api/telemetry` every 1.5 seconds when opened through the server.
- Web Serial still works, but API polling is easier to demo and debug.

## Stable serial bridge

If the browser COM connection keeps failing or breaking, use the PowerShell serial bridge instead of Web Serial.

Start the API server first:

```powershell
node server.js
```

Then in another terminal run:

```powershell
powershell -ExecutionPolicy Bypass -File .\serial-bridge.ps1 -PortName COM3 -BaudRate 38400
```

This keeps the serial port open outside the browser, reads UART lines continuously, POSTs them to `/api/telemetry`, and auto-reconnects if the COM port drops.
