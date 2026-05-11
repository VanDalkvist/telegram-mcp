import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { runTelegramAuthFlow } from "../composition/auth.js";
import { loadConfigFromDotenv } from "../config/config.js";
import { toPublicError } from "../domain/errors.js";

export async function runAuth(): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    const config = loadConfigFromDotenv();
    await runTelegramAuthFlow(config, {
      phoneNumber: async () => rl.question("phone number: "),
      phoneCode: async () => rl.question("login code: "),
      password: async () => rl.question("2FA password: "),
      onError: (error) => {
        process.stderr.write(`${String(error)}\n`);
      }
    });

    process.stderr.write(`Telegram session saved to ${config.sessionPath}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: toPublicError(error) })}\n`);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}
