// Barrel export — `import { api } from "@/lib/api"`.
export { authApi as auth } from "./auth";
export { dashboardApi as dashboard } from "./dashboard";
export { holdersApi as holders } from "./holders";
export { accountsApi as accounts } from "./accounts";
export { transactionsApi as transactions } from "./transactions";
export { approvalsApi as approvals } from "./approvals";
export { vaultsApi as vaults, fxRatesApi as fxRates } from "./vaults";
export { reportsApi as reports } from "./reports";
export { auditApi as audit } from "./audit";
export { usersApi as users } from "./users";
export { groupsApi as groups } from "./groups";
export { portalApi as portal } from "./portal";
export { pushApi as push } from "./push";
export { notificationsApi as notifications } from "./notifications";
export { adminApi as admin } from "./admin";

import { authApi } from "./auth";
import { dashboardApi } from "./dashboard";
import { holdersApi } from "./holders";
import { accountsApi } from "./accounts";
import { transactionsApi } from "./transactions";
import { approvalsApi } from "./approvals";
import { vaultsApi, fxRatesApi } from "./vaults";
import { reportsApi } from "./reports";
import { auditApi } from "./audit";
import { usersApi } from "./users";
import { groupsApi } from "./groups";
import { portalApi } from "./portal";
import { pushApi } from "./push";
import { notificationsApi } from "./notifications";
import { adminApi } from "./admin";

export const api = {
  auth: authApi,
  dashboard: dashboardApi,
  holders: holdersApi,
  accounts: accountsApi,
  transactions: transactionsApi,
  approvals: approvalsApi,
  vaults: vaultsApi,
  fxRates: fxRatesApi,
  reports: reportsApi,
  audit: auditApi,
  users: usersApi,
  groups: groupsApi,
  portal: portalApi,
  push: pushApi,
  notifications: notificationsApi,
  admin: adminApi,
};
