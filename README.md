# DTC Economics Model

A calculator page for https://kappastrategy.com/dtc-economics-model/.

It is written for consumer products leadership teams who are evaluating or running a direct-to-consumer (DTC) channel. Users enter monthly assumptions and see:
- revenue and contribution
- operating profit
- customer acquisition cost
- a 12-month projection
- which assumptions have the largest effect on profit

The page is meant as a credibility tool for buyers already in conversation with Ken, not a lead-generation funnel. The copy is plain and executive in tone, and the page carries the site's standard closing block.

It is an **illustrative planning tool, not financial advice**.

## Files

| Path | Purpose |
|---|---|
| `dtc-economics-model/index.html` | The page: site header and footer, scoped CSS, UI script, FAQ, SEO tags and closing block. |
| `dtc-economics-model/model.js` | Pure calculation engine (ES module, no DOM). |
| `tests/model.test.js` | `node:test` unit tests. |

The `dtc-economics-model/` folder is copied as-is into the site repo (`KBkappa/kappa-strategy-website`) as `site/dtc-economics-model/`. See "Integration" below.

## Running

Requires Node 18 or later. Nothing to install.

```bash
npm test     # or: node --test tests/model.test.js
```

To preview with the real site styles, serve the site with the folder copied in:

```bash
cp -r dtc-economics-model ../kappa-strategy-website/site/
cd ../kappa-strategy-website/site && npx serve .   # or: python3 -m http.server
# open http://localhost:3000/dtc-economics-model/
```

Opened on its own, without the site, the page still works. It uses fallback values for the site's colors and fonts, but the header logo and fonts won't load. `model.js` is an ES module, so the page must be served over HTTP. Browsers block module imports over `file://`.

## How it integrates with the site

The page was matched against `site/dtc-strategy-business-cases/index.html` in the site repo.

- **Header and footer:** copied unchanged, between `<!-- HEADER -->` and `<!-- FOOTER -->` comments. If the site navigation changes, update these blocks too.
- **Head:** the same favicon, font preload, `site.css`, Google tag, `site.js` and `technical.js` references as the service pages, plus page-specific SEO tags.
- **CSS:** every rule is scoped under `.dtc-model`. The calculator's tokens map to the site's variables, with fallbacks so the page still works standalone:

  ```css
  --dm-blue: var(--blue, #1d4ed8);       --dm-navy: var(--blue-deep, #0b1f3a);
  --dm-brass: var(--brass, #9a6a1f);     --dm-slate: var(--slate, #475569);
  --dm-display: var(--display, "Newsreader", ...);  --dm-body: var(--body, Inter, ...);
  ```

  Chart and status colors (`--dm-chart-*`, `--dm-good/warn/bad`) are defined at the top of the `<style>` block. The page resets `site.css`'s global `section { padding }` inside `.dtc-model`, and makes `[hidden]` always win over the site's button display rules.
- **Fonts:** Newsreader for headings and Inter for body, both self-hosted through `site.css`'s `@font-face` rules. Nothing loads from a font CDN.
- **Buttons:** the closing block uses the site's own `.button .button-primary` and `.button-secondary` classes. Calculator controls use scoped `.dm-btn` styles.

## Privacy and network

- No cookies, localStorage or sessionStorage, and no `fetch` or other network calls from the calculator. Inputs never leave the browser unless the user copies a scenario link.
- The only outside request on the page is the site-wide Google tag (`gtag.js`, G-95KHW9N730), which is identical on every page. Remove that block if this page should be tag-free.

## Analytics

The page follows the site's analytics pattern:

- **Links** carry `data-analytics-event` and `data-analytics-placement` attributes. The site's existing `site.js` sends these clicks through `gtag`, adding `placement`, `section` and `link_url`. The calculator adds no click handler of its own, so clicks are never counted twice.
- **Interactive events** call `gtag('event', name, params)` only when `window.gtag` is a function.

