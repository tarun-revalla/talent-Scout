import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFollowupEmailSystemPrompt,
  buildInitialEmailSystemPrompt,
  DEFAULT_EMAIL_SETTINGS,
  resolveEmailSettings,
} from "../lib/email-templates";

describe("email-templates", () => {
  it("resolveEmailSettings falls back to defaults for invalid input", () => {
    const settings = resolveEmailSettings(null);
    assert.equal(settings.recruiter_name, DEFAULT_EMAIL_SETTINGS.recruiter_name);
    assert.equal(settings.interest_questions.length, 4);
  });

  it("buildFollowupEmailSystemPrompt separates candidate questions from unanswered recruiter items", () => {
    const prompt = buildFollowupEmailSystemPrompt(DEFAULT_EMAIL_SETTINGS);
    assert.match(prompt, /what_this_round_covers/);
    assert.match(prompt, /SKIP this section/);
    assert.match(prompt, /NEVER use phrases like 'great question'/);
    assert.match(prompt, /questions YOU asked THEM/);
    assert.match(prompt, /recruiter will follow up shortly/);
  });

  it("buildInitialEmailSystemPrompt includes recruiter name and questions", () => {
    const prompt = buildInitialEmailSystemPrompt({
      ...DEFAULT_EMAIL_SETTINGS,
      recruiter_name: "Alex Recruiter",
      interest_questions: ["Are you open to chat?", "What's your notice period?"],
    });
    assert.match(prompt, /Alex Recruiter/);
    assert.match(prompt, /1\) Are you open to chat\?/);
    assert.match(prompt, /2\) What's your notice period\?/);
  });
});
