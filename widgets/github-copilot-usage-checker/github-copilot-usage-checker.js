// ============================================================
// GitHub Copilot Usage Widget for Scriptable
//
// 資料來源：
// GET https://api.github.com/copilot_internal/user
//
// 可顯示：
// - GitHub Login
// - Copilot 訂閱方案
// - Premium Requests / AI Credits
// - 剩餘百分比
// - 已用數量 / 總額度
// - Quota Reset（優先使用 quota_reset_date_utc）
// - Token-based billing
// 小型採單欄，中型採左右分區；大型上方顯示 Premium 額度，下方列出帳戶與使用明細。
// AI Credits 已用額度直接取 credits_used。
// 進度條表示剩餘比例，額度數字使用千分位分隔。
//
// 注意：
// /copilot_internal/user 為 GitHub 未公開 API，
// 未來 response schema / endpoint 可能改變。
// ============================================================

// ============================================================
// 1. GitHub Token
//
// 第一次執行時填入，例如：
//
// const GITHUB_TOKEN = "gho_xxxxxxxxx";
//
// 成功後 Token 會存進 Scriptable Keychain。
// 之後建議改回：
//
// const GITHUB_TOKEN = "";
//
// Token 不要 Commit 到 GitHub，也不要分享給其他人。

// Token 怎麼取得
// 如果你的電腦已經用 GitHub CLI 登入，可以使用 gh auth token 來取得。
// 你也可以從 GitHub 網站的個人設定頁面取得 Fine-grained PAT 作為 GitHub Token。
// ============================================================

const GITHUB_TOKEN = "";

// ============================================================
// 2. Configuration
// ============================================================

const CONFIG = {
  apiUrl: "https://api.github.com/copilot_internal/user",

  refreshMinutes: 30,

  // Scriptable App 中預覽尺寸
  // small / medium / large
  previewFamily: "medium",

  // iPad Medium Widget 卡片寬度
  premiumCardWidth: 145,
  statusCardWidth: 132,

  debug: false,

  // 點 Widget 一般區域時開啟
  widgetUrl: "https://github.com/settings/copilot",
};

// ============================================================
// 3. Keychain
// ============================================================

const KEYCHAIN_TOKEN = "GitHubCopilotUsageWidget.Token";

// ============================================================
// 4. Theme
// ============================================================

const THEME = {
  backgroundTop: new Color("#393A3C"),

  backgroundMiddle: new Color("#2B2C2E"),

  backgroundBottom: new Color("#222325"),

  card: new Color("#FFFFFF", 0.075),

  cardBorder: new Color("#FFFFFF", 0.1),

  text: new Color("#F0F6FC"),

  secondaryText: new Color("#8B949E"),

  mutedText: new Color("#6E7681"),

  green: new Color("#3FB950"),

  yellow: new Color("#D29922"),

  red: new Color("#F85149"),

  blue: new Color("#58A6FF"),

  purple: new Color("#A371F7"),

  progressBackground: new Color("#FFFFFF", 0.12),

  badgeBackground: new Color("#FFFFFF", 0.1),

  refreshBackground: new Color("#FFFFFF", 0.08),
};

// ============================================================
// 5. Background
// ============================================================

function applyBackground(widget) {
  const gradient = new LinearGradient();

  gradient.colors = [THEME.backgroundTop, THEME.backgroundMiddle, THEME.backgroundBottom];

  gradient.locations = [0, 0.55, 1];

  gradient.startPoint = new Point(0, 0);

  gradient.endPoint = new Point(1, 1);

  widget.backgroundGradient = gradient;
}

// ============================================================
// 6. Authentication
// ============================================================

function importToken() {
  const token = String(GITHUB_TOKEN || "").trim();

  if (!token) {
    return false;
  }

  Keychain.set(KEYCHAIN_TOKEN, token);

  return true;
}

