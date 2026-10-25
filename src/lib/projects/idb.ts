type CatalogStore = "projects" | "sessions" | "meta";

const CATALOG_VERSION = 2;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed.")), { once: true });
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted.")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed.")), { once: true });
  });
}

export async function openCatalogDatabase(databaseName: string): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    throw new Error("Project storage is available only in a browser with IndexedDB enabled.");
  }

  const request = indexedDB.open(databaseName, CATALOG_VERSION);
  request.addEventListener("upgradeneeded", (event) => {
    const database = request.result;
    const transaction = request.transaction;
    if (!database.objectStoreNames.contains("projects")) {
      const projects = database.createObjectStore("projects", { keyPath: "id" });
      projects.createIndex("nameKey", "nameKey", { unique: false });
      projects.createIndex("lastOpenedAt", "lastOpenedAt");
      projects.createIndex("storageNamespace", "storageNamespace", { unique: true });
    } else if ((event as IDBVersionChangeEvent).oldVersion < 2 && transaction) {
      const projects = transaction.objectStore("projects");
      if (projects.indexNames.contains("nameKey")) projects.deleteIndex("nameKey");
      projects.createIndex("nameKey", "nameKey", { unique: false });
    }
    if (!database.objectStoreNames.contains("sessions")) {
      database.createObjectStore("sessions", { keyPath: "projectId" });
    }
    if (!database.objectStoreNames.contains("meta")) {
      database.createObjectStore("meta", { keyPath: "key" });
    }
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Project storage is busy in another FTC Simulator tab. Close or reload the older tab, then Retry."));
    }, 5_000);
    const finish = (callback: () => void) => {
      if (settled) return false;
      settled = true;
      window.clearTimeout(timeout);
      callback();
      return true;
    };
    request.addEventListener("success", () => {
      const database = request.result;
      database.addEventListener("versionchange", () => database.close());
      if (!finish(() => resolve(database))) database.close();
    }, { once: true });
    request.addEventListener("error", () => {
      finish(() => reject(request.error ?? new Error("Project storage could not be opened.")));
    }, { once: true });
    request.addEventListener("blocked", () => {
      finish(() => reject(new Error("Project storage is busy in another FTC Simulator tab. Close or reload the older tab, then Retry.")));
    }, { once: true });
  });
}

export async function getRecord<T>(database: IDBDatabase, store: CatalogStore, key: IDBValidKey): Promise<T | undefined> {
  const transaction = database.transaction(store, "readonly");
  const request = transaction.objectStore(store).get(key);
  const done = transactionDone(transaction);
  const [result] = await Promise.all([requestResult(request), done]);
  return result as T | undefined;
}

export async function getAllRecords<T>(database: IDBDatabase, store: CatalogStore): Promise<T[]> {
  const transaction = database.transaction(store, "readonly");
  const request = transaction.objectStore(store).getAll();
  const done = transactionDone(transaction);
  const [result] = await Promise.all([requestResult(request), done]);
  return result as T[];
}

export async function putRecord<T>(database: IDBDatabase, store: CatalogStore, value: T): Promise<void> {
  const transaction = database.transaction(store, "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore(store).put(value);
  await done;
}

/**
 * Reads and replaces one record inside a single read/write transaction.
 * The mutator must remain synchronous so IndexedDB cannot auto-commit between
 * the compare and the write.
 */
export function mutateRecord<T>(
  database: IDBDatabase,
  storeName: CatalogStore,
  key: IDBValidKey,
  mutator: (current: T | undefined) => T,
): Promise<T> {
  const transaction = database.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  let nextValue: T | undefined;
  let mutationError: unknown;

  return new Promise<T>((resolve, reject) => {
    transaction.addEventListener("complete", () => {
      if (nextValue === undefined) {
        reject(new Error("IndexedDB mutation completed without producing a record."));
        return;
      }
      resolve(nextValue);
    }, { once: true });
    transaction.addEventListener("abort", () => {
      reject(mutationError ?? transaction.error ?? new Error("IndexedDB mutation was aborted."));
    }, { once: true });
    transaction.addEventListener("error", () => {
      mutationError ??= transaction.error ?? new Error("IndexedDB mutation failed.");
    }, { once: true });

    const request = store.get(key);
    request.addEventListener("success", () => {
      try {
        nextValue = mutator(request.result as T | undefined);
        store.put(nextValue);
      } catch (error) {
        mutationError = error;
        transaction.abort();
      }
    }, { once: true });
    request.addEventListener("error", () => {
      mutationError = request.error ?? new Error("IndexedDB record could not be read for mutation.");
    }, { once: true });
  });
}

/**
 * Reads the latest project and writes that project together with its editor
 * session in one transaction. Overlapping project mutations are serialized by
 * IndexedDB, so session persistence cannot put an older copy of cloud state.
 */
export function mutateProjectAndSession<Project, Session>(
  database: IDBDatabase,
  projectId: IDBValidKey,
  mutator: (
    currentProject: Project | undefined,
  ) => { project: Project; session: Session },
): Promise<{ project: Project; session: Session }> {
  const transaction = database.transaction(["projects", "sessions"], "readwrite");
  const projects = transaction.objectStore("projects");
  const sessions = transaction.objectStore("sessions");
  let nextValue: { project: Project; session: Session } | undefined;
  let mutationError: unknown;

  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => {
      if (!nextValue) {
        reject(new Error("IndexedDB session mutation completed without producing records."));
        return;
      }
      resolve(nextValue);
    }, { once: true });
    transaction.addEventListener("abort", () => {
      reject(mutationError ?? transaction.error ?? new Error("IndexedDB session mutation was aborted."));
    }, { once: true });
    transaction.addEventListener("error", () => {
      mutationError ??= transaction.error ?? new Error("IndexedDB session mutation failed.");
    }, { once: true });

    const request = projects.get(projectId);
    request.addEventListener("success", () => {
      try {
        nextValue = mutator(request.result as Project | undefined);
        projects.put(nextValue.project);
        sessions.put(nextValue.session);
      } catch (error) {
        mutationError = error;
        transaction.abort();
      }
    }, { once: true });
    request.addEventListener("error", () => {
      mutationError = request.error ?? new Error("IndexedDB project could not be read for session persistence.");
    }, { once: true });
  });
}

export async function deleteRecord(database: IDBDatabase, store: CatalogStore, key: IDBValidKey): Promise<void> {
  const transaction = database.transaction(store, "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore(store).delete(key);
  await done;
}

export async function putProjectAndSession<Project, Session>(
  database: IDBDatabase,
  project: Project,
  session: Session,
): Promise<void> {
  const transaction = database.transaction(["projects", "sessions"], "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore("projects").put(project);
  transaction.objectStore("sessions").put(session);
  await done;
}
