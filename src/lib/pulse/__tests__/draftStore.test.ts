import { describe, expect, it } from "vitest";
import {
  addMCQOptionToDraft,
  commitSlideDraft,
  createSlideDraft,
  hasCachedDraftContent,
  removeMCQOptionFromDraft,
  reorderMCQOptionsInDraft,
  switchSlideType,
  updateDraftContent,
  updateMCQOptionInDraft,
} from "../draftStore";
import type {
  InfoSlideContent,
  MCQSlideContent,
  PulseSlide,
  QASlideContent,
} from "../types";

describe("Shared Draft-State & Content Preservation", () => {
  it("preserves content when switching across slide types without silent destruction", () => {
    // 1. Start with an Info slide and add custom content
    const initialSlide: Partial<PulseSlide> = {
      id: "slide-123",
      type: "info",
      content: {
        type: "info",
        title: "Important Announcement",
        markdown: "# Key Information\n\nPreserve this text at all costs!",
      },
    };

    let draft = createSlideDraft(initialSlide, "host-paced");
    expect(draft.activeType).toBe("info");
    expect((draft.content as InfoSlideContent).markdown).toContain(
      "Preserve this text at all costs!",
    );

    // 2. Switch to MCQ slide
    draft = switchSlideType(draft, "mcq");
    expect(draft.activeType).toBe("mcq");
    expect(draft.cachedByType.info).toBeDefined();
    expect(hasCachedDraftContent(draft, "info")).toBe(true);

    // Modify MCQ content
    draft = updateDraftContent(draft, (prev) => ({
      ...prev,
      prompt: "What is your feedback?",
    }));

    // 3. Switch to Q&A slide
    draft = switchSlideType(draft, "qa");
    expect(draft.activeType).toBe("qa");
    expect(hasCachedDraftContent(draft, "info")).toBe(true);
    expect(hasCachedDraftContent(draft, "mcq")).toBe(true);

    // 4. Switch back to Info slide
    draft = switchSlideType(draft, "info");
    expect(draft.activeType).toBe("info");
    const restoredInfo = draft.content as InfoSlideContent;

    // Verify the original content was completely preserved and not destroyed
    expect(restoredInfo.title).toBe("Important Announcement");
    expect(restoredInfo.markdown).toBe(
      "# Key Information\n\nPreserve this text at all costs!",
    );

    // 5. Switch back to MCQ slide
    draft = switchSlideType(draft, "mcq");
    expect(draft.activeType).toBe("mcq");
    const restoredMCQ = draft.content as MCQSlideContent;
    expect(restoredMCQ.prompt).toBe("What is your feedback?");
  });

  it("handles option editing, additions, removals, and reordering", () => {
    let draft = createSlideDraft({ type: "mcq" }, "host-paced");

    // Add option
    draft = addMCQOptionToDraft(draft, "New Option 3");
    let mcq = draft.content as MCQSlideContent;
    expect(mcq.options.length).toBe(3);
    expect(mcq.options[2].text).toBe("New Option 3");

    // Update option
    draft = updateMCQOptionInDraft(draft, 0, { text: "Updated Option 1", isCorrect: true });
    mcq = draft.content as MCQSlideContent;
    expect(mcq.options[0].text).toBe("Updated Option 1");
    expect(mcq.options[0].isCorrect).toBe(true);

    // Reorder options (move 0 to 1)
    draft = reorderMCQOptionsInDraft(draft, 0, 1);
    mcq = draft.content as MCQSlideContent;
    expect(mcq.options[1].text).toBe("Updated Option 1");

    // Remove option
    draft = removeMCQOptionFromDraft(draft, 2);
    mcq = draft.content as MCQSlideContent;
    expect(mcq.options.length).toBe(2);
  });

  it("enforces single-choice radio exclusivity when multiple answers is disabled", () => {
    let draft = createSlideDraft({ type: "mcq" }, "host-paced");
    draft = updateDraftContent(draft, (prev) => ({
      ...prev,
      allowMultipleAnswers: false,
    }));

    // Mark option 0 correct
    draft = updateMCQOptionInDraft(draft, 0, { isCorrect: true });
    let mcq = draft.content as MCQSlideContent;
    expect(mcq.options[0].isCorrect).toBe(true);
    expect(mcq.options[1].isCorrect).toBe(false);

    // Mark option 1 correct -> should automatically uncheck option 0
    draft = updateMCQOptionInDraft(draft, 1, { isCorrect: true });
    mcq = draft.content as MCQSlideContent;
    expect(mcq.options[0].isCorrect).toBe(false);
    expect(mcq.options[1].isCorrect).toBe(true);
  });

  it("commits valid draft and rejects invalid draft", () => {
    let draft = createSlideDraft({ type: "info" });
    // Valid info draft
    draft = updateDraftContent(draft, () => ({
      type: "info",
      title: "Title",
      markdown: "Valid content",
    }));

    const result = commitSlideDraft(draft);
    expect(result.ok).toBe(true);

    // Invalid info draft (empty markdown)
    draft = updateDraftContent(draft, () => ({
      type: "info",
      title: "Title",
      markdown: "   ",
    }));

    const invalidResult = commitSlideDraft(draft);
    expect(invalidResult.ok).toBe(false);
  });
});
