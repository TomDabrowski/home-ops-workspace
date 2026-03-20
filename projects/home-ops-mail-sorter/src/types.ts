export type MailCategory =
  | "finance_bill"
  | "finance_statement"
  | "subscription"
  | "shipping_update"
  | "marketing"
  | "personal"
  | "unknown";

export type SuggestedActionType =
  | "review_finance"
  | "file_to_folder"
  | "archive_after_review"
  | "unsubscribe_or_archive"
  | "keep_in_inbox";

export interface MailMessage {
  id: string;
  receivedAt: string;
  from: string;
  subject: string;
  snippet?: string;
  sourceType?: "json" | "eml" | "imap";
  sourcePath?: string;
}

export interface CategoryScore {
  category: MailCategory;
  score: number;
  reasons: string[];
}

export interface SuggestedAction {
  type: SuggestedActionType;
  folder?: string;
  automationReady: boolean;
  summary: string;
}

export interface MailSuggestion {
  message: MailMessage;
  category: MailCategory;
  confidence: number;
  reasons: string[];
  action: SuggestedAction;
  alternatives: CategoryScore[];
  safeToAutomate?: boolean;
}

export interface MailSuggestionReport {
  generatedAt: string;
  sourcePath: string;
  totalMessages: number;
  countsByCategory: Partial<Record<MailCategory, number>>;
  suggestions: MailSuggestion[];
}

export type MailboxActionConfig = Partial<Record<MailCategory, SuggestedAction>>;

export interface MailboxConfig {
  autoArchiveThreshold: number;
  actions: MailboxActionConfig;
}

export interface ImapAccountSourceConfig {
  type: "imap";
  host: string;
  port: number;
  secure?: boolean;
  username: string;
  passwordEnv: string;
  mailbox: string;
  maxMessages?: number;
  unseenOnly?: boolean;
  sinceDays?: number;
  tlsRejectUnauthorized?: boolean;
}

export interface MailAccountConfig {
  id: string;
  label: string;
  source: ImapAccountSourceConfig;
  mailboxConfigPath?: string;
  reportsSubdir?: string;
}

export interface MailAccountsConfig {
  reportsDir?: string;
  mailboxConfigPath?: string;
  statePath?: string;
  lockPath?: string;
  runLogPath?: string;
  retention?: {
    keepSnapshots?: number;
  };
  accounts: MailAccountConfig[];
}

export interface ProcessedMessageRecord {
  fingerprint: string;
  seenAt: string;
}

export interface ProcessedAccountState {
  accountId: string;
  messages: ProcessedMessageRecord[];
}

export interface ProcessedState {
  accounts: ProcessedAccountState[];
}

export interface ScheduledRunLock {
  pid: number;
  startedAt: string;
  hostname?: string;
  configPath: string;
}

export interface ScheduledRunLogEntry {
  startedAt: string;
  finishedAt: string;
  status: "success" | "failure";
  configPath: string;
  message: string;
}

export interface AccountLatestSummary {
  accountId: string;
  generatedAt?: string;
  totalMessages: number;
  countsByCategory: Record<string, number>;
  readyCount: number;
}

export interface LatestSummaryReport {
  generatedAt: string;
  accountCount: number;
  accountsWithMessages: number;
  totalMessages: number;
  readyCount: number;
  topCategories: Array<{ category: string; count: number }>;
  accounts: AccountLatestSummary[];
}
