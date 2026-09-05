# Header browser checks

Run `node scripts/dev-header.mjs` from the repository root and open
`http://127.0.0.1:5181/fixtures/header.html`.

The fixture renders the production Topbar with type-checked, inert application callbacks.
It never opens or changes user documents. Header application data is selected separately from
`ResponsiveWorktreeHeader`, whose inputs are presentation slots and the sidebar-toggle reservation.

Check 1440, 1300, 1130, 960, 940, 720, and 480px with English and Chinese labels, short and
long titles, and ready/preview states. Include draft, conflict, error, and merged states,
other locales at narrow widths, dark appearance, and the collapsed sidebar used by embedded cards.

View/Compare is geometrically centered when symmetric side groups fit. Otherwise the trailing
wrapper uses display: contents, allowing controls to share one flex row and wrap in DOM order.
The preview switcher must never appear above View/Compare. Long names stay within 100–280px,
short names keep their intrinsic width, and the change badge immediately follows the name.
Status messages remain visible and may wrap. Check control bounds and overlap after resizing
in both directions. Segmented controls retain horizontal keyboard navigation and wrap labels.

The on-page action readout verifies View/Compare, preview selection, submit, merge, and discard.
Conflict state must disable merge and leave discard available. `test/integration-smoke.mjs`
retains built-Viewer bounds and centering assertions plus actual comparison wiring checks.
