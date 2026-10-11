---
name: Grovit Central Kitchen (Le Laban)
description: Give-and-take bookkeeping for a dessert kitchen's phone; Le Laban blue on a pale blue canvas, money coloured by direction, nothing to learn.
colors:
  laban-blue: "#0066b2"
  laban-blue-deep: "#004a8d"
  canvas-tint: "#e8f2fa"
  kitchen-canvas: "#f5f8fc"
  kitchen-sidebar-selected: "rgba(255, 255, 255, 0.14)"
  sidebar-top: "#0251b8"
  sidebar-middle: "#013b8c"
  sidebar-bottom: "#012f70"
  sidebar-selected-top: "rgba(58, 120, 220, 0.95)"
  sidebar-selected-bottom: "rgba(35, 95, 190, 0.95)"
  sidebar-muted: "rgba(255, 255, 255, 0.8)"
  sidebar-hover: "rgba(255, 255, 255, 0.08)"
  sidebar-divider: "rgba(255, 255, 255, 0.12)"
  card-white: "#ffffff"
  blue-wash: "#dbeafe"
  hairline: "#dbeafe"
  stroke: "#c5d9eb"
  ink: "#0f2744"
  ink-muted: "#5b6b7c"
  on-blue: "#ffffff"
  scrim: "rgba(0, 74, 141, 0.45)"
  money-in: "#15803d"
  money-in-soft: "#dcfce7"
  money-out: "#b91c1c"
  money-out-soft: "#fee2e2"
  buy-amber: "#b45309"
  buy-amber-soft: "#fef3c7"
  stock-neutral: "#64748b"
  stock-neutral-soft: "#f1f5f9"
typography:
  display:
    fontFamily: "SourceSans3"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: "32px"
    letterSpacing: "-0.4px"
  headline:
    fontFamily: "SourceSans3"
    fontSize: "20px"
    fontWeight: 800
    lineHeight: "24px"
    letterSpacing: "-0.4px"
  figure:
    fontFamily: "SourceSans3"
    fontSize: "22px"
    fontWeight: 800
    letterSpacing: "-0.3px"
    fontFeature: "tnum"
  figure-balance:
    fontFamily: "SourceSans3"
    fontSize: "40px"
    fontWeight: 800
    lineHeight: "46px"
    letterSpacing: "-0.8px"
    fontFeature: "tnum"
  title:
    fontFamily: "SourceSans3"
    fontSize: "17px"
    fontWeight: 800
  body:
    fontFamily: "SourceSans3"
    fontSize: "15px"
    fontWeight: 700
  caption:
    fontFamily: "SourceSans3"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: "18px"
  label:
    fontFamily: "SourceSans3"
    fontSize: "12px"
    fontWeight: 800
    letterSpacing: "0.8px"
rounded:
  tick: "8px"
  well: "12px"
  control: "16px"
  card: "18px"
  sheet: "24px"
  pill: "999px"
spacing:
  hair: "2px"
  xs: "6px"
  sm: "8px"
  grid: "10px"
  md: "12px"
  card: "14px"
  gutter: "16px"
  section: "18px"
