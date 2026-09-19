"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getTodayBeirut } from "@/lib/date";
import { buildTransactionPayload, MAX_DESCRIPTION_LENGTH, validateEntryFields } from "@/lib/transaction-entry";
import { MAX_AUDIO_BYTES, MAX_RECORDING_SECONDS, MAX_TRANSCRIPT_LENGTH } from "@/lib/voice-contract";
import { getMicrophoneError, getRecordingExtension, getRecordingMimeType } from "@/lib/voice-recording";

import entryStyles from "@/app/dashboard/dashboard.module.css";
import styles from "./voice-entry.module.css";

const PROCESSING_TIMEOUT = 65_000;
const SAVE_TIMEOUT = 30_000;
const PERMISSION_TIMEOUT = 20_000;
const UNCERTAIN_SAVE_MESSAGE = "We could not confirm whether this entry was added. Close this review and check your entries before recording or adding it again.";

function hasVoiceSupport() {
  return Boolean(navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder === "function" && typeof window.HTMLDialogElement?.prototype.showModal === "function");
}

function stopTracks(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

function releaseCapture(session) {
  if (!session) return;
  session.captureActive = false;
  clearTimeout(session.permissionTimer);
  clearTimeout(session.stopTimer);
  clearInterval(session.recordingTimer);
  if (session.recorder) {
    session.recorder.ondataavailable = null;
    session.recorder.onstop = null;
    session.recorder.onerror = null;
    if (session.recorder.state !== "inactive") {
      try { session.recorder.stop(); } catch { /* A stopped device may already be inactive. */ }
    }
  }
  stopTracks(session.stream);
  session.source?.disconnect();
  if (session.audioContext) session.audioContext.close().catch(() => {});
  session.stream = null;
  session.source = null;
  session.audioContext = null;
}

function blankDraft(context) {
  return { type: "", amount: "", currency: "USD", description: "", scope: context.scope, date: context.selectedDate };
}

function formatReviewDate(date) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Choose date";
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return "Choose date";
  return parsed.toLocaleDateString("en-GB", { timeZone: "Asia/Beirut", day: "numeric", month: "short", year: "numeric" });
}

function trapDialogFocus(event) {
  if (event.key !== "Tab") return;
  const controls = Array.from(event.currentTarget.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex='-1'])"))
    .filter((element) => element.getClientRects().length > 0);
  event.preventDefault();
  if (!controls.length) return;
  // Safari can skip buttons during native Tab navigation depending on the
  // user's keyboard preferences. Traverse explicitly so focus stays in review.
  const activeIndex = controls.indexOf(document.activeElement);
  const nextIndex = activeIndex < 0
    ? (event.shiftKey ? controls.length - 1 : 0)
    : (activeIndex + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
  controls[nextIndex].focus();
}

