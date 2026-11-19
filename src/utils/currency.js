export function formatKsh(amount, showDecimals = false) {
  const num = Number(amount) || 0;
  const formattedAmount = new Intl.NumberFormat("en-KE", {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(num);
  return `KSh ${formattedAmount}`;
}
