// Auth service abstraction. Switches implementation based on
// VITE_AUTH_BACKEND ("supabase" | "lambda"). The Supabase impl is the
// current backend; the lambda stub is a contract for the future AWS
// Lambda REST backend.
import { supabaseAuthService } from "./authService.supabase";
import { lambdaAuthService } from "./authService.lambda";

export interface SignInResult {
  userId: string;
  email: string | null;
  mustChangePassword: boolean;
}

export interface AuthService {
  signIn(email: string, password: string): Promise<SignInResult>;
  sendPasswordResetEmail(email: string): Promise<void>;
  updateOwnPassword(newPassword: string): Promise<void>;
  clearMustChangePassword(): Promise<void>;
  signOut(): Promise<void>;
  // Reads must_change_password for the currently authenticated user.
  getMustChangePassword(userId: string): Promise<boolean>;
}

const backend = (import.meta.env.VITE_AUTH_BACKEND ?? "supabase") as
  | "supabase"
  | "lambda";

export const authService: AuthService =
  backend === "lambda" ? lambdaAuthService : supabaseAuthService;