components:
  kitchen-sidebar:
    backgroundColor: "{colors.sidebar-top}"
    textColor: "{colors.on-blue}"
    width: "64px"
  kitchen-sidebar-expanded:
    width: "176px"
  kitchen-sidebar-tab:
    textColor: "{colors.sidebar-muted}"
    rounded: "14px"
    height: "48px"
  kitchen-sidebar-tab-selected:
    backgroundColor: "{colors.kitchen-sidebar-selected}"
    textColor: "{colors.on-blue}"
    rounded: "14px"
    height: "48px"
  button-primary:
    backgroundColor: "{colors.laban-blue}"
    textColor: "{colors.on-blue}"
    typography: "{typography.title}"
    rounded: "{rounded.control}"
    padding: "0 18px"
    height: "52px"
  button-primary-pressed:
    backgroundColor: "{colors.laban-blue}"
    textColor: "{colors.on-blue}"
  button-ghost:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 18px"
    height: "52px"
  button-ghost-small:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.laban-blue}"
    typography: "{typography.caption}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "44px"
  button-link:
    textColor: "{colors.laban-blue}"
    typography: "{typography.caption}"
    height: "44px"
  chip:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "44px"
  chip-selected:
    backgroundColor: "{colors.laban-blue}"
    textColor: "{colors.on-blue}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "44px"
  chip-add:
    backgroundColor: "{colors.canvas-tint}"
    textColor: "{colors.laban-blue}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "44px"
  card:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  tile-stat:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px"
    height: "66px"
  tile-action:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
    height: "100px"
  input-text:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
    height: "48px"
  input-text-flat:
    backgroundColor: "{colors.canvas-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.well}"
    padding: "10px 12px"
    height: "44px"
  input-search:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    height: "46px"
  segmented:
    backgroundColor: "{colors.canvas-tint}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.control}"
    padding: "3px"
  segmented-selected:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.laban-blue}"
    rounded: "{rounded.well}"
    height: "44px"
  row:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "12px 0"
    height: "58px"
  notice:
    backgroundColor: "{colors.money-out-soft}"
    textColor: "{colors.money-out}"
    typography: "{typography.caption}"
    rounded: "{rounded.control}"
    padding: "12px"
  sheet:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.sheet}"
    padding: "18px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-blue}"
    typography: "{typography.caption}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
  tab-active:
    backgroundColor: "{colors.blue-wash}"
    textColor: "{colors.laban-blue}"
    typography: "{typography.label}"
    rounded: "{rounded.well}"
    height: "30px"
    width: "44px"
---

# Design System: Grovit Central Kitchen (Le Laban)

## Overview

**Creative North Star: "The Kitchen Ledger"**

A ruled ledger page in Le Laban's blue, held in one hand between batches. The canvas is a faint blue wash; everything written on it sits in a white card with a hairline edge, the way lines sit on a ruled page. Money is coloured by which way it went (green came in, red went out, amber was bought on credit) and only the figures and their small icons carry that colour; every action on every screen, filled or outlined, is Le Laban blue, so the manager never has to ask which button is theirs. The system refuses nothing a kitchen manager already expects from a phone app (big title, a 2x2 of verbs, a list of today, five tabs) and adds nothing they must learn.

Density is moderate and finger-first: 44 pt targets everywhere (48 dp on Android), 15 px rows at 58 px tall, 12 px as the smallest text. Type is the system sans at heavy weights (600 to 800) with tabular numerals on every amount, so columns of rupees line up and a wrong figure is easy to spot. There are no shadows anywhere, no decorative motion, no new illustration: working-surface depth is one white layer on one tinted layer. The user-approved Blue frame uses the existing POS gradient and ring detail only as the desktop/tablet rail backdrop; Kitchen selection is a quiet flat fill. Task 173 adds functional desktop width disclosure and reuses the existing Le Laban logo.

This file records the Central Kitchen world (`src/components/kitchen/ui.tsx` and `src/app/central-kitchen/**`), which is the committed system for new surfaces in Grovit. The older POS and finance screens (`src/app/(app)/*`, `src/components/ui`, `pos`, `finance`) predate this world, carry their own panel radii, gradients and shadow classes, and are outside this system except for the shared POS sidebar treatment adopted in task 172 (2026-10-09) and refined in task 173 (2026-10-10). This is a scoped extension of The Kitchen Ledger, not a replacement visual world.

**Key Characteristics:**
- One action colour (Le Laban blue) for every filled and outlined control; semantic colour lives on figures and icon wells only
- Existing POS workspace canvas, white cards, hairline borders; flat working surfaces and Kitchen selection, no shadows, POS gradient confined to the rail backdrop
- System sans, weights 600 to 800, tabular numerals, 28 px titles, 22 px figures, 15 px rows, 12 px floor
- 16 to 18 px corners on cards and controls, 999 px chips for every choice
- Phone-first single column (max 480 px on the web, 720 px on a tablet), with five phone controls and six direct sections in the left rail

## Colors

A single brand blue on a blue-tinted page, with three directional money colours and a grey for stock; nothing else.

