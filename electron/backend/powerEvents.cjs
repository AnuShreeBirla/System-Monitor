// powerEvents.cjs
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const VALID_TYPES = [
  "suspend",
  "resume",
  "lock",
  "unlock",
  "on-ac",
  "on-battery",
];

const VALID_LIMITS = ["5", "10", "25", "all"];

// Read existing database or initialize a new one.
async function readDatabase(dbPath) {
  try {
    const content = await fs.readFile(dbPath, "utf8");
    const data = JSON.parse(content);

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      !Array.isArray(data.powerEvents)
    ) {
      throw new Error("Invalid power events database format");
    }

    return data;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    const initialData = {
      powerEvents: [],
    };

    await saveDatabase(dbPath, initialData);

    return initialData;
  }
}

// Save database using a temporary file.
async function saveDatabase(dbPath, data) {
  await fs.mkdir(path.dirname(dbPath), {
    recursive: true,
  });

  const tempPath = `${dbPath}.tmp`;

  await fs.writeFile(
    tempPath,
    JSON.stringify(data, null, 2),
    "utf8"
  );

  await fs.rename(tempPath, dbPath);
}

// Serialize write operations to prevent overlapping writes.
let writeQueue = Promise.resolve();

function queueWrite(operation) {
  const result = writeQueue.then(operation);

  writeQueue = result.catch(() => {});

  return result;
}

// CREATE: Add a new power event.
function addPowerEvent(dbPath, type, description) {
  return queueWrite(async () => {
    if (!VALID_TYPES.includes(type)) {
      throw new Error("Invalid power event type");
    }

    if (
      typeof description !== "string" ||
      !description.trim()
    ) {
      throw new Error("Description is required");
    }

    const data = await readDatabase(dbPath);

    const newEvent = {
      id: `evt_${crypto.randomUUID()}`,
      type,
      timestamp: new Date().toISOString(),
      description: description.trim(),
    };

    data.powerEvents.push(newEvent);

    await saveDatabase(dbPath, data);

    return newEvent;
  });
}

// READ: Retrieve events according to the selected limit.
async function getPowerEvents(dbPath, limit = "5") {
  const data = await readDatabase(dbPath);

  const normalizedLimit = String(limit);

  const selectedLimit = VALID_LIMITS.includes(normalizedLimit)
    ? normalizedLimit
    : "5";

  const events = [...data.powerEvents].reverse();

  const selectedEvents =
    selectedLimit === "all"
      ? events
      : events.slice(0, Number(selectedLimit));

  // Preserve the field expected by the existing dashboard.
  return selectedEvents.map((event) => ({
    ...event,
    eventType: event.type,
  }));
}

module.exports = {
  addPowerEvent,
  getPowerEvents,
};