function loadToken() {
  importToken();

  if (!Keychain.contains(KEYCHAIN_TOKEN)) {
    throw new Error(
      "找不到 GitHub Token。\n" +
        "請先將 GitHub OAuth Token 或 Fine-grained PAT " +
        "填入程式最上方的 GITHUB_TOKEN。",
    );
  }

  return Keychain.get(KEYCHAIN_TOKEN);
}

// ============================================================
// 7. API
// ============================================================

async function fetchCopilotUsage() {
  const token = loadToken();

  const request = new Request(CONFIG.apiUrl);

  request.method = "GET";

  request.timeoutInterval = 15;

  request.headers = {
    Authorization: `token ${token}`,

    Accept: "application/json",

    "X-GitHub-Api-Version": "2025-05-01",

    // 模擬 Copilot CLI
    "User-Agent": "GitHubCopilotCLI/1.0.0",

    "Copilot-Integration-Id": "copilot-cli",
  };

  let result;

  try {
    result = await request.loadJSON();
  } catch (error) {
    throw new Error("無法連線 GitHub Copilot API：" + error.message);
  }

  const statusCode = request.response?.statusCode;

  if (statusCode === 401 || statusCode === 403) {
    throw new Error(
      `GitHub Token 無法存取 Copilot 資訊（HTTP ${statusCode}）。\n` +
        "請確認 Token 所屬帳號有 Copilot，" +
        "並重新登入或更換 Token。",
    );
  }

  if (statusCode && (statusCode < 200 || statusCode >= 300)) {
    throw new Error(`GitHub API 回傳 HTTP ${statusCode}`);
  }

  if (CONFIG.debug) {
    console.log(JSON.stringify(result, null, 2));
  }

  return result;
}

// ============================================================
// 8. Helpers
// ============================================================

function numberOrNull(value) {
  if (value === undefined || value === null || value === "" || typeof value === "boolean") {
    return null;
  }

  const n = Number(value);

  return Number.isFinite(n) ? n : null;
}

function clampPercent(value) {
  const n = numberOrNull(value);

  if (n === null) {
    return null;
  }

  return Math.min(100, Math.max(0, n));
}

function firstNumber(...values) {
  for (const value of values) {
    const number = numberOrNull(value);

    if (number !== null) {
      return number;
    }
  }

  return null;
}

// ============================================================
// 9. Date helpers
// ============================================================

function normalizeDate(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);

  if (Number.isFinite(number)) {
    if (Math.abs(number) > 100000000000) {
      return new Date(number);
    }

    return new Date(number * 1000);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date) {
  if (!date) {
    return "未知";
  }

  const now = new Date();

  const sameDay =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate();

  const time = `${pad(date.getHours())}:` + `${pad(date.getMinutes())}`;

  if (sameDay) {
    return `今天 ${time}`;
  }

  return `${date.getMonth() + 1}/` + `${date.getDate()} ` + time;
}

function formatRemainingTime(date) {
  if (!date) {
    return "未知";
  }

  const diff = date.getTime() - Date.now();

  if (diff <= 0) {
    return "即將重置";
  }

  const totalMinutes = Math.ceil(diff / 60000);

  const days = Math.floor(totalMinutes / 1440);

  const hours = Math.floor((totalMinutes % 1440) / 60);

  const minutes = totalMinutes % 60;

  const parts = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (days === 0 && minutes > 0) {
    parts.push(`${minutes}m`);
  }

  if (parts.length === 0) {
    return "<1m";
  }

  return parts.join(" ");
}

// ============================================================
// 10. Plan
// ============================================================

function getPlanLabel(data) {
  const plan = String(data.copilot_plan || "").toLowerCase();

  const sku = String(data.access_type_sku || "").toLowerCase();

  if (plan === "individual_max") {
    return "MAX";
  }

  if (sku.includes("pro_plus") || sku.includes("pro-plus") || sku.includes("proplus")) {
    return "PRO+";
  }

  if (sku.includes("free") || plan === "free") {
    return "FREE";
  }

  if (sku.includes("enterprise") || plan === "enterprise") {
    return "ENTERPRISE";
  }

  if (sku.includes("business") || plan === "business") {
    return "BUSINESS";
  }

  if (sku.includes("individual")) {
    return "PRO";
  }

  if (plan === "individual") {
    return "INDIVIDUAL";
  }

  return plan ? plan.toUpperCase() : "COPILOT";
}

