const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(
  path.join(__dirname, "github-copilot-usage-checker.js"),
  "utf8",
);
const context = vm.createContext({ Color: class Color {} });
vm.runInContext(source.replace(/await main\(\);\s*$/, ""), context);
vm.runInContext('Date.now = () => Date.parse("2026-10-03T00:00:00.000Z");', context);

const resetUtc = "2026-11-01T00:00:00.000Z";

function accountWithReset(quotaResetAt, dates = { quota_reset_date_utc: resetUtc }) {
  return context.normalizeCopilot({
    ...dates,
    quota_snapshots: {
      premium_interactions: {
        quota_reset_at: quotaResetAt,
        entitlement: 20000,
        remaining: 19539,
        credits_used: 460,
      },
      chat: { quota_reset_at: quotaResetAt, unlimited: true },
      completions: { quota_reset_at: quotaResetAt, unlimited: true },
    },
  });
}

test("UTC reset controls the account and all quotas, including zero snapshot timestamps", () => {
  for (const timestamp of [0, "0", 1790812800, undefined]) {
    const account = accountWithReset(timestamp, {
      quota_reset_date_utc: resetUtc,
      quota_reset_date: "2026-12-01",
    });
    for (const item of [account, account.premium, account.chat, account.completions]) {
      assert.equal(item.resetDate.toISOString(), resetUtc);
      assert.equal(context.formatRemainingTime(item.resetDate), "29d");
    }
    assert.equal(account.premium.remaining, 19539);
    assert.equal(account.chat.unlimited, true);
    assert.equal(account.completions.unlimited, true);
  }
});

test("legacy account reset fields remain supported", () => {
  for (const field of ["quota_reset_date", "limited_user_reset_date"]) {
    const account = accountWithReset(0, { [field]: "2026-11-01" });
    assert.equal(account.premium.resetDate.toISOString(), resetUtc);
  }
});

test("positive snapshot timestamps remain a fallback, but zero is unavailable", () => {
  for (const timestamp of [1793491200, 1793491200000]) {
    assert.equal(accountWithReset(timestamp, {}).premium.resetDate.toISOString(), resetUtc);
  }
  for (const timestamp of [0, "0", null, undefined, -1, "invalid"]) {
    assert.equal(accountWithReset(timestamp, {}).premium.resetDate, null);
  }
});

test("limited quotas also use the UTC account reset", () => {
  const account = context.normalizeCopilot({
    quota_reset_date_utc: resetUtc,
    monthly_quotas: { chat: 50 },
    limited_user_quotas: { chat: 40 },
  });
  assert.equal(account.chat.resetDate.toISOString(), resetUtc);
  assert.equal(account.chat.remaining, 40);
});

class WidgetStack {
  constructor() {
    this.children = [];
  }
  addStack() {
    const stack = new WidgetStack();
    this.children.push(stack);
    return stack;
  }
  addText(text) {
    const element = {
      text,
      rightAlignText() {
        this.alignment = "right";
      },
      leftAlignText() {
        this.alignment = "left";
      },
    };
    this.children.push(element);
    return element;
  }
  addSpacer(length) {
    this.children.push({ spacer: length });
  }
  layoutVertically() {
    this.axis = "vertical";
  }
  layoutHorizontally() {
    this.axis = "horizontal";
  }
  centerAlignContent() {
    this.alignment = "center";
  }
  topAlignContent() {
    this.alignment = "top";
  }
  bottomAlignContent() {
    this.alignment = "bottom";
  }
  setPadding() {}
}

Object.assign(context, {
  ListWidget: WidgetStack,
  Size: class Size {
    constructor(width, height) {
      this.width = width;
      this.height = height;
    }
  },
  Point: class Point {},
  LinearGradient: class LinearGradient {},
  Font: {
    boldSystemFont: (size) => size,
    mediumSystemFont: (size) => size,
    systemFont: (size) => size,
    semiboldSystemFont: (size) => size,
  },
  URLScheme: { forRunningScript: () => "scriptable:///run" },
});

