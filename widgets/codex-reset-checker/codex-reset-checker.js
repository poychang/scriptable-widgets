// ============================================================
// ChatGPT / Codex Usage Widget for Scriptable
//
// 查詢方式參考：
// https://github.com/doggy8088/codex-reset-checker
//
// 使用非公開 API：
// https://chatgpt.com/backend-api/wham/usage
//
// 互動：
// - Small：點整個 Widget → Refresh
// - Medium / Large：
//      點背景 / 卡片 → ChatGPT
//      點右下角 Refresh → 重新查詢 Usage
//
// 注意：
// /backend-api/wham/usage 為非公開 API，未來可能變更。
// ============================================================

// ============================================================
// 1. auth.json
//
// 第一次使用時，把 ~/.codex/auth.json
// 的完整 JSON 貼到下面。
//
// 成功執行後，access_token / account_id
// 會保存到 Scriptable Keychain。
//
// 成功後建議改回：
//
// const AUTH_JSON = {};
//
// ============================================================

const AUTH_JSON = {
    // ===== 將 auth.json 完整內容貼在這裡 =====
};

// ============================================================
// 2. 設定
// ============================================================

const CONFIG = {
    apiUrl: 'https://chatgpt.com/backend-api/wham/usage',
    // 希望系統最早多久後重新整理，iPadOS 不保證準時執行
    refreshMinutes: 15,
    // 在 Scriptable App 內直接執行時的預覽尺寸 small / medium / large
    previewFamily: 'medium',
    debug: false,
    showAdditionalLimits: true,
    // Medium / Large 非 Refresh 區域點擊目的地
    widgetUrl: 'https://chatgpt.com/',
};

// ============================================================
// 3. Keychain
// ============================================================

const KEYCHAIN_ACCESS_TOKEN = 'ChatGPTUsageWidget.AccessToken';
const KEYCHAIN_ACCOUNT_ID = 'ChatGPTUsageWidget.AccountId';

// ============================================================
// 4. Theme
// ============================================================

const THEME = {
    backgroundTop: new Color('#182338'),
    backgroundMiddle: new Color('#101827'),
    backgroundBottom: new Color('#080D16'),
    card: new Color('#FFFFFF', 0.075),
    cardBorder: new Color('#FFFFFF', 0.1),
    text: new Color('#F8FAFC'),
    secondaryText: new Color('#94A3B8'),
    mutedText: new Color('#64748B'),
    green: new Color('#34D399'),
    yellow: new Color('#FBBF24'),
    red: new Color('#FB7185'),
    progressBackground: new Color('#FFFFFF', 0.1),
    badgeBackground: new Color('#FFFFFF', 0.1),
    refreshBackground: new Color('#FFFFFF', 0.08),
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
// 6. Credential
// ============================================================

function importCredentialFromAuthJson() {
    if (!AUTH_JSON || typeof AUTH_JSON !== 'object' || !AUTH_JSON.tokens) {
        return false;
    }

    const accessToken = AUTH_JSON.tokens.access_token;
    const accountId = AUTH_JSON.tokens.account_id;

    if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
        return false;
    }

    Keychain.set(KEYCHAIN_ACCESS_TOKEN, accessToken.trim());

    if (accountId !== undefined && accountId !== null && String(accountId).trim() !== '') {
        Keychain.set(KEYCHAIN_ACCOUNT_ID, String(accountId).trim());
    }

    return true;
}

function loadCredential() {
    importCredentialFromAuthJson();

    if (!Keychain.contains(KEYCHAIN_ACCESS_TOKEN)) {
        throw new Error('找不到 access_token。\n' + '請先將 auth.json 貼到程式最上方的 AUTH_JSON。');
    }

    return {
        accessToken: Keychain.get(KEYCHAIN_ACCESS_TOKEN),

        accountId: Keychain.contains(KEYCHAIN_ACCOUNT_ID) ? Keychain.get(KEYCHAIN_ACCOUNT_ID) : null,
    };
}

// ============================================================
// 7. API
// ============================================================