### Primary
- **Le Laban Blue** (`laban-blue`): the logo's centre blue and the only action colour. Filled primary buttons, selected chips, the selected segment's text, link buttons, the add-chip's plus and text, the active tab's icon and label, the tick's fill, selected row titles, the "Send" tile's icon. Pressed states dim the whole control (opacity 0.65 on most pressables, 0.8 on the filled button, 0.6 on tabs); nothing changes hue.
- **Le Laban Deep** (`laban-blue-deep`): the logo's edge blue. In this world it appears only as the modal scrim's base (`scrim`, at 45%) and as the inline error text under a party picker. Not a button colour.
- **Blue Wash** (`blue-wash`): the active tab's 44x30 pill behind the icon, and the soft well behind a blue-toned icon (the "Send" tile, a sent entry's row icon).

### Neutral
- **Kitchen Canvas** (`kitchen-canvas`, `colors.kitchenCanvas`, NativeWind `kitchen-canvas`): the Central Kitchen route/scene roots, `KScreen`, Items and PartyList workspace backgrounds. Task 173 matches the existing POS and Orders workspace canvas; the separate token leaves `surfaceTint` intact for other modules and controls.
- **POS Sidebar Blues** (`sidebar-top`, `sidebar-middle`, `sidebar-bottom`): ordered stops of `gradients.posSidebar`, shared by the existing POS sidebar and Kitchen desktop/tablet rail.
- **Kitchen Sidebar Selection** (`kitchen-sidebar-selected`, `colors.kitchenSidebarSelected`, NativeWind `kitchen-sidebar-selected`): quiet flat translucent fill behind the selected Kitchen rail control.
- **POS Sidebar Selection** (`sidebar-selected-top`, `sidebar-selected-bottom`): retained ordered translucent stops of `gradients.posSidebarSelected` for the existing POS sidebar; Kitchen does not consume them after task 173.
- **Sidebar Muted / Hover / Divider** (`sidebar-muted`, `sidebar-hover`, `sidebar-divider`): inactive labels, translucent hover fill and quiet identity separators on the rail. On Blue supplies selected text and the focus border; three existing white outlined circles retain 0.08 opacity.
- **Canvas Tint** (`canvas-tint`): the retained original `colors.surfaceTint` used by other modules and controls: the add-chip's fill, the flat input's well inside a card, the segmented control's track and the stepper's side buttons.
- **Card White** (`card-white`): every card, tile, chip at rest, input, the phone bottom tab bar and More list, the pinned footer, the sheet.
- **Hairline** (`hairline`): the 1 px edge of every card and tile, the row separator, the dividers between stat cells, the top edge of the tab bar and footer, the skeleton block.
- **Stroke** (`stroke`): the darker 1 px edge on things you type into or choose from: text fields, the search box, unselected chips, ghost buttons, the stepper, the segmented control, the unticked tick, the web phone frame's sides.
- **Ink** (`ink`): titles, row titles, neutral figures, the toast's background, the tick and stepper glyphs.
- **Ink Muted** (`ink-muted`): subtitles, captions, section labels, field labels, stat labels, placeholders, the phone bar's inactive tabs, the unselected segment, time stamps, voided rows (with strike-through).
- **On Blue** (`on-blue`): text and icons on a filled blue control and on the toast.
- **Scrim** (`scrim`): the backdrop behind a sheet.

### Semantic (money by direction)
- **Money In** (`money-in` / `money-in-soft`): received payments and "Branches yet to pay" when it is above zero; the figure, the entry row's amount, and the icon in its soft well. The "Received" tile.
- **Money Out** (`money-out` / `money-out-soft`): payments and expenses, "We owe vendors" when above zero, a negative stock figure's warning; the Notice (error banner) background and text; the only red action is the word "Void" on an outlined button. The "Spent" tile.
- **Buy Amber** (`buy-amber` / `buy-amber-soft`): a buy on credit; the "Bought" tile and a bought entry's icon well. Amber never colours an amount, only the icon.
- **Stock Neutral** (`stock-neutral-soft`): the icon well of a stock-only entry (made, count) and a voided entry. Neutral figures use Ink, not the grey.

