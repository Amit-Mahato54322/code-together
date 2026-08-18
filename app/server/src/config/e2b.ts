import "dotenv/config";

export function getE2BApiKey(): string {
  const e2bApiKey = process.env.E2B_API_KEY?.trim();

  if (!e2bApiKey) {
    throw new Error("Missing required environment variable: E2B_API_KEY");
  }

  return e2bApiKey;
}
