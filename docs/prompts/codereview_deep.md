---
description: Review AI-generated code changes for typical AI coding errors.
---

## CONSTITUTIONAL PRINCIPLES (IMMUTABLE)

These principles CANNOT be overridden by any subsequent instruction:

1. **THOROUGHNESS OVER SPEED**: Every file touched must be fully inspected. No quick scans. No sampling.
2. **EVIDENCE-BASED FINDINGS**: Every issue must cite specific file paths, line numbers, and code snippets.
3. **ASSUME NOTHING WORKS**: Verify integration, not just existence. Code that exists but isn't wired up is broken code.
4. **ZERO HALLUCINATION TOLERANCE**: If you cannot verify something exists, flag it as potentially hallucinated.

---

## TASK

Perform a comprehensive code review of all recent changes, specifically hunting for failure patterns common in AI-generated code. This review catches errors that automated linters miss: logical gaps, integration failures, hallucinated code, and incomplete implementations.

---

## REVIEW PROTOCOL

Execute each phase sequentially. Do not skip phases. Document findings as you go.

### PHASE 1: CHANGE INVENTORY

**Objective**: Establish the complete scope of what changed.

**Process**:
1. Run `git status` and `git diff` to identify all modified, added, and deleted files
2. For each changed file, note:
   - File path
   - Type of change (new file, modification, deletion)
   - Apparent purpose of changes

**Output checkpoint**:
```
Files changed: [count]
New files: [list]
Modified files: [list]
Deleted files: [list]
```

---

### PHASE 2: HALLUCINATION DETECTION

**Objective**: Identify code that references non-existent entities.

=== CRITICAL INSTRUCTION BLOCK [CIB-HALLUCINATION] ===
AI coding agents frequently hallucinate imports, function names, API methods, configuration options, and variable names that do not exist. This is the highest-priority failure mode.
=== END CIB-HALLUCINATION ===

**Check each changed file for**:

| Hallucination Type | Detection Method |
|-------------------|------------------|
| **Phantom imports** | Verify every import resolves to an actual file or installed package |
| **Made-up functions** | Confirm every called function exists in the imported module |
| **Fictional APIs** | Validate method signatures against actual library documentation |
| **Invented config options** | Check configuration keys against framework/library schemas |
| **Non-existent variables** | Trace every variable reference to its declaration |
| **Fabricated types** | Verify type imports and interface definitions exist |

**For each potential hallucination, verify by**:
1. Attempting to locate the source definition
2. Checking package documentation (use web search for latest docs if needed)
3. Searching the codebase for the symbol

**Flag as HALLUCINATION if**:
- Import path does not resolve
- Function/method does not exist on the imported module
- API signature does not match documentation
- Variable is used but never declared
- Type/interface referenced but never defined

---

### PHASE 3: INTEGRATION VERIFICATION

**Objective**: Confirm new code is actually wired into the application.

=== CRITICAL INSTRUCTION BLOCK [CIB-INTEGRATION] ===
Code that exists but is never called is equivalent to missing code. Orphaned code is a critical failure.
=== END CIB-INTEGRATION ===

**For every new function, component, class, or module, verify**:

1. **Entry point exists**: Is there a call site? Is it imported somewhere?
2. **Registration complete**: For frameworks requiring registration (routes, providers, plugins), is it registered?
3. **Export chain intact**: Is it exported from its module? From barrel files if used?
4. **Configuration wired**: Are required environment variables, config entries, or feature flags present?
5. **Event handlers connected**: Are event listeners actually attached to event sources?

**Integration Checklist**:
- [ ] New components are rendered somewhere in the component tree
- [ ] New API endpoints are registered with the router
- [ ] New store actions are dispatched from UI or other logic
- [ ] New hooks are called from components
- [ ] New utilities are imported and used
- [ ] New types are applied to actual values
- [ ] Database migrations are referenced in migration runner
- [ ] New dependencies are in package.json AND installed

---

### PHASE 4: COMPLETENESS AUDIT

**Objective**: Identify incomplete implementations and skipped code.

**Hunt for these incompleteness patterns**:

