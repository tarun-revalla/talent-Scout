import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { plainTextToHtml, wrapEmailHtml } from "../lib/email-html";

describe("email-html", () => {
  it("plainTextToHtml escapes HTML and preserves paragraphs", () => {
    const html = plainTextToHtml("Hello <world>\n\nSecond paragraph");
    assert.match(html, /Hello &lt;world&gt;/);
    assert.match(html, /<p[^>]*>Second paragraph<\/p>/);
  });

  it("wrapEmailHtml includes header, body, and footer with recruiter name", () => {
    const html = wrapEmailHtml("Hi there", {
      recruiterName: "Alex",
      jobTitle: "Senior Engineer",
    });
    assert.match(html, /Talent Scout/);
    assert.match(html, /design-system\.yext\.com/);
    assert.match(html, /@media only screen and \(max-width: 620px\)/);
    assert.match(html, /Senior Engineer/);
    assert.match(html, /Hi there/);
    assert.match(html, /Alex/);
  });
});
