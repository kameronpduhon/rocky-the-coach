# Rocky v2, project 5: Rocky's AI

Status: approved design, 2026-10-28. Next step: the P5a implementation plan.

This is the last of the five-project rebuild. Projects 1 to 3 are live at kampduh.com. Project 4 is specced alongside this one and ships first.

| # | Project | Ships |
|---|---|---|
| 1 | Foundation | Done |
| 2 | Workouts | Done |
| 3 | Nutrition engine | Done |
| 4 | Check-in, Plan, Progress, Library | The one-page check-in with the rule-written take, the overview screens, the Library tab, SPA mode |
| **5** | **Rocky's AI** (this spec) | Rocky's take, Tell Rocky, describe-a-meal, barcode and label scan, What Rocky knows, the AI switch |

## Source material

| Source | What it holds |
|---|---|
| Research doc (text copy in the session scratchpad, `research.txt`) | "Recommendation for Rocky" under AI coaching, the food-data trust order, and decision "Should Rocky use AI inside the app?" |
| Mocks, https://claude.ai/artifact/65WeReuGH5ZageJng9K6nq | Artboards `CheckInWeek` (the ROCKY'S TAKE card) and `Settings` (the ROCKY section) |
| Option mocks, https://claude.ai/artifact/QpJ72DACbHp4WyvN13Gdcj | Six decisions. Picked: 1C, 2A, 3B, 4B, 5A, 6A. Band 7 is the Settings section as built. Its "Issues found" list is settled below |
| `docs/design/system.md` | The Corner design system. Where it and a mock disagree on looks, the mock wins, except the colour rules |
| `docs/superpowers/specs/2026-10-27-foundation-design.md` | The sync layer, named changes and conventions |
| `docs/superpowers/specs/2026-10-27-nutrition-design.md` | Usual orders, the off-plan sheet (3A) and `logOffPlan`, which this project extends |
| Project 4's spec | The check-in page, `digest` (the week's computed numbers), `ruleTake(digest)` (the rule-written Win, Fix and Call), SPA mode with server work as Worker endpoints in `workers/app.ts` |
| `app/today/OffPlanSheet.tsx`, `app/routes/settings.tsx`, `app/domain/messages.ts`, `app/sync/mutators.ts`, `content/` | Today's code. Anything this spec does not change keeps working as it does |

Where copy below says "Rocky" or "The Corner", the code uses `COACH_NAME` and `APP_NAME` from `app/brand.ts`.

## Decisions this spec rests on