async function fetchUsage() {
    const { accessToken, accountId } = loadCredential();
    const request = new Request(CONFIG.apiUrl);

    request.method = 'GET';
    request.timeoutInterval = 15;
    request.headers = {
        Authorization: `Bearer ${accessToken}`,
        'OpenAI-Beta': 'codex-1',
        originator: 'Codex Desktop',
        Accept: 'application/json',
    };

    if (accountId) {
        request.headers['ChatGPT-Account-ID'] = accountId;
    }

    try {
        const result = await request.loadJSON();

        if (CONFIG.debug) {
            console.log(JSON.stringify(result, null, 2));
        }

        return result;
    } catch (error) {
        const statusCode = request.response?.statusCode;

        if (statusCode === 401 || statusCode === 403) {
            throw new Error(
                `登入憑證已失效（HTTP ${statusCode}）。\n` +
                    '請重新取得 Codex auth.json，' +
                    '貼到 AUTH_JSON 後再執行一次。',
            );
        }

        throw new Error('無法取得使用量：' + error.message);
    }
}

// ============================================================
// 8. Data Helpers
// ============================================================

function numberOrNull(value) {
    if (value === undefined || value === null || value === '' || typeof value === 'boolean') {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number) ? number : null;
}

function normalizePercent(value) {
    const number = numberOrNull(value);

    if (number === null) {
        return null;
    }

    return Math.min(100, Math.max(0, number));
}

function normalizeResetAt(value) {
    if (value === undefined || value === null) {
        return null;
    }

    const number = Number(value);

    if (Number.isFinite(number)) {
        // milliseconds
        if (Math.abs(number) > 100000000000) {
            return new Date(number);
        }

        // Unix seconds
        return new Date(number * 1000);
    }

    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
        return date;
    }

    return null;
}

// ============================================================
// 9. Normalize Window
// ============================================================

function normalizeWindow(window) {
    if (!window || typeof window !== 'object') {
        return null;
    }

    const usedPercent = normalizePercent(window.used_percent);

    let resetDate = normalizeResetAt(window.reset_at);

    if (!resetDate) {
        const seconds = numberOrNull(window.reset_after_seconds);

        if (seconds !== null) {
            resetDate = new Date(Date.now() + seconds * 1000);
        }
    }

    return {
        usedPercent,
        remainingPercent: usedPercent === null ? null : Math.max(0, 100 - usedPercent),
        windowSeconds: numberOrNull(window.limit_window_seconds),
        resetDate,
    };
}

// ============================================================
// 10. Additional Rate Limits
// ============================================================

function getAdditionalCollection(response) {
    const source = response.additional_rate_limits ?? response.rate_limit?.additional_rate_limits;

    if (!source) {
        return [];
    }

    if (Array.isArray(source)) {
        return source;
    }

    if (typeof source === 'object') {
        return Object.entries(source).map(([key, value]) => ({
            ...(value || {}),
            __key: key,
        }));
    }

    return [];
}

function normalizeAdditionalName(name) {
    const text = String(name);

    const lower = text.toLowerCase();

    if (lower.includes('spark')) {
        return 'GPT-5.3-Codex-Spark';
    }

    if (lower.includes('reserve')) {
        return 'GPT Reserve';
    }

    return text;
}

function normalizeAdditionalLimits(response) {
    return getAdditionalCollection(response).map((limit, index) => {
        const name =
            limit.display_name ??
            limit.title ??
            limit.name ??
            limit.limit_name ??
            limit.metered_limit_name ??
            limit.__key ??
            `額外額度 ${index + 1}`;

        const rateLimit = limit.rate_limit ?? limit.rateLimit ?? limit;

        let primary = rateLimit.primary_window ?? rateLimit.primaryWindow ?? null;
        let secondary = rateLimit.secondary_window ?? rateLimit.secondaryWindow ?? null;

        if (!primary && !secondary && rateLimit.used_percent !== undefined) {
            const seconds = numberOrNull(rateLimit.limit_window_seconds);

            if (seconds !== null && seconds >= 6 * 24 * 60 * 60) {
                secondary = rateLimit;
            } else {
                primary = rateLimit;
            }
        }

        return {
            name: normalizeAdditionalName(name),
            primary: normalizeWindow(primary),
            secondary: normalizeWindow(secondary),
        };
    });
}

// ============================================================
// 11. Normalize Usage
// ============================================================

function normalizeUsage(response) {
    if (!response || typeof response !== 'object' || !response.rate_limit) {
        throw new Error('API 回傳格式非預期：' + '找不到 rate_limit。');
    }

    return {
        planType: response.plan_type ?? null,
        primary: normalizeWindow(response.rate_limit.primary_window),
        secondary: normalizeWindow(response.rate_limit.secondary_window),
        additional: normalizeAdditionalLimits(response),
    };
}

