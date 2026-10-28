import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Arrow } from "~/ui/Arrow";

describe("Arrow", () => {
  it("draws the arrow in the text's colour and size, and reads as \"to\"", () => {
    const html = renderToStaticMarkup(createElement(Arrow));
    expect(html).not.toContain("→");
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).toMatch(/<svg[^>]*stroke="currentColor"/);
    expect(html).toMatch(/<svg[^>]*width="1em"/);
    expect(html).toContain('<span class="sr-only">to</span>');
  });
});