| Event | Fired by | Parameters |
|---|---|---|
| `dtc_model_interaction` | The first input change per page view | none |
| `dtc_model_preset` | Choosing a scenario from the dropdown | `preset_name`: `launch` \| `scaling` \| `established` |
| `dtc_model_share` | "Copy scenario link" or "Copy summary" | `share_type`: `scenario_link` \| `summary` |
| `intro_call_click` | "Arrange a 30-minute conversation" (`site.js`) | `placement: dtc_model`, `section: dtc-model-contact`, `link_url` |
| `contact_cta_click` | "Send a note instead" (`site.js`) | `placement: dtc_model`, `section: dtc-model-contact`, `link_url` |

No input values, results or personal data are sent. The header's "Start a conversation" links keep their existing `header` and `mobile_menu` placements.

## Scenario links

**Copy scenario link** puts every input into the URL fragment and copies the link, for example:

```
https://kappastrategy.com/dtc-economics-model/#s=1,80000,0.022,85,0.03,0.45,1.1,5000,0.25,0.32,9,0.03,0.06,40000
```

- The first value is a format version (`1`). The rest follow `SCENARIO_FIELDS` in `model.js`, in model units (decimals for rates).
- Opening the link restores the scenario, shown in the dropdown as "Scenario from shared link". Reset returns to the link's values.
- Fragments are not sent to the server, so scenarios never appear in server logs. GA4 page views may record the full URL including the fragment, but the fragment holds only model assumptions, never personal data.
- Invalid or tampered links are ignored, and the default scenario loads instead. Valid links are passed through the same input limits as typed values.
- To add a field, append it to `SCENARIO_FIELDS` and increase `SCENARIO_VERSION`. Older links will then be ignored rather than misread.

## Inputs (all monthly)

| Section | Input | Model key | Notes |
|---|---|---|---|
| Traffic and conversion | Monthly sessions | `sessions` | |
| | Conversion rate | `cvr` | Orders ÷ sessions |
| | Average order value | `aov` | After discounts |
| | Monthly traffic growth | `trafficGrowth` | Projection only. Can be negative. |
| Acquisition | Paid share of sessions | `paidShare` | |
| | Cost per paid session | `cpc` | Blended cost per click |
| | Other monthly marketing | `otherMarketing` | Agency, creators, tools |
| Retention | Returning-customer share of orders | `returningShare` | Shopify "returning customer rate". Capped at 90%. |
| Unit costs | COGS % of net revenue | `cogsPct` | |
| | Fulfillment and shipping per order | `fulfillmentPerOrder` | Net of shipping charged |
| | Payment processing % of gross | `processingPct` | |
| | Returns and refunds % of gross | `returnsPct` | |
| Overhead | Fixed operating costs | `fixedCosts` | Team, software, rent |

The UI shows percentages as whole numbers (2.2), while `model.js` uses decimals (0.022). Each input has a slider and a number box. The number box can go beyond the slider's range, except for percentages, which are capped at the slider's maximum.

## Scenarios

These are illustrative scenarios, not industry benchmarks. The default is "Scaling DTC channel".

| Field | DTC launch | Scaling DTC channel | Established DTC business |
|---|---|---|---|
| Sessions | 20,000 | 80,000 | 250,000 |
| Conversion rate | 1.8% | 2.2% | 2.6% |
| AOV | $75 | $85 | $95 |
| Traffic growth | 6% | 3% | 1.5% |
| Paid share | 50% | 45% | 35% |
| CPC | $0.90 | $1.10 | $1.25 |
| Other marketing | $2,000 | $5,000 | $15,000 |
| Returning share | 15% | 25% | 40% |
| COGS | 35% | 32% | 30% |
| Fulfillment / order | $10 | $9 | $8.50 |
| Processing | 3% | 3% | 2.9% |
| Returns | 7% | 6% | 7% |
| Fixed costs | $12,000 | $40,000 | $120,000 |

## Formulas (monthly)

