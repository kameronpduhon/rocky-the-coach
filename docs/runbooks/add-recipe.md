# Adding a recipe

Kameron sends a recipe in a Claude Code session (screenshot, caption text, or link). Follow every step; the tests enforce the hard rules.

1. **Read the recipe.** List every ingredient with its amount and the number of servings.
2. **Map ingredients to foods** in `content/foods.json`.
   - Missing food: look it up in USDA FoodData Central. Prefer SR Legacy (stable ids, energy present), then Foundation. Record `fdcId`, `source` (`sr-legacy` or `foundation`), the `state` it is weighed in (`raw`, `cooked`, `as-is`), `kcalPer100` and `proteinPer100`, and a grocery `section` (`meat-seafood`, `dairy-eggs`, `produce`, `pantry`). Branded sauces without an FDC entry use the label and `source: "label"`, `fdcId: null`.
   - Seasonings with negligible calories (salt, pepper, spices, garlic powder, lemon juice) go in the steps, not the ingredient list.
3. **Convert to grams in the weighed state.** Meat and fish raw, rice cooked, potatoes raw. Never leave cups or "1 chicken breast"; use grams. Add a `note` when a count helps ("3 eggs").
4. **Fix processed ingredients.** Swap seed oils for butter, olive oil, or avocado oil; swap sugary sauces for honey-based or whole-food versions; drop ultra-processed items. Mention each swap in the commit message.
5. **Pick the pool and scale one portion** to the plan's targets (the ranges in brackets are what `content/plan.json` `poolRanges` enforces):

   | Pool | Calories | Protein |
   |---|---|---|
   | breakfast | ~600 (450 to 750) | 55 g+ (40 minimum) |
   | main (lunch, dinner) | ~650 (500 to 800) | 55 g+ (40 minimum) |
   | snack | 180 to 280 (150 to 300) | 20 g+ (15 minimum) |
   | dessert | under 250 (100 to 260) | any |

   Scale the protein ingredient first, then adjust carbs and fats to land the calories.
6. **Set the mode.** `any` only if every ingredient fits the weekday animal-based rules (meat, fish, eggs, dairy, fruit, honey, potatoes, rice). Anything with other vegetables, grains, or oils as a main component is `weekend`. Add `"ground-beef"` to `tags` if it uses ground beef.
7. **Write the file** `content/meals/<slug>.json` (slug = kebab-case name) with `source` set to the creator or link, and short steps (one action per step).
8. **Run** `npx vitest run --project unit tests/unit/content.test.ts`. Fix anything out of range.
9. **Commit and push** (`Add recipe: <name> from <source>`). Workers Builds deploys it; it joins the rotation from the next generated week, and it can be swapped in today from the Meal screen.
