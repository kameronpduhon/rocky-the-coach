# Steps Shortcut (Apple Watch to Rocky)

Sends today's step total to Rocky several times a day. Health data is encrypted while the iPhone is locked, so a run that fires while locked can fail; that is fine because the next run sends the full-day total again.

## Build the Shortcut (Shortcuts app on the iPhone)

1. New Shortcut, name it **Send steps to Rocky**.
2. **Find Health Samples**: Type **Steps**, filter **Start Date is today**, **Group By Day**, Fill Missing off. Do not filter by Source: the total should combine iPhone and Watch, and Group By Day is what merges them without double counting.
3. **Get Item from List**: First Item.
4. **Get Details of Health Sample**: **Value**.
5. **Round Number** (Normal).
6. **Date**: Current Date, then **Format Date**: Custom, `yyyy-MM-dd`.
7. **Get Contents of URL**:
   - URL: `https://kampduh.com/api/ingest/steps`
   - Method: **POST**
   - Headers: `Authorization` = `Bearer <token>` (copy it from Rocky > Settings > Steps from Apple Watch > Copy header), `Content-Type` = `application/json`
   - Request Body: **JSON**, `date` (Text) = Formatted Date, `steps` (Number) = Rounded Number
8. Run it once by hand. Rocky's steps ring should match the Health app's step count for today. If it reads higher, the samples are being double counted; check Group By Day is set.

The endpoint answers `{"ok":true,"date":"...","steps":...}` on success, 401 for a wrong token, and 400 for a date more than two days from today or a step count outside 0 to 100,000.

## Automate it

Shortcuts > Automation > New > **Time of Day**: 12:00 PM, Daily, Run **Send steps to Rocky**, turn off **Ask Before Running** (iOS 17/18: **Run Immediately**). Repeat for 3:00 PM, 6:00 PM, and 9:00 PM.

On iOS 27 the flow is Edit Shortcut > Automation > Time of Day; enable **Allow Running When Locked** in the shortcut's privacy settings.

## Rotating the token

`openssl rand -hex 24 | npx wrangler secret put INGEST_TOKEN`, then paste the new header into the Shortcut.
