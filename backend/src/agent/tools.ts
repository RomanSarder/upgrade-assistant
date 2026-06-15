import Anthropic from "@anthropic-ai/sdk";

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "fetch_changelog",
    description:
      "Fetches the raw changelog content for a package between two versions. " +
      "Call this first for any package before querying or synthesising — it " +
      "populates the changelog cache the other tools depend on. Returns the " +
      "combined changelog text, its source (e.g. GitHub releases vs CHANGELOG " +
      "file), and the list of versions covered.",
    input_schema: {
      type: "object",
      properties: {
        package: {
          type: "string",
          description: "The npm package name (e.g. \"express\", \"@types/node\").",
        },
        from_version: {
          type: "string",
          description:
            "The semver version the project is currently on (exclusive lower bound).",
        },
        to_version: {
          type: "string",
          description:
            "The semver version the project intends to upgrade to (inclusive upper bound).",
        },
      },
      required: ["package", "from_version", "to_version"],
    },
  },
  {
    name: "query_changelog",
    description:
      "Performs a semantic search over a package's cached changelog to answer " +
      "a specific question about breaking changes, deprecations, required " +
      "migration steps, or new peer-dependency requirements. Must be called " +
      "after fetch_changelog for the same package and version range. Use a " +
      "focused, single-topic question per call for best results.",
    input_schema: {
      type: "object",
      properties: {
        package: {
          type: "string",
          description:
            "The npm package name — must match a prior fetch_changelog call in this session.",
        },
        from_version: {
          type: "string",
          description:
            "The semver version the project is currently on — must match the from_version " +
            "used in the preceding fetch_changelog call for this package.",
        },
        to_version: {
          type: "string",
          description:
            "The semver version the project intends to upgrade to — must match the to_version " +
            "used in the preceding fetch_changelog call for this package.",
        },
        question: {
          type: "string",
          description:
            "A natural-language question to answer from the changelog, e.g. " +
            "\"What breaking changes were introduced between 4.x and 5.x?\" or " +
            "\"Are there any removed APIs that need migration?\"",
        },
      },
      required: ["package", "from_version", "to_version", "question"],
    },
  },
  {
    name: "check_npm_metadata",
    description:
      "Retrieves live npm registry metadata for a package: whether it is " +
      "deprecated, its weekly download count, the date of its last publish, " +
      "and its current maintainer list. Use this to flag packages that are " +
      "abandoned, deprecated, or have very low adoption — independently of " +
      "changelog content.",
    input_schema: {
      type: "object",
      properties: {
        package: {
          type: "string",
          description: "The npm package name to look up on the registry.",
        },
      },
      required: ["package"],
    },
  },
  {
    name: "synthesise_risk",
    description:
      "Aggregates all evidence gathered in this session into a structured risk " +
      "assessment with prioritised upgrade recommendations. Call this exactly " +
      "once, after all fetch_changelog, query_changelog, and check_npm_metadata " +
      "calls for every package are complete. Do not call it mid-session — " +
      "partial findings produce an incomplete risk picture. You MUST include one " +
      "entry in findings for every package for which fetch_changelog was called " +
      "in this session; omitting a package silently removes it from the report.",
    input_schema: {
      type: "object",
      properties: {
        findings: {
          type: "array",
          description:
            "One entry per package analysed, containing all evidence collected " +
            "for that package during this session.",
          items: {
            type: "object",
            properties: {
              package: {
                type: "string",
                description: "The npm package name.",
              },
              from_version: {
                type: "string",
                description: "The version the project is currently on.",
              },
              to_version: {
                type: "string",
                description: "The version the project intends to upgrade to.",
              },
              is_dev_dependency: {
                type: "boolean",
                description:
                  "True if this package only appears in devDependencies.",
              },
              breaking_changes: {
                type: "string",
                description:
                  "Plain-text summary of breaking changes found in the changelog " +
                  "for this version range. Use an empty string if none were found.",
              },
              changelog_sections_used: {
                type: "array",
                items: { type: "string" },
                description:
                  "Headings of the changelog sections that were consulted " +
                  "(e.g. [\"Breaking Changes\", \"Migration Guide\"]).",
              },
              risk_level: {
                type: "string",
                enum: ["high", "medium", "low", "unknown"],
                description:
                  "Preliminary risk classification: high (breaking API changes or " +
                  "deprecated package), medium (behaviour changes requiring testing), " +
                  "low (no breaking changes), unknown (insufficient changelog data).",
              },
              reasoning: {
                type: "string",
                description:
                  "A concise explanation of why this risk level was chosen, " +
                  "referencing specific evidence found in the changelog or npm metadata.",
              },
              recommendation: {
                type: "string",
                description:
                  "Actionable upgrade advice for this package: what the developer " +
                  "should do before upgrading, what to test, or whether to skip the upgrade.",
              },
            },
            required: [
              "package",
              "from_version",
              "to_version",
              "is_dev_dependency",
              "breaking_changes",
              "changelog_sections_used",
              "risk_level",
              "reasoning",
              "recommendation",
            ],
          },
        },
      },
      required: ["findings"],
    },
  },
];
