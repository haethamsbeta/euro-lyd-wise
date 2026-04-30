export const en = {
  // common
  "common.signIn": "Sign in",
  "common.signOut": "Sign out",
  "common.loading": "Loading…",
  "common.email": "Email",
  "common.password": "Password",
  "common.fullName": "Full name",
  "common.language": "Language",

  // landing
  "landing.tagline": "Private banking, weighed in gold",
  "landing.heroLine1": "Dahab.",
  "landing.heroLine2": "Where every entry is",
  "landing.heroLine3": "precision-balanced.",
  "landing.subtitle":
    "A double-entry ledger purpose-built for trusted financial institutions — with dedicated cash, bank, and wire vaults for every currency, role-aware approvals, and a calm, glass-clear customer view.",
  "landing.enterVault": "Enter the vault",
  "landing.customerPortal": "Customer portal",
  "landing.mobileApp": "Mobile app",
  "landing.arabicNote": "ذهب · the Arabic word for gold",
  "landing.pillar1.title": "Double-entry, always",
  "landing.pillar1.body":
    "Every credit meets its debit. Cash deposits flow from the vault; withdrawals reverse it. The books cannot lie.",
  "landing.pillar2.title": "Role-aware approvals",
  "landing.pillar2.body":
    "Tellers post; admins approve over-balance withdrawals; auditors observe everything in read-only.",
  "landing.pillar3.title": "Customer transparency",
  "landing.pillar3.body":
    "A glass-clear portal gives customers their balances and history — never the back-office controls.",
  "landing.footer": "A private banking ledger",

  // login
  "login.privateBadge": "Private Banking · ذهب",
  "login.welcomeBack": "Welcome back",
  "login.subtitle": "Sign in to the back-office, or create a new account to request access.",
  "login.tabSignIn": "Sign in",
  "login.tabCreate": "Create account",
  "login.signingIn": "Signing in…",
  "login.creating": "Creating…",
  "login.createAccount": "Create account",
  "login.backHome": "← Back to home",
  "login.welcomeToast": "Welcome back",
  "login.accountCreated": "Account created. You can sign in now.",
  "login.newAccountNote": "New accounts have no role until an admin assigns one.",
  "login.privateBankingLedger": "Private Banking Ledger",

  // demo card
  "demo.title": "Demo credentials",
  "demo.intro": "Tap",
  "demo.introCta": "Prepare demo vault",
  "demo.introTail": "once, then choose a role to explore.",
  "demo.prepare": "Prepare demo vault",
  "demo.preparing": "Preparing…",
  "demo.prepared": "Vault prepared ✓ — re-run if needed",
  "demo.ready": "Demo vault prepared — sign in to explore.",
  "demo.failed": "Seed failed",
  "demo.fill": "Fill",
  "demo.filledToast": "Filled",
  "demo.switchTab": "Switch to the Sign in tab first.",
  "demo.copyFailed": "Copy failed",
  "demo.copied": "copied",
  "demo.note":
    "The seed installs 7 vaults, 5 customer accounts, posted transactions, and 2 pending approvals. Safe to re-run.",

  // nav (app shell)
  "nav.dashboard": "Dashboard",
  "nav.newTransaction": "New transaction",
  "nav.transactions": "Transactions",
  "nav.accounts": "Accounts",
  "nav.vaults": "Vaults",
  "nav.approvals": "Approvals",
  "nav.myActivity": "My activity",
  "nav.audit": "Audit log",
  "nav.users": "Users & roles",
  "nav.notifications": "Notifications",
  "nav.more": "More",

  // app shell
  "shell.noStaffTitle": "No staff access",
  "shell.noStaffBody":
    "Your account is not assigned a staff role. If you are a customer, open the customer portal instead.",

  // portal
  "portal.noAccounts":
    "You don't have any accounts linked yet. Please contact your bank.",
  "portal.ledger": "Ledger",
  "portal.exportCsv": "Export CSV",
  "portal.col.tx": "TX #",
  "portal.col.date": "Date",
  "portal.col.type": "Type",
  "portal.col.channel": "Channel",
  "portal.col.amount": "Amount",
  "portal.col.status": "Status",
  "portal.col.comment": "Comment",
};
export type Dict = typeof en;
export type DictKey = keyof Dict;