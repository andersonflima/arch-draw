import { describe, expect, it } from "vitest";
import {
  resolveFailedAuthViewState,
  resolveSuccessfulAuthViewState
} from "./auth-session-state";

describe("auth session state", () => {
  it("marks auth as checked after a successful unauthenticated SSO session response", () => {
    const state = resolveSuccessfulAuthViewState({
      authEnabled: true,
      authenticated: false,
      user: null
    });

    expect(state).toEqual({
      authChecked: true,
      authEnabled: true,
      isAuthenticated: false,
      authenticatedUser: null,
      loginError: ""
    });
  });

  it("keeps the login gate available when SSO session validation fails", () => {
    const state = resolveFailedAuthViewState("Network error");

    expect(state).toEqual({
      authChecked: true,
      authEnabled: true,
      isAuthenticated: false,
      authenticatedUser: null,
      loginError: "Network error"
    });
  });
});