// ============================================================
// 11. Quota normalization
// ============================================================

function normalizeQuota(name, raw, defaultReset) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const entitlement = numberOrNull(raw.entitlement);

  const remaining = firstNumber(raw.remaining, raw.quota_remaining);

  let percentRemaining = clampPercent(raw.percent_remaining);

  const unlimited = raw.unlimited === true || entitlement === -1;

  if (unlimited) {
    percentRemaining = 100;
  }

  if (percentRemaining === null && entitlement !== null && entitlement > 0 && remaining !== null) {
    percentRemaining = clampPercent((remaining / entitlement) * 100);
  }

  // quota_reset_at 可能為 0；優先使用帳號層級的 UTC 重置時間。
  const resetDate =
    defaultReset ??
    (numberOrNull(raw.quota_reset_at) > 0 ? normalizeDate(raw.quota_reset_at) : null);

  return {
    name,

    entitlement,

    remaining,

    percentRemaining,

    usedPercent: percentRemaining === null ? null : 100 - percentRemaining,

    unlimited,

    overageCount: numberOrNull(raw.overage_count),

    creditsUsed: numberOrNull(raw.credits_used),

    overagePermitted: raw.overage_permitted === true,

    hasQuota: raw.has_quota,

    tokenBasedBilling: raw.token_based_billing === true,

    resetDate,
  };
}

// ============================================================
// 12. Limited / Free quota fallback
// ============================================================

function normalizeLimitedQuota(name, key, data, resetDate) {
  const monthly = data.monthly_quotas ?? {};

  const remainingQuota = data.limited_user_quotas ?? {};

  const entitlement = numberOrNull(monthly[key]);

  const remaining = numberOrNull(remainingQuota[key]);

  if (entitlement === null && remaining === null) {
    return null;
  }

  let percentRemaining = null;

  if (entitlement !== null && entitlement > 0 && remaining !== null) {
    percentRemaining = clampPercent((remaining / entitlement) * 100);
  }

  return {
    name,

    entitlement,

    remaining,

    percentRemaining,

    usedPercent: percentRemaining === null ? null : 100 - percentRemaining,

    unlimited: entitlement === -1,

    overageCount: null,

    creditsUsed: null,

    overagePermitted: false,

    hasQuota: remaining === null ? null : remaining > 0,

    tokenBasedBilling: false,

    resetDate,
  };
}

// ============================================================
// 13. Normalize Copilot account
// ============================================================

function normalizeCopilot(data) {
  const globalReset =
    normalizeDate(data.quota_reset_date_utc) ??
    normalizeDate(data.quota_reset_date) ??
    normalizeDate(data.limited_user_reset_date);

  const snapshots = data.quota_snapshots ?? {};

  let premium = normalizeQuota("Premium", snapshots.premium_interactions, globalReset);

  let chat = normalizeQuota("Chat", snapshots.chat, globalReset);

  let completions = normalizeQuota("Completions", snapshots.completions, globalReset);

  // Free / Limited tier fallback
  if (!premium) {
    premium = normalizeLimitedQuota("Premium", "premium_interactions", data, globalReset);
  }

  if (!chat) {
    chat = normalizeLimitedQuota("Chat", "chat", data, globalReset);
  }

  if (!completions) {
    completions = normalizeLimitedQuota("Completions", "completions", data, globalReset);
  }

  return {
    login: data.login ?? null,

    plan: getPlanLabel(data),

    rawPlan: data.copilot_plan ?? null,

    sku: data.access_type_sku ?? null,

    tokenBasedBilling: data.token_based_billing === true,

    resetDate: globalReset,

    premium,

    chat,

    completions,
  };
}

// ============================================================
// 14. Display helpers
// ============================================================