```
Orders                  = Sessions × CVR
Gross revenue           = Orders × AOV
Net revenue             = Gross × (1 − returns%)
COGS                    = Net × COGS%                      (returned items assumed restocked)
Fulfillment             = Orders × fulfillment per order
Payment fees            = Gross × processing%              (fees not refunded on returns)
CM1                     = Net − COGS − Fulfillment − Payment fees   (contribution before marketing)
Ad spend                = Sessions × paid share × CPC
Marketing               = Ad spend + other marketing
CM2                     = CM1 − Marketing                  (contribution after marketing)
Operating profit        = CM2 − Fixed costs                (pre-tax; excludes inventory and working capital)
Operating margin        = Operating profit ÷ Net revenue

New customers           = Orders × (1 − returning share)
Blended CAC             = Marketing ÷ New customers
Contribution per order  = CM1 ÷ Orders
First-order profit      = Contribution per order − CAC
Lifetime orders         = 1 ÷ (1 − returning share)        (steady-state estimate)
LTV                     = Contribution per order × Lifetime orders
LTV:CAC                 = LTV ÷ CAC
Orders to recover CAC   = CAC ÷ Contribution per order
MER                     = Net revenue ÷ Marketing
Break-even CVR          = CVR × (Marketing + Fixed) ÷ CM1  (same traffic and spend)
Break-even net revenue  = (Marketing + Fixed) ÷ (CM1 ÷ Net revenue)
```

**Division guards.** Every division goes through `safeDiv`, which returns `null` instead of NaN or Infinity. The UI shows `null` as "n/a", or "Not reachable" for break-even values:

- **Break-even CVR and break-even net revenue** are "Not reachable" when CM1 ≤ 0. Break-even CVR is also "Not reachable" when the required rate is above 100%.
- **CAC** is n/a when there are no new customers.
- **LTV:CAC** is n/a when CAC is 0 or n/a.
- **Orders to recover CAC** is "Not reachable" when contribution per order is 0 or less.
- **MER** is n/a when marketing is 0.

Inputs are also sanitized: non-numbers become 0, rates are clamped to 0–100%, and returning share is capped at 90%.

## 12-month projection

- Month 1 uses the current inputs. Sessions in month *m* = Sessions × (1 + growth)^(m−1).
- All rates stay constant. Ad spend scales with sessions. Other marketing and fixed costs stay flat.
- Outputs:
  - 12-month totals: net revenue, CM2, operating profit and new customers.
  - Month-12 net revenue and operating profit, annualized (× 12).
  - First profitable month: the first month with operating profit ≥ $0, or "Not within 12 months".
  - "Operating losses to fund before break-even (excludes inventory)": the lowest point of cumulative operating profit, shown as a positive amount, or $0 if cumulative profit never goes negative.

## Profit levers

Each lever improves one input by 10% on its own. The 12-month projection is rerun for each, and levers are ranked by the change in 12-month operating profit. The effects are not additive.

| Lever | Change |
|---|---|
| Sessions +10% | `sessions × 1.1` (ad spend scales too) |
| Conversion rate +10% | `cvr × 1.1` |
| AOV +10% | `aov × 1.1` |
| Returning-customer orders +10% | Orders × (1 + 0.1 × returning share). No added marketing; new customers unchanged. |
| COGS % −10% | `cogsPct × 0.9` |
| CPC −10% | `cpc × 0.9` |
| Fulfillment per order −10% | `fulfillmentPerOrder × 0.9` |
| Returns rate −10% | `returnsPct × 0.9` |
| Fixed costs −10% | `fixedCosts × 0.9` |

Sessions +10% can lower profit when paid traffic costs more than it contributes. The chart draws negative bars to the left of a zero line.

## Health checks (rules of thumb)

| Check | Green | Amber | Red |
|---|---|---|---|
| LTV:CAC | ≥ 3 | 1.5–3 | < 1.5 |
| First-order profit | ≥ $0 | < $0 | — |
| CM1 % of net revenue | ≥ 50% | 35–50% | < 35% |
| Operating profit | ≥ $0 | — | < $0 |

Each status is written out ("Green", "Amber", "Red"), so it doesn't depend on color alone. A check shows "n/a" when its value can't be calculated.

