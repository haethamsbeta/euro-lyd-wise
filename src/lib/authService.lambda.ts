// Stub implementation for the future AWS Lambda REST backend.
// Each method documents the expected endpoint contract that the Lambda
// backend must implement. Switch on with VITE_AUTH_BACKEND=lambda.
import type { AuthService } from "./authService";

const BASE = import.meta.env.VITE_LAMBDA_API_BASE_URL ?? "";

function notImplemented(name: string): never {
  throw new Error(
    `[authService.lambda] ${name} not implemented yet. ` +
      `Set VITE_LAMBDA_API_BASE_URL and wire endpoints when AWS backend is ready.`,
  );
}

export const lambdaAuthService: AuthService = {
  // POST {BASE}/auth/sign-in  { email, password } -> { userId, email, mustChangePassword, token }
  async signIn() {
    void BASE;
    notImplemented("signIn");
  },
  // POST {BASE}/auth/forgot-password  { email } -> 204
  async sendPasswordResetEmail() {
    notImplemented("sendPasswordResetEmail");
  },
  // POST {BASE}/auth/reset-password  { token, newPassword } -> 204
  async updateOwnPassword() {
    notImplemented("updateOwnPassword");
  },
  // POST {BASE}/auth/me/clear-must-change-password -> 204
  async clearMustChangePassword() {
    notImplemented("clearMustChangePassword");
  },
  // POST {BASE}/auth/sign-out -> 204
  async signOut() {
    notImplemented("signOut");
  },
  // GET  {BASE}/users/{userId}/must-change-password -> { mustChangePassword }
  async getMustChangePassword() {
    notImplemented("getMustChangePassword");
  },
};