function usageColor(remainingPercent) {
  if (remainingPercent === null || remainingPercent === undefined) {
    return THEME.secondaryText;
  }

  if (remainingPercent <= 20) {
    return THEME.red;
  }

  if (remainingPercent <= 50) {
    return THEME.yellow;
  }

  return THEME.green;
}

function formatQuotaValue(quota) {
  if (!quota) {
    return "--";
  }

  if (quota.unlimited) {
    return "∞";
  }

  if (quota.percentRemaining !== null) {
    return `${Math.round(quota.percentRemaining)}%`;
  }

  if (quota.remaining !== null) {
    return formatNumber(quota.remaining);
  }

  return "--";
}

function formatQuotaDetail(quota) {
  if (!quota) {
    return "無資料";
  }

  if (quota.unlimited) {
    return "Unlimited";
  }

  if (quota.remaining !== null && quota.entitlement !== null && quota.entitlement > 0) {
    return `${formatNumber(quota.remaining)} / ` + `${formatNumber(quota.entitlement)}`;
  }

  return "Quota";
}

function formatQuotaUsedDetail(quota, tokenBasedBilling) {
  if (!quota) {
    return "無資料";
  }

  if (quota.unlimited) {
    return "Unlimited";
  }

  const used =
    tokenBasedBilling || quota.tokenBasedBilling
      ? quota.creditsUsed
      : quota.entitlement != null && quota.remaining != null && quota.entitlement >= 0
        ? Math.max(0, quota.entitlement - quota.remaining)
        : null;

  return `${formatNumber(used)} / ${formatNumber(quota.entitlement)}`;
}

