export function formatPONumber(sequence) {
  return `PO:${String(sequence).padStart(3, "0")}`;
}

export function getPONumberSequence(value) {
  const match = String(value || "").match(/^(?:PO:)?(\d+)$/i);
  return match ? Number(match[1]) : 0;
}