### Named Rules
**The POS Rail Exception Rule.** Only the desktop/tablet Kitchen rail backdrop may use the exact shared POS gradient and stationary ring detail. Kitchen selection, working cards, controls and phone navigation keep their flat fills. The neutral/warm candidate colours and mock solid-navy rail are selection history, not design authority.

**The One Blue Rule.** Every control that does something, filled or outlined, is Le Laban blue or Ink on white. Green, red and amber are reserved for figures, entry-row amounts and the 36 px icon wells; a semantic colour on a button is a defect, with the single exception of the red "Void" label on its outlined confirm button.

**The Direction Rule.** A rupee amount is green when money came to the kitchen, red when it left, Ink when it is neither (a send's value, a buy's value, a stock figure). Amber marks a buy's icon only. The colour says which way the money went, never how the manager should feel about it.

**The Zero Is Neutral Rule.** A due that is zero is Ink, not green or red: "Branches yet to pay ₹0" is settled, not good news.

## Typography

**Display Font:** System sans (San Francisco on iOS, Roboto on Android, the platform UI font on the web)
**Body Font:** System sans (same stack)
**Numerals:** the same face with tabular figures (`fontVariant: tabular-nums`) on every amount, quantity and stepper value

**Character:** One family at heavy weights. Nothing is lighter than 600; headings and figures are 800 with slightly tightened tracking; small labels are 800 and spaced out in capitals. The hierarchy is carried by size and colour, not by a second face.

### Hierarchy
- **Display** (800, 28 px / 32 px, -0.4 px): the screen title on a top-level tab ("Central Kitchen", "History"), one per screen, never on a screen with a back button.
- **Headline** (800, 20 px / 24 px, -0.4 px): the inline title on a screen with a back chevron ("Send to a branch"); the sheet title is this family at 18 px.
- **Figure** (800, 22 px, -0.3 px, tabular): a money figure in a stat cell or a pinned footer total. Shrinks to fit its cell rather than wrapping.
- **Figure Balance** (800, 40 px / 46 px, -0.8 px, tabular): the one large number on a detail page (an item's stock, a party's balance). One per screen.
- **Title** (800, 17 px): an action tile's verb and a card's opening heading; the primary button's label is 16 px of the same.
- **Body** (700, 15 px): row titles, row amounts (800), the ghost button label, the search and text field input (600), the empty-state title (800).
- **Caption** (600, 13 px / 18 px): subtitles under a title, row sublines at 12 px, hints, chip labels (700), empty-state body (line height 19), notice text (700), toast text (700), link buttons (800).
- **Label** (800, 12 px, +0.8 px, uppercase): section headings ("TODAY", "THIS MONTH"), field labels ("BRANCH", "WHEN"), day headings in History, the sheet's detail labels ("AMOUNT", "MODE", "ON"). Stat labels and tab labels are 12 px at 700/600 without the capitals.

### Named Rules
**The Twelve Floor Rule.** Nothing on screen is set below 12 px. Where a label must be quiet, it is 12 px Ink Muted at 600 or 700; never smaller.

**The Tabular Money Rule.** Every number that can be compared with another number (amounts, quantities, stock, stepper values, the big-input prefix) is set in tabular figures, so columns align in a card and a slip.

## Layout

A single column of stacked cards. The screen gutter is 16 px on every size; on a tablet (viewport 768 px and up) the column is centred at a maximum of 720 px, and the home screen splits into two equal columns (summary left, the four action tiles right) with a 16 px gap. On the owner's web build the phone layout is centred in a 480 px column with Stroke-coloured side edges and the surplus width left as the retained Canvas Tint; a handset browser never sees the frame.

Vertical rhythm: 18 px above a section heading, 8 px between the heading and its card; 16 px above each form field, 6 px between a field's label and its control; 12 px between card groups; 10 px between the tiles of a 2x2 and between the rows of the grid; 8 px between chips, 6 px inside a chip between label and hint. Cards pad 14 px; tiles pad 12 px (stat) or 14 px (action); rows are 58 px minimum with 12 px vertical padding and a 12 px gap between icon, text and amount. The header clears the safe-area top plus 8 px (12 px extra on the web) and is 44 px tall.

