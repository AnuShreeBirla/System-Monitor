
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const VALID_TYPES = [
  "sleep",
  "wake",
  "lock",
  "unlock",
  "on-battery",
  "on-ac",
];

const MAX_EVENTS = 20;

// Prevent overlapping database operations.
let databaseQueue = Promise.resolve();

function withDatabaseLock(operation) {
    const task = databaseQueue.then(operation, operation);

    databaseQueue = task.catch(() => {});

    return task;
}

// READ DATABASE
async function readDatabase(dbPath) {
    try {
        const content = await fs.readFile(dbPath, 'utf8');
        const data = JSON.parse(content);

        if (
            !data ||
            typeof data !== 'object' ||
            Array.isArray(data) ||
            !Array.isArray(data.powerEvents)
        ) {
            throw new Error('Invalid power events database format');
        }

        return data;

    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }

        const initialData = { powerEvents: [] };

        await fs.mkdir(path.dirname(dbPath), {
            recursive: true,
        });

        await saveDatabase(dbPath, initialData);

        return initialData;
    }
}

// SAVE DATABASE
async function saveDatabase(dbPath, data) {
    await fs.mkdir(path.dirname(dbPath), {
        recursive: true,
    });

    const temporaryPath =
        `${dbPath}.${process.pid}.${crypto.randomUUID()}.tmp`;

    try {
        await fs.writeFile(
            temporaryPath,
            JSON.stringify(data, null, 2),
            'utf8'
        );

        await fs.rename(temporaryPath, dbPath);

    } catch (error) {
        try {
            await fs.unlink(temporaryPath);
        } catch {}

        throw error;
    }
}

// CREATE
async function addPowerEvent(dbPath, type, description) {
    return withDatabaseLock(async () => {
        if (!VALID_TYPES.includes(type)) {
            throw new Error('Invalid power event type');
        }

        if (
            typeof description !== 'string' ||
            !description.trim()
        ) {
            throw new Error('Description is required');
        }

        const data = await readDatabase(dbPath);

        const newEvent = {
            id: `evt_${crypto.randomUUID()}`,
            type,
            timestamp: new Date().toISOString(),
            description: description.trim(),
        };

        data.powerEvents.push(newEvent);

        data.powerEvents =
            data.powerEvents.slice(-MAX_EVENTS);

        await saveDatabase(dbPath, data);

        return newEvent;
    });
}

// READ
async function getPowerEvents(dbPath) {
    return withDatabaseLock(async () => {
        const data = await readDatabase(dbPath);

        return [...data.powerEvents].reverse();
    });
}

// UPDATE
async function updatePowerEvent(dbPath, id, updates) {
    return withDatabaseLock(async () => {
        if (
            !updates ||
            typeof updates !== 'object' ||
            Array.isArray(updates)
        ) {
            throw new Error('Updates must be an object');
        }

        const allowedKeys = ['type', 'description'];

        for (const key of Object.keys(updates)) {
            if (!allowedKeys.includes(key)) {
                throw new Error(`Unknown update field: ${key}`);
            }
        }

        const data = await readDatabase(dbPath);

        const event = data.powerEvents.find(
            item => item.id === id
        );

        if (!event) {
            throw new Error('Power event not found');
        }

        if (updates.type !== undefined) {
            if (!VALID_TYPES.includes(updates.type)) {
                throw new Error('Invalid power event type');
            }

            event.type = updates.type;
        }

        if (updates.description !== undefined) {
            if (
                typeof updates.description !== 'string' ||
                !updates.description.trim()
            ) {
                throw new Error('Invalid description');
            }

            event.description = updates.description.trim();
        }

        await saveDatabase(dbPath, data);

        return event;
    });
}

// DELETE
async function deletePowerEvent(dbPath, id) {
    return withDatabaseLock(async () => {
        const data = await readDatabase(dbPath);

        const originalLength = data.powerEvents.length;

        data.powerEvents = data.powerEvents.filter(
            event => event.id !== id
        );

        if (data.powerEvents.length === originalLength) {
            throw new Error('Power event not found');
        }

        await saveDatabase(dbPath, data);

        return true;
    });
}

module.exports = {
    addPowerEvent,
    getPowerEvents,
    updatePowerEvent,
    deletePowerEvent,
};
