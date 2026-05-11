export interface AuthPrompts {
  phoneNumber(): Promise<string>;
  phoneCode(): Promise<string>;
  password(): Promise<string>;
  onError(error: Error): void;
}
