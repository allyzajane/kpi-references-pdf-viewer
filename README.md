# KPI References

KPI References is a responsive in-browser PDF portal backed by a Google Drive folder. Documents are listed and streamed through Cloudflare Pages Functions, so Google Drive credentials and Drive resource keys remain on the server side.

## Cloudflare Pages deployment

This repository is ready for Cloudflare Pages with Functions. Cloudflare Pages supports server-side code through Pages Functions, and its Vite build preset uses `pnpm run build` with `dist` as the build output directory. See the official [Cloudflare Pages overview](https://developers.cloudflare.com/pages/) and [Vite build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/).

1. Push this repository to GitHub.
2. In Cloudflare, create a Pages project and import the repository.
3. Set the build command to `pnpm run build` and build output directory to `dist`.
4. In **Settings → Environment variables**, add the Drive variables below as encrypted secrets. Do not commit their values.
5. Deploy. For local function testing, copy `.dev.vars.example` to `.dev.vars`, set real values, run `pnpm run build`, then run `pnpm run cf:dev`.

> This project uses the **Pages** deployment model because its backend lives in the `functions/` directory. Use the Pages build settings above or `pnpm run cf:deploy`; do not use the Worker-only `wrangler deploy` command for this project.

| Variable | Required for | Notes |
| --- | --- | --- |
| `DRIVE_PORTAL_ACCESS_MODE` | All deployments | Use `public` or `private`. |
| `GOOGLE_DRIVE_FOLDER_ID` | All deployments | The Google Drive folder ID. |
| `GOOGLE_DRIVE_API_KEY` | Public mode | Restrict this key in Google Cloud and store it only as a server-side secret. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Private mode | Full service-account JSON as an encrypted server-side secret. Share the folder with the service account. |

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm run dev` | Start the independent Vite front end. |
| `pnpm run build` | Produce the `dist` static output for Cloudflare Pages. |
| `pnpm run cf:dev` | Serve the static build with Pages Functions locally. |
| `pnpm run test` | Run unit and export-readiness checks. |

## Security model

The browser calls `/api/documents` endpoints implemented as Pages Functions. Those functions list Drive PDFs, obtain media, and stream bytes to the reader. API keys, service-account JSON, and Drive `resourceKey` values are never placed in browser responses, static assets, or source-controlled environment files.
