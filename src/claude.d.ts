/**
 * Ambient types for the runtime that claude.ai provides to a published artifact,
 * plus the jsPDF global loaded from cdnjs.
 *
 * This is a hand-written subset covering only what the app calls. It is derived
 * from the Artifact runtime contract (version 0.2.91). If a runtime call is added
 * to the app, or the contract changes, update this file to match.
 *
 * This file has no imports or exports on purpose, so its declarations are global.
 */

/* ---------- db capability ---------- */

type DbErrorCode =
  | "invalid_argument"
  | "resource_exhausted"
  | "quota_exceeded"
  | "unavailable"
  | "revoked"
  | "not_granted"
  | "capability_disabled"
  | "capability_removed"
  | "transform_error";

interface DbError {
  code: DbErrorCode;
  message: string;
}

type DbData = Record<string, unknown>;
type Unsubscribe = () => void;

interface DbDocumentSnapshot {
  id: string;
  exists: boolean;
  /** `undefined` when the document does not exist. */
  data(): DbData | undefined;
}

interface DbQuerySnapshot {
  docs: DbDocumentSnapshot[];
  size: number;
  empty: boolean;
}

interface DbAcquireOptions {
  /** Identifies who holds the lease. Use a per-tab id, not the user id. */
  holder: string;
  ttlMs?: number;
  data?: DbData;
}

interface DbAcquireResult {
  acquired: boolean;
  version?: number;
  expiresAt?: string;
  holder?: string;
}

interface DbDocumentReference {
  id: string;
  path: string;
  get(): Promise<DbDocumentSnapshot>;
  /** Replaces the whole document. */
  set(data: DbData): Promise<void>;
  /** Merges the given fields into the document. */
  update(data: DbData): Promise<void>;
  delete(): Promise<void>;
  acquire(options: DbAcquireOptions): Promise<DbAcquireResult>;
  onSnapshot(next: (snap: DbDocumentSnapshot) => void, error?: (e: DbError) => void): Unsubscribe;
}

interface DbQuery {
  orderBy(field: string, dir?: "asc" | "desc"): DbQuery;
  limit(n: number): DbQuery;
  get(): Promise<DbQuerySnapshot>;
  onSnapshot(next: (snap: DbQuerySnapshot) => void, error?: (e: DbError) => void): Unsubscribe;
}

interface DbCollectionReference extends DbQuery {
  path: string;
  doc(id?: string): DbDocumentReference;
  add(data: DbData): Promise<DbDocumentReference>;
}

interface ClaudeDb {
  doc(path: string): DbDocumentReference;
  collection(path: string): DbCollectionReference;
}

/* ---------- user capability ---------- */

interface ClaudeUserProfile {
  id: string;
  name: string;
  avatarUrl: string;
  color: string;
  email: string | null;
  isMe: boolean;
  guest: boolean;
}

interface ClaudeUser {
  /** The viewer's id, or null when the viewer is not signed in. */
  id(): Promise<string | null>;
  /**
   * Whether the viewer holds a capability, for example `can("data.write")`.
   * Resolves `null` when the platform has not said. It is a Promise: always await it.
   */
  can(capability: string): Promise<boolean | null>;
  profiles(ids: readonly string[] | string): Promise<Record<string, ClaudeUserProfile>>;
}

/* ---------- downloads capability ---------- */

interface ClaudeSaveRequest {
  filename: string;
  data: string | Blob | ArrayBuffer | ArrayBufferView;
}

interface ClaudeDownloads {
  save(request: ClaudeSaveRequest): Promise<{ status: "saved" | "delivered" }>;
}

/* ---------- runtime entry point ---------- */

interface ClaudeCapabilities {
  db: ClaudeDb;
  user: ClaudeUser;
  downloads: ClaudeDownloads;
}

interface ClaudeRuntime {
  /** Resolves `null` when this view cannot run the capability. */
  use<K extends keyof ClaudeCapabilities>(name: K): Promise<ClaudeCapabilities[K] | null>;
}

declare const claude: ClaudeRuntime;

/* ---------- jsPDF (loaded from cdnjs) ---------- */

interface JsPdfDocument {
  setFont(fontName: string | undefined, fontStyle?: string): JsPdfDocument;
  setFontSize(size: number): JsPdfDocument;
  text(text: string | string[], x: number, y: number): JsPdfDocument;
  splitTextToSize(text: string, maxWidth: number): string[];
  output(type: "blob"): Blob;
}

interface Window {
  /** Absent if the cdnjs script failed to load. */
  jspdf?: { jsPDF: new () => JsPdfDocument };
}
