# Upgrade Assistant — Theme & Design

## Risk level system

The risk level is the core visual language of the app. Use this map everywhere a risk appears — badges, table rows, summary cards. Never hardcode colours for risk outside this definition.

```typescript
// src/shared/risk.ts — canonical source, import from here
export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'breaking' | 'unknown'

export const riskConfig: Record<RiskLevel, {
  label: string
  badge: string   // Badge className
  row: string     // TableRow className
}> = {
  safe:     { label: 'Safe',     badge: 'bg-green-100 text-green-800 border-green-200',         row: '' },
  low:      { label: 'Low',      badge: 'bg-yellow-100 text-yellow-800 border-yellow-200',      row: '' },
  medium:   { label: 'Medium',   badge: 'bg-orange-100 text-orange-800 border-orange-200',      row: 'bg-orange-50/40' },
  high:     { label: 'High',     badge: 'bg-red-100 text-red-800 border-red-200',               row: 'bg-red-50/40' },
  breaking: { label: 'Breaking', badge: 'bg-red-200 text-red-900 border-red-300 font-semibold', row: 'bg-red-50/60' },
  unknown:  { label: 'Unknown',  badge: 'bg-gray-100 text-gray-500 border-gray-200',            row: '' },
}
```

Use `riskConfig[risk].badge` as the className on `<Badge variant="outline">`.
Use `riskConfig[risk].row` as the className on `<TableRow>`.

## Layout

- Sidebar: fixed left, `w-60`. Items: Dashboard, Repos, History.
- Content area: `flex-1 min-h-screen px-8 py-8`
- Page content max width: `max-w-5xl` — except stream and results which are full width within the content area.
- No top navbar.

## Screens

### Upload screen
Centred, `max-w-2xl mx-auto`. Large `Textarea` for pasting package.json. File input as a secondary option below. One primary `Button`: "Analyse". Nothing else — no instructional copy, no decorative elements.

### Stream screen
Full-width `ScrollArea`, fixed height `h-[70vh]`. Dark background: `bg-gray-950`. Text: `font-mono text-sm text-gray-100`. Each line: muted timestamp, package name in white, status in muted gray or a risk colour when risk is determined. Auto-scroll to bottom as lines arrive. No fake typing effects.

### Results screen
Top: four `Card` components in a row — Safe to batch, Needs attention, Breaking, Unknown — each showing a large count and a label. Below: packages grouped by risk level. Group order: Breaking → High → Medium → Low → Safe → Unknown. Each group has a heading with the count. Use the shadcn `Table`. Columns: Package | Current → Latest | Risk | Summary | Scope (dev/prod).

### Detail panel
`Sheet` sliding in from the right, `side="right"`, `className="w-[480px]"`. Header: package name + version range. Risk `Badge` prominently below the header. Breaking changes as a `<ul>` with `<li>` items. A collapsible section (use `details`/`summary` or a toggle button) for "Changelog sections retrieved" — collapsed by default. A muted `Card` at the bottom with the recommendation text.

## shadcn component usage

| Need | Component | Key props |
|---|---|---|
| Risk label | `Badge variant="outline"` | className from riskConfig |
| Detail panel | `Sheet` | `side="right"` |
| Results table | `Table` + sub-components | Use all: Header, Body, Row, Head, Cell |
| Summary counts | `Card` + `CardHeader` + `CardContent` | — |
| Loading state | `Skeleton` | Match the shape of real content exactly |
| Error message | `Alert variant="destructive"` | — |
| Scroll container | `ScrollArea` | Always for the stream and any list over ~400px |
| Notifications | `Sonner` (toast) | — |
| Icon buttons | `Tooltip` wrapping the button | Always — no unlabelled icon buttons |

## Typography

- Page headings: `text-2xl font-semibold tracking-tight`
- Section headings: `text-sm font-medium text-muted-foreground uppercase tracking-wide`
- Body: Tailwind default (`text-sm`)
- Monospace (stream only): `font-mono text-sm`
- Muted supporting text: `text-sm text-muted-foreground`

## Spacing

- Between page sections: `space-y-6`
- Between cards in a row: `gap-4`
- Inside cards: use `CardHeader` and `CardContent` — do not add extra padding
- Table row height: Tailwind default — do not set explicit heights