test("medium keeps premium usage on the left and shows account details on the right", () => {
  for (const tokenBasedBilling of [true, false]) {
    for (const percent of [0, 9.5, 96, 97.6, 100]) {
      const account = accountWithReset(0);
      account.login = "poychang";
      account.plan = "MAX";
      account.tokenBasedBilling = tokenBasedBilling;
      account.premium.percentRemaining = percent;
      account.premium.usedPercent = 100 - percent;
      const widget = context.buildMediumWidget(account);
      const limits = widget.children.find((child) => child.axis === "horizontal");
      assert.equal(limits.alignment, "top");
      const [left, right] = limits.children.filter((child) => child instanceof WidgetStack);
      assert.equal(limits.children.length, 3);
      assert.deepEqual(limits.children[1], { spacer: undefined });
      assert.equal(left.size.width, 145);
      assert.equal(right.size.width, 145);
      assert.equal(left.children[0].text, tokenBasedBilling ? "AI Credits" : "Premium Requests");
      const rows = right.children.filter((child) => child instanceof WidgetStack);
      assert.deepEqual(
        rows.map((row) => row.children.filter((child) => "text" in child).map((child) => child.text)),
        [
          ["Account", "@poychang"],
          ["Plan", "MAX"],
          ["Resets in", "29d"],
          ["Used", tokenBasedBilling ? "460 / 20,000" : "461 / 20,000"],
        ],
      );
      assert.equal(right.children.length, 7);
      for (const row of rows) {
        assert.equal(row.size.width, 145);
        assert.equal(row.size.height, 18);
        assert.equal(row.children[0].font, 8);
        assert.equal(row.children.at(-1).font, 10);
        assert.equal(row.children.at(-1).lineLimit, 1);
        assert.equal(row.children.at(-1).alignment, "right");
        assert.equal(row.children.some((child) => child instanceof WidgetStack), false);
      }

      const [heading, titleGap, valueRow, barGap, bar] = left.children;
      assert.equal(heading.font, 11);
      assert.equal(heading.lineLimit, 1);
      assert.equal(titleGap.spacer, 4);
      assert.equal(valueRow.size.height, 34);
      assert.equal(valueRow.children[0].text, `${Math.round(percent)}% left`);
      assert.equal(valueRow.children[0].lineLimit, 1);
      assert.equal(valueRow.axis, "horizontal");
      assert.equal(valueRow.children[0].alignment, "left");
      assert.deepEqual(valueRow.children[1], { spacer: undefined });
      assert.equal(barGap.spacer, 7);
      assert.equal(bar.size.height, 5);
      assert.equal(bar.size.width, 145);
      if (percent > 0) {
        assert.equal(bar.children[0].size.width, Math.max(3, 145 * percent / 100));
      } else {
        assert.equal(bar.children.length, 1);
      }
    }
  }
});

test("medium quota placeholders and unlimited values keep the same value-row height", () => {
  for (const premium of [null, { unlimited: true }, { remaining: 123456789, percentRemaining: null }]) {
    const account = accountWithReset(0);
    account.premium = premium;
    const widget = context.buildMediumWidget(account);
    const limits = widget.children.find((child) => child.axis === "horizontal");
    const [left] = limits.children.filter((child) => child instanceof WidgetStack);
    const expected = !premium ? "\u2014" : premium.unlimited ? "Unlimited" : "123,456,789 left";
    assert.equal(left.children[2].size.height, 34);
    assert.equal(left.children[2].children[0].text, expected);
    assert.equal(left.children[2].children[0].minimumScaleFactor, 0.6);
  }
});

test("account details handle missing data, unlimited quota, and long account names", () => {
  for (const login of [null, "a".repeat(39)]) {
    for (const premium of [null, { unlimited: true }]) {
      const parent = new WidgetStack();
      context.createAccountDetailsColumn(parent, { login, premium });
      const rows = parent.children[0].children.filter((child) => child instanceof WidgetStack);
      assert.equal(rows[0].children.at(-1).text, login ? `@${login}` : "--");
      assert.equal(rows[0].children.at(-1).minimumScaleFactor, 0.6);
      assert.equal(rows[1].children.at(-1).text, "--");
      assert.equal(rows[2].children.at(-1).text, "--");
      assert.equal(rows[3].children.at(-1).text, premium ? "Unlimited" : "\u7121\u8cc7\u6599");
    }
  }
});

