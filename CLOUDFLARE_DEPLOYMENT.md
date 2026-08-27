# Deploy KPI References on Cloudflare Pages

This guide deploys the current **KPI References** project to Cloudflare Pages while keeping Google Drive credentials and Drive access context on the server side. The project is an independent Vite application with Cloudflare Pages Functions in `functions/`; it is **not** a Worker-only deployment.

> **Before you begin:** Never place your Google Drive API key, service-account JSON, or Drive resource keys in GitHub, `client/`, or any `VITE_*` environment variable. They must be configured as server-side Cloudflare environment variables.

## 1. Confirm the repository is current

Push the current project revision to the GitHub repository you will connect to Cloudflare. At the repository root, confirm these files exist:

| Path | Purpose |
| --- | --- |
| `vite.config.ts` | Standard Vite configuration with an explicit `plugins` array. |
| `wrangler.jsonc` | Declares `pages_build_output_dir` as `./dist`. |
| `functions/api/documents/` | Secure list, access, and PDF streaming Pages Functions. |
| `package.json` | Provides `build`, `cf:dev`, and `cf:deploy` commands. |
| `.dev.vars.example` | Safe local variable template with no credentials. |

Run the following on your computer before connecting the repository:

```bash
pnpm install
pnpm run check
pnpm run build
pnpm run test
```

The production build must finish successfully and produce a `dist/` directory.

## 2. Create the Cloudflare Pages project

Open **Workers & Pages** in the Cloudflare dashboard, choose **Create application**, then choose **Pages** and **Connect to Git**. Authorize GitHub if requested, select the KPI References repository, and select the branch you want to publish (normally `main`).

Set the build configuration exactly as follows. Cloudflare’s React (Vite) preset uses a build command and `dist` build directory consistent with this configuration.[1]

| Setting | Value |
| --- | --- |
| Framework preset | React (Vite), or None with the settings below |
| Production branch | `main` |
| Build command | `pnpm run build` |
| Build output directory | `dist` |
| Root directory | Leave blank unless the app is inside a monorepo subdirectory |
| Node version | 22 or later |

Do **not** set the build command to `wrangler deploy` or `npx wrangler deploy`. Those commands are for Worker deployments and cause Cloudflare to attempt a Worker-style Vite integration. This project uses Pages and will discover its server-side endpoints from the `functions/` directory during a Pages deployment.[2]

## 3. Set the Google Drive environment variables

Before the first production deployment, open the Pages project, go to **Settings → Environment variables**, and add the values below for the **Production** environment. Add the same values to Preview only if you want pull-request deployments to connect to the real Drive folder.

In both access modes, also set `DRIVE_STATUS_ACCESS_TOKEN` to a long, random value that you create. It protects the in-app `/setup` connection screen; operators enter the same value only when they need to run a configuration check.

### Public Google Drive folder

Use these values when the configured Drive folder is shared for public viewing:

| Variable | Value |
| --- | --- |
| `DRIVE_PORTAL_ACCESS_MODE` | `public` |
| `GOOGLE_DRIVE_FOLDER_ID` | Your Google Drive folder ID |
| `GOOGLE_DRIVE_API_KEY` | Your restricted Google Drive API key |
| `DRIVE_STATUS_ACCESS_TOKEN` | A long random operator token you create |

Configure the API key in Google Cloud so it can call the Google Drive API, use only the required API scope, and protect it as a Cloudflare secret. Do not use a browser-referrer restriction for this server-side key; the API call originates from the Pages Function rather than from the reader’s browser.

### Private Google Drive folder

Use these values when the folder must remain private:

| Variable | Value |
| --- | --- |
| `DRIVE_PORTAL_ACCESS_MODE` | `private` |
| `GOOGLE_DRIVE_FOLDER_ID` | Your Google Drive folder ID |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Complete service-account JSON, entered as one encrypted secret |
| `DRIVE_STATUS_ACCESS_TOKEN` | A long random operator token you create |

Share the target Drive folder with the service account’s `client_email` address. Do not paste its private key into source files, issue trackers, or browser code.

## 4. Deploy from the Cloudflare dashboard

Click **Save and Deploy**. Cloudflare will install dependencies, run `pnpm run build`, upload `dist/`, and compile the Pages Functions automatically. Pages Functions execute server-side code on Cloudflare’s network, so the credentials configured in the previous step remain outside the front-end bundle.[2]

When deployment finishes, open the generated `*.pages.dev` URL. The header should show **KPI References**, the document list should load, and the default PDF should open inside the reader.

## 5. Optional: deploy from your own terminal

You can deploy from a local terminal that is already logged into Cloudflare:

```bash
pnpm install
pnpm run build
pnpm run cf:deploy
```

The `cf:deploy` command runs `wrangler pages deploy dist`. This is the correct command for the Pages project. If the CLI opens an authorization page, complete it in a browser on the same computer; the callback expects access to your computer’s localhost address.

## 6. Verify the production portal

After deployment, perform the following checks:

1. Open the published root URL and ensure the document catalog appears.
2. Open a PDF and confirm it renders in the in-app reader.
3. Use the document search, page navigator, zoom controls, and mobile layout.
4. Confirm browser developer tools do not show `GOOGLE_DRIVE_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`, or a Drive `resourceKey` in page source or API list/access responses.
5. Confirm a download appears only for documents whose Drive permissions permit download.
6. Open `/setup`, enter `DRIVE_STATUS_ACCESS_TOKEN`, and confirm the connection check reports status without exposing credential values.

## Troubleshooting

| Symptom | Cause | Resolution |
| --- | --- | --- |
| `Cannot modify Vite config: could not find a valid plugins array` | A prior revision or a Worker-style deployment command was used. | Pull the current project revision, keep `plugins: [react(), tailwindcss(), developmentDriveApi()]` in `vite.config.ts`, and deploy through Pages with `pnpm run build` and `dist`. |
| Document list is unavailable after deployment | Drive variables are missing, in the wrong environment, or invalid. | Recheck the Production environment variables and redeploy. |
| Private folder returns unauthorized | The service account lacks folder access. | Share the folder with the service account email and verify the JSON secret is complete. |
| PDF does not open | Drive access allows metadata but not content, or the file was removed. | Confirm the PDF is still in the configured folder and that the selected access mode matches its sharing configuration. |
| Browser login from a remote development environment fails | The CLI OAuth callback cannot return to the local process. | Deploy through the Cloudflare dashboard, use a local terminal, or use a scoped API token. |

## References

[1] [Cloudflare Pages: Build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)

[2] [Cloudflare Pages: Functions](https://developers.cloudflare.com/pages/functions/)
