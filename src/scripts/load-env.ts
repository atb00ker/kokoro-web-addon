import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function loadEnvFile(): { sourcePath: string } {
  const envPath = join(root, ".env");
  const examplePath = join(root, ".env.example");
  const sourcePath = existsSync(envPath) ? envPath : examplePath;

  if (!existsSync(sourcePath)) {
    throw new Error(
      "Missing .env and .env.example. Copy .env.example to .env and fill in values (see docs/SETUP.md).",
    );
  }

  dotenv.config({ path: sourcePath });
  return { sourcePath };
}

export function envOrDefault(key: string, fallback: string): string {
  const value = process.env[key]?.trim();
  return value || fallback;
}
