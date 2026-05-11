export interface GramJsLikeClient {
  getDialogs(params?: { limit?: number; folder?: number }): Promise<unknown[]>;
  getEntity(entity: unknown): Promise<unknown>;
  getMessages(entity: unknown, params?: Record<string, unknown>): Promise<unknown[]>;
  getParticipants(entity: unknown, params?: Record<string, unknown>): Promise<unknown[]>;
  invoke(request: unknown): Promise<unknown>;
}
