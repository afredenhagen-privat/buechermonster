// Dexie spricht in Tests gegen eine In-Memory-IndexedDB.
// Ohne diesen Import: "ReferenceError: indexedDB is not defined".
import 'fake-indexeddb/auto';
