# Verification Notes

The public Google Drive listing was validated against the configured folder on August 27, 2026. The server returned three PDF-only records in natural-name order, including file IDs, sizes, and modification timestamps.

The secure PDF stream test retrieved the first listed document through the server route. Google delivered it as a binary stream; the response bytes began with the standard `%PDF` signature. The browser rendered the selected document in the on-page PDF.js canvas and reported a 181-page document.

The active client refreshes the document listing every 60 seconds while the portal is open and also refreshes on window focus. The manual refresh button uses the same server-side listing procedure.

The browser was rechecked after adding the typed document-access procedure. The portal successfully obtained a server-issued viewer URL, rendered the selected PDF in place, showed page `1 / 181`, and exposed the page navigation, zoom, fit, new-tab, download, and fullscreen controls.

During follow-up troubleshooting, the default document rendered successfully in a fresh browser session. The second listed document also passed the typed access stage and began loading through the in-page viewer; the next verification step is to confirm its final rendered/error state and capture the availability response if it fails.

The second PDF subsequently rendered successfully as a 57-page document. The third PDF passed the same typed access stage and started its secure in-page fetch; final rendering confirmation is pending.

The third PDF rendered successfully as a 44-page document. All three current Drive PDFs therefore render through the portal’s access flow. After the fullscreen handling update, fullscreen entered successfully without replacing the loaded PDF with a document error state.

The reported **Document unavailable** result was caused by the original fullscreen handler placing a preview-context fullscreen rejection into the same error state used for genuine PDF load failures. It was not a Drive-file failure. Fullscreen notices now remain separate from document availability and provide an in-context alternative when the browser blocks fullscreen.

The adaptive reader was validated with a loaded 181-page document in a desktop browser. It measured the reader container rather than using a fixed canvas dimension, selected a 59% Fit to Page scale, displayed the complete first page without horizontal document overflow, and exposed page input, zoom, fit-width, fit-page, rotation, download, new-tab, and reader-fullscreen controls.

The reader’s next-page control updated both the canvas and page input from page 1 to page 2. A manual 150% preset request was safely capped at the current 59% container width limit rather than creating horizontal document scrolling; the current effective zoom display remained accurate.

Reader-only fullscreen was tested on page 2. The fullscreen container increased its effective Fit to Page scale from 59% to 86%, preserved the active document and current page, exposed the dedicated Exit control, and returned to the portal at page 2 with its normal 59% container-derived scale.

Rotation recomputed the reader’s effective Fit to Page scale to 89% while keeping the rotated page inside the viewer’s width. Direct page input then moved the reader to page 10 and updated the canvas, page control, and total-page context without leaving the responsive reader.

With focus outside an editable field, the ArrowRight shortcut advanced the rotated reader from page 10 to page 11 and synchronized the canvas and page input. This confirms keyboard page navigation remains available in the adaptive layout.

At a 1920×1080 viewport, the portal retained its split-screen desktop composition, kept the full reader toolbar visible, and assigned the reader the remaining screen height beneath the application header. A corresponding scale test confirms that a large 1450×800 reader content area selects a 94% Fit to Page scale rather than a fixed canvas size.

A controlled live 1920×1080 browser session waited for the public Drive PDF stream before capture. The loaded cover page rendered at a 78% Fit to Page scale inside the allocated reader region, with the document navigator, full toolbar, and page controls all visible and no horizontal page scrolling.