// ============================================================
// 12. Formatting
// ============================================================

function pad(value) {
    return String(value).padStart(2, '0');
}

function formatDate(date) {
    if (!date) {
        return '未知';
    }

    const now = new Date();
    const sameDay =
        now.getFullYear() === date.getFullYear() &&
        now.getMonth() === date.getMonth() &&
        now.getDate() === date.getDate();
    const time = `${pad(date.getHours())}:` + `${pad(date.getMinutes())}`;

    if (sameDay) {
        return time;
    }

    return `${date.getMonth() + 1}/` + `${date.getDate()} ` + time;
}

function formatRemaining(date) {
    if (!date) {
        return '未知';
    }

    const diff = date.getTime() - Date.now();

    if (diff <= 0) {
        return '即將重置';
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
        return '<1m';
    }

    return parts.join(' ');
}

function formatWindowTitle(window, fallback) {
    if (!window) {
        return fallback;
    }

    const seconds = window.windowSeconds;

    if (!seconds) {
        return fallback;
    }

    if (seconds >= 6 * 24 * 60 * 60) {
        return '每週';
    }

    if (seconds <= 24 * 60 * 60) {
        const hours = seconds / 3600;

        if (Number.isInteger(hours)) {
            return `${hours} 小時`;
        }
    }

    return fallback;
}

// ============================================================
// 13. Usage Color
// ============================================================

function usageColor(remaining) {
    if (remaining === null || remaining === undefined) {
        return THEME.secondaryText;
    }

    if (remaining <= 20) {
        return THEME.red;
    }

    if (remaining <= 50) {
        return THEME.yellow;
    }

    return THEME.green;
}

// ============================================================
// 14. Refresh URL
// ============================================================

function getRefreshUrl() {
    return URLScheme.forRunningScript();
}

// ============================================================
// 15. Header
// ============================================================

function addHeader(widget, usage) {
    const row = widget.addStack();
    row.centerAlignContent();

    const title = row.addText('ChatGPT / Codex');
    title.font = Font.boldSystemFont(14);
    title.textColor = THEME.text;

    row.addSpacer();

    if (usage.planType) {
        const badge = row.addStack();
        badge.backgroundColor = THEME.badgeBackground;
        badge.cornerRadius = 7;
        badge.setPadding(3, 7, 3, 7);

        const badgeText = badge.addText(String(usage.planType).toUpperCase());
        badgeText.font = Font.semiboldSystemFont(8);
        badgeText.textColor = THEME.text;
    }
}

// ============================================================
// 16. Progress Bar
// ============================================================

function addProgressBar(parent, usedPercent, width = 118) {
    const percent = usedPercent === null ? 0 : Math.min(100, Math.max(0, usedPercent));
    const remaining = 100 - percent;
    const bar = parent.addStack();
    bar.size = new Size(width, 5);
    bar.cornerRadius = 2.5;
    bar.backgroundColor = THEME.progressBackground;

    if (percent > 0) {
        const fill = bar.addStack();
        fill.size = new Size(Math.max(3, (width * percent) / 100), 5);
        fill.cornerRadius = 2.5;
        fill.backgroundColor = usageColor(remaining);
    }

    bar.addSpacer();
}

// ============================================================
// 17. Usage Card
// ============================================================

function createUsageCard(parent, title, window, cardWidth = 138) {
    const card = parent.addStack();
    card.layoutVertically();
    card.size = new Size(cardWidth, 0);
    card.backgroundColor = THEME.card;
    card.borderWidth = 1;
    card.borderColor = THEME.cardBorder;
    card.cornerRadius = 13;
    card.setPadding(8, 10, 8, 10);

    // Card title
    const titleRow = card.addStack();
    titleRow.centerAlignContent();

    const titleText = titleRow.addText(title);
    titleText.font = Font.semiboldSystemFont(10);
    titleText.textColor = THEME.secondaryText;
    titleRow.addSpacer();

    const remaining = window?.remainingPercent ?? null;

    const dot = titleRow.addText('●');
    dot.font = Font.systemFont(6);
    dot.textColor = usageColor(remaining);
    card.addSpacer(3);

    // Remaining %
    const valueRow = card.addStack();
    valueRow.bottomAlignContent();

    const percentage = remaining === null ? '—' : `${Math.round(remaining)}%`;

    const percentText = valueRow.addText(percentage);
    percentText.font = Font.boldSystemFont(24);
    percentText.textColor = usageColor(remaining);
    valueRow.addSpacer(5);

    const remainingLabel = valueRow.addText('剩餘');
    remainingLabel.font = Font.mediumSystemFont(8);
    remainingLabel.textColor = THEME.secondaryText;
    card.addSpacer(4);

    // Progress
    addProgressBar(card, window?.usedPercent ?? null, cardWidth - 20);
    card.addSpacer(5);

    // Reset
    const resetRow = card.addStack();
    resetRow.centerAlignContent();

    const resetIcon = resetRow.addText('↻');
    resetIcon.font = Font.mediumSystemFont(9);
    resetIcon.textColor = THEME.mutedText;
    resetRow.addSpacer(3);

    const remainingTime = resetRow.addText(formatRemaining(window?.resetDate));
    remainingTime.font = Font.mediumSystemFont(8);
    remainingTime.textColor = THEME.secondaryText;
    remainingTime.lineLimit = 1;
    resetRow.addSpacer();

    const exactTime = resetRow.addText(formatDate(window?.resetDate));
    exactTime.font = Font.systemFont(7);
    exactTime.textColor = THEME.mutedText;
    exactTime.lineLimit = 1;
}

