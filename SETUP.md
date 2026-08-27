# Folio Portal Setup

Folio reads PDF documents from one configured Google Drive folder. The browser communicates only with the portal’s own endpoints; the Google Drive API key remains server-side. The active connection uses the public-folder mode, which is appropriate only for documents that may be accessed by anyone who has the folder link.

## Required configuration

| Setting | Required value | Purpose |
| --- | --- | --- |
| `DRIVE_PORTAL_ACCESS_MODE` | `public` | Enables the public-folder access strategy. |
| `GOOGLE_DRIVE_FOLDER_ID` | The identifier after `/folders/` in the Google Drive folder URL | Limits the portal to one Drive folder. |
| `GOOGLE_DRIVE_API_KEY` | A Google Cloud API key from a project with the Google Drive API enabled | Authenticates the server’s Drive API requests. |

The folder and any PDFs presented by the portal must permit public viewing. Folder-level sharing normally propagates to the files and subfolders within it, although stricter individual-file settings may still affect availability. [1]

## Google Cloud security checklist

Enable the Google Drive API in the API Library for the Cloud project that owns the API key. Google documents that enabling an API associates it with the selected project and allows it to be called. [2]

Restrict the API key to the **Google Drive API** in **APIs & Services → Credentials**. Google recommends both API and client restrictions for API keys. [3] Because Folio makes the key’s request from its server rather than the browser, do not set a browser-referrer restriction. An IP restriction is feasible only if the deployed hosting environment has stable, known egress IP addresses; otherwise, keep the key stored exclusively as a server secret, rotate it if exposed, and monitor its usage.

## Portal behavior

The portal lists only Drive files whose MIME type is `application/pdf`, orders them by natural filename order, and displays each file’s Drive ID, modification date, and size. Optional groups are created from a Drive description such as `Category: Policies`; files without that tag appear under **Documents**.

While the portal is open, it checks the folder every 60 seconds and after the browser regains focus. The refresh control invokes the same server-side listing endpoint immediately. The selected document ID is saved locally only while it remains in the current authorized listing; otherwise Folio clears it and selects the first available PDF.

> If the folder should not be public, change `DRIVE_PORTAL_ACCESS_MODE` to `private`, remove the API key from the active configuration, and configure a dedicated service account with **Viewer** access to the Drive folder. The backend already supports this mode; it is safer than broad public sharing for internal documents.

## References

[1]: https://support.google.com/drive/answer/7166529 "Google Drive Help — Share folders in Google Drive"
[2]: https://support.google.com/googleapi/answer/6158841?hl=en "Google API Console Help — Enable and disable APIs"
[3]: https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys "Google Cloud — Adding restrictions to API keys"
