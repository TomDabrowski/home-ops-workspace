import type { WatchReport, WatchStatus } from "./types.ts";

function statusRank(status: WatchStatus): number {
  if (status === "down") return 2;
  if (status === "warn") return 1;
  return 0;
}

export function shouldNotify(report: WatchReport, minimumStatus: WatchStatus): boolean {
  return statusRank(report.summary.status) >= statusRank(minimumStatus);
}

export function notificationPayload(report: WatchReport) {
  return {
    source: "home-ops-watcher",
    status: report.summary.status,
    checkedAt: report.summary.checkedAt,
    summary: report.summary,
    problems: report.latestResults
      .filter((entry) => entry.status !== "ok")
      .map((entry) => ({
        targetId: entry.targetId,
        label: entry.label,
        status: entry.status,
        detail: entry.detail,
      })),
  };
}

export async function sendWebhookNotification(
  webhookUrl: string,
  report: WatchReport,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(notificationPayload(report)),
  });
  if (!response.ok) {
    throw new Error(`Notification webhook failed with HTTP ${response.status}`);
  }
}
