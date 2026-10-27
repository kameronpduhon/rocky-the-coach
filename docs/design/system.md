# Rocky design system: Corner revised

Measured from the approved mocks on the canvas at https://claude.ai/artifact/65WeReuGH5ZageJng9K6nq (artboards Corner2, Corner2Lunch, Settings, WorkoutSet and the rest). When this file and a mock disagree, the mock wins. Fix this file.

Tokens live in `app/styles/tokens.css`, and Tailwind exposes each as a colour (`bg-paper`, `text-ink-3`, `border-border`). Light only.

## Colour

| Token | Hex | Only for |
|---|---|---|
| `paper` | #F3EEE4 | Page background, sheets, the docked action bar |
| `raised` | #FBF8F2 | The highlighted "next" row, set cards, cards |
| `well` | #E8E0D2 | Recessed fills |
| `field` | #FFFFFF | Text inputs and copy fields |
| `ink` | #1A1714 | Text, 2 px rules under section heads, the Rocky card, selected choices, the "on" switch, done marks |
| `ink-2` | #3A332A | Body copy in callouts and cards |
| `ink-3` | #4A443C | Meta lines, secondary labels, quiet links |
| `muted` | #6B6358 | Past rows, inactive tabs, quiet right-hand labels |
| `rule` | #DED5C5 | 1 px row dividers |
| `border` | #8F8677 | 1.5 px outlines of controls and empty cells. Never text. |
| `underline` | #B9AF9E | Underline colour of quiet text links |
| `red` / `on-red` | #BF3326 / #FFFFFF | The one primary action per screen, live state (rest timer, current lift bar, today, active tab, "NEXT", the protein target tick), focus ring |
| `brass-tag` / `brass-on` | #7E6020 / #FBF6EA | The "GO UP" tag |
| `brass-border` / `brass-fill` | #9C7A2E / #F8F1E1 | The progression callout. Progression only. |
| `coral` | #F08A7E | The label on the dark Rocky card |
| `on-ink-2` | #D9D0C0 | Secondary text on an ink fill |

Never red for food over target. Over target shows in the same ink as under.

## Type

Anton (display), Barlow (body), Barlow Semi Condensed (every number, button and tab, always tabular).

| Role | Face, size / line-height, weight | Colour |
|---|---|---|
| Poster | Anton 64 to 68 / 0.92, uppercase | ink |
| Screen title | Anton 48 / 1, uppercase, ends with a period ("SETTINGS.") | ink |
| Section head | Anton 28, with a 2 px ink rule 6 px below it. An optional right-hand note in Semi Condensed 600 15, muted. | ink |
| Meta line under a poster | Semi Condensed 600 18 | ink-3 |
| Date and streak header | Semi Condensed 700 16, 0.04em | ink |
| Big number | Semi Condensed 700 34 / 1 (set logger 56), with the unit at 600 18 in ink-3 | ink |
| Primary button | Semi Condensed 700 19 (gym 21), uppercase, 0.04em | on-red |
| Outline button | Semi Condensed 700 16 (or Barlow 600 15 to 16 for sentence-case labels) | ink |
| Tab | Semi Condensed 700 15, uppercase, 0.04em | red active, muted otherwise |
| Card label | Semi Condensed 700 14, uppercase, 0.06em | coral on ink, ink-3 on raised |
| Rocky card body | Barlow 500 19 / 1.4 | paper |
| Body | Barlow 400 16 (row titles 17 700) | ink |
| Secondary | Barlow 400 14 to 15 | ink-3, or muted for past rows |
| Micro label | Semi Condensed 700 12 to 13 | 12 only for "NEXT" and chart axis labels |

No label above a heading. Small text is 13 px or more, except the two 12 px micro labels above.

## Shape and spacing

- Page gutter 20 px. Gap between page sections 26 to 32 px. Gap inside a section 14 to 16 px.
- Radius 6 px on buttons, cards, callouts and fields, and 3 px on tags and week cells. Circles (meal checks, switch thumbs) are fully round.
- Borders 1.5 px on controls, 2 px on selected choices, the set cards and section rules, and 1 px on row dividers.

## Controls

| Control | Spec |
|---|---|
| Primary button | 56 px tall (64 px in the gym), red fill, radius 6, label as above. One per screen. |
| Outline button | 44 or 56 px tall, 1.5 px ink border, transparent |
| Quiet link | 44 px tall target, Barlow 600 16, ink-3, underlined 4 px below in `underline` |
| Icon button | 44 x 44, 1.5 px `border` outline, radius 6, 18 to 20 px ink icon |
| Switch | 50 x 30 track. On: ink fill with a 24 px paper thumb. Off: 1.5 px `border` outline with a 23 px `border` thumb. In a 44 px target. |
| Choice pair | Grid of two, min 64 px tall when it has a subline. Selected: ink fill, 2 px ink border, paper text. Unselected: 1.5 px `border` outline. |
| Field | 48 px min, field background, 1.5 px `border` outline, radius 6. A Copy action sits inside as an underlined text button. |
| Meal check | 44 px circle, 1.5 px `border` outline. Eaten rows collapse to one line with an ink check and "Eaten". |
| Stepper | 48 px tall pair of outline ink buttons under a big number |
| Progression callout | `brass-fill`, 1.5 px `brass-border`, radius 6, a "GO UP" tag, then ink-2 body 16 / 1.4 |
| Rocky card | Ink fill, radius 6, 18 px padding, coral card label, paper body |
| Row | min 48 px (60 with a subline), 1 px `rule` divider above. The "next" row has a raised fill and a 2 px ink rule above. |
| Tab bar | Fixed bottom, paper, 2 px ink rule above, 4 text tabs 52 px tall, safe-area padding below |
| Docked action bar (gym) | Paper, 2 px ink rule above, a one-line "then" note in ink-3 15, the primary button |

## Behaviour

- Tap targets of at least 44 px.
- Press feedback on the frame the tap lands (opacity 0.55 on `:active`).
- Focus ring: 2.5 px red, offset 2 px.
- Selection: ink background, paper text.
- Motion: one moment only. A check landing (a spring via CSS `linear()`) and the protein bar filling. Nothing animates on load. Everything stops under `prefers-reduced-motion`.