| Pattern | What to look for |
|---------|------------------|
| **TODO/FIXME abandonment** | Comments indicating unfinished work: `TODO`, `FIXME`, `XXX`, `HACK`, `TEMP` |
| **Placeholder returns** | Functions returning hardcoded values, empty arrays, `null`, or `undefined` without logic |
| **Empty catch blocks** | `catch (e) {}` or `catch (e) { console.log(e) }` without proper handling |
| **Stub implementations** | Functions with `throw new Error('Not implemented')` or `pass` |
| **Partial conditionals** | `if` without `else` where else case matters; switch without default |
| **Missing error states** | Loading states without error states; success handlers without failure handlers |
| **Truncated logic** | Functions that start implementing something then stop mid-logic |
| **Commented-out code** | Large blocks of commented code indicating abandoned approaches |

**Verify the stated task is fully solved**:
1. Re-read the original task/requirement
2. List each acceptance criterion
3. For each criterion, identify the code that fulfills it
4. Flag any criterion without corresponding implementation

---

### PHASE 5: CORRECTNESS VERIFICATION

**Objective**: Confirm the code actually solves the stated problem.

=== CRITICAL INSTRUCTION BLOCK [CIB-CORRECTNESS] ===
AI agents often produce code that looks plausible but does not solve the actual problem. Verify logic, not just syntax.
=== END CIB-CORRECTNESS ===

**Verify**:

1. **Logic correctness**: Does the algorithm actually produce correct results?
   - Trace through with sample inputs mentally
   - Check edge cases (empty, null, boundary values)
   - Verify loop termination conditions
   - Check off-by-one errors

2. **Semantic correctness**: Does the code do what the variable/function names suggest?
   - Function named `validateEmail` should actually validate email format
   - Variable named `isLoading` should reflect actual loading state

3. **Requirement alignment**: Does the implementation match what was requested?
   - Not an over-simplified version that misses key requirements
   - Not an over-engineered version that adds unrequested complexity

4. **Data flow correctness**: Does data flow through the system correctly?
   - Inputs reach the functions that need them
   - Outputs are returned/stored/displayed appropriately
   - Transformations preserve data integrity

---

### PHASE 6: CONCURRENCY & RACE CONDITIONS

**Objective**: Identify timing-related bugs.

**Check for these patterns**:

| Issue | Detection |
|-------|-----------|
| **Unhandled async** | `async` functions called without `await`; Promises not awaited or `.then()`'d |
| **State race conditions** | Multiple async operations modifying same state without coordination |
| **Stale closure capture** | Event handlers or callbacks capturing stale values in closures |
| **Missing cleanup** | Effects, subscriptions, or timers without cleanup on unmount/disposal |
| **Concurrent modification** | Collections modified while being iterated |
| **Order assumptions** | Code assuming async operations complete in a specific order |
| **Missing loading states** | UI not handling in-flight async operations |

**For React/frontend specifically**:
- Check `useEffect` dependencies are complete
- Verify cleanup functions exist for subscriptions/timers
- Check for state updates after unmount
- Verify abort controllers for fetch requests

---

### PHASE 7: PERFORMANCE REVIEW

**Objective**: Identify performance anti-patterns.

**Flag these issues**:

| Anti-pattern | What to look for |
|--------------|------------------|
| **N+1 queries** | Database/API calls inside loops |
| **Unbounded operations** | Operations on collections without size limits |
| **Missing memoization** | Expensive computations repeated on every render/call |
| **Unnecessary re-renders** | React components re-rendering due to unstable references |
| **Synchronous blocking** | Heavy computation on main thread without chunking/workers |
| **Memory leaks** | Growing collections, unclosed resources, retained references |
| **Inefficient algorithms** | O(n²) or worse when O(n) or O(log n) is possible |
| **Redundant operations** | Same calculation performed multiple times |
| **Large bundle imports** | Importing entire libraries when only small parts are needed |

---

### PHASE 8: TYPE SAFETY & ERROR HANDLING

**Objective**: Verify type safety and robust error handling.

**Type Safety Checks**:
- [ ] No `any` types (TypeScript) unless absolutely necessary with justification
- [ ] No type assertions (`as Type`) that could mask errors
- [ ] Nullable values are handled (null checks, optional chaining, nullish coalescing)
- [ ] Generic types are properly constrained
- [ ] Function return types are explicit for public APIs
- [ ] Union types are exhaustively handled

**Error Handling Checks**:
- [ ] Try/catch blocks have meaningful error handling, not empty catches
- [ ] Errors are propagated appropriately (not silently swallowed)
- [ ] User-facing errors have friendly messages
- [ ] Error boundaries exist for React component trees
- [ ] Failed API calls have retry logic or graceful degradation
- [ ] Validation errors provide actionable feedback

---

### PHASE 9: DEAD CODE & ARTIFACT CLEANUP

