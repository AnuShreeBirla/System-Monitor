
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const VALID_TYPES = [
  "sleep",
  "wake",
  "lock",
  "unlock",
  "on-battery",
];

const MAX_EVENTS = 20;

// Read database, or create it if it doesn't exist
async function readDatabase(dbPath) {
  try {
    const content = await fs.readFile(dbPath, "utf8");
    const data = JSON.parse(content);

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Invalid database format");
    }

    if (!Array.isArray(data.powerEvents)) {
      data.powerEvents = [];
    }

    return data;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    const initialData = { powerEvents: [] };

    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    await fs.writeFile(
      dbPath,
      JSON.stringify(initialData, null, 2),
      "utf8"
    );

    return initialData;
  }
}

// Save database
async function saveDatabase(dbPath, data) {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });

  const tempPath = `${dbPath}.tmp`;

  await fs.writeFile(
    tempPath,
    JSON.stringify(data, null, 2),
    "utf8"
  );

  await fs.rename(tempPath, dbPath);
}

// CREATE
async function addPowerEvent(dbPath, type, description) {
  if (!VALID_TYPES.includes(type)) {
    throw new Error("Invalid power event type");
  }

  if (typeof description !== "string" || !description.trim()) {
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

  // Keep only the latest 20 events
  data.powerEvents = data.powerEvents.slice(-MAX_EVENTS);

  await saveDatabase(dbPath, data);

  return newEvent;
}

// READ
async function getPowerEvents(dbPath) {
  const data = await readDatabase(dbPath);

  return [...data.powerEvents].reverse();
}

// UPDATE
async function updatePowerEvent(dbPath, id, updates) {
  const data = await readDatabase(dbPath);

  const event = data.powerEvents.find(item => item.id === id);

  if (!event) {
    throw new Error("Power event not found");
  }

  if (updates.type !== undefined) {
    if (!VALID_TYPES.includes(updates.type)) {
      throw new Error("Invalid power event type");
    }
    event.type = updates.type;
  }

  if (updates.description !== undefined) {
    if (
      typeof updates.description !== "string" ||
      !updates.description.trim()
    ) {
      throw new Error("Invalid description");
    }
    event.description = updates.description.trim();
  }

  await saveDatabase(dbPath, data);

  return event;
}

// DELETE
async function deletePowerEvent(dbPath, id) {
  const data = await readDatabase(dbPath);

  const originalLength = data.powerEvents.length;

  data.powerEvents = data.powerEvents.filter(
    event => event.id !== id
  );

  if (data.powerEvents.length === originalLength) {
    throw new Error("Power event not found");
  }

  await saveDatabase(dbPath, data);

  return true;
}

module.exports = {
  addPowerEvent,
  getPowerEvents,
  updatePowerEvent,
  deletePowerEvent,
};
