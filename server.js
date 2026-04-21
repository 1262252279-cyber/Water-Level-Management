const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const HOST = "127.0.0.1";
const PORT = 8080;
const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

const telemetry = {
  LEVEL: 68,
  WL: 68,
  DIST: 9.6,
  MOTOR: "OFF",
  PUMP: "OFF",
  SENSOR: "OK",
  SENSORHEALTH: "OK",
  MOTORHEALTH: "STOP",
  ALERT: "NORMAL",
  BAUD: 38400,
  raw: "WL=68.0% Dist=9.6cm Motor=OFF Sensor=OK MotorHealth=STOP",
  updatedAt: new Date().toISOString(),
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sanitizeNumeric(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const parsed = Number.parseFloat(String(value).replace(/[^0-9.+-]/g, ""));
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseTelemetryLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      return null;
    }
  }

  const data = {};
  const segments = trimmed.includes(",") ? trimmed.split(",") : trimmed.split(/\s+/);

  for (const segment of segments) {
    const normalized = segment.trim();
    if (!normalized) {
      continue;
    }

    let key;
    let value;

    if (normalized.includes("=")) {
      [key, value] = normalized.split("=");
    } else if (normalized.includes(":")) {
      [key, value] = normalized.split(":");
    }

    if (!key || value === undefined) {
      continue;
    }

    data[key.trim().toUpperCase()] = value.trim();
  }

  return Object.keys(data).length ? data : null;
}

function normalizeTelemetry(input) {
  const next = { ...telemetry };
  const data = input || {};

  const level = sanitizeNumeric(data.LEVEL ?? data.WL ?? data.level ?? data.wl);
  const distance = sanitizeNumeric(data.DIST ?? data.DISTANCE ?? data.distance ?? data.dist);
  const motor = data.MOTOR ?? data.PUMP ?? data.motor ?? data.pump;
  const sensor = data.SENSOR ?? data.SENSORHEALTH ?? data.sensor ?? data.sensorhealth;
  const motorHealth = data.MOTORHEALTH ?? data.ALERT ?? data.motorhealth ?? data.alert;
  const baud = sanitizeNumeric(data.BAUD ?? data.baud);

  if (level !== undefined) {
    next.LEVEL = level;
    next.WL = level;
  }

  if (distance !== undefined) {
    next.DIST = distance;
  }

  if (motor !== undefined) {
    next.MOTOR = String(motor).toUpperCase();
    next.PUMP = String(motor).toUpperCase();
  }

  if (sensor !== undefined) {
    next.SENSOR = String(sensor).toUpperCase();
    next.SENSORHEALTH = String(sensor).toUpperCase();
  }

  if (motorHealth !== undefined) {
    next.MOTORHEALTH = String(motorHealth).toUpperCase();
    next.ALERT = next.MOTORHEALTH;
  }

  if (baud !== undefined) {
    next.BAUD = baud;
  }

  next.raw = typeof data.raw === "string" ? data.raw : next.raw;
  next.updatedAt = new Date().toISOString();
  return next;
}

function updateTelemetry(input, rawLine) {
  const normalized = normalizeTelemetry(input);
  normalized.raw = rawLine || normalized.raw;
  Object.assign(telemetry, normalized);
  return telemetry;
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      sendJson(res, 404, { ok: false, error: "File not found" });
      return;
    }

    res.writeHead(200, { "Content-Type": contentType });
    res.end(buffer);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/health" && req.method === "GET") {
    sendJson(res, 200, { ok: true, service: "water-level-api", time: new Date().toISOString() });
    return;
  }

  if (url.pathname === "/api/telemetry" && req.method === "GET") {
    sendJson(res, 200, { ok: true, data: telemetry });
    return;
  }

  if (url.pathname === "/api/telemetry" && req.method === "POST") {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      let parsed;
      const contentType = req.headers["content-type"] || "";

      if (contentType.includes("application/json")) {
        try {
          parsed = JSON.parse(body);
        } catch (error) {
          sendJson(res, 400, { ok: false, error: "Invalid JSON body" });
          return;
        }
      } else {
        parsed = parseTelemetryLine(body);
      }

      if (!parsed) {
        sendJson(res, 400, { ok: false, error: "Telemetry body was empty or unrecognized" });
        return;
      }

      const updated = updateTelemetry(parsed, body.trim());
      sendJson(res, 200, { ok: true, data: updated });
    });

    return;
  }

  let requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  requestedPath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT, requestedPath);

  if (!filePath.startsWith(ROOT)) {
    sendJson(res, 403, { ok: false, error: "Forbidden path" });
    return;
  }

  serveFile(res, filePath);
});

server.listen(PORT, HOST, () => {
  console.log(`Water level dashboard available at http://${HOST}:${PORT}`);
  console.log(`Telemetry API ready at http://${HOST}:${PORT}/api/telemetry`);
});