## Assumptions and limitations

- This is a steady-state model with no seasonality and no scale effects. All rates stay constant.
- Lifetime orders = 1 ÷ (1 − returning share). This treats today's returning share as a stable repeat rate. It ignores cohort timing, churn curves and discounting, so LTV is an estimate, not a cohort LTV.
- The returning share stays constant in the projection. In practice, fast traffic growth usually dilutes it.
- Operating profit excludes inventory, working capital, debt service and capital spending, so "operating losses to fund" is a floor, not a full cash requirement.
- All marketing, including retention marketing, counts toward blended CAC.

## Test expectations: one difference from the original brief

Every expected value for the "Scaling DTC channel" scenario (originally "Growth-stage") is reproduced exactly:
- orders 1,760
- gross revenue $149,600
- net revenue $140,624
- CM1 $75,296.32
- marketing $44,600
- operating profit −$9,303.68
- new customers 1,320
- CAC $33.79
- LTV:CAC 1.69
- MER 3.15
- break-even CVR 2.47%

The exception is **first profitable month: 9, not 10**. Under the brief's own projection rules, month 8 operating profit is −$1,098.03 and month 9 is +$219.03. The usual alternative conventions don't produce 10 either: applying growth from month 1 gives month 8, and cumulative break-even is not reached within 12 months. The test asserts 9. If "profitable" should mean something else, change `firstProfitableMonth` in `project()`.

The tests also cover:
- zero sessions
- a 90% returning share, including input above the cap
- CM1 ≤ 0
- zero marketing
- break-even CVR above 100%
- input sanitizing
- scenario names and numbers
- scenario-link round-trips and rejection of invalid links

## UI features

- **KPI cards:** net revenue, operating profit and margin, blended CAC, LTV:CAC, MER and break-even conversion rate. A screen-reader announcement (`aria-live`) gives a short summary about 0.7 seconds after the last change.
- **Save as baseline:** pins the current results. The KPI cards then show the change from the baseline, with ▲/▼ arrows and good/bad color (lower is better for CAC and break-even CVR). The baseline is held in memory only.
- **Scenario dropdown and Reset:** editing a value marks the scenario "(edited)". Reset restores the selected scenario's values.
- **Sharing:** "Copy scenario link" and "Copy summary" (plain text). "Print" uses a print stylesheet that hides the site header, footer, controls and closing block.
- **Charts and tables:**
  - a 12-month chart drawn as inline SVG (no chart library): net revenue bars and an operating-profit line on one axis, with hover detail and a table view
  - a profit-levers bar chart
  - health checks
  - unit economics
  - a monthly P&L with a % of net revenue column
- **Explanations:** a collapsible "How this model works" section, plus a visible three-question FAQ that is repeated as `FAQPage` structured data.
- **Accessibility:** labeled inputs, keyboard-operable tooltips (`aria-expanded`), a chart title and description, and no horizontal scroll at 375px.

## SEO

- **Title:** "DTC Economics Model | Kappa Strategy"
- **Meta description, `robots`, Open Graph and Twitter tags:** same pattern and social image as the service pages
- **Canonical:** `https://kappastrategy.com/dtc-economics-model/`
- **Structured data:** JSON-LD `@graph` with `WebApplication` (provider linked to `#organization`) and `FAQPage`

Google currently shows FAQ rich results only for a small set of authoritative sites, so the FAQ markup mainly helps machine readability.

## Changing things

| Change | Where |
|---|---|
| Scenario names or numbers | `PRESETS` in `model.js` (update the tests too) |
| Field labels, tooltips, slider ranges | `SECTIONS` in the `index.html` script |
| Colors | the `.dtc-model` token block at the top of the `<style>` block |
| Closing block copy or links | `<section class="service-contact" id="dtc-model-contact">` |
| `model.js` contents | after any change, bump `?v=` on the `import ... from './model.js?v=...'` line, because `.htaccess` caches `.js` files for 30 days |

## Integration

See the PR description for the exact copy list and the site-level edits.
