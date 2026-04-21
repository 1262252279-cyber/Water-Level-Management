const chartBars = document.getElementById("chart-bars");
const connectButton = document.getElementById("connect-button");
const disconnectButton = document.getElementById("disconnect-button");

const state = {
  port: null,
  reader: null,
  keepReading: false,
  baudRate: 38400,
  apiPollingTimer: null,
  apiMode: false,
  levelHistory: [42, 55, 61, 74, 69, 68],
  events: [
    {
      title: "Low-level interrupt cleared",
      body: "Water level recovered above the refill threshold.",
    },
    {
      title: "Pump auto-stop executed",
      body: "Controller disabled relay after target level was reached.",
    },
    {
      title: "UART frame validated",
      body: "Checksum passed on the latest telemetry packet.",
    },
  ],
};

const ui = {
  connectionLabel: document.getElementById("connection-label"),
  supportNote: document.getElementById("support-note"),
  systemSummary: document.getElementById("system-summary"),
  levelValue: document.getElementById("level-value"),
  levelNote: document.getElementById("level-note"),
  pumpValue: document.getElementById("pump-value"),
  pumpNote: document.getElementById("pump-note"),
  baudValue: document.getElementById("baud-value"),
  baudNote: document.getElementById("baud-note"),
  alertValue: document.getElementById("alert-value"),
  alertNote: document.getElementById("alert-note"),
  fillPercent: document.getElementById("fill-percent"),
  fillLabel: document.getElementById("fill-label"),
  packetLevelValue: document.getElementById("packet-level-value"),
  packetLevelFlag: document.getElementById("packet-level-flag"),
  packetLevelStatus: document.getElementById("packet-level-status"),
  packetPumpValue: document.getElementById("packet-pump-value"),
  packetPumpFlag: document.getElementById("packet-pump-flag"),
  packetPumpStatus: document.getElementById("packet-pump-status"),
  packetSensorValue: document.getElementById("packet-sensor-value"),
  packetSensorFlag: document.getElementById("packet-sensor-flag"),
  packetSensorStatus: document.getElementById("packet-sensor-status"),
  packetAlertValue: document.getElementById("packet-alert-value"),
  packetAlertFlag: document.getElementById("packet-alert-flag"),
  packetAlertStatus: document.getElementById("packet-alert-status"),
  eventTitle1: document.getElementById("event-title-1"),
  eventBody1: document.getElementById("event-body-1"),
  eventTitle2: document.getElementById("event-title-2"),
  eventBody2: document.getElementById("event-body-2"),
  eventTitle3: document.getElementById("event-title-3"),
  eventBody3: document.getElementById("event-body-3"),
};

function renderChart() {
  chartBars.innerHTML = "";

  state.levelHistory.forEach((value, index) => {
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = `${Math.max(18, value * 2.3)}px`;
    bar.style.animationDelay = `${index * 90}ms`;
    chartBars.appendChild(bar);
  });
}

function renderEvents() {
  const [event1, event2, event3] = state.events;
  ui.eventTitle1.textContent = event1.title;
  ui.eventBody1.textContent = event1.body;
  ui.eventTitle2.textContent = event2.title;
  ui.eventBody2.textContent = event2.body;
  ui.eventTitle3.textContent = event3.title;
  ui.eventBody3.textContent = event3.body;
}

function pushEvent(title, body) {
  state.events.unshift({ title, body });
  state.events = state.events.slice(0, 3);
  renderEvents();
}

function setConnectionState(label, note) {
  ui.connectionLabel.textContent = label;
  ui.supportNote.textContent = note;
}

function updateDashboard(data) {
  const level = Number.parseInt(data.LEVEL ?? data.level ?? data.WL ?? data.wl, 10);
  const pump = String(
    data.PUMP ?? data.pump ?? data.MOTOR ?? data.motor ?? ui.pumpValue.textContent
  ).toUpperCase();
  const baud = String(data.BAUD ?? data.baud ?? state.baudRate);
  const alert = String(
    data.ALERT ?? data.alert ?? data.MOTORHEALTH ?? data.motorhealth ?? "NONE"
  ).toUpperCase();
  const sensor = String(
    data.SENSOR ?? data.sensor ?? data.SENSORHEALTH ?? data.sensorhealth ?? "OK"
  ).toUpperCase();

  if (!Number.isNaN(level)) {
    ui.levelValue.textContent = `${level}%`;
    ui.fillPercent.textContent = `${level}%`;
    ui.packetLevelValue.textContent = `${level}%`;
    ui.fillLabel.textContent = level < 30 ? "refill zone" : "tank filled";
    ui.levelNote.textContent = level < 30
      ? "Level is below threshold and needs refill action"
      : "Reservoir is above refill threshold";

    state.levelHistory = [...state.levelHistory.slice(-5), level];
    renderChart();
  }

  ui.pumpValue.textContent = pump;
  ui.packetPumpValue.textContent = pump;
  ui.pumpNote.textContent = pump === "ON"
    ? "Pump is actively refilling the tank"
    : "Auto mode waiting for low-level event";

  ui.baudValue.textContent = baud;
  ui.packetLevelFlag.textContent = data.LEVEL_FLAG ?? data.level_flag ?? "0x21";
  ui.packetPumpFlag.textContent = data.PUMP_FLAG ?? data.pump_flag ?? "0x10";
  ui.packetSensorFlag.textContent = data.SENSOR_FLAG ?? data.sensor_flag ?? "0x33";
  ui.packetAlertFlag.textContent = data.ALERT_FLAG ?? data.alert_flag ?? "0x00";
  ui.baudNote.textContent = "Streaming live Web Serial telemetry";

  ui.alertValue.textContent = alert;
  ui.packetAlertValue.textContent = alert;
  ui.alertNote.textContent = alert === "NONE" || alert === "NORMAL"
    ? "No overflow or dry-run risk detected"
    : "Attention needed from controller logic";
  ui.packetAlertStatus.textContent = alert === "NONE" || alert === "NORMAL" ? "Quiet" : "Active";

  ui.packetSensorValue.textContent = sensor;
  ui.packetSensorStatus.textContent = sensor === "OK" ? "Healthy" : "Check";
  ui.packetPumpStatus.textContent = pump === "ON" ? "Running" : "Idle";
  ui.packetLevelStatus.textContent = Number.isNaN(level) ? "Waiting" : "Clean";

  ui.systemSummary.textContent = `Live UART feed active. Tank ${Number.isNaN(level) ? "unknown" : `level is ${level}%`}, pump is ${pump}, sensor status is ${sensor}, and alert state is ${alert}.`;
}

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  try {
    if (trimmed.startsWith("{")) {
      return JSON.parse(trimmed);
    }
  } catch (error) {
    pushEvent("JSON parse warning", `Received malformed JSON frame: ${trimmed}`);
    return null;
  }

  const data = {};
  const segments = trimmed.includes(",") ? trimmed.split(",") : trimmed.split(/\s+/);

  segments.forEach((segment) => {
    const normalizedSegment = segment.trim();
    if (!normalizedSegment) {
      return;
    }

    let rawKey;
    let rawValue;

    if (normalizedSegment.includes(":")) {
      [rawKey, rawValue] = normalizedSegment.split(":");
    } else if (normalizedSegment.includes("=")) {
      [rawKey, rawValue] = normalizedSegment.split("=");
    }

    if (!rawKey || rawValue === undefined) {
      return;
    }

    data[rawKey.trim().toUpperCase()] = rawValue.trim();
  });

  return Object.keys(data).length ? data : null;
}

