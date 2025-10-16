import { tool, ParameterType } from "@optimizely-opal/opal-tools-sdk";

interface FlagNamingParameters {
  flagName: string;
  namingConvention?: string; // "snake_case", "kebab-case", "camelCase", "custom"
  customPattern?: string; // Regex pattern for custom validation
  prefix?: string; // Required prefix (e.g., "ff_", "feature_")
  suffix?: string; // Required suffix (e.g., "_test", "_experiment")
  maxLength?: number; // Maximum length
  minLength?: number; // Minimum length
  allowedCategories?: string; // Comma-separated allowed categories (e.g., "feature,experiment,rollout")
  teamPrefix?: string; // Team identifier prefix (e.g., "checkout_", "homepage_")
}

interface ValidationResult {
  isValid: boolean;
  flagName: string;
  validationSummary: {
    passed: number;
    failed: number;
    warnings: number;
  };
  checks: {
    rule: string;
    status: "pass" | "fail" | "warning";
    message: string;
  }[];
  suggestions: string[];
  correctedName?: string; // Auto-corrected version
  examples: string[]; // Example valid names
}

async function flagNamingValidator(
  parameters: FlagNamingParameters
): Promise<ValidationResult> {
  const {
    flagName,
    namingConvention = "snake_case",
    customPattern,
    prefix,
    suffix,
    maxLength = 50,
    minLength = 5,
    allowedCategories,
    teamPrefix,
  } = parameters;

  if (!flagName || flagName.trim() === "") {
    throw new Error("flagName is required and cannot be empty");
  }

  const checks: {
    rule: string;
    status: "pass" | "fail" | "warning";
    message: string;
  }[] = [];
  const suggestions: string[] = [];
  let correctedName = flagName;

  // Check 1: Length validation
  if (flagName.length > maxLength) {
    checks.push({
      rule: "Maximum Length",
      status: "fail",
      message: `Flag name is ${flagName.length} characters, exceeds maximum of ${maxLength}`,
    });
    suggestions.push(
      `Shorten the name to ${maxLength} characters or less. Consider abbreviations.`
    );
  } else {
    checks.push({
      rule: "Maximum Length",
      status: "pass",
      message: `Flag name length (${flagName.length}) is within limit (${maxLength})`,
    });
  }

  if (flagName.length < minLength) {
    checks.push({
      rule: "Minimum Length",
      status: "fail",
      message: `Flag name is ${flagName.length} characters, below minimum of ${minLength}`,
    });
    suggestions.push(
      `Extend the name to at least ${minLength} characters for clarity.`
    );
  } else {
    checks.push({
      rule: "Minimum Length",
      status: "pass",
      message: `Flag name length (${flagName.length}) meets minimum (${minLength})`,
    });
  }

  // Check 2: Naming convention
  const conventionResult = validateNamingConvention(
    flagName,
    namingConvention,
    customPattern
  );
  checks.push({
    rule: "Naming Convention",
    status: conventionResult.valid ? "pass" : "fail",
    message: conventionResult.message,
  });
  if (!conventionResult.valid) {
    suggestions.push(conventionResult.suggestion || "");
    correctedName = conventionResult.corrected || correctedName;
  }

  // Check 3: Prefix validation
  if (prefix) {
    if (flagName.startsWith(prefix)) {
      checks.push({
        rule: "Required Prefix",
        status: "pass",
        message: `Flag name starts with required prefix "${prefix}"`,
      });
    } else {
      checks.push({
        rule: "Required Prefix",
        status: "fail",
        message: `Flag name must start with prefix "${prefix}"`,
      });
      suggestions.push(`Add prefix "${prefix}" to the flag name.`);
      if (!correctedName.startsWith(prefix)) {
        correctedName = prefix + correctedName;
      }
    }
  }

  // Check 4: Suffix validation
  if (suffix) {
    if (flagName.endsWith(suffix)) {
      checks.push({
        rule: "Required Suffix",
        status: "pass",
        message: `Flag name ends with required suffix "${suffix}"`,
      });
    } else {
      checks.push({
        rule: "Required Suffix",
        status: "fail",
        message: `Flag name must end with suffix "${suffix}"`,
      });
      suggestions.push(`Add suffix "${suffix}" to the flag name.`);
      if (!correctedName.endsWith(suffix)) {
        correctedName = correctedName + suffix;
      }
    }
  }

  // Check 5: Team prefix
  if (teamPrefix) {
    // Extract prefix after any global prefix
    const checkName = prefix ? flagName.substring(prefix.length) : flagName;
    if (checkName.startsWith(teamPrefix)) {
      checks.push({
        rule: "Team Prefix",
        status: "pass",
        message: `Flag includes team identifier "${teamPrefix}"`,
      });
    } else {
      checks.push({
        rule: "Team Prefix",
        status: "warning",
        message: `Consider adding team identifier "${teamPrefix}" for better organization`,
      });
      suggestions.push(
        `Add team prefix "${teamPrefix}" after the global prefix for better organization.`
      );
    }
  }

  // Check 6: Category validation
  if (allowedCategories) {
    const categories = allowedCategories.split(",").map((c) => c.trim());
    const categoryMatch = categories.some((cat) =>
      flagName.toLowerCase().includes(cat.toLowerCase())
    );

    if (categoryMatch) {
      checks.push({
        rule: "Category Identifier",
        status: "pass",
        message: `Flag name includes a valid category (${categories.join(", ")})`,
      });
    } else {
      checks.push({
        rule: "Category Identifier",
        status: "warning",
        message: `Flag name should include a category: ${categories.join(", ")}`,
      });
      suggestions.push(
        `Include a category identifier like: ${categories.join(", ")}`
      );
    }
  }

  // Check 7: Special characters
  const specialCharsPattern = /[^a-zA-Z0-9_-]/;
  if (specialCharsPattern.test(flagName)) {
    checks.push({
      rule: "Special Characters",
      status: "fail",
      message: "Flag name contains invalid special characters",
    });
    suggestions.push(
      "Remove special characters. Only alphanumeric, underscore, and hyphen are allowed."
    );
    correctedName = correctedName.replace(/[^a-zA-Z0-9_-]/g, "_");
  } else {
    checks.push({
      rule: "Special Characters",
      status: "pass",
      message: "No invalid special characters detected",
    });
  }

  // Check 8: Readability & best practices
  const readabilityChecks = performReadabilityChecks(flagName);
  checks.push(...readabilityChecks.checks);
  suggestions.push(...readabilityChecks.suggestions);

  // Calculate summary
  const validationSummary = {
    passed: checks.filter((c) => c.status === "pass").length,
    failed: checks.filter((c) => c.status === "fail").length,
    warnings: checks.filter((c) => c.status === "warning").length,
  };

  const isValid = validationSummary.failed === 0;

  // Generate examples
  const examples = generateExamples({
    namingConvention,
    prefix,
    suffix,
    teamPrefix,
    allowedCategories,
  });

  // Add general best practice suggestions
  if (isValid && validationSummary.warnings === 0) {
    suggestions.push("✅ Flag name follows all conventions - good to go!");
  } else if (isValid && validationSummary.warnings > 0) {
    suggestions.push(
      "✅ Flag name is valid but consider addressing warnings for better consistency."
    );
  }

  return {
    isValid,
    flagName,
    validationSummary,
    checks,
    suggestions: suggestions.filter((s) => s.length > 0),
    correctedName: correctedName !== flagName ? correctedName : undefined,
    examples,
  };
}