// ============================================================
// 18. Footer
// ============================================================

function addFooter(widget, enableRefresh = true) {
    const row = widget.addStack();

    row.centerAlignContent();

    const now = new Date();

    const updated = row.addText(`Updated ` + `${pad(now.getHours())}:` + `${pad(now.getMinutes())}`);
    updated.font = Font.mediumSystemFont(7);
    updated.textColor = THEME.mutedText;
    row.addSpacer();

    if (enableRefresh) {
        const refresh = row.addStack();
        refresh.backgroundColor = THEME.refreshBackground;
        refresh.cornerRadius = 6;
        refresh.setPadding(2, 6, 2, 6);
        // 點這個區域時執行本 Script
        refresh.url = getRefreshUrl();

        const refreshText = refresh.addText('↻ Refresh');
        refreshText.font = Font.semiboldSystemFont(7);
        refreshText.textColor = THEME.green;
    } else {
        const status = row.addText('● LIVE');
        status.font = Font.semiboldSystemFont(7);
        status.textColor = THEME.green;
    }
}

// ============================================================
// 19. Small Widget
// ============================================================

function buildSmallWidget(usage) {
    const widget = new ListWidget();

    applyBackground(widget);

    // Small Widget 整個點擊區域用來 Refresh
    widget.url = getRefreshUrl();
    widget.setPadding(11, 12, 9, 12);

    const top = widget.addStack();
    top.centerAlignContent();

    const title = top.addText('ChatGPT');
    title.font = Font.boldSystemFont(13);
    title.textColor = THEME.text;
    top.addSpacer();

    if (usage.planType) {
        const plan = top.addText(String(usage.planType).toUpperCase());
        plan.font = Font.semiboldSystemFont(7);
        plan.textColor = THEME.secondaryText;
    }

    widget.addSpacer(8);

    const primary = usage.primary;
    const remaining = primary?.remainingPercent ?? null;
    const value = widget.addText(remaining === null ? '—' : `${Math.round(remaining)}%`);
    value.font = Font.boldSystemFont(30);
    value.textColor = usageColor(remaining);

    const label = widget.addText(`${formatWindowTitle(primary, '工作階段')}剩餘`);
    label.font = Font.mediumSystemFont(9);
    label.textColor = THEME.secondaryText;
    widget.addSpacer(7);

    addProgressBar(widget, primary?.usedPercent ?? null, 120);
    widget.addSpacer(6);

    const reset = widget.addText(`↻ ${formatRemaining(primary?.resetDate)}`);
    reset.font = Font.mediumSystemFont(8);
    reset.textColor = THEME.secondaryText;
    widget.addSpacer();

    // Small 已經是整張 Refresh，所以 Footer 不重複 Refresh
    addFooter(widget, false);

    return widget;
}

// ============================================================
// 20. Medium Widget
// ============================================================

function buildMediumWidget(usage) {
    const widget = new ListWidget();

    applyBackground(widget);

    // 點 Widget 一般區域 → ChatGPT
    widget.url = CONFIG.widgetUrl;
    widget.setPadding(9, 14, 8, 14);
    addHeader(widget, usage);
    widget.addSpacer(6);

    const cards = widget.addStack();
    cards.layoutHorizontally();
    createUsageCard(cards, formatWindowTitle(usage.primary, '工作階段'), usage.primary, 138);
    cards.addSpacer(8);

    createUsageCard(cards, formatWindowTitle(usage.secondary, '每週'), usage.secondary, 138);
    widget.addSpacer();

    // 右下角 Refresh 可單獨執行 Script
    addFooter(widget, true);

    return widget;
}