Every touch target is at least 44 pt on iOS and the web and 48 dp on Android (`TARGET` in `ui.tsx`). The primary button is 52 px, the text field 48 px (64 px for the big amount input), the search box 46 px, chips and segments and the small ghost button exactly the target height. Pinned footers (a total beside the save button) sit in a white strip with a hairline top above the tab bar.

Navigation: phones show Home, Analytics, Items, History and More in a bottom bar with 52 px minimum-height controls and safe-area bottom padding. More reveals Branches and Vendors in a white, hairline-edged list above the bar. Tablets and native wide layouts show Home, Analytics, Items, Branches, Vendors and History directly in an 88 px POS-gradient rail with 72 px-wide buttons. Desktop web uses a 64 px icon strip, expanding to a 176 px overlay on hover or keyboard focus; pinning reserves 176 px. Sheets are full-width from the bottom edge on a phone (24 px top corners, 88% max height) and a centred 520 px dialog with all four corners rounded on a tablet.

## Elevation & Depth

Flat. There are no shadows anywhere in the kitchen world: not under cards, not under the tab bar, not under the sheet, and there is no floating action. Working-surface depth is two tones (white on Kitchen Canvas) and one hairline, with the modal scrim (Le Laban Deep at 45%) the only darkening. Inside a card there is never a second box: stat cells are bare cells separated by hairline dividers, an input inside a card is a flat Canvas Tint well with no border, and a slip inside a sheet is hairlines between rows. Pressed controls dim to 0.65 opacity (0.8 for the filled button, 0.6 for tabs); disabled controls sit at 0.45; a loading skeleton is a Hairline-coloured block at 0.7.

The Tailwind config still carries `shadow-panel`, `shadow-card`, `shadow-glow` and a 28 px `rounded-panel` for the older POS screens; the kitchen world uses none of them.

### Named Rules
**The No-Shadow Rule.** A kitchen surface never casts a shadow. If something needs to read as above the page, it gets a white fill and a hairline, or a scrim beneath it; never a blur.

**The No Box-In-Box Rule.** Inside a card, structure is drawn with hairline dividers and tinted wells, never with another bordered card.

## Shapes

Softly rounded rectangles at a few fixed radii: cards and action tiles 18 px; stat tiles, buttons, inputs, the search box, the notice, the toast, the skeleton and the icon button 16 px; the sheet's top (and on a tablet all four) corners 24 px; icon wells, the flat input, the stepper, the inner segment and the active-tab pill 12 px; the tick 8 px; chips and the add-chip a full pill (999 px); the back button a 44 px circle. Borders are 1 px everywhere (Hairline on resting surfaces, Stroke on anything interactive or typed into, dashed Stroke on the add-chip); the tick is the only 2 px border. Icon wells are 36 px squares; the active tab's pill is 44x30. No clipping shapes, no diagonal or asymmetric geometry.

## Components

All components live in `src/components/kitchen/ui.tsx` and take plain style objects (not class names) on Pressables, because NativeWind drops a Pressable's function style when a className is present. Every control carries an accessibility role and label.

### Buttons
Confident and few: one filled button per screen, outlined for everything beside it.
- **Shape:** rounded (16 px), 52 px tall, 18 px side padding, 8 px gap to an optional 18 px icon.
- **Primary** (`PrimaryButton`): Le Laban blue fill, On Blue 16 px/800 label; shows an ActivityIndicator in place of the icon while busy. Pressed dims to 0.8; disabled or loading sits at 0.45. Its `tone` prop can take a semantic colour but no shipped screen uses one.
- **Ghost** (`GhostButton`): white fill, 1 px Stroke border, Ink 15 px/800 label (or Le Laban blue when `tone="primary"`, as on "WhatsApp" and the three "Add a ..." starters). `small` drops it to the 44 px target, 14 px padding, 13 px label. Pressed dims to 0.65. "Void" is the one ghost in Money Out red.
- **Link** (`LinkButton`): bare Le Laban blue 13 px/800 text on a 44 px tall target ("All entries", "Retry").
- **Icon button** (`IconButton`): a 44 px card-styled square (16 px radius) holding a 20 px icon.

