# Codex Reset Checker

這是一個適用於 [Scriptable](https://scriptable.app/) 的 ChatGPT / Codex 使用量小工具，用來查看目前使用量、剩餘百分比與下次重置時間。

資料查詢方式參考 [doggy8088/codex-reset-checker](https://github.com/doggy8088/codex-reset-checker)。

## 功能

- 顯示目前 Codex 使用方案。
- 顯示工作階段與每週使用額度。
- 顯示各額度的剩餘百分比、進度條與重置時間。
- Large Widget 可顯示額外使用額度，例如 Codex Spark。
- Small Widget 點擊整個區域即可重新查詢。
- Medium / Large Widget 點擊背景或卡片可開啟 ChatGPT，點擊右下角按鈕可重新查詢。
- 憑證成功匯入後會保存到 Scriptable Keychain。

## 需求

- iPhone 或 iPad
- [Scriptable](https://apps.apple.com/tw/app/scriptable/id1405459188)
- 可使用 Codex 的 ChatGPT 帳號
- Codex CLI 產生的 `~/.codex/auth.json`

## 安裝

1. 將 [codex-reset-checker.js](./codex-reset-checker.js) 的內容複製到 Scriptable，建立同名腳本。
2. 開啟腳本最上方的 `AUTH_JSON` 設定。
3. 將 `~/.codex/auth.json` 的完整 JSON 貼到 `AUTH_JSON` 物件中。
4. 在 Scriptable 執行一次腳本，確認能正常顯示使用量。
5. 將腳本加入主畫面小工具，選擇 Small、Medium 或 Large 尺寸。

首次成功執行後，`access_token` 與 `account_id` 會保存到 Scriptable Keychain。確認憑證已保存後，建議將 `AUTH_JSON` 清空：

```javascript
const AUTH_JSON = {};
```

## 設定

可在腳本中的 `CONFIG` 調整以下項目：

| 設定                   | 預設值                 | 說明                                                                              |
| ---------------------- | ---------------------- | --------------------------------------------------------------------------------- |
| `refreshMinutes`       | `15`                   | Widget 要求系統最早多久後重新查詢，實際執行時間由 iOS / iPadOS 決定。             |
| `previewFamily`        | `"medium"`             | 在 Scriptable App 直接執行時使用的預覽尺寸。可設為 `small`、`medium` 或 `large`。 |
| `debug`                | `false`                | 是否將 API 回應輸出到 Scriptable Console。                                        |
| `showAdditionalLimits` | `true`                 | 是否在 Large Widget 顯示額外使用額度。                                            |
| `widgetUrl`            | `https://chatgpt.com/` | Medium / Large Widget 一般區域的點擊目的地。                                      |

## Widget 互動

| 尺寸   | 一般點擊     | 重新整理             |
| ------ | ------------ | -------------------- |
| Small  | 重新執行腳本 | 點擊整個 Widget      |
| Medium | 開啟 ChatGPT | 點擊右下角 `Refresh` |
| Large  | 開啟 ChatGPT | 點擊右下角 `Refresh` |

## 安全注意事項

這個腳本使用 ChatGPT 的非公開 API：

```text
https://chatgpt.com/backend-api/wham/usage
```

非公開 API 可能在沒有預告的情況下變更或失效。腳本需要使用登入憑證，因此請注意：

- 不要將包含真實 `access_token` 的 `AUTH_JSON` 提交到 Git repository。
- 不要將 `auth.json` 或腳本截圖公開分享。
- 使用完畢後，請將 `AUTH_JSON` 改回空物件，避免憑證長期留在腳本原始碼中。
- 若懷疑憑證外洩，請立即重新登入或撤銷相關工作階段。
- 此腳本僅供個人使用，請自行承擔使用非公開 API 的風險。

## 疑難排解

### 找不到 `access_token`

確認 `AUTH_JSON` 中包含有效的 `tokens.access_token`，並在 Scriptable 中完整執行一次腳本。例如：

```javascript
const AUTH_JSON = {
    tokens: {
        access_token: '貼上你的 access token',
        account_id: '你的 account id',
    },
};
```

範例中的值僅供說明，請勿直接使用。

### 登入憑證已失效（HTTP 401 / 403）

重新取得最新的 `auth.json`，暫時貼回 `AUTH_JSON` 並執行腳本。成功後再次清空 `AUTH_JSON`。

### 無法取得使用量或 API 回傳格式非預期

可能原因包括 API 已變更、網路連線問題、帳號權限變更，或服務暫時無法使用。可以暫時將 `CONFIG.debug` 設為 `true`，在 Scriptable Console 查看回應內容；排查完成後請改回 `false`。

## 參考文件

- [Scriptable](https://scriptable.app/)
- [Scriptable Docs - Scriptable Docs](https://docs.scriptable.app/)
- [Codex Reset Checker](https://github.com/doggy8088/codex-reset-checker)