// ============================================================
// 21. Large Widget
// ============================================================

function buildLargeWidget(usage) {
    const widget = new ListWidget();

    applyBackground(widget);

    widget.url = CONFIG.widgetUrl;
    widget.setPadding(14, 16, 12, 16);
    addHeader(widget, usage);
    widget.addSpacer(10);

    const cards = widget.addStack();
    cards.layoutHorizontally();
    createUsageCard(cards, formatWindowTitle(usage.primary, '工作階段'), usage.primary, 150);
    cards.addSpacer(10);

    createUsageCard(cards, formatWindowTitle(usage.secondary, '每週'), usage.secondary, 150);

    // Additional Rate Limits
    if (CONFIG.showAdditionalLimits && usage.additional?.length > 0) {
        widget.addSpacer(13);

        const section = widget.addText('其他使用額度');
        section.font = Font.semiboldSystemFont(10);
        section.textColor = THEME.secondaryText;
        widget.addSpacer(6);

        for (const limit of usage.additional.slice(0, 3)) {
            const window = limit.secondary ?? limit.primary;

            if (!window) {
                continue;
            }

            const row = widget.addStack();
            row.centerAlignContent();

            const name = row.addText(limit.name);
            name.font = Font.mediumSystemFont(9);
            name.textColor = THEME.text;
            name.lineLimit = 1;
            row.addSpacer();

            const remaining = window.remainingPercent;

            const value = row.addText(remaining === null ? '—' : `${Math.round(remaining)}%`);
            value.font = Font.semiboldSystemFont(9);
            value.textColor = usageColor(remaining);
            widget.addSpacer(3);

            addProgressBar(widget, window.usedPercent, 300);
            widget.addSpacer(3);

            const reset = widget.addText(`重設 ${formatRemaining(window.resetDate)} · ${formatDate(window.resetDate)}`);
            reset.font = Font.systemFont(7);
            reset.textColor = THEME.mutedText;
            widget.addSpacer(7);
        }
    }

    widget.addSpacer();

    addFooter(widget, true);

    return widget;
}

// ============================================================
// 22. Error Widget
// ============================================================

function buildErrorWidget(error) {
    const widget = new ListWidget();

    applyBackground(widget);

    // 發生錯誤時點 Widget 直接重新執行
    widget.url = getRefreshUrl();
    widget.setPadding(13, 14, 13, 14);

    const title = widget.addText('ChatGPT / Codex');
    title.font = Font.boldSystemFont(14);
    title.textColor = THEME.text;
    widget.addSpacer(8);

    const errorTitle = widget.addText('無法取得使用量');
    errorTitle.font = Font.semiboldSystemFont(12);
    errorTitle.textColor = THEME.red;
    widget.addSpacer(4);

    const message = widget.addText(error.message ?? String(error));
    message.font = Font.systemFont(8);
    message.textColor = THEME.secondaryText;
    message.lineLimit = 5;
    widget.addSpacer();

    const retry = widget.addText('↻ 點擊重新查詢');
    retry.font = Font.semiboldSystemFont(8);
    retry.textColor = THEME.green;
    return widget;
}

// ============================================================
// 23. Main
// ============================================================

async function main() {
    let widget;

    try {
        const response = await fetchUsage();
        const usage = normalizeUsage(response);
        const family = config.runsInWidget ? config.widgetFamily : CONFIG.previewFamily;

        if (family === 'small') {
            widget = buildSmallWidget(usage);
        } else if (family === 'large') {
            widget = buildLargeWidget(usage);
        } else {
            widget = buildMediumWidget(usage);
        }
    } catch (error) {
        console.error(error);

        widget = buildErrorWidget(error);
    }

    // 要求 WidgetKit 最早在指定時間後重新執行
    widget.refreshAfterDate = new Date(Date.now() + CONFIG.refreshMinutes * 60 * 1000);

    if (config.runsInWidget) {
        Script.setWidget(widget);
    } else {
        if (CONFIG.previewFamily === 'small') {
            await widget.presentSmall();
        } else if (CONFIG.previewFamily === 'large') {
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