function validateNamingConvention(
  name: string,
  convention: string,
  customPattern?: string
): {
  valid: boolean;
  message: string;
  suggestion?: string;
  corrected?: string;
} {
  let pattern: RegExp;
  let message: string;
  let suggestion: string = "";
  let corrected: string = name;

  switch (convention) {
    case "snake_case":
      pattern = /^[a-z0-9]+(_[a-z0-9]+)*$/;
      message = pattern.test(name)
        ? "Follows snake_case convention"
        : "Does not follow snake_case convention (lowercase with underscores)";
      if (!pattern.test(name)) {
        suggestion =
          "Use lowercase letters and numbers separated by underscores (e.g., feature_new_checkout)";
        corrected = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "");
      }
      break;

    case "kebab-case":
      pattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
      message = pattern.test(name)
        ? "Follows kebab-case convention"
        : "Does not follow kebab-case convention (lowercase with hyphens)";
      if (!pattern.test(name)) {
        suggestion =
          "Use lowercase letters and numbers separated by hyphens (e.g., feature-new-checkout)";
        corrected = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
      }
      break;

    case "camelCase":
      pattern = /^[a-z][a-zA-Z0-9]*$/;
      message = pattern.test(name)
        ? "Follows camelCase convention"
        : "Does not follow camelCase convention";
      if (!pattern.test(name)) {
        suggestion =
          "Start with lowercase, use camelCase for word boundaries (e.g., featureNewCheckout)";
        corrected = name
          .replace(/[^a-zA-Z0-9]/g, " ")
          .split(" ")
          .map((word, i) =>
            i === 0
              ? word.toLowerCase()
              : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          )
          .join("");
      }
      break;

    case "PascalCase":
      pattern = /^[A-Z][a-zA-Z0-9]*$/;
      message = pattern.test(name)
        ? "Follows PascalCase convention"
        : "Does not follow PascalCase convention";
      if (!pattern.test(name)) {
        suggestion =
          "Start with uppercase, use PascalCase for word boundaries (e.g., FeatureNewCheckout)";
        corrected = name
          .replace(/[^a-zA-Z0-9]/g, " ")
          .split(" ")
          .map(
            (word) =>
              word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          )
          .join("");
      }
      break;

    case "custom":
      if (!customPattern) {
        return {
          valid: false,
          message: "Custom pattern not provided",
          suggestion: "Provide a customPattern parameter",
        };
      }
      pattern = new RegExp(customPattern);
      message = pattern.test(name)
        ? "Follows custom naming pattern"
        : "Does not follow custom naming pattern";
      if (!pattern.test(name)) {
        suggestion = `Name must match pattern: ${customPattern}`;
      }
      break;

    default:
      return {
        valid: false,
        message: `Unknown naming convention: ${convention}`,
        suggestion:
          "Use snake_case, kebab-case, camelCase, PascalCase, or custom",
      };
  }

  return {
    valid: pattern.test(name),
    message,
    suggestion: pattern.test(name) ? undefined : suggestion,
    corrected: pattern.test(name) ? undefined : corrected,
  };
}

