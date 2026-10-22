import test from 'node:test';
import assert from 'node:assert/strict';
import { getMicrophoneError, getRecordingExtension, getRecordingMimeType } from '../src/lib/voice-recording.js';

test('recording format selection preserves Safari MP4 and Chromium WebM', () => {
  assert.equal(getRecordingMimeType({ isTypeSupported: type => type === 'audio/mp4' }), 'audio/mp4');
  assert.equal(getRecordingMimeType({ isTypeSupported: type => type.startsWith('audio/webm') }), 'audio/webm;codecs=opus');
  assert.equal(getRecordingExtension('audio/mp4;codecs=mp4a.40.2'), 'mp4');
  assert.equal(getRecordingExtension('audio/webm;codecs=opus'), 'webm');
  assert.equal(getRecordingExtension('video/mp4'), 'mp4');
});

test('native recorder fallback does not guess an unsupported upload extension', () => {
  assert.equal(getRecordingMimeType({}), '');
  assert.equal(getRecordingMimeType({ isTypeSupported: () => false }), '');
  for (const type of ['', undefined, 'audio/ogg', 'audio/aac', 'text/plain']) {
    assert.equal(getRecordingExtension(type), null);
  }
  assert.equal(getRecordingExtension('audio/x-m4a'), 'm4a');
  assert.equal(getRecordingExtension('audio/mpeg'), 'mp3');
  assert.equal(getRecordingExtension('audio/x-wav'), 'wav');
});

test('microphone failures give actionable fallback without leaking browser error details', () => {
  assert.match(getMicrophoneError({ name: 'NotAllowedError', message: 'sensitive provider data' }), /access was denied/);
  assert.match(getMicrophoneError({ name: 'NotFoundError' }), /No microphone/);
  assert.match(getMicrophoneError({ name: 'NotReadableError' }), /other apps/);
  assert.match(getMicrophoneError({ name: 'UnexpectedError' }), /manual form/);
  assert.doesNotMatch(getMicrophoneError({ name: 'Unknown', message: 'private device info' }), /private device info/);
});