test("AI Credits usage uses credits_used, including zero, decimals, and missing values", () => {
  for (const [creditsUsed, expected] of [
    [460, "460 / 20,000"],
    [0, "0 / 20,000"],
    ["460.5", "460.5 / 20,000"],
    [undefined, "-- / 20,000"],
    ["invalid", "-- / 20,000"],
  ]) {
    for (const snapshotBilling of [false, true]) {
      const quota = context.normalizeQuota("Premium", {
        entitlement: 20000,
        remaining: 19539,
        credits_used: creditsUsed,
        token_based_billing: snapshotBilling,
      });
      assert.equal(context.formatQuotaUsedDetail(quota, !snapshotBilling), expected);
    }
  }
});

test("request-based quotas calculate used requests and retain remaining details elsewhere", () => {
  const quota = context.normalizeLimitedQuota("Premium", "premium_interactions", {
    monthly_quotas: { premium_interactions: 50 },
    limited_user_quotas: { premium_interactions: 40 },
  });

  assert.equal(context.formatQuotaUsedDetail(quota, false), "10 / 50");
  assert.equal(context.formatQuotaDetail(quota), "40 / 50");
  assert.equal(context.formatQuotaUsedDetail({ entitlement: 50, remaining: null }, false), "-- / 50");
  assert.equal(context.formatQuotaUsedDetail({ creditsUsed: 0 }, true), "0 / --");
});

test("quota numbers use thousands separators and retain at most two decimal places", () => {
  for (const [value, expected] of [
    [20000, "20,000"],
    [1234567.895, "1,234,567.9"],
    [1234.567, "1,234.57"],
    [868, "868"],
    [0, "0"],
    [null, "--"],
    [undefined, "--"],
  ]) {
    assert.equal(context.formatNumber(value), expected);
  }
  assert.equal(context.formatQuotaValue({ percentRemaining: null, remaining: 20000 }), "20,000");
  assert.equal(context.formatQuotaDetail({ remaining: 19132, entitlement: 20000 }), "19,132 / 20,000");
});

test("all widget sizes fill progress bars by remaining quota", () => {
  function findBars(stack) {
    return stack.children.flatMap((child) => {
      if (!(child instanceof WidgetStack)) return [];
      return child.size?.height === 5 ? [child] : findBars(child);
    });
  }

  for (const build of [context.buildSmallWidget, context.buildMediumWidget, context.buildLargeWidget]) {
    for (const premium of [
      { percentRemaining: 96, usedPercent: 4, remaining: 19132, entitlement: 20000 },
      { unlimited: true },
      null,
    ]) {
      const account = accountWithReset(0);
      account.premium = premium;
      const bars = findBars(build(account));
      assert.equal(bars.length, 1);
      const [bar] = bars;
      if (premium) {
        assert.equal(bar.children[0].size.width, bar.size.width * (premium.unlimited ? 100 : 96) / 100);
      } else {
        assert.equal(bar.children.length, 1);
      }
    }
  }
});

test("remaining progress clamps boundaries and keeps low-quota warning colors", () => {
  for (const [percent, expected] of [[-5, 0], [0, 0], [20, 20], [50, 50], [96, 96], [110, 100], [null, 0]]) {
    const parent = new WidgetStack();
    context.addProgressBar(parent, percent, 100);
    const bar = parent.children[0];
    if (expected > 0) {
      assert.equal(bar.children[0].size.width, expected);
      assert.equal(bar.children[0].backgroundColor, context.usageColor(expected));
    } else {
      assert.equal(bar.children.length, 1);
    }
  }
});

function widgetElements(stack) {
  return stack.children.flatMap((child) =>
    child instanceof WidgetStack ? [child, ...widgetElements(child)] : [child],
  );
}

