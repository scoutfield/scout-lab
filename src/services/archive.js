const DB_NAME = 'scout-lab';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'icloud-directory';

export const deleteArchiveDatabase = () => new Promise((resolve, reject) => {
  const request = indexedDB.deleteDatabase(DB_NAME);
  request.onerror = () => reject(request.error || new Error('Scout Lab data reset failed.'));
  request.onblocked = () => reject(new Error('Close other Scout Lab tabs and reload to finish the data reset.'));
  request.onsuccess = () => resolve();
});

const openDb = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);

  request.onupgradeneeded = () => {
    request.result.createObjectStore(STORE_NAME);
  };
  request.onerror = () => reject(request.error);
  request.onsuccess = () => resolve(request.result);
});

const getHandle = async () => {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(HANDLE_KEY);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
};

const setHandle = async (handle) => {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const request = tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(handle);
  });
};

export const hasPermission = async (handle, mode = 'readwrite') => {
  if (!handle) return false;

  return (await handle.queryPermission({ mode })) === 'granted';
};

export const verifyPermission = async (handle, mode = 'readwrite') => {
  if (await hasPermission(handle, mode)) return true;
  if (!handle) return false;

  if ((await handle.requestPermission({ mode })) === 'granted') return true;

  return false;
};

const getOrCreateDirectory = async (root, parts) => {
  let cursor = root;

  for (const part of parts) {
    cursor = await cursor.getDirectoryHandle(part, { create: true });
  }

  return cursor;
};

export const canUseFileSystemAccess = () => 'showDirectoryPicker' in window;

export const connectArchiveFolder = async () => {
  if (!canUseFileSystemAccess()) {
    throw new Error('Folder access is not supported in this browser.');
  }

  const handle = await window.showDirectoryPicker({
    id: 'scout-lab-archive',
    mode: 'readwrite',
  });

  await setHandle(handle);
  return handle;
};

export const getArchiveStatus = async () => {
  const handle = await getHandle();
  if (!handle) return { connected: false, name: '' };

  const connected = await hasPermission(handle, 'readwrite');
  return { connected, name: handle.name };
};

export const getArchiveFolder = async () => {
  const handle = await getHandle();
  if (!handle) throw new Error('Choose your shared iCloud Drive folder first.');
  if (!(await verifyPermission(handle, 'readwrite'))) {
    throw new Error('Reconnect your iCloud Drive folder to use shared credentials.');
  }
  return handle;
};

export const writeArchiveToHandle = async (handle, date, content) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Archive date must use YYYY-MM-DD.');
  if (typeof content !== 'string') throw new Error('Archive content must be text.');

  const allowed = await verifyPermission(handle, 'readwrite');
  if (!allowed) {
    throw new Error('Scout Lab does not have permission to write to this folder.');
  }

  const [year, month] = date.split('-');
  const monthDir = await getOrCreateDirectory(handle, [year, month]);
  const file = await monthDir.getFileHandle(`${date}.md`, { create: true });
  const writable = await file.createWritable();

  await writable.write(content);
  await writable.close();

  return `${handle.name}/${year}/${month}/${date}.md`;
};

export const writeDailyArchive = async (date, content) => {
  const handle = await getHandle();

  if (!handle) {
    throw new Error('Choose an iCloud Drive folder before saving.');
  }

  return writeArchiveToHandle(handle, date, content);
};
