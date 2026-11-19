function parseNumber(value, fieldName) {
  const cleaned = typeof value === "string"
    ? value.trim().replace(/^KSh\s*/i, "").replace(/,/g, "")
    : value;
  if (cleaned === "" || cleaned === null || cleaned === undefined) {
    throw new Error(`${fieldName} is required.`);
  }
  const number = Number(cleaned);
  if (!Number.isFinite(number)) throw new Error(`${fieldName} must be a valid number.`);
  return number;
}

function normalizeDate(value) {
  const date = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("Date must use YYYY-MM-DD format.");
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    parsed.getUTCFullYear() !== Number(match[1])
    || parsed.getUTCMonth() + 1 !== Number(match[2])
    || parsed.getUTCDate() !== Number(match[3])
  ) {
    throw new Error("Date must be a valid calendar date.");
  }
  return date;
}

export function normalizeInventoryTransaction(transaction) {
  const date = normalizeDate(transaction.date);
  const item = String(transaction.item || "").trim();
  const supplier = String(transaction.supplier || "").trim();
  const uom = String(transaction.uom || "").trim();
  const description = String(transaction.description || "").trim();
  const category = String(transaction.category || "").trim() || "General Materials";
  const quantity = parseNumber(transaction.quantity, "Quantity");
  const amount = parseNumber(transaction.amount, "Unit cost");

  if (!item || !supplier || !uom) {
    throw new Error("Item, supplier, and unit of measure are required.");
  }
  if (quantity <= 0) throw new Error("Quantity must be greater than zero.");
  if (amount < 0) throw new Error("Unit cost cannot be negative.");

  return {
    ...transaction,
    date,
    item,
    description,
    quantity,
    uom,
    amount,
    supplier,
    category,
    total: quantity * amount,
  };
}

const HEADER_ALIASES = {
  date: ["date", "transactiondate", "purchasedate"],
  item: ["item", "material", "itemname", "materialname"],
  description: ["description", "details"],
  quantity: ["quantity", "qty"],
  uom: ["uom", "unit", "unitofmeasure", "unitofmeasurement"],
  amount: ["amount", "unitcost", "unitprice", "costperunit"],
  supplier: ["supplier", "suppliername", "vendor"],
  category: ["category", "materialcategory"],
};

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function parseInventoryTransactionRows(rows) {
  if (!Array.isArray(rows) || rows.length < 2) {
    throw new Error("The spreadsheet must contain a header row and at least one transaction.");
  }
  if (rows.length > 5001) {
    throw new Error("A spreadsheet can contain no more than 5,000 transactions at a time.");
  }

  const headers = rows[0].map(normalizeHeader);
  const indexes = Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([field, aliases]) => [
      field,
      headers.findIndex((header) => aliases.includes(header)),
    ])
  );
  const requiredFields = ["date", "item", "quantity", "uom", "amount", "supplier"];
  const missingFields = requiredFields.filter((field) => indexes[field] === -1);
  if (missingFields.length) {
    throw new Error(`Missing required columns: ${missingFields.join(", ")}.`);
  }

  const transactions = [];
  const rowErrors = [];
  rows.slice(1).forEach((row, index) => {
    if (!row.some((cell) => String(cell || "").trim())) return;
    const values = Object.fromEntries(
      Object.entries(indexes)
        .filter(([, columnIndex]) => columnIndex >= 0)
        .map(([field, columnIndex]) => [field, row[columnIndex]])
    );
    try {
      transactions.push(normalizeInventoryTransaction(values));
    } catch (error) {
      rowErrors.push(`Row ${index + 2}: ${error.message}`);
    }
  });

  if (rowErrors.length) throw new Error(rowErrors.join(" "));
  if (!transactions.length) throw new Error("No non-empty transaction rows were found.");
  return transactions;
}
