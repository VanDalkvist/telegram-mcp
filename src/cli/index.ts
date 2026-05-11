#!/usr/bin/env node
import { runAuth } from "./auth.js";
import { runServer } from "./server.js";

const command = process.argv[2];

if (command === "auth") {
  await runAuth();
} else {
  await runServer();
}
