const DATABASE_NAME = "easy-procure-receipts";
const STORE_NAME = "receipts";
const DATABASE_VERSION = 1;

function openReceiptDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Receipt storage is not available in this browser."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open receipt storage."));
  });
}

export async function saveReceiptFile(file) {
  const database = await openReceiptDatabase();
  const id = `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).add({
        id,
        name: file.name,
        type: file.type,
        blob: file,
      });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Could not save the receipt file."));
      transaction.onabort = () => reject(transaction.error || new Error("Receipt file save was cancelled."));
    });
    return id;
  } finally {
    database.close();
  }
}

export async function getReceiptFile(id) {
  const database = await openReceiptDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Could not read the receipt file."));
    });
  } finally {
    database.close();
  }
}

export async function deleteReceiptFile(id) {
  const database = await openReceiptDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Could not delete the receipt file."));
      transaction.onabort = () => reject(transaction.error || new Error("Receipt file deletion was cancelled."));
    });
  } finally {
    database.close();
  }
}