test("small uses a compact single-column usage layout with used credits and reset countdown", () => {
  for (const tokenBasedBilling of [true, false]) {
    const account = accountWithReset(0);
    account.plan = "MAX";
    account.tokenBasedBilling = tokenBasedBilling;
    account.premium.percentRemaining = 96;
    const widget = context.buildSmallWidget(account);
    const elements = widgetElements(widget);
    const texts = elements.filter((element) => "text" in element).map((element) => element.text);
    assert.deepEqual(texts.slice(0, -1), [
      "Copilot",
      "MAX",
      tokenBasedBilling ? "AI Credits" : "Premium Requests",
      "96% left",
      "Resets in 29d",
      "Used",
      tokenBasedBilling ? "460 / 20,000" : "461 / 20,000",
      "Updated",
    ]);
    assert.match(texts.at(-1), /^\d{2}:\d{2}$/);
    const usedIndex = widget.children.findIndex((child) => child.children?.[0].text === "Used");
    assert.deepEqual(widget.children[usedIndex + 1], { spacer: 4 });
    assert.equal(widget.children[usedIndex + 2].children[0].text, "Updated");
    for (const row of [widget.children[usedIndex], widget.children[usedIndex + 2]]) {
      assert.equal(row.axis, "horizontal");
      assert.equal(row.alignment, "center");
      assert.deepEqual(row.children[1], { spacer: 6 });
      assert.deepEqual(row.children[2], { spacer: undefined });
      const name = row.children[0];
      const value = row.children.at(-1);
      assert.equal(name.alignment, "left");
      assert.equal(value.alignment, "right");
      for (const item of [name, value]) {
        assert.equal(item.font, 8);
        assert.equal(item.textColor, vm.runInContext("THEME.secondaryText", context));
        assert.equal(item.lineLimit, 1);
        assert.equal(item.minimumScaleFactor, 0.6);
      }
    }
    assert.deepEqual(widget.children[usedIndex + 3], { spacer: undefined });
    assert.equal(usedIndex + 3, widget.children.length - 1);
    assert.equal(widget.url, "scriptable:///run");
    const column = widget.children.find((child) => child.axis === "vertical");
    assert.equal(column.size.width, 120);
    assert.equal(column.children[2].children[0].alignment, "left");
    assert.equal(column.children[4].size.width, 120);
    assert.equal(texts.some((text) => text.includes("Refresh")), false);
  }
});

test("large stacks a wide usage overview above full-width account details", () => {
  const account = accountWithReset(0);
  account.login = "poychang";
  account.plan = "MAX";
  account.tokenBasedBilling = true;
  const medium = context.buildMediumWidget(account);
  const large = context.buildLargeWidget(account);
  const mediumElements = widgetElements(medium);
  const largeElements = widgetElements(large);
  const content = (elements) => elements
    .filter((element) => "text" in element && !element.text.startsWith("Updated "))
    .map((element) => element.text);
  assert.deepEqual(content(largeElements), content(mediumElements));
  assert.equal(large.url, "https://github.com/settings/copilot");
  for (const elements of [mediumElements, largeElements]) {
    const updated = elements.find((element) => element.text?.startsWith("Updated "));
    assert.equal(updated.font, 7);
    assert.equal(updated.textColor, vm.runInContext("THEME.mutedText", context));
  }
  assert.equal(largeElements.some((element) => element.url === "scriptable:///run"), true);
  assert.equal(largeElements.some((element) => element.borderWidth || element.borderColor), false);
  assert.equal(content(largeElements).some((text) => /Chat|Completions|Billing/.test(text)), false);

  const sections = large.children.filter((child) => child.axis === "vertical");
  assert.equal(sections.length, 2);
  const [usage, details] = sections;
  assert.equal(large.children.some((child) => child.axis === "horizontal"), false);
  assert.equal(usage.size.width, 290);
  assert.equal(usage.children[2].size.height, 56);
  assert.equal(usage.children[2].children[0].font, 40);
  assert.equal(usage.children[2].children[0].alignment, "left");
  assert.equal(usage.children[4].size.width, 290);
  assert.equal(details.size.width, 0);
  const usageIndex = large.children.indexOf(usage);
  assert.deepEqual(large.children[usageIndex + 1], { spacer: 10 });
  assert.equal(large.children[usageIndex + 2], details);
  const rows = details.children.filter((child) => child instanceof WidgetStack);
  assert.equal(rows.length, 4);
  for (const row of rows) {
    assert.equal(row.size.width, 0);
    assert.equal(row.size.height, 24);
    assert.equal(row.children[0].font, 14);
    assert.equal(row.children.at(-1).font, 16);
    assert.equal(row.children.at(-1).alignment, "right");
  }
});

test("small and large retain missing-data and unlimited states with single-line values", () => {
  for (const build of [context.buildSmallWidget, context.buildLargeWidget]) {
    for (const premium of [null, { unlimited: true }]) {
      const account = accountWithReset(0);
      account.premium = premium;
      const elements = widgetElements(build(account));
      const value = elements.find((element) => element.text === (premium ? "Unlimited" : "\u2014"));
      assert.ok(value);
      assert.equal(value.lineLimit, 1);
      assert.equal(value.minimumScaleFactor, 0.6);
      assert.ok(elements.find((element) => element.text === "Reset time unavailable"));
    }
  }
});
