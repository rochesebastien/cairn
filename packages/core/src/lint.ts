/**
 * Acceptance criteria are user language, not implementation language.
 *
 * lintAcceptance() rejects criteria that leak implementation detail:
 * CSS selectors, HTTP routes, camelCase identifiers, file paths and
 * function-call syntax. The regexes are deliberately conservative: criteria
 * are ordinary English or French prose and false positives are worse than
 * misses (a false positive blocks a legitimate stone).
 */

export type LintRule =
  | "css-selector"
  | "http-route"
  | "identifier"
  | "file-path"
  | "function-call";

export interface Violation {
  /** The offending criterion, verbatim. */
  criterion: string;
  /** Index of the criterion in the input array. */
  index: number;
  rule: LintRule;
  /** The exact substring that triggered the rule. */
  match: string;
  /** Human-facing explanation, in English. */
  message: string;
}

/** Words that look like camelCase but are ordinary product nouns. */
const CAMEL_CASE_ALLOWLIST = new Set([
  "iphone",
  "ipad",
  "ipod",
  "ios",
  "ipados",
  "imac",
  "icloud",
  "itunes",
  "imessage",
  "macos",
  "watchos",
  "tvos",
  "ebay",
  "eur",
  "mrs",
  "phd",
]);

/** Tokens that end in a code-ish extension but are technology names. */
const FILE_LIKE_ALLOWLIST = new Set([
  "node.js",
  "next.js",
  "nuxt.js",
  "vue.js",
  "react.js",
  "express.js",
  "three.js",
  "d3.js",
  "chart.js",
  "socket.io",
]);

const LETTER = "\\p{L}\\p{N}_$";

interface RuleSpec {
  rule: LintRule;
  pattern: RegExp;
  message: string;
  /** Return false to drop a match as a known false positive. */
  accept?: (match: RegExpExecArray, criterion: string) => boolean;
}