- **The model is a narrator and an intake clerk, never a decision-maker.** Rules set every number that reaches a target, a log or a call.
- **Rocky's take is AI-written when the AI is on.** It replaces `ruleTake`'s text in the same dark card, with no label saying who wrote it. The rule take shows when the AI is off, offline, without a key, or when the AI's text fails a check.
- **The take is written once per week state and stored.** It is written after the engine has made the call, when the check-in opens, and does not change on reload. It may quote the call ("I'm trimming 100").
- **Every number in the take must appear in the lines the model was given.** At most four sentences: one win, one fix, the call and why, next week's focus. It uses the person's voice (`corner` or `plain`) and their facts.
- **Describe-a-meal:** the model only splits the text into foods with grams and maps each to an id in a food table the app ships. The rules compute calories and protein. The model never writes a calorie or protein number that gets logged.
- **The food table** is USDA FoodData Central (public domain), a few hundred common foods: the plan's foods cooked and raw, beans, tortillas, sauces, drinks and common restaurant components.
- **Label scan:** the model reads the Nutrition Facts panel into fields, which are what's printed. The person confirms them. The photo goes to the model and is discarded, never stored.
- **Barcode:** decoded on the phone, looked up in Open Food Facts through a Worker endpoint with a cache. Barcode is not AI and works with the AI off.
- **Tell Rocky proposes, the person accepts.** Three kinds only: swap an exercise (library exercises only), move a workout, remember a fact. Each accepted proposal runs an existing named change (`swapAlways`, `moveWorkout`) or the new fact change.
- **What Rocky knows** is a visible, editable list. It feeds the take and Tell Rocky.
- **The AI switch** is per person, on the profile, default on. Off hides describe, label reading, Tell Rocky's AI and the AI take. Barcode stays. What Rocky knows stays editable, and "+ Tell Rocky something" saves the typed text as written.
- **Provider:** Claude Sonnet 5.5 (`claude-sonnet-5-5`) through `@anthropic-ai/sdk` in the Worker. Secret `ANTHROPIC_API_KEY`, which Kameron sets. With no key every AI path falls back to rules, so merging never waits on the secret.
- **Picked options:** 1C (usuals first, then "Not in your usuals?" with Describe it and Scan), 2A (the editable plate), 3B (the product card), 4B (a "Tell Rocky something" line on Today's Rocky card, Settings keeps its button), 5A (same card, no label), 6A (AI parts hide when off, barcode stays).
- **Out of scope:**
    - LLM-written push notifications. Never.
    - Sick and travel modes, resting a meal, and "Ask Rocky" questions over history.
    - Photo-of-a-plate logging.
    - FatSecret or any paid food database.
    - Voice input. The iPhone keyboard's dictation already covers it.

## 1. How the AI is wired

### Units

| Unit | Runs on | Does |
|---|---|---|
| `app/ai/numbers.ts` | Both | Pulls numbers out of text (digits and number words) and checks a text against an allowed set |
| `app/ai/take.ts` | Both | `takeLines(digest, ruleTake)`, `checkTake(text, lines)`, `takeHash(lines, voice)` |
| `app/ai/plate.ts` | Phone | Plate rows and totals from the model's items and the food table |
| `app/ai/proposals.ts` | Both | Proposal types, content checks (Worker) and row checks (phone), and each proposal's copy |
| `app/ai/barcode.ts` | Both | GTIN check digit and display grouping |
| `app/ai/label.ts` | Both | Label sanity check |
| `app/ai/claude.server.ts` | Worker | The four model calls behind one `AiClient` interface, so tests pass a fake |
| `app/ai/prompts.server.ts` | Worker | The system prompts |
| `app/ai/off.server.ts` | Worker | Open Food Facts lookup, parse and cache |
| `workers/ai.ts` | Worker | The `/api/ai/*` and `/api/food/*` routes, mounted in `workers/app.ts` before the app handler |
| `app/ai/client.ts` | Phone | Calls the endpoints with timeouts, and caches `status` |
| `app/ai/use-take.ts` | Phone | Picks the AI or the rule take for the check-in card |

### Endpoints

Every route checks the session the same way the sync endpoints do after Project 4, and answers 401 without one. Every `/api/ai/*` route except `status` also:
- answers `503 { fallback: "no-key" }` when `ANTHROPIC_API_KEY` is unset,
- answers `403 { fallback: "off" }` when the person's `profile.ai` is 0 in their D1,
- answers `429 { fallback: "cap" }` past the daily cap,
- writes one `ai_calls` row per model call.

| Route | Body | Returns | Daily cap per person |
|---|---|---|---|
| `GET /api/ai/status` | | `{ available }`: whether the key is set. Makes no model call. The phone caches it for the session | |
| `POST /api/ai/take` | `{ weekStart, lines, voice }` | `{ text }` or `{ text: null }` | 3 writes per week |
| `POST /api/ai/describe` | `{ text }` (1 to 300 chars) | `{ name, category, items: [{ label, foodId, grams }] }` | 30 |
| `POST /api/ai/label` | `{ image }` (base64 JPEG, under 5 MB) | `{ readable, name, servingText, servingGrams, kcal, proteinG }` | 20 |
| `POST /api/ai/tell` | `{ text, today, context }` (text 1 to 500 chars) | `{ proposals }` | 20 |
| `GET /api/food/barcode/:code` | | `{ found: true, product }` or `{ found: false }` | None. Not AI, works with the AI off |

Any model failure (network, 5xx, 429 from Anthropic, `stop_reason` of `refusal` or `max_tokens`, a null `parsed_output`, or a check that fails) returns the route's fallback shape with status 200 and writes the reason to `ai_calls`. The phone treats a fallback and a timeout the same way.

### The model call

- **Package:** `@anthropic-ai/sdk` added to `dependencies`. It runs on Workers over `fetch`.
- **Client:** `new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 15_000 })`, made per request.
- **Model:** `AI_MODEL = "claude-sonnet-5-5"` in `app/ai/claude.server.ts`. One constant, so a model change is one line.
- **Thinking:** the `thinking` parameter is left out, so Sonnet 5.5 runs adaptive thinking. `{ type: "disabled" }` is a 400 on this model.
- **Effort:** `output_config.effort` is `"low"` for describe, label and tell, and `"medium"` for the take.
- **No `temperature`, no assistant prefill.** Both are 400s on current models and API versions.
- **Structured outputs** for describe, label and tell: `client.messages.parse({ ..., output_config: { effort, format: zodOutputFormat(Schema) } })`. The Zod schemas live beside the calls. Bounds the API ignores (string lengths, numeric ranges, array sizes) are checked again by Zod on `parsed_output`, and anything out of bounds is a fallback.
- **The take** is a plain `client.messages.create` whose first text block is the take.
- **Vision:** the label call sends `{ type: "image", source: { type: "base64", media_type: "image/jpeg", data } }` before its text block.
- **Prompt caching:** the describe system prompt is two blocks. The second holds the food table (about 5,000 tokens) and carries `cache_control: { type: "ephemeral" }`, so a second describe inside 5 minutes (the plate's "Edit") reads it from cache. The tell prompt caches its exercise library block the same way. The take and label prompts are too small and too rare to cache.
- **`max_tokens`:** 2,000 for take and label, 3,000 for tell, 4,000 for describe. Non-streaming, well under the SDK's timeout.
- **Errors** are caught most specific first: `Anthropic.RateLimitError`, `Anthropic.APIConnectionError`, then `Anthropic.APIError`. All of them fall back.
- **Refusals:** `stop_reason === "refusal"` falls back to rules. No server-side `fallbacks` parameter (see Calls made).
- **Nothing personal is logged.** No `console.log` of a request body, a photo or a model reply. `ai_calls` holds counts only.

### Cost

At $2 per million input tokens and $10 per million output on Sonnet 5.5:

| Call | Tokens in / out (with thinking) | Each | A month, both people |
|---|---|---|---|
| Take | 2,500 / 600 | $0.011 | $0.05 (Kameron only; Catherine has no plan) |
| Describe | 6,000 / 800 | $0.020 | $0.48 at 12 each |
| Label | 2,000 / 400 | $0.008 | $0.10 at 6 each |
| Tell | 3,000 / 600 | $0.012 | $0.10 at 4 each |

About $0.50 to $0.75 a month. The daily caps bound a runaway at about $1 a day per person.

### Secret and config

- `ANTHROPIC_API_KEY` is set with `wrangler secret put ANTHROPIC_API_KEY`. Kameron runs it.
- It is **not** added to `secrets.required` in `wrangler.jsonc`, so a deploy never waits on it.
- `wrangler types` only types the required secrets, so `app/ai/env.d.ts` declares it on `Env` as `ANTHROPIC_API_KEY?: string`.
- Local dev reads it from `.dev.vars` when present. Without it, dev runs the rules paths.
- Removing the secret is the household kill switch: every AI path falls back within one request.

## 2. Rocky's take (`app/ai/take.ts`; option 5A)

### What the model is given

`takeLines(digest, ruleTake)` turns the week into short labelled lines. It reads these digest fields when present and leaves a line out when the digest lacks it:

| Line | Example |
|---|---|
| Week | "Week 3, Oct 19 to 25" |
| Days | "7 of 7 days counted, 5 fully on plan" |
| Trend | "Trend weight 205.6 lb, down 0.4 lb this week" |
| Waist | "Waist 35.5 in, down 0.25 in" |
| Protein | "Protein averaged 178 g a day, target 180 g" |
| Steps | "Steps averaged 7,640 a day, goal 8,000. Lowest day Saturday, 5,900" |
| Lifts | "4 sessions, 3 planned. 3 lifts moved up" |
| Burn | "Burn estimate 2,680 a day, settling, steady by week 5" |
| The call | One of: "The call: trim 100, from 2,300 to 2,200 cal a day from Monday" · "The call: calories hold at 2,300" · "The call: keep 2,300, walk 1,000 more, step goal 9,000" · "The call: maintenance week, 2,680 cal a day" |
| Rule take | "Written win: …" · "Written fix: …" · the rule take's lines, so the model narrates the same win and fix the rules picked |

The prompt also carries:
- **The voice.** `corner`: "Straight shooter, a little fight. One boxing image at most." `plain`: "Same advice, no boxing talk."
- **What Rocky knows**, as a list.
- **The rules:** at most four sentences, in this order: one win, one fix, the call and why, next week's focus. Use only numbers from the lines, written as digits. Never blame, never shame. No medical advice. No em dashes, no emojis, no lists, no quotation marks around the call.

### The check (`checkTake(text, lines)`)

The text passes only if every one of these holds:
- **Numbers:** every number in the text is in the allowed set, compared by value with commas stripped and signs dropped. The allowed set is every number in the lines, found the same way.
    - Digits: `\d[\d,]*(\.\d+)?`.
    - Words: two to twenty, thirty to ninety by tens, hundred and thousand, plus "half" (0.5) and "quarter" (0.25). "One" and "a" are not read as numbers, since they are mostly pronouns and articles.
    - Numbers in What Rocky knows are not allowed unless the lines hold them too.
- **Length:** one to four sentences (split after `.`, `!` or `?` and a space), 420 characters at most, no line breaks.
- **Characters:** no em dash or en dash, no emoji (`\p{Extended_Pictographic}`).

A failed check is not retried. The rule take shows.

### When it is written and shown (`useTake`)

- **The AI take shows only when all of these hold:** the person's AI switch is on, `status.available` is true, and a stored take for the week has the current `takeHash` and passes `checkTake` against the current lines on the phone.
- **`takeHash`** is SHA-256 of the lines and the voice, first 16 hex characters.
- **On opening the check-in** with a signal, AI on, and no stored take matching the hash:
    - The card shows its label and three static placeholder bars in `on-ink-2` at 30% opacity (no shimmer, nothing animates).
    - The phone posts to `/api/ai/take` and waits up to 10 seconds.
    - The Worker calls the model, runs `checkTake`, and on a pass upserts the `takes` row for the week and bumps `writes`. It returns the text, and the phone pulls so its copy has the row.
    - On a fallback, a timeout or a failed check, the card shows the rule take.
- **A reload with the same numbers and voice** shows the stored take at once, with no request.
- **New numbers** (a weigh-in logged after the check-in opened) or **a voice change** make a new hash. The next open writes a new take, up to 3 writes a week. After that the rule take shows for any state that has no stored take.
- **After Finish** the stored take stays with the week.
- **How it looks:** the AI text renders as one paragraph in Project 4's card body (mock `CheckInWeek`: Barlow 500 18 / 1.45, paper on ink). The rule take keeps Project 4's Win, Fix and Call lines. The card label reads "ROCKY'S TAKE" either way.

## 3. Ate something else (options 1C, 2A, 3B, 6A)

The off-plan sheet keeps its one sheet and gains views. Each view after the first has a 44 px back button left of the title that returns to the usuals view. "Done" closes the sheet and drops anything unsaved.

### The first view (1C)

- **Title:** "Ate something else".
- **Usual orders first**, exactly as Project 3 built them.
- **"Not in your usuals?"** section head (Semi Condensed 700 16, ink), then two choice rows (64 px, 1.5 px `border` outline, icon, bold label over a 13 px subline):

| State | Describe it | Scan |
|---|---|---|
| AI on, signal | "Describe it" · "Type it like a text" | "Scan" · "Barcode or label" |
| AI off, or no key | Hidden | "Scan a barcode" · "Looks it up in Open Food Facts" |
| Offline | "Describe it" · "Needs a signal", disabled | "Scan" · "Needs a signal", disabled |

- **"Type the numbers instead"** quiet link opens the Something new form (Project 3's form, unchanged) as its own view, titled "Something new".

### Describe it

- **Title:** "Describe it".
- Field label "What did you eat?", a 4-line text box, max 300 characters, placeholder "Chipotle bowl, double chicken, white rice, black beans, fajita veg, salsa, guac".
- Under it, ink-3 15: "Rocky splits it into foods. The food table sets the calories and protein."
- Red **"Build the plate"**. While waiting it reads "Building the plate" and is disabled. The phone waits up to 20 seconds.
- Quiet "Type the numbers instead".
- **Failures:**
    - Fallback or timeout: "Rocky couldn't build that plate just now. Try again, or type the numbers." The text stays in the box.
    - No items back: "Rocky couldn't find any foods in that. Try naming each one."

### The plate (2A)

- **Title:** the model's `name` (60 characters at most), for example "Chipotle bowl". Tapping the title turns it into a field to rename it.
- **What you said:** the description in ink-3 15 with a quiet "Edit" on the right, which goes back to Describe it with the text kept.
- **One row per item**, in the model's order, 60 px with a 1 px rule above:
    - **Matched** (the `foodId` is in the table): the table's name, the subline "<kcal> cal · <protein> g", and a grams stepper on the right (two 44 px outline buttons around "<grams> g").
    - **Unmatched** (`foodId` null, or not in the table): the model's `label`, the note "Not in the food table. Type the numbers or pick a food." in ink-3 14, the stepper, then a line of two small fields, "Cal" and "Protein g", and a quiet "Pick a food".
        - Typed numbers count for the grams shown. Stepping the grams afterwards scales them.
        - "Pick a food" opens the food picker. The picked food replaces the row at the same grams, and the row becomes matched.
- **The stepper** moves 10 g, or 5 g at 50 g and under. It stops at 0. A row at 0 g counts 0.
- **"Anything the description left out?"** in ink-3 15, then three chips (44 px, 1.5 px `border`, Semi Condensed 700 16):
    - "+ oil" adds "Cooking oil" at 10 g, or adds 10 g to that row if it is already there.
    - "+ sauce" opens the food picker on sauces and dressings.
    - "+ drink" opens the food picker on drinks. A picked drink starts at its first portion, for example a 355 g can.
- **Total:** "<kcal> cal" in the big number style with "· <protein> g protein" after it, for example "782 cal · 71 g protein".
    - Under it, when an unmatched row has no numbers: "<Name> isn't counted until it has numbers." For two or more: "<n> foods aren't counted until they have numbers."
- **Category** select (Meal, Snack, Dessert, Drink), starting at the model's `category`.
- **Switches:** "Relaxed meal (weekend restaurant)" and "Save as a usual", as in the Something new form.
- Red **"Log it"**, disabled while the total is 0. It runs `logOffPlan` with the title as the name, the category, the total calories and protein, the relaxed switch, and a `usualId` when Save as a usual is on. The sheet closes.

### The math (`app/ai/plate.ts`)

- A matched row: kcal = grams × `kcalPer100` / 100, rounded to the nearest 5. Protein = grams × `proteinPer100` / 100, rounded to the nearest 1 g. The same rounding v1 uses for portions.
- An unmatched row with typed numbers: the typed numbers, scaled by new grams / grams when typed, rounded the same way.
- **The total is the sum of the rows as shown**, so the numbers on screen add up.
- Grams from the model are clamped to whole numbers between 1 and 2,000. At most 12 items are kept.

### The food picker

- A sheet over the plate, titled "Pick a food", with a search field ("Search foods") and the table grouped by `group`, filtered by name and aliases as you type.
- Opened from a chip, it starts filtered to that group, with "All foods" to clear the filter.
- A row shows the name and "<kcal> cal · <protein> g per 100 g". Tapping it picks it.

### Scan (3B)

- **Title:** "Scan".
- **The viewfinder:** the rear camera (`getUserMedia({ video: { facingMode: "environment" } })`) in a 4:3 box with a centred guide rectangle (2 px paper, 40% opacity). The phone looks for a barcode about 5 times a second.
- **Under it, AI on:** quiet "No barcode? Read the label".
- **A barcode found:** the camera stops, the code is checked (GTIN-8, 12, 13 or 14 with a valid check digit) and looked up. While waiting: "Looking up <grouped digits>". A bad check digit keeps scanning.
- **Found:** the product card.
- **Not found (either OFF has no listing, or has no calories):**
    - Bold "Not in Open Food Facts.", then ink-3 15 "Barcode <grouped digits> has no listing. A photo of the nutrition label works instead."
    - Outline 56 px "Read the label instead" (AI on only).
    - Quiet "Type the numbers".
- **Camera blocked or missing:** "The camera is off for The Corner. Allow it in your iPhone's settings, or type the numbers." with the label option under it when the AI is on (the label uses the photo picker, which needs no camera permission).
- **Grouping:** UPC-A as 1-5-5-1 ("0 85239 00417 2"), EAN-13 as 1-6-6, anything else as one run of digits.

### Read the label

- "Read the label" and "Read the label instead" open the iPhone photo sheet (`<input type="file" accept="image/*" capture="environment">`).
- **On the phone,** the photo is drawn to a canvas at 1,568 px on its long edge and encoded as JPEG at 0.8. The original file and the canvas are dropped once the request is sent. Nothing is written to IndexedDB, the sync queue or R2.
- While waiting (up to 20 seconds): "Reading the label".
- **The model** returns what is printed: the product name if it is on the photo, the serving text ("1 bar (55 g)"), serving grams, calories and protein per serving. `readable` is false when it can't find a Nutrition Facts panel.
- **The Worker** sends the photo to the model and keeps nothing.
- **Not readable, or a fallback:** "Couldn't read that label. Try again with the panel flat and in focus." with outline "Take another photo" and quiet "Type the numbers".
- **Sanity check (`app/ai/label.ts`):** calories 0 to 2,000, protein 0 to 200 g, and protein × 4 no more than calories + 20. A label that fails opens the Something new form filled in, with the note "These numbers look off. Check them against the label."

### The product card (3B)

Used for both a barcode hit and a label read.

- A raised card:
    - The name (Barlow 700 17). From a label with no printed name, a required field "What was it" takes its place.
    - The source line in ink-3 14:
        - Barcode: "Per <serving text> · Open Food Facts", for example "Per bottle, 14 fl oz · Open Food Facts".
        - Label: "Per <serving text> · From the label".
    - Two big numbers side by side: "<kcal> cal" and "<protein> g protein", per serving.
    - **"Servings"** with a stepper, 1 to 10, whole servings. The big numbers stay per serving.
    - **No serving size** (OFF has only per-100 g numbers): the source line reads "Per 100 g · Open Food Facts", and the stepper is "Grams", 10 g steps from 100 g.
- From a label, under the card in ink-3 14: "Check it against the wrapper."
- Quiet **"Numbers look wrong? Edit them"** opens the Something new form filled with the name, category, and the per-serving numbers times the servings.
- **"Save as a usual"** switch.
- Red **"Log it"** runs `logOffPlan`:
    - The name, with ", <n> servings" added when the stepper is above 1.
    - Calories and protein: per serving × servings, rounded to whole numbers.
    - Category: from a barcode, "drink" when OFF's `categories_tags` holds `en:beverages`, otherwise "snack". From a label, "snack".
    - Relaxed off.

### Open Food Facts (`app/ai/off.server.ts`)

- `GET https://world.openfoodfacts.org/api/v2/product/<code>?fields=code,product_name,brands,serving_size,serving_quantity,nutriments,categories_tags`, with `User-Agent: TheCorner/2.0 (https://kampduh.com)` and a 6 second timeout.
- **The name:** the first brand and the product name, trimmed to 80 characters.
- **Per serving:** `energy-kcal_serving` and `proteins_serving` when present. Otherwise the per-100 g numbers times `serving_quantity` / 100. Otherwise per 100 g with no serving. Calories from `energy-kj` / 4.184 when only kJ is given.
- **No calories at all** counts as not found.
- **Cache:** the Workers Cache API (`caches.default`) under `https://kampduh.com/__off/<code>`. A hit is kept 30 days, a miss 1 day. The Worker runs in one pinned region, so one cache serves both people.
- **OFF down or slow:** the phone shows the not-found view with "Open Food Facts didn't answer. Try again in a minute." in place of the listing line.

### The barcode decoder

- The `barcode-detector` package's ponyfill (`barcode-detector/ponyfill`), which wraps zxing-wasm behind the standard `BarcodeDetector` API. iOS browsers are WebKit, which has no native `BarcodeDetector`.
- Formats: `ean_13`, `ean_8`, `upc_a`, `upc_e`.
- **Loaded only when Scan opens**, with a dynamic `import()`, so the main bundle doesn't grow.
- **The `.wasm` file is served from our own assets.** The library fetches it from jsDelivr by default, which breaks offline loading and adds a third-party request. `prepareZXingModule` points `locateFile` at the copy in `public/`, and the service worker precaches it.

## 4. Tell Rocky (option 4B)

### Where it opens

- **Today:** a "Tell Rocky something" line at the bottom of Today's Rocky card: a 1 px `on-ink` rule above, a 44 px row, Barlow 600 16 in paper, and a right chevron. `RockyCard` gains an optional `action` prop for it. It shows only when the AI is on and available.
- **Settings:** "+ Tell Rocky something" under What Rocky knows, always.

### The sheet, AI on

- **Title:** "Tell Rocky".
- A 3-line text box, 500 characters at most, placeholder "Sore shoulder, travelling Thursday, anything Rocky should know". An outline "Send" sits under it, right-aligned.
- While waiting (up to 20 seconds) Send reads "Reading" and is disabled. Offline, Send is disabled and reads "Needs a signal". The text stays in the box.
- **The result line** in ink-3 15:
    - "Rocky suggests 2 changes. Nothing changes until you accept one."
    - "Rocky suggests 1 change. Nothing changes until you accept it."
- **A card per proposal** (raised, radius 6, 16 px padding): a bold title, an ink-3 subline, then an outline "Accept" and a quiet "Dismiss".
    - **Accept** runs the change. The card then collapses to one muted line: "Swapped.", "Moved." or "Remembered."
    - **Dismiss** removes the card.
- **No proposals:** "Rocky has nothing to change for that. Keep it in What Rocky knows?" with an outline "Remember it", which saves the text as written.
- **A fallback or timeout:** "Rocky couldn't read that just now. Keep it as written?" with the same "Remember it".

### The sheet, AI off or no key (Settings only)

- **Title:** "Tell Rocky".
- The same text box, with "Rocky's AI is off, so this is saved as written." in ink-3 14 under it.
- An outline "Save" runs `rememberFact` with the text as typed, and closes the sheet.

### What the model is given (`/api/ai/tell`)

- Today's date and weekday.
- **`context`, built on the phone from its copy:** the next 8 days, each with its date, weekday, workout name (or "rest") and template id, whether it is logged, and each template's current lifts (exercise ids by position, with `exercise_overrides` applied, as the Plan screen shows them).
- **The library:** every exercise's id, name, group and equipment. Cached as one block.
- What Rocky knows.
- **The rules:** propose only from three kinds, at most three proposals. Swap only to an exercise in the library. Never propose calories, macros, steps or meals. Propose a fact when the note is worth keeping in mind beyond this week. Write a fact in the person's own words, short, and with no number they didn't type.

### Proposals (`app/ai/proposals.ts`)

| Kind | The model returns | Title | Subline | Accept runs |
|---|---|---|---|---|
| Swap | `templateId`, `replaces`, `exercise` | "Swap <current> for <new>" | "<Workout name>, from <Weekday>, <Mon D> on. Swap back from the workout any time." | `swapAlways { templateId, position, exercise }` |
| Move | `from`, `to` (dates) | "Move <Weekday>'s <workout> to <Weekday>" | "<Mon D> to <Mon D>." Adds "<Weekday>'s <workout> moves to <Weekday>." when the other day has one | `moveWorkout { a: from, b: to }` |
| Fact | `text` | "Remember: <text> (<Mon D>)" | "Goes in What Rocky knows. Forget it there any time." | `rememberFact { clientId, text, dated: true }` |

**Checks.** A proposal that fails a check is dropped without a word.
- **On the Worker, against the content:**
    - Ids exist: the template is in the plan, and both exercises are in the library.
    - The new exercise differs from the one it replaces.
    - Dates are valid.
    - A fact is 1 to 200 characters, and every number in it appears in the person's note.
- **On the phone, against its copy, just before showing:**
    - A swap's `replaces` is the template's current lift at some position. That position is what `swapAlways` gets.
    - A move passes `moveWorkout`'s own rules: same week, not in the past, one of the days has a workout, neither is logged.
    - A fact proposal is dropped when What Rocky knows already holds 30 facts.
- **Without a plan** (Catherine), only fact proposals are asked for and kept.
- **The named change checks again on push.** A refusal shows the Foundation notice, for example "Swap didn't save. That exercise isn't in the library."

## 5. Settings: the ROCKY section (mock `Settings`, option 6A, band 7)

Order, under the "ROCKY" section head:

1. **How Rocky talks:** the voice picker, unchanged.
2. **Rocky's AI:** a row with bold "Rocky's AI" over ink-2 14 copy, and the switch on the right.
    - Copy: "Writes Rocky's take, reads "Tell Rocky" notes and nutrition labels, and turns a described meal into a plate. Never changes your numbers. Off means written lines only."
    - The switch runs `setAi`.
    - When `status.available` is false, a line under it in ink-3 14: "Not set up on this server yet, so Rocky uses written lines."
3. **What Rocky knows:** bold label, then one row per fact, oldest first:
    - The text (Barlow 15 / 1.35), with " (<Mon D>)" from `created_at` when the fact is `dated`.
    - A 44 px "×" button labelled "Forget: <text>", which runs `forgetFact`.
    - **Tapping the text** turns the row into a field with the text, an outline "Save" (runs `editFact`) and a quiet "Cancel".
    - **No facts:** "Nothing yet. Tell Rocky something worth keeping in mind."
4. **"+ Tell Rocky something"**: an outline button that opens the Tell Rocky sheet.
    - At 30 facts it stays, and the sheet shows "Rocky knows 30 things. Forget one to add another." in place of the box when the AI is off.

## 6. Data

One migration, in P5a. It runs on both person databases (`drizzle/`). `rocky-core` is untouched.

### `profile`

- Gains `ai` (integer, not null, default 1).
- **Readers:** `aiOn(rows)` in `app/settings/model.ts` treats a missing column as on, so a phone that hasn't pulled the row since the migration reads on.

### `facts` (new, synced)

| Column | Notes |
|---|---|
| `client_id` | Primary key, made on the phone |
| `text` | 1 to 200 characters |
| `dated` | Integer 0 or 1. 1 for facts accepted from a proposal, which show their date |
| `created_at`, `updated_at` | ISO times |

Nothing is seeded. Kameron adds his own facts from Settings.

### `takes` (new, synced; written only by the Worker)

| Column | Notes |
|---|---|
| `week_start` | Primary key, the Monday of the week under review |
| `text` | The take |
| `hash` | `takeHash` of the lines and voice it was written from |
| `voice` | `corner` or `plain` |
| `writes` | Writes this week, for the cap of 3 |
| `written_at` | ISO time |

### `ai_calls` (new, server only, not synced)

| Column | Notes |
|---|---|
| `id` | Integer primary key |
| `at` | ISO time |
| `kind` | `take`, `describe`, `label` or `tell` |
| `ok` | 1 when the reply was used |
| `reason` | Null, or `no-reply`, `refusal`, `max-tokens`, `bad-output`, `numbers`, `length`, `characters`, `rate-limit`, `error` |
| `input_tokens`, `output_tokens`, `cache_read_tokens` | From `usage` |

The daily caps count today's rows (Chicago day) of each kind. Backups pick up the new tables, as they dump every table.

### Sync

- `SYNCED` gains `{ name: "facts", ...cols("client_id") }` and `{ name: "takes", ...cols("week_start") }`.
- The migration's triggers for both come from `scripts/gen-sync-triggers.ts facts takes`.
- **`SYNC_SCHEMA` stays as Project 4 leaves it.** No row key changes, and both new tables start empty.

### Content: the food table

- **`content/food-table.json`**, about 300 foods. Each has:
    - `id`, `name`, `aliases` (for search and for the model).
    - `group`: one of `protein`, `starch`, `beans`, `tortilla-bread`, `vegetable`, `fruit`, `dairy`, `fat-oil`, `sauce`, `snack-sweet`, `drink`, `fast-food`.
    - `fdcId` and `source` (`foundation`, `sr-legacy` or `fndds`).
    - `kcalPer100`, `proteinPer100`.
    - `portions`: a few `{ label, g }`, for example `{ "label": "1 large tortilla", "g": 64 }`.
- **It covers:**
    - The plan's foods, cooked and raw.
    - Common restaurant components: Chipotle-style proteins, rice, beans, fajita veg, salsas, guacamole, queso, tortillas.
    - Burgers, fries, pizza and nuggets from SR Legacy's "Fast foods" group.
    - Breads, sauces and dressings, cheeses.
    - Beer, wine, spirits, soda and the common coffee drinks.
- **`content/food-table.source.json`** is the hand-kept list (id, name, aliases, group, fdcId, portions).
- **`scripts/build-food-table.ts`** reads it and FoodData Central's bulk JSON downloads (Foundation, SR Legacy, FNDDS; no API key) and writes `content/food-table.json` with the numbers filled in. Kameron or an agent runs it by hand, and the output is committed.
- **`foods.json` is unchanged.** It stays the plan's pantry with roles and grocery sections.
- **The describe prompt** carries each food as one line: "<id> | <name> | <aliases> | <portions>". No calorie numbers are sent, so the model has none to repeat.

### Named changes

New and changed mutators in `app/sync/mutators.ts`:

| Mutator | What it does |
|---|---|
| `setAi { on }` | Writes `profile.ai`. It spreads the existing profile row first, because the phone's copy replaces the whole row on `put` |
| `setVoice { voice }` | Changed: spreads the existing profile row the same way, so a voice change doesn't drop `ai` on the phone's copy |
| `rememberFact { clientId, text, dated }` | Adds a fact. Text trimmed, 1 to 200 characters. Refused at 30 facts: "Rocky knows 30 things. Forget one first." |
| `editFact { key, text }` | Changes a fact's text and `updated_at`. An empty text forgets it |
| `forgetFact { key }` | Deletes a fact |
| `logOffPlan` | Unchanged. The plate and the product card both log through it |
| `swapAlways`, `moveWorkout` | Unchanged. Accepted proposals run them as the workout screens do |

`MUTATION_LABELS` gains "AI setting", "Fact", "Fact change" and "Fact removal".

## 7. Errors and edge cases

| Situation | Behaviour |
|---|---|
| No `ANTHROPIC_API_KEY` | `status.available` is false. Every AI entry point hides as if the switch were off. The take is the rule take. Settings says it isn't set up |
| The AI switch off | No AI request leaves the phone. The Worker also refuses with 403 if one does. A stored AI take is not shown |
| Offline | The take is the rule take. Describe it and Scan read "Needs a signal". Tell Rocky's Send is disabled. Barcode needs a signal too |
| The model is slow | The phone stops waiting at 10 seconds (take) or 20 seconds (the rest) and takes the fallback |
| The take quotes a number not in the lines | `checkTake` fails on the Worker. Nothing is stored and the rule take shows |
| Numbers change after the take was written | The hash changes. The next open writes a new take, up to 3 a week |
| A stored take no longer passes on the phone | The rule take shows. It can only happen if `takeLines` changes in a deploy |
| Describe maps a food to an id not in the table | The row is unmatched |
| Describe returns 13 or more items, or grams past 2,000 | Items past 12 are dropped and grams are clamped |
| A label with no Nutrition Facts panel | "Couldn't read that label." view |
| Label numbers fail the sanity check | The form opens filled in, with "These numbers look off." |
| A barcode with a bad check digit | Ignored; scanning goes on |
| OFF has the product but no calories | Not found, with the label offered |
| OFF is down | Not found with "Open Food Facts didn't answer." Nothing is cached for that code |
| The camera is denied | The blocked view, with the label and typing still offered |
| A swap proposal names an exercise outside the library | Dropped on the Worker |
| A swap's `replaces` isn't in the workout any more | Dropped on the phone |
| A move proposal crosses weeks or touches a logged day | Dropped on the phone, refused again by `moveWorkout` |
| Two phones accept the same swap | `swapAlways` is idempotent |
| A fact proposal with a number the person didn't type | Dropped |
| 30 facts | `rememberFact` refuses. Fact proposals are dropped, and the AI-off sheet shows the limit |
| Catherine (no plan) | No check-in, so no take. Tell Rocky proposes facts only. Describe, Scan and What Rocky knows work |
| A daily cap is reached | The route answers 429 with a fallback. The phone shows that path's fallback copy |
| Anthropic refuses (`stop_reason: "refusal"`) | The fallback. Logged as `refusal` |

## 8. Rollout

Project 5 starts after Project 4 has shipped, because it builds on the check-in page, `digest`, `ruleTake` and the Worker endpoint pattern. Each step deploys on its own, and the app works fully after each one.

1. **P5a: data, plumbing and the Settings section.** Carries the migration.
    - **Migration:** `profile.ai`, `facts`, `takes`, `ai_calls`, triggers for `facts` and `takes`. Kameron runs both remote migrations.
    - **Mutators:** `setAi`, `rememberFact`, `editFact`, `forgetFact`, and `setVoice`'s spread.
    - **Worker:** `workers/ai.ts` with `status` and the four AI routes, `claude.server.ts`, prompts, caps and `ai_calls`. Nothing on the phone calls the AI routes yet.
    - **Settings:** the switch, What Rocky knows, and "+ Tell Rocky something" saving as written (the AI-off sheet) for everyone until P5c.
    - Kameron sets `ANTHROPIC_API_KEY` whenever he likes. Nothing waits on it.
2. **P5b: Rocky's take.**
    - `takeLines`, `checkTake`, `useTake` and the card's AI paragraph on the check-in.
    - With no key, the rule take keeps showing.
3. **P5c: Tell Rocky.**
    - The sheet, proposals, and the line on Today's Rocky card.
    - Settings' button opens the AI sheet when the AI is on.
4. **P5d: Scan and the new first view.**
    - The 1C layout, the barcode decoder, `/api/food/barcode`, the product card, label reading, and the not-found and blocked views.
    - The Describe it row is not shown until P5e.
5. **P5e: Describe it.**
    - The food table and its build script, `/api/ai/describe` wired to the phone, the plate, and the food picker.

## Testing

**Unit:**
- **Numbers:** digits with commas and decimals, signs, number words, "half" and "quarter", "one" ignored.
- **`checkTake`:**
    - The `CheckInWeek` mock's take passes against matching lines.
    - It fails with a number not in the lines, with five sentences, past 420 characters, with an em dash, and with an emoji.
    - A number from What Rocky knows fails.
- **`takeLines`:**
    - Each call kind's line.
    - A digest missing waist leaves the Waist line out.
    - The hash changes with the voice and with any number.
- **Plate:**
    - Row math and rounding, and the total equals the sum of the rows.
    - Typed numbers scale with grams.
    - "+ oil" twice adds 20 g to one row.
    - An unmatched row with no numbers isn't counted.
- **Barcode:** check digits for each GTIN length, and the grouping.
- **OFF parse:** per serving, per 100 g times serving quantity, per 100 g only, kJ only, no calories, and the beverages category.
- **Label sanity:** in range, protein too high, calories too high.
- **Proposals:**
    - Each kind's copy.
    - The Worker checks drop a non-library exercise, an unknown template, a same-exercise swap, and a fact with an untyped number.
    - The phone checks drop a stale `replaces`, a cross-week move and a logged day.
    - Catherine keeps only facts.
- **Mutators** against the in-memory store:
    - `setAi` keeps the voice, and `setVoice` keeps `ai`.
    - `rememberFact` trims text and refuses at 30.
    - `editFact` with empty text forgets.
- **Content:** every food-table entry has a unique id, a known group, an `fdcId`, `kcalPer100` from 0 to 900, `proteinPer100` from 0 to 100, protein × 4 no more than kcal × 1.1, and at least one portion.
- **View models:**
    - The off-plan first view for AI on, AI off, no key and offline.
    - The ROCKY section with and without facts and with no key.
    - `useTake`'s choice for each case in section 2.

**Workers (real D1):**
- **The migration:**
    - The existing profile row reads `ai` 1.
    - Writes to `facts` and `takes` are logged in `changes`.
    - `ai_calls` exists and is not synced.
- **Every route:** 401 without a session, 503 with no key, 403 with `ai` 0, and 429 past the cap.
- **`/api/ai/take`** with a fake `AiClient`:
    - It stores the row and returns the text.
    - The same hash returns the stored text without calling the client.
    - A new hash rewrites it, and the fourth write in a week is refused.
    - A reply with a stray number stores nothing and logs `numbers`.
- **`/api/ai/describe`:** an unknown food id comes back as null, and grams are clamped.
- **`/api/ai/tell`:** invalid proposals are dropped.
- **`/api/food/barcode`:** a found code is parsed, the second request is served from the cache with no outbound fetch, and a miss is cached.
- **Each new mutator** applies cleanly through push.
- **`ai_calls`** gets one row per call, with usage numbers.

**A real API check (`scripts/ai-check.ts`, about $0.10 a run):**
- Run by hand with the key in `.dev.vars`, against Anthropic itself.
- **The take:** a fixture digest in each voice. The take passes `checkTake`.
- **Describe:** "Chipotle bowl, double chicken, white rice, black beans, fajita veg, salsa, guac" maps at least 6 of 7 foods to table ids. A second run inside 5 minutes shows `cache_read_input_tokens` above 0.
- **Label:** `test/fixtures/label-protein-bar.jpg` reads the printed calories and protein exactly.
- **Tell:** "My left shoulder is sore, no overhead pressing this week" proposes only library exercises, and at least one fact.
- It prints each reply, the check results and the token usage, and exits non-zero on any failure.

**Process:** one full-suite run before each PR.

**On the wire (kampduh.com):**
- After each deploy, fetch `https://kampduh.com/`, find the route chunks under `/assets/`, and grep them for the step's copy:
    - P5a: "What Rocky knows".
    - P5b: "/api/ai/take".
    - P5c: "Nothing changes until you accept".
    - P5d: "Not in your usuals?" and "Read the label instead".
    - P5e: "Build the plate".
- `curl` `/api/food/barcode/<a known UPC>` with a session cookie returns `found: true`, and a second call is faster.
- **Once Kameron has set the secret:**
    - `/api/ai/status` returns `available: true`.
    - Opening Sunday's check-in writes a `takes` row: `wrangler d1 execute rocky-db --remote --command "select week_start, length(text), writes from takes"`.
    - `select kind, ok, reason, input_tokens, output_tokens, cache_read_tokens from ai_calls order by id desc limit 10` shows `ok` 1 with token counts close to the cost table.

## Calls made in this spec

Choices the decisions and mocks left open, settled here to stay consistent with them:

1. **A swap proposal is "from now on", not "this week".** Option 4B's mock drew a one-week swap ("Next week goes back to normal"), but no existing named change swaps a future workout's exercise for one week. Per the decision, Accept runs `swapAlways`, and the subline says how to swap back. The board's Landmine press example is moot: only library exercises can be proposed.
2. **Takes are stored in a synced `takes` table keyed by week.** A take is rewritten only when the numbers or the voice change, at most 3 times a week. The phone re-runs the number check before showing a stored take.
3. **While the first take is being written,** the card shows static placeholder bars for up to 10 seconds, then the rule take. No retry when the check fails.
4. **How the number check reads text:** digits and the words two to ninety, hundred, thousand, half and quarter. "One" is ignored. Numbers from What Rocky knows aren't allowed in the take.
5. **The model is also given `ruleTake`'s win and fix**, so the AI narrates the same points the rules picked.
6. **Facts:** 200 characters at most, 30 in all, edited inline, nothing seeded. Facts accepted from a proposal show their date. A fact proposal may only use numbers the person typed.
7. **The Today line for Tell Rocky hides with the AI off.** Only Settings' button stays, and it saves the text as written.
8. **The server-side `fallbacks` parameter is not used.** On Sonnet 5.5 it only reroutes `cyber` and `frontier_llm` declines, which a meal, a label or a check-in won't trigger. A refusal falls back to rules like any other failure.
9. **Thinking is left adaptive.** Effort is low for describe, label and tell, and medium for the take.
10. **`GET /api/ai/status`** lets the phone hide AI entry points when there is no key. Settings says so.
11. **Daily caps per person** (30 describes, 20 labels, 20 tells, 3 takes a week) and a server-only `ai_calls` table for usage and failure reasons.
12. **The barcode cache is the Workers Cache API** (30 days for a hit, 1 day for a miss), so there is no D1 table.
13. **The barcode decoder is the `barcode-detector` ponyfill,** loaded on demand, with its wasm self-hosted.
14. **The product card's stepper says "Servings",** not the mock's "Bottles", because OFF has no reliable unit noun. With no serving size it becomes a grams stepper.
15. **Category:**
    - Barcode: drink for OFF beverages, snack otherwise.
    - Label: snack.
    - Describe: the model's guess, and the plate gains a Category select the 2A mock left out, for the same reason Project 3 kept it (the dessert allowance needs it).
16. **A label photo with no printed name** asks for one on the card.
17. **A label read that fails the sanity check** opens the form with a warning.
18. **Photos are downscaled on the phone** to 1,568 px JPEG before upload.
19. **The food table is a separate `content/food-table.json`,** built by a script from FDC bulk downloads (Foundation, SR Legacy including its Fast foods group, FNDDS). `foods.json` stays the plan's pantry. The prompt gets ids and names, never numbers.
20. **Plate details:**
    - Stepper steps of 10 g (5 g at 50 g and under).
    - Typed numbers on an unmatched row scale with grams.
    - "+ oil" is 10 g of cooking oil. "+ sauce" and "+ drink" open the picker filtered.
    - The title can be renamed.
    - The total is the sum of the rounded rows.
21. **The not-counted note** reads "<Name> isn't counted until it has numbers." rather than the mock's "they have", so a single food reads right.
22. **`setVoice` now spreads the profile row,** so it and `setAi` can't wipe each other on the phone's copy.
23. **`ANTHROPIC_API_KEY` stays out of `secrets.required`** and is typed optional, so deploys never need it.
24. **AI entry points need a signal.** They show "Needs a signal" offline, as the Meal screen's photo button does.
25. **Open Food Facts gets a User-Agent naming the app and site,** with no email address.
26. **Project 5 ships after Project 4.** Only P5a carries a migration.
