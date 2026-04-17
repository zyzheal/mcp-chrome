#!/usr/bin/env node
import serverInstance from './server';
import nativeMessagingHostInstance from './native-messaging-host';

// Log startup information to stderr (Native Messaging uses stdout for protocol)
console.error('[NativeServer] ======================================================');
console.error('[NativeServer] Native Server starting up...');
console.error('[NativeServer] PID:', process.pid);
console.error('[NativeServer] Node.js:', process.version);
console.error('[NativeServer] Platform:', process.platform);
console.error('[NativeServer] ======================================================');

try {
  serverInstance.setNativeHost(nativeMessagingHostInstance);
  nativeMessagingHostInstance.setServer(serverInstance);
  console.error('[NativeServer] Server and NativeMessagingHost linked');
  nativeMessagingHostInstance.start();
  console.error(
    '[NativeServer] NativeMessagingHost.start() called - waiting for Chrome extension messages',
  );
} catch (error) {
  console.error('[NativeServer] FATAL: Failed to initialize:', error);
  process.exit(1);
}

process.on('error', (error) => {
  console.error('[NativeServer] process error:', error.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.error('[NativeServer] SIGINT received, exiting');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('[NativeServer] SIGTERM received, exiting');
  process.exit(0);
});

process.on('exit', (code) => {
  console.error(`[NativeServer] Process exiting with code ${code}`);
});

process.on('uncaughtException', (error) => {
  console.error('[NativeServer] Uncaught exception:', error.message);
  console.error('[NativeServer] Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[NativeServer] Unhandled rejection:', reason);
});