function performReadabilityChecks(name: string): {
  checks: { rule: string; status: "pass" | "fail" | "warning"; message: string }[];
  suggestions: string[];
} {
  const checks: any[] = [];
  const suggestions: string[] = [];

  // Check for too many consecutive underscores/hyphens
  if (/_{2,}|-{2,}/.test(name)) {
    checks.push({
      rule: "Readability - Separators",
      status: "warning",
      message: "Multiple consecutive separators detected",
    });
    suggestions.push("Avoid multiple consecutive underscores or hyphens.");
  }

  // Check for numbers at the start
  if (/^[0-9]/.test(name)) {
    checks.push({
      rule: "Readability - Start Character",
      status: "warning",
      message: "Flag name starts with a number",
    });
    suggestions.push(
      "Consider starting with a letter for better readability."
    );
  }

  // Check for overly generic names
  const genericPatterns = /^(test|temp|flag|feature|experiment|new|old)$/i;
  if (genericPatterns.test(name)) {
    checks.push({
      rule: "Descriptiveness",
      status: "fail",
      message: "Flag name is too generic",
    });
    suggestions.push(
      "Use a more descriptive name that indicates what the flag controls."
    );
  } else {
    checks.push({
      rule: "Descriptiveness",
      status: "pass",
      message: "Flag name appears descriptive",
    });
  }

  // Check for abbreviations clarity
  const wordCount = name.split(/[_-]/).length;
  if (wordCount === 1 && name.length > 15) {
    checks.push({
      rule: "Readability - Word Separation",
      status: "warning",
      message: "Long name without word separators may be hard to read",
    });
    suggestions.push("Consider using separators to break up long names.");
  }

  return { checks, suggestions };
}

