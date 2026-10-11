export function baseUrl(): string {
  // Read directly (not via env()) so pure modules/tests work without DATABASE_URL.
  return (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}
export function signupUrl(): string {
  return `${baseUrl()}/get-key`;
}
export function orderPageUrl(token: string): string {
  return `${baseUrl()}/order/${token}`;
}
export function reportPageUrl(token: string): string {
  return `${baseUrl()}/r/${token}`;
}
export const SIGNUP_HINT =
  "Get a free API key (includes 1 free Quick Check per day): POST /v1/keys {\"email\":\"you@example.com\"}, the form at /get-key, or the keyless MCP tool verify_signup.";
