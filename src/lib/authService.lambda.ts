import type { AuthService, SignInResult } from "./authService";
import { api } from "@/lib/api";
import type { LoginResponse } from "@/lib/api/auth";
import { clearDahabAuthStorage, getAccessToken, setLambdaAuthSession } from "@/lib/dahabAuthToken";
import { normalizeLambdaUser } from "@/lib/lambdaUser";

function payloadFromLogin(res: LoginResponse) {
  return res?.data?.access_token || res?.data?.token ? res.data : res;
}

export const lambdaAuthService: AuthService = {
  async signIn(email, password) {
    const payload = payloadFromLogin(await api.auth.login({ email, password }));
    const accessToken = payload?.access_token ?? payload?.token;
    if (!accessToken) throw new Error("Lambda login did not return an access token.");

    const user = normalizeLambdaUser(payload);
    setLambdaAuthSession({
      accessToken,
      refreshToken: payload?.refresh_token ?? null,
      user,
    });

    return {
      userId: user.id ?? user.userId ?? "",
      email: user.email ?? null,
      mustChangePassword: Boolean(
        payload?.user?.must_change_password ??
        payload?.user?.mustChangePassword ??
        payload?.must_change_password ??
        payload?.mustChangePassword,
      ),
    } satisfies SignInResult;
  },

  async sendPasswordResetEmail(email) {
    await api.auth.forgotPassword(email);
  },

  async updateOwnPassword(newPassword, currentPassword) {
    if (!currentPassword) {
      throw new Error("Current password is required to change your password.");
    }
    await api.auth.changePassword(currentPassword, newPassword);
  },

  async clearMustChangePassword() {
    // Lambda clears must_change_password as part of /auth/change-password.
  },

  async signOut() {
    if (getAccessToken()) {
      try {
        await api.auth.logout();
      } catch {
        // Local sign-out must still complete if the session is already expired.
      }
    }
    clearDahabAuthStorage();
  },

  async getMustChangePassword() {
    if (!getAccessToken()) return false;
    const me = await api.auth.me();
    return Boolean(me?.mustChangePassword);
  },
};
