import { test, assert, assertEqual } from "./test-harness";
import * as fc from "fast-check";
import {
  getTimeGreeting,
  isSameDay,
  calculateTotalContextTokens,
  EnhancedContextChip,
} from "../src/utils/chat-ui-utils";

/**
 * Property 1: Time-based greeting selection
 * For any hour of the day (0-23), the greeting function SHALL return the correct greeting:
 * - "早上好" for 5-11
 * - "下午好" for 12-17
 * - "晚上好" for 18-4
 * 
 * **Feature: chat-ui-enhancement, Property 1: Time-based greeting selection**
 * **Validates: Requirements 3.1**
 */
test("Property 1: Time-based greeting selection", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 23 }), (hour) => {
      const greeting = getTimeGreeting(hour);
      
      // Verify the greeting is one of the valid options
      const validGreetings = ["早上好", "下午好", "晚上好"];
      assert(validGreetings.includes(greeting), `Invalid greeting: ${greeting}`);
      
      // Verify correct greeting for each time range
      if (hour >= 5 && hour <= 11) {
        assertEqual(greeting, "早上好", `Hour ${hour} should return 早上好`);
      } else if (hour >= 12 && hour <= 17) {
        assertEqual(greeting, "下午好", `Hour ${hour} should return 下午好`);
      } else {
        assertEqual(greeting, "晚上好", `Hour ${hour} should return 晚上好`);
      }
      
      return true;
    }),
    { numRuns: 100 }
  );
});


// ============================================================================
// Context Chips Property Tests
// ============================================================================

/**
 * Property 8: Context token sum
 * For any list of context chips with token counts, the total token count
 * SHALL equal the sum of all individual token counts.
 * 
 * **Feature: chat-ui-enhancement, Property 8: Context token sum**
 * **Validates: Requirements 8.2**
 */
test("Property 8: Context token sum", () => {
  const kindArb = fc.constantFrom<"page" | "tag">("page", "tag");
  
  const chipArb: fc.Arbitrary<EnhancedContextChip> = fc.record({
    id: fc.uuid(),
    title: fc.string({ minLength: 1, maxLength: 50 }),
    kind: kindArb,
    tokenCount: fc.integer({ min: 0, max: 100000 }),
    preview: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
  });

  fc.assert(
    fc.property(fc.array(chipArb, { minLength: 0, maxLength: 50 }), (chips) => {
      const totalFromFunction = calculateTotalContextTokens(chips);
      
      // Calculate expected sum manually
      let expectedSum = 0;
      for (const chip of chips) {
        expectedSum += chip.tokenCount;
      }
      
      // Property: Total equals sum of individual token counts
      assertEqual(
        totalFromFunction,
        expectedSum,
        `Total ${totalFromFunction} should equal sum ${expectedSum}`
      );
      
      // Property: Total is non-negative
      assert(totalFromFunction >= 0, "Total should be non-negative");
      
      // Property: Empty array returns 0
      if (chips.length === 0) {
        assertEqual(totalFromFunction, 0, "Empty array should return 0");
      }
      
      return true;
    }),
    { numRuns: 100 }
  );
});


// ============================================================================
// Tool Progress Display Property Tests
// ============================================================================

// ============================================================================
// Display Settings Property Tests
// ============================================================================

import {
  getMessageGap,
  getBubblePadding,
  shouldRenderTimestamp,
  spacingConfig,
} from "../src/store/display-settings-store";

/**
 * Property 10: Compact mode spacing reduction
 * For any display settings with compactMode enabled, the message spacing
 * SHALL be less than the spacing when compactMode is disabled.
 * 
 * **Feature: chat-ui-enhancement, Property 10: Compact mode spacing reduction**
 * **Validates: Requirements 12.2**
 */
test("Property 10: Compact mode spacing reduction", () => {
  fc.assert(
    fc.property(fc.boolean(), (compactMode) => {
      const gap = getMessageGap(compactMode);
      const bubblePadding = getBubblePadding(compactMode);
      
      // Property: Gap is always a positive number
      assert(gap > 0, `Gap ${gap} should be positive`);
      
      assert(bubblePadding.length > 0, "Bubble padding should be non-empty");
      
      // Property: Compact mode has smaller gap than comfortable mode
      const compactGap = getMessageGap(true);
      const comfortableGap = getMessageGap(false);
      assert(
        compactGap < comfortableGap,
        `Compact gap ${compactGap} should be less than comfortable gap ${comfortableGap}`
      );
      
      // Property: Values match the config
      if (compactMode) {
        assertEqual(gap, spacingConfig.compact.messageGap, "Compact gap should match config");
        assertEqual(bubblePadding, spacingConfig.compact.bubblePadding, "Compact bubble padding should match config");
      } else {
        assertEqual(gap, spacingConfig.comfortable.messageGap, "Comfortable gap should match config");
        assertEqual(bubblePadding, spacingConfig.comfortable.bubblePadding, "Comfortable bubble padding should match config");
      }
      
      return true;
    }),
    { numRuns: 100 }
  );
});

/**
 * Property 11: Timestamp visibility toggle
 * For any display settings, timestamps SHALL be rendered if and only if
 * showTimestamps is true.
 * 
 * **Feature: chat-ui-enhancement, Property 11: Timestamp visibility toggle**
 * **Validates: Requirements 12.3**
 */
test("Property 11: Timestamp visibility toggle", () => {
  fc.assert(
    fc.property(fc.boolean(), (showTimestamps) => {
      const shouldRender = shouldRenderTimestamp(showTimestamps);
      
      // Property: shouldRenderTimestamp returns exactly the input value
      assertEqual(
        shouldRender,
        showTimestamps,
        `shouldRenderTimestamp(${showTimestamps}) should return ${showTimestamps}`
      );
      
      // Property: When showTimestamps is true, timestamps should be rendered
      if (showTimestamps) {
        assert(shouldRender === true, "Timestamps should be rendered when showTimestamps is true");
      }
      
      // Property: When showTimestamps is false, timestamps should not be rendered
      if (!showTimestamps) {
        assert(shouldRender === false, "Timestamps should not be rendered when showTimestamps is false");
      }
      
      return true;
    }),
    { numRuns: 100 }
  );
});
