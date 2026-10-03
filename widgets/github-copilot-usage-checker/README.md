# GitHub Copilot Usage Checker

這是一個適用於 [Scriptable](https://scriptable.app/) 的 GitHub Copilot 使用量小工具，用來查看 AI Credits / Premium Requests 的剩餘額度、已用量與重置時間。

資料來源為 GitHub 的非公開 API：

```text
GET https://api.github.com/copilot_internal/user
```

## 功能

- 支援 Small、Medium、Large 三種小工具尺寸。
- 顯示 Copilot 訂閱方案與 Premium 剩餘百分比。
- 進度條表示**剩餘比例**：例如 `96% left` 對應約 96% 的填滿程度。
- Small 採單欄精簡版，顯示方案、剩餘比例、重置倒數與已用／總額度。
- Medium 採無邊框左右分區；Large 採上下分區，上方呈現額度，下方顯示帳戶名稱、方案、重置倒數與已用／總額度。
- 三種尺寸皆聚焦 Premium 額度，不顯示 Chat / Completions。
- 額度數字使用千分位，最多顯示兩位小數。
- Token 可保存至 Scriptable Keychain，不必長期留在腳本中。

## 需求

- iPhone 或 iPad。
- [Scriptable](https://apps.apple.com/tw/app/scriptable/id1405459188)。
- 可使用 GitHub Copilot 的 GitHub 帳號。
- 能存取上述 API 的 GitHub Token。

## 安裝與 Token 設定

1. 將 [github-copilot-usage-checker.js](./github-copilot-usage-checker.js) 的內容複製到 Scriptable，建立同名腳本。
2. 取得 GitHub Token。若電腦已安裝 GitHub CLI 並登入正確帳號，可在終端機執行：

   ```shell
   gh auth token
   ```

   這個指令會輸出登入憑證，請勿公開分享輸出內容。也可嘗試從 GitHub 的 **Settings → Developer settings → Personal access tokens** 建立 Fine-grained PAT；由於此 API 未公開，實際能否存取仍取決於 Token、帳號權限與 GitHub 的限制。

3. 將 Token 暫時填入腳本最上方：

   ```javascript
   const GITHUB_TOKEN = "貼上你的 GitHub Token";
   ```

4. 在 Scriptable 執行腳本，確認能正常顯示使用量。
5. Token 會在查詢 API 前寫入 Keychain。確認設定完成後，將腳本中的值清空並儲存：

   ```javascript
   const GITHUB_TOKEN = "";
   ```

   後續執行會讀取 Keychain 中的 Token；清空這個設定不會刪除已保存的 Token。

6. 在主畫面加入 Scriptable 小工具，選擇尺寸，再編輯小工具設定，將 **Script** 指定為此腳本。不需要填寫 Parameter。

若要更換 Token 或切換帳號，重新填入新的 Token 並執行一次即可覆寫保存的憑證，完成後再清空設定。

## 版面與互動

| 尺寸 | 顯示內容 | 一般點擊 | 重新整理 |
| --- | --- | --- | --- |
| Small | 訂閱方案、Premium 剩餘百分比、進度條、重置倒數、已用／總額度 | 重新執行腳本 | 點擊整個 Widget |
| Medium | 左側額度概覽，右側帳戶與使用明細 | 開啟 GitHub Copilot 設定頁 | 點擊右下角 `Refresh` |
| Large | 上方額度概覽，下方帳戶與使用明細，使用較大文字與較寬進度條 | 開啟 GitHub Copilot 設定頁 | 點擊右下角 `Refresh` |

### Small

沿用 Medium 的配色與資訊層級，由上而下顯示標題與方案、額度名稱、靠左的剩餘百分比、藍色剩餘進度條、重置倒數、已用／總額度及更新時間。`Used` 與 `Updated` 維持兩列，標籤靠左、額度與時間靠右，使用相同的 8 點 Medium 字體與次要文字顏色。兩列相隔 4 點，剩餘空間留在資訊區下方，不固定於底部。整張 Widget 都可點擊重新執行。

### Medium

- **左側**：依帳戶計費模式顯示 `AI Credits` 或 `Premium Requests`，包含剩餘百分比、剩餘進度條與重置倒數。
- **右側**：
  - `Account`：GitHub 帳戶名稱。
  - `Plan`：訂閱方案顯示名稱。
  - `Resets in`：距離額度重置的時間，例如 `29d`。
  - `Used`：已用／總額度，例如 `868 / 20,000`。
- 左右欄使用彈性間距，讓右側明細與標頭、重新整理按鈕共用右邊界。

### Large

- **上方**：顯示 AI Credits / Premium Requests，使用 40 點的大字呈現剩餘比例，搭配較寬的藍色進度條與重置倒數。
- **下方**：Account、Plan、Resets in、Used 四列帳戶明細展開至可用寬度，使用 14 點標籤與 16 點數值，標題靠左、數值靠右。
- 延續 Medium 的無邊框配色，保留頂部標頭與底部更新時間／重新整理按鈕，不顯示 Chat / Completions。

`Updated` 表示最近一次腳本產生畫面的時間，並非 API 中的用量統計時間。點擊重新整理會透過 Scriptable 重新執行腳本，不代表系統一定會立即更新主畫面上的 Widget。

## 資料與計算方式

API 回應結構可參考 [user.jsonc](./user.jsonc)。這個檔案僅供參考，Widget 執行時會直接呼叫 API，不會讀取此檔案。

### 額度

主要額度取自 `quota_snapshots.premium_interactions`，也就是 AI Credits / Premium Requests 使用的資料，不是兩份不同的額度。

| 顯示項目 | 資料來源或計算方式 |
| --- | --- |
| 剩餘百分比 | 優先使用 `percent_remaining`；缺少時，以有效的剩餘／總額度計算。文字四捨五入為整數百分比，進度條使用未取整的比例。 |
| 剩餘額度 | 優先使用 `remaining`，其次為 `quota_remaining`。 |
| 總額度 | `entitlement`。 |
| AI Credits 已用額度 | 直接使用 `credits_used`，不以總額度減去剩餘額度反推。缺少時顯示 `--`。 |
| 非 Token-based 計費的已用額度 | 以有效的 `entitlement - remaining` 計算，最低為 0。 |
| 不限量 | `unlimited: true` 或 `entitlement: -1`，顯示 `Unlimited`，進度條填滿。 |

若缺少 quota snapshots，腳本也支援從 `monthly_quotas` 與 `limited_user_quotas` 取得 Free / Limited 額度。缺少資料時會顯示 `--`、`—` 或「無資料」，不代表剩餘額度為零。

### 重置時間

帳戶層級的重置時間依序使用：

1. `quota_reset_date_utc`
2. `quota_reset_date`
3. `limited_user_reset_date`

各 quota 優先沿用帳戶層級的重置時間；若不存在，再使用該 quota 有效且大於 0 的 `quota_reset_at`。`quota_reset_at: 0` 不會被當成 1970 年的日期。

倒數以重置時間與目前時間的差值計算；頁尾更新時間使用裝置本地時區。到達重置時間會顯示「即將重置」，實際額度仍以後續 API 回應為準。

## 設定

可在腳本中的 `CONFIG` 調整：

| 設定 | 預設值 | 說明 |
| --- | --- | --- |
| `apiUrl` | `https://api.github.com/copilot_internal/user` | 使用量 API；通常不需修改。請勿改成不受信任的網址，請求會攜帶 Token。 |
| `refreshMinutes` | `30` | 要求系統最早於多久後更新；實際更新時間由 iOS / iPadOS 決定。 |
| `previewFamily` | `"medium"` | 直接在 Scriptable 執行時的預覽尺寸，可設為 `small`、`medium` 或 `large`；不影響主畫面 Widget 的尺寸。 |
| `debug` | `false` | 是否將 API 回應輸出至 Scriptable Console。 |
| `widgetUrl` | `https://github.com/settings/copilot` | Medium / Large 一般區域的點擊目的地。 |

`CONFIG` 另有 `premiumCardWidth` 與 `statusCardWidth`，但目前版面未使用這兩個設定，調整它們不會改變欄位寬度。

## 疑難排解

### 找不到 GitHub Token

先在 `GITHUB_TOKEN` 填入有效 Token，並於 Scriptable 執行一次。若只將腳本複製到 App，尚未執行，Keychain 不會自動建立憑證。

### HTTP 401 / 403

確認 Token 未過期或遭撤銷、所屬帳號能使用 Copilot，且能存取這個非公開 API。可重新取得 Token 並匯入；Fine-grained PAT 不一定能存取所有非公開端點。

### 無法取得使用量，或部分欄位沒有資料

可能是網路問題、帳號權限限制，或 API 格式已變更。可暫時將 `CONFIG.debug` 設為 `true`，重新執行後查看 Scriptable Console；排查完成請改回 `false`。

API 回應可能包含帳戶、組織與使用量資訊，分享記錄前請先移除個人或敏感資料。

### Widget 沒有每 30 分鐘更新，倒數也沒有持續跳動

`refreshMinutes` 是更新時間的請求，不是固定排程。倒數文字只會在腳本重新執行時重算，並非即時倒數計時器。可透過 `Refresh` 手動重新執行。

## 安全注意事項

- 這個 Widget 使用非公開 API，端點與回應格式可能在沒有預告的情況下變更或失效。
- 不要將真實 Token 提交到 Git repository，或包含在截圖、分享的腳本與終端機輸出中。
- 確認 Token 已保存至 Keychain 後，請清空腳本內的 `GITHUB_TOKEN`。
- 若懷疑 Token 外洩，請到 GitHub 撤銷並重新產生憑證；只清空腳本中的值不會撤銷 Token。
- 此腳本僅供個人使用，請自行評估使用非公開 API 的風險。

## 開發與測試

Widget 本體需在 Scriptable 執行。回歸測試使用 Node.js 內建測試工具及 Scriptable 元件替身，不需要額外安裝套件；建議使用 Node.js 22 或更新版本。

在儲存庫根目錄執行：

```powershell
node --test widgets\github-copilot-usage-checker\github-copilot-usage-checker.test.cjs
```

測試涵蓋重置時間、已用額度、千分位、各尺寸的剩餘進度條與版面結構；實際字型、欄位對齊與裝置尺寸仍需在 Scriptable 預覽確認。
