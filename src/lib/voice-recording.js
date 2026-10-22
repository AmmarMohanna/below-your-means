// Keep the format selected by the browser: iPhone Safari records MP4, while
// Chromium commonly records WebM. These formats are accepted by transcription.
const RECORDING_TYPES = [
  "audio/webm;codecs=opus",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm",
];

export function getRecordingMimeType(Recorder) {
  if (typeof Recorder?.isTypeSupported !== "function") return "";
  return RECORDING_TYPES.find((type) => Recorder.isTypeSupported(type)) || "";
}

export function getRecordingExtension(mimeType) {
  const type = mimeType?.split(";")[0].trim().toLowerCase();
  if (["audio/webm", "video/webm"].includes(type)) return "webm";
  if (["audio/mp4", "video/mp4"].includes(type)) return "mp4";
  if (["audio/m4a", "audio/x-m4a"].includes(type)) return "m4a";
  if (["audio/mpeg", "audio/mp3", "audio/mpga"].includes(type)) return "mp3";
  if (["audio/wav", "audio/wave", "audio/x-wav"].includes(type)) return "wav";
  return null;
}

export function getMicrophoneError(error) {
  switch (error?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone access was denied. Allow it in your browser settings, or use the manual form.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No microphone was found. Connect one, or use the manual form.";
    case "NotReadableError":
    case "TrackStartError":
      return "The microphone is unavailable. Close other apps using it and try again, or use the manual form.";
    default:
      return "Recording could not start. Try again, or use the manual form.";
  }
}
