import { test, assert, assertEqual } from "./test-harness";
import * as fc from "fast-check";
import {
  getTimeGreeting,
  isSameDay,
  groupMessagesByDate,
  calculateTokenPercentage,
  getProgressColor,
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


/**
 * Property 2: Message date grouping
 * For any list of messages with timestamps, the grouping function SHALL produce
 * date separators such that all messages between two separators share the same calendar date.
 * 
 * **Feature: chat-ui-enhancement, Property 2: Message date grouping**
 * **Validates: Requirements 4.1**
 */
test("Property 2: Message date grouping", () => {
  // Generate arbitrary messages with valid timestamps (using integer timestamps to avoid NaN)
  const validDateArb = fc.integer({ min: 1704067200000, max: 1767225600000 }) // 2024-01-01 to 2025-12-31
    .map((ts) => new Date(ts));
  
  const messageArb = fc.record({
    id: fc.uuid(),
    timestamp: validDateArb,
    content: fc.string(),
  });

  fc.assert(
    fc.property(fc.array(messageArb, { minLength: 0, maxLength: 20 }), (messages) => {
      const grouped = groupMessagesByDate(messages);

      // Property: All messages between two separators share the same calendar date
      let currentSeparatorDate: Date | null = null;

      for (const item of grouped) {
        if (item.type === "separator") {
          currentSeparatorDate = item.date;
        } else if (item.type === "message") {
          // There must be a separator before any message
          assert(currentSeparatorDate !== null, "Message without preceding separator");

          // The message date must match the separator date (same calendar day)
          const msgDate = item.message.timestamp;
          assert(
            isSameDay(msgDate, currentSeparatorDate!),
            `Message date ${msgDate.toISOString()} does not match separator date ${currentSeparatorDate!.toISOString()}`
          );
        }
      }

      // Property: Number of messages in output equals input
      const messageCount = grouped.filter((item) => item.type === "message").length;
      assertEqual(messageCount, messages.length, "Message count mismatch");

      return true;
    }),
    { numRuns: 100 }
  );
});


/**
 * Property 3: Token progress percentage calculation
 * For any current token count and max token limit where max > 0,
 * the percentage calculation SHALL return a value between 0 and 100 (clamped).
 * 
 * **Feature: chat-ui-enhancement, Property 3: Token progress percentage calculation**
 * **Validates: Requirements 5.1**
 */
test("Property 3: Token progress percentage calculation", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 1000000 }), // current tokens
      fc.integer({ min: 1, max: 1000000 }), // max tokens (must be > 0)
      (current, max) => {
        const percentage = calculateTokenPercentage(current, max);
        
        // Property: Result is always between 0 and 100
        assert(percentage >= 0, `Percentage ${percentage} is less than 0`);
        assert(percentage <= 100, `Percentage ${percentage} is greater than 100`);
        
        // Property: When current <= max, percentage should be <= 100
        if (current <= max) {
          assert(percentage <= 100, `Percentage ${percentage} should be <= 100 when current <= max`);
        }
        
        // Property: When current is 0, percentage should be 0
        if (current === 0) {
          assertEqual(percentage, 0, "Percentage should be 0 when current is 0");
        }
        
        return true;
      }
    ),
    { numRuns: 100 }
  );
});

/**
 * Property 4: Token progress color thresholds
 * For any percentage value, the color function SHALL return:
 * - "danger" for >= 95%
 * - "warning" for >= 80% and < 95%
 * - "primary" for < 80%
 * 
 * **Feature: chat-ui-enhancement, Property 4: Token progress color thresholds**
 * **Validates: Requirements 5.2, 5.3**
 */
test("Property 4: Token progress color thresholds", () => {
  fc.assert(
    fc.property(fc.float({ min: 0, max: 100, noNaN: true }), (percentage) => {
      const color = getProgressColor(percentage);
      
      // Property: Color is always one of the valid options
      const validColors = [
        "var(--orca-color-danger)",
        "var(--orca-color-warning)",
        "var(--orca-color-primary)",
      ];
      assert(validColors.includes(color), `Invalid color: ${color}`);
      
      // Property: Correct color for each threshold
      if (percentage >= 95) {
        assertEqual(color, "var(--orca-color-danger)", `Percentage ${percentage} should return danger`);
      } else if (percentage >= 80) {
        assertEqual(color, "var(--orca-color-warning)", `Percentage ${percentage} should return warning`);
      } else {
        assertEqual(color, "var(--orca-color-primary)", `Percentage ${percentage} should return primary`);
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

import { formatToolProgress } from "../src/utils/chat-ui-utils";

/**
 * Property 9: Tool progress display
 * For any completed count and total count where total > 0,
 * the progress string SHALL be formatted as "{completed}/{total} 完成".
 * 
 * **Feature: chat-ui-enhancement, Property 9: Tool progress display**
 * **Validates: Requirements 10.3**
 */
test("Property 9: Tool progress display", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 100 }), // completed count
      fc.integer({ min: 1, max: 100 }), // total count (must be > 0)
      (completed, total) => {
        const progressString = formatToolProgress(completed, total);
        
        // Property: Result is formatted as "{completed}/{total} 完成"
        const expectedFormat = `${completed}/${total} 完成`;
        assertEqual(
          progressString,
          expectedFormat,
          `Progress string "${progressString}" should equal "${expectedFormat}"`
        );
        
        // Property: Result contains the completed count
        assert(
          progressString.includes(String(completed)),
          `Progress string should contain completed count ${completed}`
        );
        
        // Property: Result contains the total count
        assert(
          progressString.includes(String(total)),
          `Progress string should contain total count ${total}`
        );
        
        // Property: Result ends with "完成"
        assert(
          progressString.endsWith("完成"),
          `Progress string should end with "完成"`
        );
        
        return true;
      }
    ),
    { numRuns: 100 }
  );
});

/**
 * Edge case: Tool progress with zero total
 * When total is 0 or negative, should return "0/0 完成"
 */
test("Property 9 Edge Case: Tool progress with zero total", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 100 }), // completed count
      fc.integer({ min: -100, max: 0 }), // total count (0 or negative)
      (completed, total) => {
        const progressString = formatToolProgress(completed, total);
        
        // Property: When total <= 0, return "0/0 完成"
        assertEqual(
          progressString,
          "0/0 完成",
          `Progress string with total ${total} should be "0/0 完成"`
        );
        
        return true;
      }
    ),
    { numRuns: 100 }
  );
});


// ============================================================================
// Display Settings Property Tests
// ============================================================================

import {
  getMessageGap,
  getMessagePadding,
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
      const padding = getMessagePadding(compactMode);
      const bubblePadding = getBubblePadding(compactMode);
      
      // Property: Gap is always a positive number
      assert(gap > 0, `Gap ${gap} should be positive`);
      
      // Property: Padding is always a non-empty string
      assert(padding.length > 0, "Padding should be non-empty");
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
        assertEqual(padding, spacingConfig.compact.messagePadding, "Compact padding should match config");
        assertEqual(bubblePadding, spacingConfig.compact.bubblePadding, "Compact bubble padding should match config");
      } else {
        assertEqual(gap, spacingConfig.comfortable.messageGap, "Comfortable gap should match config");
        assertEqual(padding, spacingConfig.comfortable.messagePadding, "Comfortable padding should match config");
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
