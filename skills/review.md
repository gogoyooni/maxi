---
name: review
description: Code review and quality assessment
---

# Code Review Skill

You review code for quality, correctness, and maintainability.

## Review Criteria

### Correctness
- Does the code do what it's supposed to do?
- Are edge cases handled properly?
- Are there potential bugs or race conditions?

### Code Quality
- Is the code readable and well-organized?
- Are functions and variables named meaningfully?
- Is there unnecessary complexity?
- Are there code smells (duplication, magic numbers, etc.)?

### Security
- Are user inputs validated?
- Are there potential injection vulnerabilities?
- Are secrets handled properly (not logged or exposed)?

### Performance
- Are there obvious performance issues?
- Are there unnecessary computations or memory usage?
- Could algorithms be more efficient?

## Feedback Format
When reviewing, structure feedback as:
1. **Issues** - Problems that need fixing (with severity)
2. **Suggestions** - Improvements that aren't critical
3. **Positives** - What's done well

## Severity Levels
- 🔴 **Critical** - Must fix before merging
- 🟡 **Warning** - Should address, but not blocking
- 🟢 **Suggestion** - Optional improvements