const RULES: RuleSpec[] = [
  {
    rule: "css-selector",
    // #id — at least two chars, starting with a letter, not glued to a word.
    pattern: /(?<![\p{L}\p{N}_$#])#[a-zA-Z][a-zA-Z0-9_-]{1,}\b/gu,
    message:
      "looks like a CSS id selector; describe what the user sees, not how it is marked up",
  },
  {
    rule: "css-selector",
    // .class — must stand alone: preceded by start/space/quote, never by a
    // word char (so "fichier.md" or "3.5" are not class selectors) and never
    // by another dot (so "..." is not a class selector).
    pattern:
      /(?<![\p{L}\p{N}_$.\-/\\])\.[a-zA-Z][a-zA-Z0-9_-]*(?=$|[\s,;:!?)\]"'»])/gu,
    message:
      "looks like a CSS class selector; describe what the user sees, not how it is marked up",
  },
  {
    rule: "css-selector",
    // [attr=value] and [data-*] / [aria-*] attribute selectors.
    pattern: /\[[^[\]\n]*=[^[\]\n]*\]|\[(?:data|aria)-[a-zA-Z0-9_-]+\]/gu,
    message:
      "looks like a CSS attribute selector; describe what the user sees, not how it is marked up",
  },
  {
    rule: "http-route",
    pattern:
      /\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\/[^\s,;)"']*/gu,
    message:
      "looks like an HTTP route; acceptance criteria describe user outcomes, not endpoints",
  },
  {
    rule: "identifier",
    // camelCase: lowercase run followed by at least one capitalised run.
    pattern: new RegExp(
      `(?<![${LETTER}])[a-z][a-z0-9]*(?:[A-Z][a-zA-Z0-9]*)+(?![${LETTER}])`,
      "gu",
    ),
    message:
      "looks like a code identifier; name the thing the way a user would say it",
    accept: (match) => !CAMEL_CASE_ALLOWLIST.has(match[0].toLowerCase()),
  },
  {
    rule: "identifier",
    // snake_case / SCREAMING_SNAKE identifiers.
    pattern: new RegExp(
      `(?<![${LETTER}])[a-zA-Z][a-zA-Z0-9]*(?:_[a-zA-Z0-9]+)+(?![${LETTER}])`,
      "gu",
    ),
    message:
      "looks like a code identifier; name the thing the way a user would say it",
  },
  {
    rule: "file-path",
    // A path with a directory separator ending in a short extension.
    pattern:
      /(?<![\p{L}\p{N}_$/:])(?:\.{1,2}\/|\/)?[\w.-]+\/[\w.\-/]*\.[a-zA-Z0-9]{1,5}(?![\p{L}\p{N}])/gu,
    message:
      "looks like a file path; acceptance criteria must not mention the codebase",
    // Ignore URLs — they are handled (or tolerated) elsewhere.
    accept: (match, criterion) => {
      const before = criterion.slice(0, match.index);
      return !/(?:https?:)?\/\/\S*$/i.test(before) && !/:\/\/$/.test(before);
    },
  },
  {
    rule: "file-path",
    // A bare filename with a source-code extension.
    pattern: new RegExp(
      `(?<![${LETTER}/\\\\.])[\\w-]+\\.(?:ts|tsx|js|jsx|mjs|cjs|json|ya?ml|toml|css|scss|less|html?|py|rb|go|rs|java|kt|php|sql|sh|ps1|vue|svelte|env)(?![${LETTER}])`,
      "gu",
    ),
    message:
      "looks like a source file; acceptance criteria must not mention the codebase",
    accept: (match) => !FILE_LIKE_ALLOWLIST.has(match[0].toLowerCase()),
  },
  {
    rule: "function-call",
    // foo() — empty argument list is unambiguous.
    pattern: new RegExp(`(?<![${LETTER}])[a-zA-Z_$][\\w$]*\\(\\s*\\)`, "gu"),
    message:
      "looks like a function call; describe the behaviour, not the code that implements it",
  },
  {
    rule: "function-call",
    // obj.method(...) — dotted call with arguments.
    pattern: new RegExp(
      `(?<![${LETTER}])[a-zA-Z_$][\\w$]*(?:\\.[a-zA-Z_$][\\w$]*)+\\([^)\\n]*\\)`,
      "gu",
    ),
    message:
      "looks like a function call; describe the behaviour, not the code that implements it",
  },
  {
    rule: "function-call",
    // camelCaseCall(args) — never valid French/English prose.
    // Plain `mot(x)` is NOT matched: French inclusive writing such as
    // "l'utilisateur(trice)" or "les employé(e)s" must stay legal.
    pattern: new RegExp(
      `(?<![${LETTER}])[a-z][a-z0-9$]*(?:[A-Z][\\w$]*)+\\([^)\\n]*\\)`,
      "gu",
    ),
    message:
      "looks like a function call; describe the behaviour, not the code that implements it",
  },
];

/**
 * Lint acceptance criteria. Returns one violation per (criterion, rule, match)
 * triple, in criterion order. An empty array means the criteria are clean.
 */
export function lintAcceptance(criteria: readonly string[]): Violation[] {
  const violations: Violation[] = [];

  criteria.forEach((criterion, index) => {
    const seen = new Set<string>();
    for (const spec of RULES) {
      spec.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = spec.pattern.exec(criterion)) !== null) {
        // Guard against zero-length matches looping forever.
        if (match[0].length === 0) {
          spec.pattern.lastIndex += 1;
          continue;
        }
        if (spec.accept && !spec.accept(match, criterion)) continue;
        const key = `${spec.rule}::${match[0]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        violations.push({
          criterion,
          index,
          rule: spec.rule,
          match: match[0],
          message: `"${match[0]}" ${spec.message}`,
        });
      }
    }
  });

  return violations.sort((a, b) => a.index - b.index);
}

/** Convenience: true when the criteria contain no implementation leakage. */
export function isAcceptanceClean(criteria: readonly string[]): boolean {
  return lintAcceptance(criteria).length === 0;
}

/** One line per violation, ready for CLI output. */
export function formatViolations(violations: readonly Violation[]): string[] {
  return violations.map((v) => `[${v.rule}] ${v.criterion}\n    ${v.message}`);
}
