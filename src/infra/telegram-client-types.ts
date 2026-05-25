export interface GramJsLikeClient {
  getDialogs(params?: {
    limit?: number;
    folder?: number;
    offsetDate?: number;
    offsetId?: number;
    offsetPeer?: unknown;
    ignorePinned?: boolean;
  }): Promise<unknown[]>;
  getEntity(entity: unknown): Promise<unknown>;
  getMessages(entity: unknown, params?: Record<string, unknown>): Promise<unknown[]>;
  getParticipants(entity: unknown, params?: Record<string, unknown>): Promise<unknown[]>;
  downloadProfilePhoto(entity: unknown, params?: Record<string, unknown>): Promise<string | Buffer | undefined>;
  invoke(request: unknown): Promise<unknown>;
}