async function disconnectSerial(silent = false) {
  state.keepReading = false;

  if (state.reader) {
    try {
      await state.reader.cancel();
    } catch (error) {
      if (!silent) {
        pushEvent("Reader shutdown note", "Serial reader needed a forced cancel before closing.");
      }
    }
  }

  if (state.port) {
    try {
      await state.port.close();
    } catch (error) {
      if (!silent) {
        pushEvent("Port close warning", "The serial port did not close cleanly.");
      }
    }
  }

  state.reader = null;
  state.port = null;
  setConnectionState("Serial disconnected", "Use Chrome or Edge for Web Serial, or run the local API server for browser polling.");
}

async function readSerialLoop() {
  const decoder = new TextDecoder();
  let buffer = "";

  while (state.port && state.port.readable && state.keepReading) {
    state.reader = state.port.readable.getReader();

    try {
      while (state.keepReading) {
        const { value, done } = await state.reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";

        lines.forEach((line) => {
          const parsed = parseLine(line);
          if (!parsed) {
            return;
          }

          updateDashboard(parsed);

          if (parsed.EVENT || parsed.event) {
            pushEvent("UART event", parsed.EVENT || parsed.event);
          } else {
            pushEvent("Telemetry frame received", line.trim());
          }
        });
      }
    } catch (error) {
      pushEvent("Serial read error", error.message);
      break;
    } finally {
      state.reader.releaseLock();
      state.reader = null;
    }
  }

  await disconnectSerial(true);
}

async function connectSerial() {
  if (!("serial" in navigator)) {
    setConnectionState("Web Serial unsupported", "This browser does not support the Web Serial API. Use recent Chrome or Edge.");
    pushEvent("Browser unsupported", "Web Serial API was not found in this browser.");
    return;
  }

  try {
    state.port = await navigator.serial.requestPort();
    await state.port.open({ baudRate: state.baudRate });
    state.keepReading = true;
    setConnectionState("Serial connected", `Listening at ${state.baudRate} baud. Send CSV or JSON lines over UART.`);
    pushEvent("UART connected", `Serial port opened at ${state.baudRate} baud.`);
    await readSerialLoop();
  } catch (error) {
    await disconnectSerial(true);
    setConnectionState("Connection failed", "Port open failed. Check permissions, baud rate, and whether another app is using the COM port.");
    pushEvent("UART connect failed", error.message);
  }
}

async function pollTelemetryApi() {
  if (state.port) {
    return;
  }

  try {
    const response = await fetch("/api/telemetry", {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed with ${response.status}`);
    }

    const payload = await response.json();
    if (!payload.ok || !payload.data) {
      return;
    }

    updateDashboard(payload.data);
    if (!state.apiMode) {
      state.apiMode = true;
      setConnectionState("API live", "Polling telemetry from the local API server. POST UART lines to /api/telemetry to update this dashboard.");
      pushEvent("API polling active", "Dashboard switched to live data from /api/telemetry.");
    }
  } catch (error) {
    if (state.apiMode) {
      state.apiMode = false;
      setConnectionState("API offline", "Start the local API server, then the dashboard will resume polling automatically.");
      pushEvent("API polling stopped", error.message);
    }
  }
}

function startApiPolling() {
  if (location.protocol === "file:") {
    return;
  }

  pollTelemetryApi();
  state.apiPollingTimer = setInterval(pollTelemetryApi, 1500);
}

connectButton.addEventListener("click", connectSerial);
disconnectButton.addEventListener("click", () => {
  disconnectSerial();
  pushEvent("UART disconnected", "Serial streaming was stopped from the dashboard.");
});

renderChart();
renderEvents();
startApiPolling();
