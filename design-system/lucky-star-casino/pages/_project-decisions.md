# Project decisions (apply on top of MASTER.md)

These are owner decisions and platform constraints. Where one differs from MASTER.md, it says so and why. Everything else follows MASTER.md and its page overrides.

| Topic | MASTER says | Project rule | Why |
|---|---|---|---|
| CTA colour | `#7C3AED` | `#7C3AED` is the default. Each site's operator can set their own brand colour (`SiteSettings.color_accent`); it becomes `--primary`. Its text colour (`--primary-foreground`) is picked automatically, white or `#0F172A`, so contrast stays at least 4.5:1. | White-label product: every operator brands their own site. |
| Theme modes | Dark only | Night (dark) is the default. Day (light) is built from the same palette. | Owner chose Night as the default and wants Day too. The skill's dark-mode-pairing rule requires both themes to be designed together. |
| Depth / glass | Vibrant & Block; avoid flat design | Cards are slightly translucent with a backdrop blur ("glass") on top of the master's shadow scale. | The owner asked for a glassy look. It adds depth, so it doesn't break the no-flat rule. Glass is never used under body text that can't keep 4.5:1. |
| Fonts | Inter / Inter | Inter for everything, loaded with `next/font`. Weights: 400 body, 500 labels, 600–700 headings. | Matches the master and the weight-hierarchy rule. |
| Admin buttons and chips | pages/admin.md: pill-shaped | Buttons, chips and tabs in the admin console are pills. | Page override. |
| Admin mobile-only effects | pages/admin.md: haptics, Reanimated | Not applicable on the web. Ignored. | Native-only APIs. |
| Icons | Heroicons / Lucide | Lucide only (`lucide-react`), 2px stroke. Sizes: 16 inline, 20 controls, 24 navigation. | Consistent icon family and size tokens (pro-rules). |
| z-index scale | 10 / 20 / 30 / 50 | dropdown 10, sticky 20, fixed nav 30, overlay/modal 50, toast 60. | z-index-management rule. |
