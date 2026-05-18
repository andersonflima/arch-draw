import type { AuthSession, AuthenticatedUser } from "../../api/client";

export type AuthViewState = Readonly<{
  authChecked: boolean;
  authEnabled: boolean;
  isAuthenticated: boolean;
  authenticatedUser: AuthenticatedUser | null;
  loginError: string;
}>;

export const resolveSuccessfulAuthViewState = (session: AuthSession): AuthViewState => ({
  authChecked: true,
  authEnabled: session.authEnabled,
  isAuthenticated: session.authenticated,
  authenticatedUser: session.user,
  loginError: ""
});

export const resolveFailedAuthViewState = (loginError: string): AuthViewState => ({
  authChecked: true,
  authEnabled: true,
  isAuthenticated: false,
  authenticatedUser: null,
  loginError
});