function generateExamples(params: {
  namingConvention: string;
  prefix?: string;
  suffix?: string;
  teamPrefix?: string;
  allowedCategories?: string;
}): string[] {
  const examples: string[] = [];
  const { namingConvention, prefix, suffix, teamPrefix, allowedCategories } =
    params;

  const category = allowedCategories?.split(",")[0]?.trim() || "feature";
  const team = teamPrefix || "";
  const pre = prefix || "";
  const suf = suffix || "";

  switch (namingConvention) {
    case "snake_case":
      examples.push(
        `${pre}${team}${category}_new_checkout${suf}`,
        `${pre}${team}${category}_payment_gateway_v2${suf}`,
        `${pre}${team}${category}_mobile_navigation${suf}`
      );
      break;
    case "kebab-case":
      examples.push(
        `${pre}${team}${category}-new-checkout${suf}`,
        `${pre}${team}${category}-payment-gateway-v2${suf}`,
        `${pre}${team}${category}-mobile-navigation${suf}`
      );
      break;
    case "camelCase":
      examples.push(
        `${pre}${team}${category}NewCheckout${suf}`,
        `${pre}${team}${category}PaymentGatewayV2${suf}`,
        `${pre}${team}${category}MobileNavigation${suf}`
      );
      break;
    case "PascalCase":
      examples.push(
        `${pre}${team}${category}NewCheckout${suf}`,
        `${pre}${team}${category}PaymentGatewayV2${suf}`,
        `${pre}${team}${category}MobileNavigation${suf}`
      );
      break;
    default:
      examples.push(
        `${pre}${team}new_checkout${suf}`,
        `${pre}${team}payment_v2${suf}`,
        `${pre}${team}mobile_nav${suf}`
      );
  }

  return examples;
}

tool({
  name: "flag-naming-validator",
  description:
    "Validates feature flag names against naming conventions and best practices. Checks for proper formatting, length, prefixes, suffixes, and readability. Provides suggestions for improvement and auto-corrected versions. Helps maintain consistency across your feature flag naming.",
  parameters: [
    {
      name: "flagName",
      type: ParameterType.String,
      description:
        'The feature flag name to validate (e.g., "feature_new_checkout", "ff-payment-v2")',
      required: true,
    },
    {
      name: "namingConvention",
      type: ParameterType.String,
      description:
        'Naming convention to enforce: "snake_case" (default), "kebab-case", "camelCase", "PascalCase", or "custom"',
      required: false,
    },
    {
      name: "customPattern",
      type: ParameterType.String,
      description:
        'Custom regex pattern for validation (only used when namingConvention is "custom"). Example: "^ff_[a-z]+_[0-9]+$"',
      required: false,
    },
    {
      name: "prefix",
      type: ParameterType.String,
      description:
        'Required prefix for all flags (e.g., "ff_", "feature_"). Leave empty for no prefix requirement.',
      required: false,
    },
    {
      name: "suffix",
      type: ParameterType.String,
      description:
        'Required suffix for all flags (e.g., "_test", "_v1"). Leave empty for no suffix requirement.',
      required: false,
    },
    {
      name: "maxLength",
      type: ParameterType.Number,
      description: "Maximum allowed length for flag names. Defaults to 50.",
      required: false,
    },
    {
      name: "minLength",
      type: ParameterType.Number,
      description: "Minimum required length for flag names. Defaults to 5.",
      required: false,
    },
    {
      name: "allowedCategories",
      type: ParameterType.String,
      description:
        'Comma-separated list of allowed categories that should appear in flag names (e.g., "feature,experiment,rollout,killswitch")',
      required: false,
    },
    {
      name: "teamPrefix",
      type: ParameterType.String,
      description:
        'Team identifier that should appear in flag names (e.g., "checkout_", "homepage_"). This helps organize flags by team.',
      required: false,
    },
  ],
})(flagNamingValidator);
