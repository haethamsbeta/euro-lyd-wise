// Auth service abstraction. Switches implementation based on
// VITE_AUTH_BACKEND ("supabase" | "lambda"), falling back to the active
// DATA_BACKEND so Lambda mode cannot accidentally call Supabase auth helpers.
import { supabaseAuthService } from "./authService.supabase";
import { lambdaAuthService } from "./authService.lambda";
import { DATA_BACKEND } from "./runtimeConfig";

export interface SignInResult {
  userId: string;
  email: string | null;
  mustChangePassword: boolean;
}

export interface AuthService {
  signIn(email: string, password: string): Promise<SignInResult>;
  sendPasswordResetEmail(email: string): Promise<void>;
  updateOwnPassword(newPassword: string, currentPassword?: string): Promise<void>;
  clearMustChangePassword(): Promise<void>;
  signOut(): Promise<void>;
  // Reads must_change_password for the currently authenticated user.
  getMustChangePassword(userId: string): Promise<boolean>;
}

const backend = ((import.meta.env.VITE_AUTH_BACKEND as string | undefined) ?? DATA_BACKEND) as
  | "supabase"
  | "lambda";

export const authService: AuthService =
  backend === "lambda" ? lambdaAuthService : supabaseAuthService;