function formatNumber(value) {
  if (value === null || value === undefined) {
    return "--";
  }

  const rounded = Number.isInteger(value) ? value : Math.round(value * 100) / 100;

  return rounded.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// ============================================================
// 15. Refresh URL
// ============================================================

function getRefreshUrl() {
  return URLScheme.forRunningScript();
}

// ============================================================
// 17. Progress Bar
// ============================================================

function addProgressBar(parent, remainingPercent, width, fillColor) {
  const percent = clampPercent(remainingPercent) ?? 0;

  const bar = parent.addStack();

  bar.size = new Size(width, 5);

  bar.cornerRadius = 2.5;

  bar.backgroundColor = THEME.progressBackground;

  if (percent > 0) {
    const fill = bar.addStack();

    fill.size = new Size(Math.max(3, (width * percent) / 100), 5);

    fill.cornerRadius = 2.5;

    fill.backgroundColor = fillColor ?? usageColor(percent);
  }

  bar.addSpacer();
}

// ============================================================
// 18. Shared Usage Layout
// ============================================================

function addUsageHeader(widget) {
  const row = widget.addStack();

  row.centerAlignContent();

  const title = row.addText("GitHub Copilot");

  title.font = Font.mediumSystemFont(16);

  title.textColor = THEME.text;

  row.addSpacer();

  const label = row.addText("Usage limits");

  label.font = Font.systemFont(11);

  label.textColor = THEME.secondaryText;
}

function createUsageLimitColumn(parent, title, quota, width = 145, large = false) {
  const column = parent.addStack();

  column.layoutVertically();

  column.size = new Size(width, 0);

  const heading = column.addText(title);

  heading.font = Font.mediumSystemFont(large ? 13 : 11);

  heading.textColor = THEME.secondaryText;

  heading.lineLimit = 1;

  heading.minimumScaleFactor = 0.8;

  column.addSpacer(4);

  const remaining = quota?.unlimited
    ? "Unlimited"
    : quota?.percentRemaining !== null && quota?.percentRemaining !== undefined
      ? `${Math.round(quota.percentRemaining)}% left`
      : quota?.remaining !== null && quota?.remaining !== undefined
        ? `${formatNumber(quota.remaining)} left`
        : "—";

  const valueRow = column.addStack();

  valueRow.size = new Size(width, large ? 56 : 34);

  valueRow.layoutHorizontally();

  valueRow.centerAlignContent();

  const value = valueRow.addText(remaining);

  value.font = Font.systemFont(large ? 40 : 27);

  value.textColor = THEME.text;

  value.lineLimit = 1;

  value.minimumScaleFactor = 0.6;

  value.leftAlignText();

  valueRow.addSpacer();

  column.addSpacer(7);

  addProgressBar(column, quota?.unlimited ? 100 : quota?.percentRemaining, width, THEME.blue);

  column.addSpacer(6);

  const reset = column.addText(
    quota?.resetDate ? `Resets in ${formatRemainingTime(quota.resetDate)}` : "Reset time unavailable",
  );

  reset.font = Font.systemFont(10);

  reset.textColor = THEME.secondaryText;

  reset.lineLimit = 1;

  reset.minimumScaleFactor = 0.6;
}

function createAccountDetailsColumn(parent, account, large = false) {
  const column = parent.addStack();

  column.layoutVertically();

  column.size = new Size(large ? 0 : 145, 0);

  const resetDate = account.premium?.resetDate ?? account.resetDate;

  const details = [
    ["Account", account.login ? `@${account.login}` : "--"],
    ["Plan", account.plan ?? "--"],
    ["Resets in", resetDate ? formatRemainingTime(resetDate) : "--"],
    ["Used", formatQuotaUsedDetail(account.premium, account.tokenBasedBilling)],
  ];

  for (const [index, [label, text]] of details.entries()) {
    if (index > 0) {
      column.addSpacer(large ? 6 : 3);
    }

    const row = column.addStack();

    row.size = new Size(large ? 0 : 145, large ? 24 : 18);

    row.centerAlignContent();

    const name = row.addText(label);

    name.font = Font.systemFont(large ? 14 : 8);

    name.textColor = THEME.secondaryText;

    name.lineLimit = 1;

    row.addSpacer(6);

    row.addSpacer();

    const value = row.addText(text);

    value.font = Font.mediumSystemFont(large ? 16 : 10);

    value.textColor = THEME.text;

    value.lineLimit = 1;

    value.minimumScaleFactor = 0.6;

    value.rightAlignText();
  }
}

// ============================================================
// 20. Footer
// ============================================================

function addFooter(widget, refreshEnabled) {
  const row = widget.addStack();

  row.centerAlignContent();

  const now = new Date();

  const updated = row.addText(`Updated ` + `${pad(now.getHours())}:` + `${pad(now.getMinutes())}`);

  updated.font = Font.mediumSystemFont(7);

  updated.textColor = THEME.mutedText;

  row.addSpacer();

  if (refreshEnabled) {
    const refresh = row.addStack();

    refresh.backgroundColor = THEME.refreshBackground;

    refresh.cornerRadius = 6;

    refresh.setPadding(2, 6, 2, 6);

    refresh.url = getRefreshUrl();

    const text = refresh.addText("↻ Refresh");

    text.font = Font.semiboldSystemFont(7);

    text.textColor = THEME.green;
  }

}

// ============================================================
// 21. Small Widget
// ============================================================

function buildSmallWidget(account) {
  const widget = new ListWidget();

  applyBackground(widget);

  // Small：整張點擊 Refresh
  widget.url = getRefreshUrl();

  widget.setPadding(11, 12, 9, 12);

  const top = widget.addStack();

  top.centerAlignContent();

  const title = top.addText("Copilot");

  title.font = Font.mediumSystemFont(13);

  title.textColor = THEME.text;

  top.addSpacer();

  const plan = top.addText(account.plan);

  plan.font = Font.semiboldSystemFont(7);

  plan.textColor = THEME.secondaryText;

  plan.lineLimit = 1;

  plan.minimumScaleFactor = 0.6;

  widget.addSpacer(6);

  createUsageLimitColumn(
    widget,
    account.tokenBasedBilling ? "AI Credits" : "Premium Requests",
    account.premium,
    120,
  );

  const now = new Date();

  const details = [
    ["Used", formatQuotaUsedDetail(account.premium, account.tokenBasedBilling)],
    ["Updated", `${pad(now.getHours())}:${pad(now.getMinutes())}`],
  ];

  for (const [label, text] of details) {
    widget.addSpacer(4);

    const row = widget.addStack();

    row.layoutHorizontally();

    row.centerAlignContent();

    const name = row.addText(label);

    row.addSpacer(6);

    row.addSpacer();

    const value = row.addText(text);

    for (const item of [name, value]) {
      item.font = Font.mediumSystemFont(8);

      item.textColor = THEME.secondaryText;

      item.lineLimit = 1;

      item.minimumScaleFactor = 0.6;
    }

    name.leftAlignText();

    value.rightAlignText();
  }

  widget.addSpacer();

  return widget;
}

// ============================================================
// 22. Medium Widget
// ============================================================

function buildMediumWidget(account) {
  const widget = new ListWidget();

  applyBackground(widget);

  widget.url = CONFIG.widgetUrl;

  widget.setPadding(10, 14, 8, 14);

  addUsageHeader(widget);

  widget.addSpacer(10);

  const limits = widget.addStack();

  limits.layoutHorizontally();

  limits.topAlignContent();

  createUsageLimitColumn(
    limits,
    account.tokenBasedBilling ? "AI Credits" : "Premium Requests",
    account.premium,
  );

  limits.addSpacer();

  createAccountDetailsColumn(limits, account);

  widget.addSpacer();

  addFooter(widget, true);

  return widget;
}

// ============================================================
// 23. Large Widget
// ============================================================

function buildLargeWidget(account) {
  const widget = new ListWidget();

  applyBackground(widget);

  widget.url = CONFIG.widgetUrl;

  widget.setPadding(14, 14, 12, 14);

  addUsageHeader(widget);

  widget.addSpacer(10);

  createUsageLimitColumn(
    widget,
    account.tokenBasedBilling ? "AI Credits" : "Premium Requests",
    account.premium,
    290,
    true,
  );

  widget.addSpacer(10);

  createAccountDetailsColumn(widget, account, true);

  widget.addSpacer();

  addFooter(widget, true);

  return widget;
}

// ============================================================
// 24. Error Widget
// ============================================================

function buildErrorWidget(error) {
  const widget = new ListWidget();

  applyBackground(widget);

  widget.url = getRefreshUrl();

  widget.setPadding(13, 14, 13, 14);

  const title = widget.addText("GitHub Copilot");

  title.font = Font.boldSystemFont(14);

  title.textColor = THEME.text;

  widget.addSpacer(8);

  const errorTitle = widget.addText("無法取得使用量");

  errorTitle.font = Font.semiboldSystemFont(12);

  errorTitle.textColor = THEME.red;

  widget.addSpacer(4);

  const message = widget.addText(error.message ?? String(error));

  message.font = Font.systemFont(8);

  message.textColor = THEME.secondaryText;

  message.lineLimit = 6;

  widget.addSpacer();

  const retry = widget.addText("↻ 點擊重新查詢");

  retry.font = Font.semiboldSystemFont(8);

  retry.textColor = THEME.green;

  return widget;
}

// ============================================================
// 25. Main
// ============================================================

async function main() {
  let widget;

  try {
    const response = await fetchCopilotUsage();

    const account = normalizeCopilot(response);

    const family = config.runsInWidget ? config.widgetFamily : CONFIG.previewFamily;

    if (family === "small") {
      widget = buildSmallWidget(account);
    } else if (family === "large") {
      widget = buildLargeWidget(account);
    } else {
      widget = buildMediumWidget(account);
    }
  } catch (error) {
    console.error(error);

    widget = buildErrorWidget(error);
  }

  widget.refreshAfterDate = new Date(Date.now() + CONFIG.refreshMinutes * 60 * 1000);

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    if (CONFIG.previewFamily === "small") {
      await widget.presentSmall();
    } else if (CONFIG.previewFamily === "large") {
      await widget.presentLarge();
    } else {
      await widget.presentMedium();
    }
  }

  Script.complete();
}

// ============================================================
// Run
// ============================================================

await main();