/** A voice draft never shares state with the manual form or writes until confirm. */
export default function VoiceEntry({ selectedDate, scope, disabled = false, onSaved, onCheckEntries }) {
  const [phase, setPhase] = useState("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [clarification, setClarification] = useState("");
  const [unsupported, setUnsupported] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [uncertainSave, setUncertainSave] = useState(false);
  const [reviewStatus, setReviewStatus] = useState("");
  const sessionRef = useRef(null);
  const generationRef = useRef(0);
  const revisionRef = useRef(0);
  const savingRef = useRef(false);
  const microphoneRef = useRef(null);
  const dialogRef = useRef(null);
  const titleRef = useRef(null);

  const isCurrent = (session) => sessionRef.current === session && session.id === generationRef.current;

  const invalidateSession = useCallback(() => {
    generationRef.current += 1;
    const session = sessionRef.current;
    sessionRef.current = null;
    session?.controller?.abort();
    clearTimeout(session?.requestTimer);
    releaseCapture(session);
  }, []);

  useEffect(() => {
    setSupported(hasVoiceSupport());
    const stopBackgroundCapture = () => {
      if (document.visibilityState !== "hidden" || !sessionRef.current?.captureActive || savingRef.current) return;
      invalidateSession();
      setPhase("idle");
      setError("Recording stopped when the app went into the background. Record again, or use the manual form.");
    };
    document.addEventListener("visibilitychange", stopBackgroundCapture);
    return () => {
      document.removeEventListener("visibilitychange", stopBackgroundCapture);
      invalidateSession();
    };
  }, [invalidateSession]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!reviewOpen) {
      if (dialog.open) {
        dialog.close();
        microphoneRef.current?.focus();
      }
      return;
    }
    if (!dialog.open) dialog.showModal();
    titleRef.current?.focus();

    // Safari's keyboard changes the visual viewport, not always the layout viewport.
    const viewport = window.visualViewport;
    const updateViewport = () => {
      dialog.style.setProperty("--voice-viewport-height", `${viewport?.height || window.innerHeight}px`);
      dialog.style.setProperty("--voice-viewport-top", `${viewport?.offsetTop || 0}px`);
    };
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
      document.body.style.overflow = previousOverflow;
    };
  }, [reviewOpen]);

  const cancelRecording = () => {
    invalidateSession();
    setPhase("idle");
    setElapsed(0);
    setError("");
    microphoneRef.current?.focus();
  };

  const dismissReview = () => {
    if (savingRef.current) return;
    const shouldCheck = uncertainSave;
    invalidateSession();
    setReviewOpen(false);
    setPhase("idle");
    setDraft(null);
    setTranscript("");
    setClarification("");
    setUnsupported(false);
    setSaveError("");
    setReviewStatus("");
    setUncertainSave(false);
    if (shouldCheck) onCheckEntries?.();
  };

  async function requestJson(session, url, options, timeout = PROCESSING_TIMEOUT) {
    const controller = new AbortController();
    session.controller = controller;
    let timedOut = false;
    const requestTimer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
    session.requestTimer = requestTimer;
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const failure = new Error(data?.error || "The request failed. Please try again.");
        failure.status = response.status;
        failure.uncertain = Boolean(data?.uncertain);
        throw failure;
      }
      if (!data) throw new Error("The response could not be read. Please try again.");
      return data;
    } catch (failure) {
      if (timedOut) throw new Error("The request timed out. Please try again, or use the manual form.");
      throw failure;
    } finally {
      clearTimeout(requestTimer);
      if (session.requestTimer === requestTimer) session.requestTimer = null;
      if (session.controller === controller) session.controller = null;
    }
  }

  async function interpret(session, text, replacing = false) {
    if (session.interpreting || !isCurrent(session)) return;
    session.interpreting = true;
    const revision = revisionRef.current;
    setPhase("interpreting");
    setReviewStatus(replacing ? "Interpreting your transcript…" : "");
    setSaveError("");
    try {
      const result = await requestJson(session, "/api/transactions/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, ...session.context }),
      });
      if (!isCurrent(session)) return;
      if (revision !== revisionRef.current) {
        setReviewStatus("Your newer edits were kept. Interpret again only if you want to replace them.");
        return;
      }
      if (!["ready", "needs_clarification", "unsupported"].includes(result.status)) {
        throw new Error("The interpretation could not be read. Edit the fields or try interpreting again.");
      }
      const extracted = result.transaction;
      const nextDraft = blankDraft(session.context);
      if (extracted && result.status !== "unsupported") {
        nextDraft.type = extracted.type ?? "";
        nextDraft.amount = extracted.currency && extracted.currency !== "USD" ? "" : (extracted.amount ?? "");
        nextDraft.description = extracted.description ?? "";
        nextDraft.scope = extracted.scope ?? "";
        nextDraft.date = extracted.date ?? "";
      }
      setDraft(nextDraft);
      setUnsupported(result.status === "unsupported");
      setClarification(result.clarification_question || (result.status === "unsupported" ? "Record one transaction at a time, or use the manual form." : ""));
      setReviewStatus("");
      setReviewOpen(true);
    } catch (failure) {
      if (!isCurrent(session)) return;
      if (revision !== revisionRef.current) {
        setReviewStatus("Your newer edits were kept.");
        return;
      }
      if (!replacing) setDraft(blankDraft(session.context));
      setSaveError(failure.name === "AbortError" ? "Interpretation was interrupted. Try again or complete the fields." : failure.message || "Could not interpret the recording. Try again or complete the fields.");
      setReviewStatus("");
      setReviewOpen(true);
    } finally {
      session.interpreting = false;
      if (isCurrent(session)) setPhase("review");
    }
  }

  async function processRecording(session) {
    if (!isCurrent(session)) return;
    const mimeType = session.recorder.mimeType || session.chunks[0]?.type || session.mimeType;
    const silent = session.soundChecks >= 4 && !session.heardAudio;
    releaseCapture(session);
    const recording = new Blob(session.chunks, { type: mimeType });
    session.chunks = [];
    const extension = getRecordingExtension(recording.type);
    if (recording.size < 128 || silent || !extension || recording.size > MAX_AUDIO_BYTES) {
      const message = recording.size > MAX_AUDIO_BYTES ? "That recording was too large. Try a shorter entry." : !extension ? "This browser recorded an unsupported audio format. Use the manual form." : "We could not hear an entry. Try again and speak near the microphone, or use the manual form.";
      invalidateSession();
      setError(message);
      setPhase("idle");
      return;
    }
    setPhase("transcribing");
    const body = new FormData();
    body.append("file", recording, `entry.${extension}`);
    try {
      const result = await requestJson(session, "/api/transactions/transcribe", { method: "POST", body });
      if (!isCurrent(session)) return;
      if (typeof result.transcript !== "string" || !result.transcript.trim()) throw new Error("We could not hear an entry. Try again and speak near the microphone.");
      setTranscript(result.transcript);
      await interpret(session, result.transcript);
    } catch (failure) {
      if (!isCurrent(session)) return;
      invalidateSession();
      setError(failure.name === "AbortError" ? "Processing was interrupted. Try again, or use the manual form." : failure.message || "Could not process the recording. Try again, or use the manual form.");
      setPhase("idle");
    }
  }

  function stopRecording(session = sessionRef.current) {
    if (!session || !isCurrent(session) || session.stopping) return;
    session.stopping = true;
    clearInterval(session.recordingTimer);
    setPhase("transcribing");
    session.stopTimer = setTimeout(() => {
      if (!isCurrent(session)) return;
      invalidateSession();
      setPhase("idle");
      setError("The recording could not finish. Try again, or use the manual form.");
    }, 5_000);
    try {
      session.recorder.stop();
      stopTracks(session.stream);
    } catch {
      invalidateSession();
      setPhase("idle");
      setError("The recording could not finish. Try again, or use the manual form.");
    }
  }

  async function startRecording() {
    // Ref guards cover double taps before React paints the disabled button.
    if (sessionRef.current || savingRef.current || disabled) return;
    if (!hasVoiceSupport()) {
      setSupported(false);
      return;
    }
    setError("");
    setSaveError("");
    setUncertainSave(false);
    setElapsed(0);
    setPhase("requesting");
    revisionRef.current = 0;
    const session = { id: ++generationRef.current, context: { selectedDate, scope }, captureActive: true, chunks: [], bytes: 0, soundChecks: 0, heardAudio: false };
    sessionRef.current = session;
    session.permissionTimer = setTimeout(() => {
      if (!isCurrent(session)) return;
      invalidateSession();
      setPhase("idle");
      setError("Microphone permission is still pending. Allow access and try again, or use the manual form.");
    }, PERMISSION_TIMEOUT);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isCurrent(session)) { stopTracks(stream); return; }
      clearTimeout(session.permissionTimer);
      session.stream = stream;
      session.mimeType = getRecordingMimeType(window.MediaRecorder);
      session.recorder = new window.MediaRecorder(stream, session.mimeType ? { mimeType: session.mimeType } : undefined);
      const recorder = session.recorder;
      recorder.ondataavailable = (event) => {
        if (!isCurrent(session) || !event.data?.size) return;
        session.bytes += event.data.size;
        if (session.bytes > MAX_AUDIO_BYTES) {
          invalidateSession();
          setPhase("idle");
          setError("That recording was too large. Try a shorter entry, or use the manual form.");
          return;
        }
        session.chunks.push(event.data);
      };
      recorder.onstop = () => processRecording(session);
      recorder.onerror = () => {
        if (!isCurrent(session)) return;
        invalidateSession();
        setPhase("idle");
        setError("Recording was interrupted. Try again, or use the manual form.");
      };
      // Silence detection is optional; unsupported/suspended audio contexts fall
      // back to the server's empty-transcript handling.
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          session.audioContext = new AudioContext();
          session.source = session.audioContext.createMediaStreamSource(stream);
          session.analyser = session.audioContext.createAnalyser();
          session.analyser.fftSize = 2048;
          session.samples = new Float32Array(session.analyser.fftSize);
          session.source.connect(session.analyser);
          session.audioContext.resume().catch(() => {});
        }
      } catch {
        session.source?.disconnect();
        session.audioContext?.close().catch(() => {});
        session.audioContext = null;
      }
      recorder.start(1000);
      const startedAt = Date.now();
      setPhase("recording");
      session.recordingTimer = setInterval(() => {
        if (!isCurrent(session)) return;
        const seconds = Math.floor((Date.now() - startedAt) / 1000);
        setElapsed(Math.min(seconds, MAX_RECORDING_SECONDS));
        if (session.audioContext?.state === "running" && session.analyser) {
          session.analyser.getFloatTimeDomainData(session.samples);
          const rms = Math.sqrt(session.samples.reduce((sum, value) => sum + value * value, 0) / session.samples.length);
          session.soundChecks += 1;
          if (rms > 0.003) session.heardAudio = true;
        }
        if (seconds >= MAX_RECORDING_SECONDS) stopRecording(session);
      }, 250);
    } catch (failure) {
      if (!isCurrent(session)) return;
      invalidateSession();
      setPhase("idle");
      setError(getMicrophoneError(failure));
    }
  }

  function updateField(field, value) {
    if (savingRef.current || uncertainSave) return;
    revisionRef.current += 1;
    setDraft((previous) => ({ ...previous, [field]: value }));
    if (!unsupported) setClarification("");
    setSaveError("");
    setReviewStatus("");
  }

  async function confirmEntry() {
    if (savingRef.current || uncertainSave || unsupported || phase !== "review" || !draft) return;
    if (Object.keys(validateEntryFields(draft, { requireDescription: true })).length) return;
    const session = sessionRef.current;
    if (!session || !isCurrent(session)) return;
    savingRef.current = true;
    setPhase("saving");
    setSaveError("");
    setReviewStatus("Adding your entry…");
    try {
      const payload = buildTransactionPayload(draft);
      const result = await requestJson(session, "/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }, SAVE_TIMEOUT);
      if (!isCurrent(session)) return;
      if (result.success !== true || !Number.isSafeInteger(Number(result.id)) || Number(result.id) <= 0) {
        throw new Error("The save response could not be confirmed.");
      }
      savingRef.current = false;
      invalidateSession();
      setReviewOpen(false);
      setDraft(null);
      setTranscript("");
      setClarification("");
      setUnsupported(false);
      setReviewStatus("");
      setPhase("idle");
      onSaved?.();
    } catch (failure) {
      if (!isCurrent(session)) return;
      // An error after an INSERT or a lost response may represent a successful
      // write. Never retry that draft: refresh the list when the review closes.
      const uncertain = failure.uncertain || !failure.status || failure.status >= 500 || failure.status === 408;
      setUncertainSave(uncertain);
      setSaveError(uncertain ? UNCERTAIN_SAVE_MESSAGE : failure.message || "Could not save this entry. Your edits are still here; try again.");
      setReviewStatus("");
      setPhase("review");
    } finally {
      savingRef.current = false;
    }
  }

  const fieldErrors = draft ? validateEntryFields(draft, { requireDescription: true }) : {};
  const saving = phase === "saving";
  const interpreting = phase === "interpreting";
  const fieldsLocked = saving || uncertainSave;
  const canConfirm = Boolean(draft) && phase === "review" && !unsupported && !uncertainSave && !Object.keys(fieldErrors).length;
  const active = ["requesting", "recording", "transcribing", "interpreting"].includes(phase) && !reviewOpen;

  return (
    <>
      <button ref={microphoneRef} type="button" className={styles.recordButton} aria-label="Record an entry" title="Record an entry" onClick={startRecording} disabled={!supported || disabled || active || reviewOpen}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></svg>
      </button>
      {(active || error || !supported) && <section className={styles.feedback} aria-label="Voice entry">
        {!supported && <p className={styles.hint}>Voice recording is unavailable in this browser. Use the manual form.</p>}
        {active && (
          <>
            <div className={styles.status}>
              <span role="status" className={styles.recordingLabel}>{phase === "recording" && <span className={styles.recordingDot} aria-hidden="true" />}{phase === "requesting" ? "Waiting for microphone access…" : phase === "recording" ? "Recording…" : phase === "transcribing" ? "Transcribing your recording…" : "Interpreting your entry…"}</span>
              {phase === "recording" && <span className={styles.elapsed} aria-label={`${elapsed} seconds recorded`}>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} / 1:00</span>}
            </div>
            <div className={styles.recordingActions}>
              <button type="button" className={styles.secondary} onClick={cancelRecording}>Cancel</button>
              {phase === "recording" && <button type="button" className={entryStyles.saveButton} aria-label="Stop recording" onClick={() => stopRecording()}>Stop</button>}
            </div>
          </>
        )}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </section>}

      <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="voice-review-title" aria-describedby="voice-review-intro" aria-busy={saving || interpreting}
        onKeyDown={trapDialogFocus}
        onCancel={(event) => { event.preventDefault(); dismissReview(); }}
        onClose={() => { if (reviewOpen && !savingRef.current) dismissReview(); }}>
        <h2 id="voice-review-title" ref={titleRef} tabIndex={-1} className={styles.title}>Review your entry</h2>
        <p id="voice-review-intro" className={styles.intro}>Change any field below. Your entry is added only when you confirm.</p>
        {clarification && <p className={styles.clarification} role="status">{clarification}</p>}
        {draft && <div className={styles.fields}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Entry type</span>
            <div className={entryStyles.segmented} role="group" aria-label="Entry type" aria-describedby={fieldErrors.type ? "voice-type-error" : undefined}>
              {["expense", "income"].map((value) => <button key={value} type="button" aria-pressed={draft.type === value} disabled={fieldsLocked}
                className={`${entryStyles.segment} ${draft.type === value ? entryStyles.segmentActive : ""}`}
                onClick={() => updateField("type", value)}>{value === "expense" ? "Expense" : "Income"}</button>)}
            </div>
            {fieldErrors.type && <p id="voice-type-error" className={styles.fieldError}>{fieldErrors.type}</p>}
          </div>
          <div className={styles.field}>
            <label className={`${entryStyles.amountInputWrap} ${styles.amount}`}>
              <span className={entryStyles.currency}>$</span>
              <input aria-label="Amount in US dollars" type="number" inputMode="decimal" step="0.01" min="0.01" required
                className={`${entryStyles.amountInput} ${styles.amountInput}`} placeholder="0.00" value={draft.amount} disabled={fieldsLocked}
                aria-invalid={Boolean(fieldErrors.amount)} aria-describedby={fieldErrors.amount ? "voice-amount-error" : undefined}
                onChange={(event) => updateField("amount", event.target.value)} onFocus={(event) => event.target.select()} />
              <span className={styles.usd}>USD</span>
            </label>
            {fieldErrors.amount && <p id="voice-amount-error" className={styles.fieldError}>{fieldErrors.amount}</p>}
          </div>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Description</span>
            <input aria-label="Description" type="text" className={entryStyles.textInput} placeholder={draft.type === "income" ? "Who paid you?" : "What was it for?"}
              required maxLength={MAX_DESCRIPTION_LENGTH} value={draft.description} disabled={fieldsLocked}
              aria-invalid={Boolean(fieldErrors.description)} aria-describedby={fieldErrors.description ? "voice-description-error" : undefined}
              onChange={(event) => updateField("description", event.target.value)} />
            {fieldErrors.description && <span id="voice-description-error" className={styles.fieldError}>{fieldErrors.description}</span>}
          </label>
          <div className={styles.options}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Scope</span>
              <select aria-label="Entry scope" className={`${entryStyles.scopeInput} ${styles.scope}`} value={draft.scope} disabled={fieldsLocked}
                aria-invalid={Boolean(fieldErrors.scope)} aria-describedby={fieldErrors.scope ? "voice-scope-error" : undefined}
                onChange={(event) => updateField("scope", event.target.value)}>
                <option value="" disabled>Choose scope</option><option value="personal">Personal</option><option value="business">Business</option>
              </select>
              {fieldErrors.scope && <span id="voice-scope-error" className={styles.fieldError}>{fieldErrors.scope}</span>}
            </label>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Date</span>
              <label className={`${entryStyles.dateInputWrap} ${styles.date}`}>
                <span>{formatReviewDate(draft.date)}</span>
                <input aria-label="Entry date" type="date" className={entryStyles.dateInput} value={draft.date} max={getTodayBeirut()} required disabled={fieldsLocked}
                  aria-invalid={Boolean(fieldErrors.date)} aria-describedby={fieldErrors.date ? "voice-date-error" : undefined}
                  onChange={(event) => updateField("date", event.target.value)} />
              </label>
              {fieldErrors.date && <p id="voice-date-error" className={styles.fieldError}>{fieldErrors.date}</p>}
            </div>
          </div>
        </div>}
        <details className={styles.transcript}>
          <summary>Transcript</summary>
          <textarea aria-label="Transcript" value={transcript} maxLength={MAX_TRANSCRIPT_LENGTH} disabled={fieldsLocked}
            onChange={(event) => { revisionRef.current += 1; setTranscript(event.target.value); setReviewStatus(""); }} />
          <p className={styles.transcriptHint}>Interpreting again replaces the fields above. You can also correct them directly.</p>
          <button type="button" className={`${styles.secondary} ${styles.replaceButton}`} disabled={fieldsLocked || interpreting || !transcript.trim()}
            onClick={() => { const session = sessionRef.current; if (session && !savingRef.current && !uncertainSave) interpret(session, transcript, true); }}>
            {interpreting ? "Interpreting…" : "Interpret again and replace fields"}
          </button>
        </details>
        {saveError && <p className={styles.error} role="alert">{saveError}</p>}
        {reviewStatus && <p className={styles.saveStatus} role="status">{reviewStatus}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={dismissReview} disabled={saving}>{uncertainSave ? "Close and check entries" : "Cancel"}</button>
          <button type="button" className={`${entryStyles.saveButton} ${styles.confirm}`} disabled={!canConfirm} onClick={confirmEntry}>{saving ? "Adding…" : "Confirm and add"}</button>
        </div>
      </dialog>
    </>
  );
}
