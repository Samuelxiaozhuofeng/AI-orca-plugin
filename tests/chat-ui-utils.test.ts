import { test, assert, assertEqual } from "./test-harness";
import * as fc from "fast-check";
import {
  getTimeGreeting,
  isSameDay,
  groupCommandsByCategory,
  fuzzyMatch,
  addRecentCommandPure,
  calculateTotalContextTokens,
  SlashCommand,
  SlashCommandCategory,
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
// Slash Command Menu Property Tests
// ============================================================================

/**
 * Property 5: Slash command category grouping
 * For any list of slash commands, the grouping function SHALL produce groups
 * where all commands in a group share the same category.
 * 
 * **Feature: chat-ui-enhancement, Property 5: Slash command category grouping**
 * **Validates: Requirements 7.1**
 */
test("Property 5: Slash command category grouping", () => {
  const categoryArb = fc.constantFrom<SlashCommandCategory>("format", "style", "visualization");
  
  const commandArb: fc.Arbitrary<SlashCommand> = fc.record({
    command: fc.string({ minLength: 1, maxLength: 20 }),
    description: fc.string({ maxLength: 50 }),
    icon: fc.string({ minLength: 1, maxLength: 20 }),
    category: categoryArb,
  });

  fc.assert(
    fc.property(fc.array(commandArb, { minLength: 0, maxLength: 30 }), (commands) => {
      const grouped = groupCommandsByCategory(commands);

      // Property: All commands in each group share the same category
      for (const cmd of grouped.format) {
        assertEqual(cmd.category, "format", `Command in format group has wrong category: ${cmd.category}`);
      }
      for (const cmd of grouped.style) {
        assertEqual(cmd.category, "style", `Command in style group has wrong category: ${cmd.category}`);
      }
      for (const cmd of grouped.visualization) {
        assertEqual(cmd.category, "visualization", `Command in visualization group has wrong category: ${cmd.category}`);
      }

      // Property: Total count of grouped commands equals input count
      const totalGrouped = grouped.format.length + grouped.style.length + grouped.visualization.length;
      assertEqual(totalGrouped, commands.length, "Total grouped commands should equal input count");

      return true;
    }),
    { numRuns: 100 }
  );
});


/**
 * Property 6: Recent commands ordering
 * For any command usage history, the recent commands list SHALL be ordered
 * by most recent first and limited to maxItems.
 * 
 * **Feature: chat-ui-enhancement, Property 6: Recent commands ordering**
 * **Validates: Requirements 7.2**
 */
test("Property 6: Recent commands ordering", () => {
  fc.assert(
    fc.property(
      fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 20 }),
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.integer({ min: 1, max: 10 }),
      (existingCommands, newCommand, maxItems) => {
        const result = addRecentCommandPure(existingCommands, newCommand, maxItems);

        // Property: The new command is always first
        assertEqual(result[0], newCommand, "New command should be first");

        // Property: Result length is at most maxItems
        assert(result.length <= maxItems, `Result length ${result.length} exceeds maxItems ${maxItems}`);

        // Property: No duplicates in result
        const uniqueSet = new Set(result);
        assertEqual(uniqueSet.size, result.length, "Result should have no duplicates");

        // Property: If new command was in existing, it's removed from old position
        const existingIndex = existingCommands.indexOf(newCommand);
        if (existingIndex >= 0) {
          // The command should only appear once (at position 0)
          const occurrences = result.filter((cmd) => cmd === newCommand).length;
          assertEqual(occurrences, 1, "Command should appear exactly once");
        }

        return true;
      }
    ),
    { numRuns: 100 }
  );
});


/**
 * Property 7: Fuzzy command matching
 * For any query string and command list, the fuzzy match function SHALL return
 * commands where all query characters appear in order within the command string.
 * 
 * **Feature: chat-ui-enhancement, Property 7: Fuzzy command matching**
 * **Validates: Requirements 7.3**
 */
test("Property 7: Fuzzy command matching", () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 0, maxLength: 10 }),
      fc.string({ minLength: 0, maxLength: 30 }),
      (query, target) => {
        const matches = fuzzyMatch(query, target);

        // Property: Empty query always matches
        if (query.length === 0) {
          assert(matches === true, "Empty query should always match");
          return true;
        }

        // Property: If matches, all query chars appear in order in target
        if (matches) {
          const queryLower = query.toLowerCase();
          const targetLower = target.toLowerCase();
          let queryIndex = 0;
          
          for (const char of targetLower) {
            if (char === queryLower[queryIndex]) {
              queryIndex++;
            }
          }
          
          assertEqual(queryIndex, queryLower.length, "All query chars should be found in order");
        }

        // Property: If query is longer than target, cannot match (unless empty query)
        if (query.length > target.length && query.length > 0) {
          assert(matches === false, "Query longer than target should not match");
        }

        // Property: Case insensitive - same result regardless of case
        const upperQuery = query.toUpperCase();
        const upperTarget = target.toUpperCase();
        const upperMatches = fuzzyMatch(upperQuery, upperTarget);
        assertEqual(matches, upperMatches, "Matching should be case insensitive");

        return true;
      }
    ),
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
