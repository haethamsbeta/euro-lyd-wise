import { supabase } from "@/integrations/supabase/client";
import type { AuthService, SignInResult } from "./authService";

export const supabaseAuthService: AuthService = {
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const userId = data.user!.id;
    const must = await this.getMustChangePassword(userId);
    return { userId, email: data.user?.email ?? null, mustChangePassword: must } satisfies SignInResult;
  },
  async sendPasswordResetEmail(email) {
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  },
  async updateOwnPassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },
  async clearMustChangePassword() {
    const { error } = await supabase.rpc("clear_must_change_password");
    if (error) throw error;
  },
  async signOut() {
    await supabase.auth.signOut();
  },
  async getMustChangePassword(userId) {
    const { data } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", userId)
      .maybeSingle();
    return Boolean((data as any)?.must_change_password);
  },
};