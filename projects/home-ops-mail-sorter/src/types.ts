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
  sourceType?: "json" | "eml";
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

export interface LearnedRule {
  sender: string;
  matchType: "sender" | "domain";
  category: MailCategory;
  action: SuggestedAction;
  decisionCount: number;
  lastDecidedAt: string;
}

export interface MailSuggestion {
  message: MailMessage;
  category: MailCategory;
  confidence: number;
  reasons: string[];
  action: SuggestedAction;
  alternatives: CategoryScore[];
  learnedRule?: LearnedRule;
}

export interface MailSuggestionReport {
  generatedAt: string;
  sourcePath: string;
  totalMessages: number;
  countsByCategory: Partial<Record<MailCategory, number>>;
  suggestions: MailSuggestion[];
}

export interface ReviewDecision {
  messageId: string;
  sender: string;
  subject: string;
  sourcePath: string;
  decidedAt: string;
  category: MailCategory;
  action: SuggestedAction;
}

export interface ReviewState {
  decisions: ReviewDecision[];
}

export type MailboxActionConfig = Partial<Record<MailCategory, SuggestedAction>>;

export interface MailboxConfig {
  autoArchiveThreshold: number;
  actions: MailboxActionConfig;
}
