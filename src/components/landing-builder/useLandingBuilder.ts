import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAuthHeaders } from '../LoginPage';
import type {
  LandingBuilderDocument,
  LandingContentManifest,
  LandingBuilderSaveStatus,
  LandingBuilderState,
  LandingBuilderType,
} from './types';

const SAVE_DELAY = 800;
const PREVIEW_DELAY = 300;

export function useLandingBuilder(type: LandingBuilderType) {
  const [document, setDocument] = useState<LandingBuilderDocument | null>(null);
  const [published, setPublished] = useState<LandingBuilderDocument | null>(null);
  const [defaults, setDefaults] = useState<LandingBuilderDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<LandingBuilderSaveStatus>('idle');
  const [publishing, setPublishing] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(true);
  const [contentManifest, setContentManifest] = useState<LandingContentManifest>({ groups: [], total: 0 });

  const documentRef = useRef<LandingBuilderDocument | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);
  const previewSequenceRef = useRef(0);
  const saveChainRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const dirtyRef = useRef(false);
  const publishingRef = useRef(false);
  const documentRevisionRef = useRef(Date.now());
  const historyRef = useRef<LandingBuilderDocument[]>([]);
  const historyIndexRef = useRef(-1);
  const [historyVersion, setHistoryVersion] = useState(0);

  const resetHistory = useCallback((next: LandingBuilderDocument) => {
    historyRef.current = [JSON.parse(JSON.stringify(next))];
    historyIndexRef.current = 0;
    setHistoryVersion((value) => value + 1);
  }, []);

  const recordHistory = useCallback((next: LandingBuilderDocument) => {
    const history = historyRef.current.slice(0, historyIndexRef.current + 1);
    history.push(JSON.parse(JSON.stringify(next)));
    if (history.length > 80) history.shift();
    historyRef.current = history;
    historyIndexRef.current = history.length - 1;
    setHistoryVersion((value) => value + 1);
  }, []);

  const requestPreview = useCallback(async (next: LandingBuilderDocument) => {
    const sequence = ++previewSequenceRef.current;
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/landing-builder/${type}/preview`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: next }),
        signal: controller.signal,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body?.error || 'Preview gagal dimuat');
      if (sequence === previewSequenceRef.current) {
        setPreviewHtml(body.html || '');
        setContentManifest(body.content_manifest || { groups: [], total: 0 });
        setPreviewError(null);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError' && sequence === previewSequenceRef.current) {
        setPreviewError(err?.message || 'Preview gagal dimuat');
      }
    } finally {
      if (sequence === previewSequenceRef.current) setPreviewLoading(false);
    }
  }, [type]);

  const persistDraft = useCallback(async (next: LandingBuilderDocument, clientUpdatedAt: number) => {
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/landing-builder/${type}/draft`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: next, client_updated_at: clientUpdatedAt }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body?.error || 'Gagal menyimpan draft');
      const state = body.data as LandingBuilderState;
      setPublished(state.published);
      setPublishedAt(state.published_at);
      const isLatestLocalDocument = JSON.stringify(documentRef.current) === JSON.stringify(next);
      if (isLatestLocalDocument) {
        documentRef.current = state.draft;
        documentRevisionRef.current = Math.max(documentRevisionRef.current, state.draft_client_updated_at || 0);
        setDocument(state.draft);
        dirtyRef.current = false;
      }
      setSaveStatus('saved');
      setMutationError(null);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 1800);
      return true;
    } catch (err: any) {
      setSaveStatus('error');
      setMutationError(err?.message || 'Gagal menyimpan draft');
      return false;
    }
  }, [type]);

  const saveDraft = useCallback((next: LandingBuilderDocument, clientUpdatedAt: number) => {
    const operation = saveChainRef.current
      .catch(() => false)
      .then(() => persistDraft(next, clientUpdatedAt));
    saveChainRef.current = operation;
    return operation;
  }, [persistDraft]);

  const scheduleChanges = useCallback((next: LandingBuilderDocument, clientUpdatedAt: number) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveDraft(next, clientUpdatedAt), SAVE_DELAY);
    previewTimerRef.current = setTimeout(() => requestPreview(next), PREVIEW_DELAY);
  }, [requestPreview, saveDraft]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/landing-builder/${type}`, { headers: getAuthHeaders() });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body?.error || 'Gagal memuat editor');
      const state = body.data as LandingBuilderState;
      const next = state.draft;
      documentRef.current = next;
      documentRevisionRef.current = Math.max(Date.now(), state.draft_client_updated_at || 0);
      dirtyRef.current = false;
      setDocument(next);
      resetHistory(next);
      setPublished(state.published);
      setDefaults(body.defaults as LandingBuilderDocument);
      setContentManifest(body.content_manifest || { groups: [], total: 0 });
      setPublishedAt(state.published_at);
      await requestPreview(next);
    } catch (err: any) {
      setLoadError(err?.message || 'Gagal memuat editor');
      setPreviewLoading(false);
    } finally {
      setLoading(false);
    }
  }, [requestPreview, resetHistory, type]);

  useEffect(() => {
    load();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      previewAbortRef.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    const persistBeforeUnload = () => {
      const current = documentRef.current;
      if (!dirtyRef.current || !current) return;
      fetch(`/api/landing-builder/${type}/draft`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: current, client_updated_at: documentRevisionRef.current }),
        keepalive: true,
      }).catch(() => undefined);
    };
    window.addEventListener('beforeunload', persistBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', persistBeforeUnload);
      persistBeforeUnload();
    };
  }, [type]);

  const updateDocument = useCallback((updater: (current: LandingBuilderDocument) => LandingBuilderDocument) => {
    const current = documentRef.current;
    if (!current || publishingRef.current) return;
    const next = updater(current);
    const revision = Math.max(Date.now(), documentRevisionRef.current + 1);
    documentRevisionRef.current = revision;
    documentRef.current = next;
    dirtyRef.current = true;
    setDocument(next);
    recordHistory(next);
    scheduleChanges(next, revision);
  }, [recordHistory, scheduleChanges]);

  const applyHistoryAt = useCallback((index: number) => {
    const snapshot = historyRef.current[index];
    if (!snapshot || publishingRef.current) return;
    const next = JSON.parse(JSON.stringify(snapshot)) as LandingBuilderDocument;
    historyIndexRef.current = index;
    setHistoryVersion((value) => value + 1);
    const revision = Math.max(Date.now(), documentRevisionRef.current + 1);
    documentRevisionRef.current = revision;
    documentRef.current = next;
    dirtyRef.current = true;
    setDocument(next);
    scheduleChanges(next, revision);
  }, [scheduleChanges]);

  const undo = useCallback(() => applyHistoryAt(historyIndexRef.current - 1), [applyHistoryAt]);
  const redo = useCallback(() => applyHistoryAt(historyIndexRef.current + 1), [applyHistoryAt]);

  const publish = useCallback(async () => {
    if (!documentRef.current || publishingRef.current) return false;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setPublishing(true);
    publishingRef.current = true;
    try {
      // Serialize publish behind an autosave that may already be in-flight so a
      // stale draft request can never finish after publication.
      await saveChainRef.current.catch(() => false);
      const current = documentRef.current;
      if (!current) return false;
      const res = await fetch(`/api/landing-builder/${type}/publish`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: current, client_updated_at: documentRevisionRef.current }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body?.error || 'Publish gagal');
      const state = body.data as LandingBuilderState;
      setDocument(state.draft);
      documentRef.current = state.draft;
      setPublished(state.published);
      setPublishedAt(state.published_at);
      dirtyRef.current = false;
      setSaveStatus('saved');
      setMutationError(null);
      return true;
    } catch (err: any) {
      setMutationError(err?.message || 'Publish gagal');
      setSaveStatus('error');
      return false;
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  }, [type]);

  const flushDraft = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const queuedSaved = await saveChainRef.current.catch(() => false);
    if (!dirtyRef.current) return queuedSaved;
    const current = documentRef.current;
    if (!current) return true;
    return saveDraft(current, documentRevisionRef.current);
  }, [saveDraft]);

  const restorePublished = useCallback(() => {
    if (!published || publishingRef.current) return;
    const next = JSON.parse(JSON.stringify(published)) as LandingBuilderDocument;
    const revision = Math.max(Date.now(), documentRevisionRef.current + 1);
    documentRevisionRef.current = revision;
    documentRef.current = next;
    dirtyRef.current = true;
    setDocument(next);
    recordHistory(next);
    scheduleChanges(next, revision);
  }, [published, recordHistory, scheduleChanges]);

  const hasUnpublishedChanges = useMemo(() => {
    if (!document || !published) return false;
    return JSON.stringify(document) !== JSON.stringify(published);
  }, [document, published]);

  const error = mutationError || loadError || previewError;
  const canUndo = historyVersion >= 0 && historyIndexRef.current > 0;
  const canRedo = historyVersion >= 0 && historyIndexRef.current >= 0 && historyIndexRef.current < historyRef.current.length - 1;

  return {
    document,
    defaults,
    loading,
    error,
    loadError,
    previewError,
    saveStatus,
    publishing,
    publishedAt,
    previewHtml,
    previewLoading,
    contentManifest,
    hasUnpublishedChanges,
    updateDocument,
    publish,
    flushDraft,
    restorePublished,
    canUndo,
    canRedo,
    undo,
    redo,
    reload: load,
  };
}