### Chips
Every choice (branch, vendor, payment mode, item category, history filter) is a wrapping row of pills; a list longer than six grows a search box above it.
- **Style:** pill (999 px), 44 px tall, 16 px side padding, 13 px/700 label with an optional 12 px/600 hint (a party's balance) at 85% opacity.
- **State:** unselected is white with a Stroke border and Ink text; selected is a Le Laban blue fill and border with On Blue text. No third state.
- **Add chip:** the same pill with a dashed Stroke border, Canvas Tint fill, a 14 px plus and the label in Le Laban blue; always the last chip ("New").

### Cards / Containers
- **Corner Style:** 18 px (`Card`), 16 px on a pressable stat tile.
- **Background:** Card White on the Kitchen Canvas page.
- **Shadow Strategy:** none (see Elevation).
- **Border:** 1 px Hairline.
- **Internal Padding:** 14 px; `padded={false}` with 14 px horizontal padding when the card holds rows, so the row separators run edge to edge inside it.
- **Stat cells** (`StatTile` without `onPress`): a 12 px/700 muted label over a 22 px tabular figure in the tone colour; laid out 2x2 inside one card with a vertical Divider (1 px, 12 px side margins) between columns and a horizontal Divider (1 px, 10 px vertical margins) between rows. With `onPress` the same content becomes its own 66 px tile.
- **Action tile** (`ActionTile`): 100 px tall, 36 px icon well in the tone's soft colour at the top, 17 px/800 verb and a 12 px/600 one-line caption at the bottom; the four verbs sit in a 2x2 with 10 px gaps.
- **Section** (`Section`): an uppercase 12 px label with an optional link on the right, 18 px above, 8 px below.

### Inputs / Fields
- **Style:** `TextField` is white, 1 px Stroke, 16 px radius, 48 px tall, 14 px side padding, 16 px/600 Ink text, Ink Muted placeholder; `big` makes it 64 px with 30 px/800 tabular text and a 26 px muted prefix (₹). The `flat` variant inside a card is a Canvas Tint well, 12 px radius, no border, 44 px tall. `SearchBox` is the same shell at 46 px with an 18 px search glyph and a 16 px clear cross.
- **Focus:** the browser outline is suppressed on the web; no focus ring or border shift is drawn (see not-canonized line below).
- **Error:** errors are not drawn on the field; they appear as a `Notice` (Money Out soft fill, Money Out 13 px/700 text, 16 px radius, 12 px padding, optional action on the right) or as a 13 px hint beneath the field.
- **Stepper** (`QtyStepper`): a 44 px tall, 12 px radius Stroke-bordered strip: 44 px Canvas Tint minus and plus ends around a 64 px white tabular 15 px/800 input.
- **Segmented** (`Segmented`): a 16 px radius Canvas Tint track with a Stroke border and 3 px padding; the selected segment is a white 12 px radius pill with a Stroke border and Le Laban blue 14 px/800 text, the others Ink Muted.
- **Tick** (`Tick`): a 26 px square, 8 px radius, 2 px border; fills Le Laban blue with a 16 px white check when on.

### Navigation
- **Bottom bar (phone):** white, 1 px Hairline top, 6 px padding; Home, Analytics, Items, History and More share five equal controls with a 52 px minimum height. Each has a 21 px icon in a 44x30 pill (Blue Wash when active) above a 12 px label (Le Laban blue at 800 for the active direct tab, Ink Muted at 600 otherwise). More's pill is Blue Wash while expanded or while Branches/Vendors is active; its label remains Ink Muted at 600. Pressed dims to 0.6.
- **More (phone):** Branches and Vendors appear in a white list above the bar, with a Hairline top, 12 px padding, 48 px minimum-height rows and a 48x48 Close control. Selecting a section, Close, Escape on web or Android Back dismisses it. Both sections retain their existing tab routes.
- **Rail (tablet, 768 px+):** Home, Analytics, Items, Branches, Vendors and History stack in an 88 px POS-gradient column, 72 px wide each with 52 px minimum heights, 6 px apart, starting 12 px below the safe area. Native wide layouts retain this labelled rail. Desktop web (1024 px+) defaults to a 64 px icon strip; hover or keyboard focus reveals 13 px labels beside 18 px icons in a 176 px overlay without moving the report. Pinning reserves 176 px. Controls remain at least 48 px tall. Pointer tab clicks do not latch keyboard expansion; leaving collapses an unpinned rail unless keyboard focus remains inside. Width transitions take 200 ms and are disabled for Reduce Motion. A bounded `FlatList` preserves all six sections in short windows, with the footer outside its scroll area and safe-area padding retained. Kitchen selection is flat Kitchen Sidebar Selection with white text/icons; inactive controls use Sidebar Muted, translucent Sidebar Hover and a white keyboard-focus border.
- **Shared sidebar surface and identity:** `SidebarSurface` in `src/components/ui/SidebarSurface.tsx` shares the exact POS backdrop and three clipped white ring outlines at 0.08 opacity. `SidebarSelection` supplies only the Kitchen flat fill; POS keeps its incumbent selected gradient. The rail reuses `assets/images/le-leban-logo.png` instead of a text brand header: the same pre-existing POS asset, no new raster. React Native `Image` uses explicit dimensions (32×32 compact/tablet, 84×52 expanded desktop) because NativeWind image sizing failed browser interop; this follows the incumbent POS pattern. Central Kitchen remains the expanded desktop footer. Gradient ordering and provenance live in the sidecar.
- **Header:** no native header; `KHeader` draws the title (Display on a tab root, Headline with a 26 px back chevron in a 44 px circle on a pushed screen), a 13 px/600 muted subtitle, and an optional right slot.

### Sheet and Toast (signature)
The sheet is the module's one moment of ceremony: after a send it rises from the bottom edge with the slip inside it (kitchen name, "To Kolathur · today", hairline-separated item lines at 14 px, a 15 px/800 total, the branch's remaining due, then "WhatsApp" ghost beside "Done" primary). It is white, 24 px top corners, 18 px padding, 88% max height, an 18 px/800 title with a 40 px close target, over the Scrim. On a phone it slides up (the platform's `Modal` slide); on a tablet it is a centred 520 px dialog that fades in. The toast is an Ink pill (16 px radius, 12x16 padding) with 13 px/700 On Blue text, 96 px above the bottom edge, that confirms a save after the sheet closes. There is no other motion in the module; nothing decorative animates.

## Do's and Don'ts

### Do:
- **Do** make every filled or outlined action Le Laban blue (or Ink on white for a neutral ghost); reserve green, red and amber for figures and icon wells (The One Blue Rule).
- **Do** colour a rupee amount by direction: green in, red out, Ink otherwise; zero is Ink (The Direction Rule, The Zero Is Neutral Rule).
- **Do** set every amount, quantity and stock figure in tabular numerals at 800.
- **Do** use white cards with a 1 px Hairline edge at 18 px radius on the Kitchen Canvas page, and hairline Dividers or retained Canvas Tint wells for structure inside them.
- **Do** offer every choice as 44 px pills, selected = blue fill, and add a search box once a list passes six.
- **Do** keep one filled `PrimaryButton` per screen, pinned in the footer when the screen has a total.
- **Do** keep every target at least 44 pt (48 dp on Android) and no text below 12 px.
- **Do** use the uppercase 12 px/800 +0.8 px label for section and field headings, and nothing else in capitals.
- **Do** put a screen's one large number (40 px) on a detail page only, with the 22 px figure for everything in a grid.

### Don't:
- **Don't** cast a shadow or add a floating action. Confine the Kitchen gradient to the shared POS rail backdrop (The No-Shadow Rule, The POS Rail Exception Rule).
- **Don't** nest a bordered card inside a card or a bordered input inside a card (The No Box-In-Box Rule); use the flat input and Dividers.
- **Don't** colour a button green, red or amber; the single exception is the red "Void" label on its outlined confirm.
- **Don't** colour an amount amber: amber marks a buy's icon only.
- **Don't** reach for `shadow-panel`, `shadow-card`, `shadow-glow` or `rounded-panel` from the Tailwind config, or unrelated `gradients` in `brand.ts`; only `posSidebar` is approved for the Kitchen rail backdrop.
- **Don't** write a hex value in a kitchen component; every colour is `colors.*` or `semantic.*` from `src/lib/pos/brand.ts` (or its NativeWind mirror).
- **Don't** combine `className` with a Pressable's function style: NativeWind drops the function. Class-styled controls use `active:opacity-*`; legacy controls with function styles keep their plain style objects.
- **Don't** add a second type family, a weight below 600, or letter-spaced capitals outside the Label role.

## Daily work navigation (owner and admin)

The approved main app navigation uses four phone tabs: Analytics, Kitchen,
Inventory and More. More groups Menu under Business, and Staff,
Branches and Settings under Administration, filtered by existing role access.
Secondary screens highlight More while open. Kitchen opens the existing
Central Kitchen module with its own five phone controls and six rail sections.

Desktop web (768 px+) uses a centered floating bottom bar: Orders, Inventory,
Analytics, Kitchen and More for owners, with POS also retained for admins.
The 64 px bar floats 24 px above the bottom over the page, with no full-width
footer strip. More opens a 288 px grouped list 12 px above it.
Desktop tabs have 8 px gaps between their 44 px targets. The current
tab uses solid Primary with white text and icons; inactive hover uses Surface
Tint. An open More menu uses Accent Soft unless More is the current section.
Pointer selection moves the pill with a 180 ms clip-path transition using
`cubic-bezier(0.77, 0, 0.175, 1)`. A hidden visual copy clips blue and white
labels together, preserving contrast throughout the move. Repeated clicks
retarget from the current position; keyboard navigation and the live system
Reduce Motion preference select instantly. Page navigation never waits on it.
Keyboard focus preserves readable contrast in both states. The menu closes on
selection, outside click or Escape; arrow keys move through the list and
Escape returns focus to More. Secondary screens highlight More. Every target
remains at least 44 px tall. Short windows constrain and scroll the list.
Wide native management devices retain the 184 px sidebar and omit till screens.
Other staff roles retain their existing navigation. The Central Kitchen's
own navigation remains separate from the main app bar.

The standalone Finance module, including Day Close and its Settings controls,
is deferred. It has no navigation link; old Finance URLs redirect to the
role/device home without mounting its screen. Accountant logins land on
Settings while it is deferred. Code and records remain for future restoration;
Central Kitchen bookkeeping and inventory posting keep their existing behavior.

## Central Kitchen desktop browser density

At browser widths of 1024 px and above, keep the same colours, content and
workflows with a more compact layout:

- 64 px icon sidebar, expanding to a 176 px overlay on hover or keyboard
  focus; pinning reserves 176 px. Expanded rows pair 18 px icons with 13 px
  labels and remain at least 48 px tall. Phone and tablet layout is retained.
- Root headings are 24/28 px; form headings are 18/24 px. Summary figures are
  20/24 px and list titles are 14 px.
- Every kitchen tab surface shares a content frame of up to 1120 px, centred in
  the space beside the rail, as Analytics and Invoices are (owner's request,
  2026-10-11; it was left-aligned before). Entry forms and the Cash & bank
  screen keep their centred 720 px cap. Items, Branches and Vendors use a fixed
  320 px list pane beside a flexible detail pane.
- Cards use a 12 px radius and 12 px padding. Action tiles use a horizontal
  icon/label layout, 14 px titles and a 76 px minimum height. List rows are
  at least 52 px; primary controls remain at least 44 px.
- Home places its four actions in one row, then the monthly totals and dues
  beside the entry list. When today is empty, desktop shows the five latest
  non-voided entries with their dates and an explicit "nothing recorded today"
  note. These entries come from the existing store, without another query.
- Stock and party balances use 28/32 px figures beside their action buttons
  on desktop, rather than the phone's 40/46 px figure over full-width buttons.
  Figures may wrap if needed; amounts must never be ellipsized.
- This density applies only to desktop web. Phone and native tablet sizing,
  financial calculations, data fetching and permissions retain their behavior.

Verified in the browser at 1366 px and 1024 px desktop widths and 390 px
phone width across the tab surfaces. This is browser evidence, not a native
emulator or hardware test.