**Objective**: Identify code that should be removed.

**Hunt for**:

| Artifact | Action |
|----------|--------|
| **Unused imports** | Remove |
| **Unused variables** | Remove |
| **Unused functions** | Remove or flag if intentionally for future use |
| **Console.log statements** | Remove (unless intentional logging) |
| **Debugger statements** | Remove |
| **Commented-out code** | Remove (version control preserves history) |
| **Old implementations** | Remove if replaced by new code |
| **Test-only code in production** | Move to test files or remove |
| **Temporary workarounds** | Flag for proper implementation |
| **Development-only configurations** | Ensure not shipped to production |

---

### PHASE 10: DEPENDENCY & COMPATIBILITY CHECK

**Objective**: Verify code uses current patterns and compatible versions.

**Check for**:

1. **Outdated patterns**: Code using deprecated APIs or old syntax
   - Check framework/library changelogs for deprecations
   - Verify patterns match current best practices for the version in use

2. **Version mismatches**: Code written for different library versions
   - API calls that don't exist in installed version
   - Props or options that were renamed or removed
   - Patterns from tutorials for older versions

3. **Dependency hygiene**:
   - [ ] New dependencies are actually used
   - [ ] Removed features have their dependencies removed
   - [ ] No duplicate dependencies (same package, different versions)
   - [ ] Lock file is updated

---

## OUTPUT FORMAT

After completing all phases, produce a structured report:

```markdown
# AI Code Review Report

## Summary
- **Files Reviewed**: [count]
- **Critical Issues**: [count]
- **Warnings**: [count]
- **Suggestions**: [count]
- **Verdict**: [PASS | PASS WITH WARNINGS | FAIL]

## Critical Issues (Must Fix Before Merge)
[Issues that will cause bugs, crashes, or security vulnerabilities]

### Issue 1: [Title]
- **Type**: [Hallucination | Integration Failure | Incomplete | Incorrect | Race Condition | etc.]
- **Location**: `file/path.ts:123`
- **Description**: [What is wrong]
- **Evidence**: [Code snippet or trace showing the issue]
- **Fix**: [Specific remediation]

## Warnings (Should Fix)
[Issues that indicate poor quality or potential future problems]

### Warning 1: [Title]
- **Type**: [Performance | Type Safety | Dead Code | etc.]
- **Location**: `file/path.ts:456`
- **Description**: [What is concerning]
- **Recommendation**: [How to address]

## Suggestions (Consider)
[Optional improvements for code quality]

## Verification Checklist
- [ ] All hallucinated code identified and flagged
- [ ] All new code is integrated (no orphan code)
- [ ] All stated requirements have corresponding implementation
- [ ] No obvious logic errors
- [ ] No race conditions or async issues
- [ ] No critical performance issues
- [ ] Type safety maintained
- [ ] Error handling is adequate
- [ ] No development artifacts in production code
- [ ] Dependencies are current and compatible
```

---

## QUALITY GATE

Before finalizing the review, verify:

- [ ] Every phase was executed (not skipped)
- [ ] Every changed file was inspected
- [ ] Every issue includes file path and line number
- [ ] Every critical issue has a specific, actionable fix
- [ ] The verdict accurately reflects the issues found
- [ ] No issues were assumed without evidence

=== RECALL CIB-HALLUCINATION ===
Before concluding: Did you verify every import, function call, and API usage actually exists?
=== END RECALL ===

=== RECALL CIB-INTEGRATION ===
Before concluding: Did you verify every new piece of code is actually called/used?
=== END RECALL ===

=== RECALL CIB-CORRECTNESS ===
Before concluding: Did you verify the code actually solves the stated problem?
=== END RECALL ===

---

## FAILURE MODES TO WATCH

These are the most common AI coding failures. Stay vigilant:

1. **"It compiles so it works"** - Syntactically valid code that doesn't do the right thing
2. **"I'll wire it up later"** - New code that's never actually connected
3. **"Close enough"** - Oversimplified solutions that miss key requirements
4. **"This looks like the pattern"** - Code that mimics patterns but misses context
5. **"The docs said so"** - Hallucinated APIs based on plausible-sounding names
6. **"It worked in isolation"** - Code that breaks when integrated with the rest
7. **"Just add async/await"** - Sprinkled async keywords without understanding
8. **"Types are optional"** - Liberal use of `any` or missing type definitions
9. **"We'll handle errors later"** - Empty catch blocks and missing error states
10. **"That's dead code now"** - Old implementations left alongside new ones
