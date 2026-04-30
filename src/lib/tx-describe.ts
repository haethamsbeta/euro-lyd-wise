export function describeTx(p: {
  direction: "deposit" | "withdraw";
  status: string;
  channel: string;
  amount: string;
  customerName: string | null;
  comment: string | null;
  isReversal: boolean;
  isCorrected: boolean;
}): string {
  const action = p.direction === "deposit" ? "Deposit" : "Withdrawal";
  const who = p.customerName ? ` for ${p.customerName}` : "";
  const channel = p.channel ? ` via ${p.channel}` : "";
  let base = `${action} of ${p.amount}${who}${channel}.`;
  if (p.status === "pending") base = `Pending ${action.toLowerCase()} of ${p.amount}${who}${channel}, awaiting approval.`;
  if (p.status === "rejected") base = `${action} of ${p.amount}${who}${channel} was rejected.`;
  if (p.status === "reversed") base = `${action} of ${p.amount}${who}${channel} has been reversed.`;
  if (p.isReversal) base += " This entry reverses an earlier transaction.";
  if (p.isCorrected) base += " This entry was later corrected.";
  if (p.comment) base += ` Note: "${p.comment}".`;
  return base;
}