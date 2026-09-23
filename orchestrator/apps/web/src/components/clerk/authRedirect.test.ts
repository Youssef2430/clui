import { describe, expect, it } from "vite-plus/test";

import { resolveClerkSignInProps } from "./authRedirect";

describe("resolveClerkSignInProps", () => {
  it("returns to the current browser URL on the web", () => {
    const href = "https://app.t3.codes/connect?state=state-1#details";
    expect(resolveClerkSignInProps(href, false)).toEqual({
      forceRedirectUrl: href,
      signUpForceRedirectUrl: href,
    });
  });

  it("removes a Clerk virtual pathname and callback params while preserving the desktop route", () => {
    expect(
      resolveClerkSignInProps(
        "glui://app/CLERK-ROUTER/VIRTUAL/sign-up?__clerk_status=complete#/settings/connections",
        true,
      ),
    ).toEqual({
      forceRedirectUrl: "glui://app/#/settings/connections",
      signUpForceRedirectUrl: "glui://app/#/settings/connections",
    });
  });

  it("preserves a clean development desktop route", () => {
    expect(resolveClerkSignInProps("glui-dev://app/#/settings/general", true)).toEqual({
      forceRedirectUrl: "glui-dev://app/#/settings/general",
      signUpForceRedirectUrl: "glui-dev://app/#/settings/general",
    });
  });
});
