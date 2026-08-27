import { useCallback, useEffect, useRef, useState } from "react";
import { getDocumentAccess, listDocuments, type DocumentAccess, type PortalDocument } from "@/lib/documentsApi";

const LIST_REFRESH_INTERVAL = 60_000;

export function useDrivePortal(selectedId: string | null) {
  const [documents, setDocuments] = useState<PortalDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [access, setAccess] = useState<DocumentAccess | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const initialLoadComplete = useRef(false);

  const refreshDocuments = useCallback(async () => {
    const initialLoad = !initialLoadComplete.current;
    if (initialLoad) setDocumentsLoading(true);
    else setIsRefreshing(true);

    try {
      setDocuments(await listDocuments());
      setDocumentsError(null);
    } catch (error) {
      setDocumentsError(error instanceof Error ? error.message : "The document collection is unavailable.");
    } finally {
      initialLoadComplete.current = true;
      setDocumentsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const refreshAccess = useCallback(async (fileId: string) => {
    setAccessLoading(true);
    try {
      setAccess(await getDocumentAccess(fileId));
      setAccessError(null);
    } catch (error) {
      setAccess(null);
      setAccessError(error instanceof Error ? error.message : "The portal could not verify access to this document.");
    } finally {
      setAccessLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDocuments();
    const refreshTimer = window.setInterval(() => void refreshDocuments(), LIST_REFRESH_INTERVAL);
    const onFocus = () => void refreshDocuments();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshDocuments]);

  useEffect(() => {
    if (!selectedId) {
      setAccess(null);
      setAccessError(null);
      setAccessLoading(false);
      return;
    }
    void refreshAccess(selectedId);
  }, [refreshAccess, selectedId]);

  return { documents, documentsLoading, documentsError, isRefreshing, refreshDocuments, access, accessLoading, accessError, refreshAccess };
}
