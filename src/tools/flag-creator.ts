import { tool, ParameterType } from "@optimizely-opal/opal-tools-sdk";

interface FlagCreatorParameters {
  flagName: string; // The name/title of the flag (required)
  flagKey?: string; // The unique key (auto-generated from name if not provided)
  description?: string; // Description of what the flag does
  variables?: string; // JSON array of variable definitions
  variations?: string; // JSON array of variation definitions
  defaultVariation?: string; // Default variation key
  optimizelyApiKey?: string; // Optimizely API key
  projectId?: string; // Optimizely project ID
  environment?: string; // Environment (development, production, etc.)
}

interface Variable {
  key: string;
  type: "boolean" | "string" | "integer" | "double" | "json";
  defaultValue: string | number | boolean;
}

interface Variation {
  key: string;
  name: string;
  variables?: Record<string, any>; // Variable values for this variation
}

interface FlagCreationResult {
  success: boolean;
  flagKey: string;
  flagName: string;
  flagId?: string;
  apiUrl?: string;
  message: string;
  details: {
    variations: Variation[];
    variables: Variable[];
    environment: string;
    defaultVariation: string;
  };
  errors?: string[];
  nextSteps: string[];
}

async function flagCreator(
  parameters: FlagCreatorParameters
): Promise<FlagCreationResult> {
  const {
    flagName,
    flagKey,
    description,
    variables,
    variations,
    defaultVariation,
    optimizelyApiKey,
    projectId,
    environment = "development",
  } = parameters;

  // Use environment variables as fallback for API credentials
  const apiKey = optimizelyApiKey || process.env.OPTIMIZELY_API_KEY;
  const projId = projectId || process.env.OPTIMIZELY_PROJECT_ID;

  // Validation
  if (!flagName || flagName.trim() === "") {
    throw new Error("flagName is required and cannot be empty");
  }

  const errors: string[] = [];

  // Generate flag key if not provided (convert to snake_case)
  const generatedKey =
    flagKey ||
    flagName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  // Parse variables if provided
  let parsedVariables: Variable[] = [];
  if (variables) {
    try {
      parsedVariables = JSON.parse(variables);
      if (!Array.isArray(parsedVariables)) {
        errors.push("variables must be a JSON array");
      }
      // Validate variable structure
      parsedVariables.forEach((v, idx) => {
        if (!v.key || !v.type || v.defaultValue === undefined) {
          errors.push(
            `Variable at index ${idx} must have: key, type, and defaultValue`
          );
        }
        const validTypes = ["boolean", "string", "integer", "double", "json"];
        if (!validTypes.includes(v.type)) {
          errors.push(
            `Variable '${v.key}' has invalid type. Must be one of: ${validTypes.join(", ")}`
          );
        }
      });
    } catch (error) {
      errors.push(
        `Invalid variables JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else {
    // Default to a single boolean variable
    parsedVariables = [
      {
        key: "enabled",
        type: "boolean",
        defaultValue: false,
      },
    ];
  }

  // Parse variations if provided
  let parsedVariations: Variation[] = [];
  if (variations) {
    try {
      parsedVariations = JSON.parse(variations);
      if (!Array.isArray(parsedVariations)) {
        errors.push("variations must be a JSON array");
      }
      // Validate variation structure
      parsedVariations.forEach((v, idx) => {
        if (!v.key || !v.name) {
          errors.push(
            `Variation at index ${idx} must have: key and name properties`
          );
        }
      });
    } catch (error) {
      errors.push(
        `Invalid variations JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else {
    // Default to on/off variations
    parsedVariations = [
      {
        key: "off",
        name: "Off",
        variables: { enabled: false },
      },
      {
        key: "on",
        name: "On",
        variables: { enabled: true },
      },
    ];
  }

  // Determine default variation
  const defaultVar = defaultVariation || parsedVariations[0]?.key || "off";

  // Check if default variation exists
  if (!parsedVariations.find((v) => v.key === defaultVar)) {
    errors.push(
      `Default variation '${defaultVar}' not found in variations list`
    );
  }

  // If there are validation errors, return early
  if (errors.length > 0) {
    return {
      success: false,
      flagKey: generatedKey,
      flagName,
      message: "Flag creation failed due to validation errors",
      details: {
        variations: parsedVariations,
        variables: parsedVariables,
        environment,
        defaultVariation: defaultVar,
      },
      errors,
      nextSteps: [
        "Fix the validation errors listed above",
        "Ensure variables and variations are valid JSON arrays",
        "Verify all required fields are provided",
      ],
    };
  }

  // If API key and project ID available (from params or env), create in Optimizely
  if (apiKey && projId) {
    try {
      const result = await createFlagInOptimizely({
        apiKey: apiKey,
        projectId: projId,
        flagKey: generatedKey,
        flagName,
        description: description || `Feature flag: ${flagName}`,
        variables: parsedVariables,
        variations: parsedVariations,
        defaultVariation: defaultVar,
        environment,
      });

      const credSource = optimizelyApiKey ? "parameters" : "environment variables";
      return {
        success: true,
        flagKey: generatedKey,
        flagName,
        flagId: result.flagId,
        apiUrl: result.url,
        message: `✅ Flag '${flagName}' created successfully in Optimizely! (Using credentials from ${credSource})`,
        details: {
          variations: parsedVariations,
          variables: parsedVariables,
          environment,
          defaultVariation: defaultVar,
        },
        nextSteps: [
          `View flag in Optimizely: ${result.url}`,
          "Configure targeting rules and rollout percentage",
          "Add flag to your application code",
          "Test the flag in your environment",
        ],
      };
    } catch (error) {
      return {
        success: false,
        flagKey: generatedKey,
        flagName,
        message: `❌ Failed to create flag in Optimizely: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          variations: parsedVariations,
          variables: parsedVariables,
          environment,
          defaultVariation: defaultVar,
        },
        errors: [
          error instanceof Error ? error.message : String(error),
          "Check your API key and project ID",
          "Ensure you have permission to create flags",
        ],
        nextSteps: [
          "Verify your Optimizely API credentials",
          "Check project ID is correct",
          "Review Optimizely API documentation",
        ],
      };
    }
  }

  // If no API credentials, return mock success with config
  return {
    success: true,
    flagKey: generatedKey,
    flagName,
    message: `✅ Flag configuration validated successfully! (No API credentials found - flag not created)`,
    details: {
      variations: parsedVariations,
      variables: parsedVariables,
      environment,
      defaultVariation: defaultVar,
    },
    nextSteps: [
      "To auto-create flags: Set OPTIMIZELY_API_KEY and OPTIMIZELY_PROJECT_ID environment variables in Netlify",
      "Or provide optimizelyApiKey and projectId parameters",
      "Or manually create this flag in Optimizely using the configuration above",
      `Flag Key: ${generatedKey}`,
      `Variations: ${parsedVariations.map((v) => v.name).join(", ")}`,
    ],
  };
}

async function createFlagInOptimizely(config: {
  apiKey: string;
  projectId: string;
  flagKey: string;
  flagName: string;
  description: string;
  variables: Variable[];
  variations: Variation[];
  defaultVariation: string;
  environment: string;
}): Promise<{ flagId: string; url: string }> {
  const {
    apiKey,
    projectId,
    flagKey,
    flagName,
    description,
    variables,
    variations,
    defaultVariation,
    environment,
  } = config;

  // Optimizely REST API endpoint for creating flags
  const apiUrl = `https://api.optimizely.com/flags/v1/projects/${projectId}/flags`;

  // Build the flag payload according to Optimizely's API spec
  // Note: Optimizely API only accepts key, name, and description when creating a flag
  // Variations, variables, and environment configurations must be added separately after creation
  const payload = {
    key: flagKey,
    name: flagName,
    description: description || `Feature flag: ${flagName}`,
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Optimizely API error (${response.status}): ${errorBody}`
    );
  }

  const result = await response.json();

  return {
    flagId: result.id || result.key,
    url: `https://app.optimizely.com/v2/projects/${projectId}/flags/${result.id || flagKey}`,
  };
}

tool({
  name: "flag-creator",
  description:
    "Creates a new feature flag in Optimizely Feature Experimentation. Requires flag name (title). Optionally accepts variables, variations, and default variation. If Optimizely API credentials are provided, creates the flag directly in Optimizely; otherwise validates and returns the configuration.",
  parameters: [
    {
      name: "flagName",
      type: ParameterType.String,
      description:
        'The display name/title of the feature flag (e.g., "New Checkout Flow", "Dark Mode Toggle"). This is required.',
      required: true,
    },
    {
      name: "flagKey",
      type: ParameterType.String,
      description:
        'Unique key for the flag (e.g., "new_checkout_flow"). If not provided, will be auto-generated from flagName in snake_case format.',
      required: false,
    },
    {
      name: "description",
      type: ParameterType.String,
      description:
        "Description of what this flag controls and its purpose. Helps with documentation and searchability.",
      required: false,
    },
    {
      name: "variables",
      type: ParameterType.String,
      description:
        'JSON array of variable definitions. Each variable needs: key, type (boolean|string|integer|double|json), defaultValue. Example: \'[{"key":"enabled","type":"boolean","defaultValue":false}]\'. Defaults to single boolean "enabled" variable if not provided.',
      required: false,
    },
    {
      name: "variations",
      type: ParameterType.String,
      description:
        'JSON array of variation definitions. Each variation needs: key, name, and optional variables object. Example: \'[{"key":"off","name":"Off","variables":{"enabled":false}},{"key":"on","name":"On","variables":{"enabled":true}}]\'. Defaults to on/off variations if not provided.',
      required: false,
    },
    {
      name: "defaultVariation",
      type: ParameterType.String,
      description:
        'Key of the default variation to serve. Must match one of the variation keys. Defaults to first variation if not specified.',
      required: false,
    },
    {
      name: "optimizelyApiKey",
      type: ParameterType.String,
      description:
        "Optimizely API key (Personal Access Token) for authentication. Required to actually create the flag in Optimizely. Without this, the tool will only validate and return the configuration.",
      required: false,
    },
    {
      name: "projectId",
      type: ParameterType.String,
      description:
        "Optimizely project ID where the flag should be created. Required along with API key to create the flag.",
      required: false,
    },
    {
      name: "environment",
      type: ParameterType.String,
      description:
        'Environment for the flag (e.g., "development", "staging", "production"). Defaults to "development".',
      required: false,
    },
  ],
})(flagCreator);
