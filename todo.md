# Project TODO

- [x] Add secure server-only configuration for the Google Drive folder and supported authentication modes.
- [x] Implement a Google Drive document service that filters and consistently sorts PDF-only results.
- [x] Expose typed server procedures for listing documents, refreshing the index, and obtaining access-controlled viewer URLs.
- [x] Add resilient handling for missing, unauthorized, corrupted, and non-PDF document responses.
- [x] Add automatic Drive-folder refresh while the portal is open, without page reloads or server in-process timers.
- [x] Build the elegant, responsive document navigator with search, grouping, metadata, active selection, manual refresh, and empty state.
- [x] Build the on-page PDF.js viewer with loading/error states, title, navigation, zoom, fit-to-width, fullscreen, new-tab, and permission-aware download controls.
- [x] Restore the last selected document only when it remains listed and authorized.
- [x] Add automated tests for Drive document validation, ordering, and access-state mapping.
- [x] Verify desktop and mobile layouts, core viewer flows, and error states.
- [x] Configure the active portal connection for a public Drive folder using a restricted server-side Google Drive API key.
- [ ] Verify the API key’s Google Cloud restrictions and record the recommended restriction settings in the portal setup notes.
- [x] Add a typed document-access procedure for browser viewer and permission-aware download URLs, then consume it in the viewer.
- [x] Add automated coverage for unavailable, unauthorized, invalid, and unexpected-content Drive error mappings.
