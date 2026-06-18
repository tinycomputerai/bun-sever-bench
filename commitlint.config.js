/** biome-ignore-all lint/performance/useTopLevelRegex: non-problem since this is just a static workflow  */
const VALID_TYPES = [
    "chore",
    "ci",
    "docs",
    "feat",
    "fix",
    "refactor",
    "revert",
    "test",
  ];
  
  const FORMAT_HINT = `PR title must match "type: description" (e.g. "feat: add login flow"). Valid types: ${VALID_TYPES.join(", ")}`;
  
  /** @type {import("@commitlint/types").UserConfig} */
  export default {
    helpUrl: "https://www.conventionalcommits.org/en/v1.0.0/",
    plugins: [
      {
        rules: {
          "pr-title-format": ({ header }) => {
            const errors = [];
            if (!header?.trim()) {
              return [false, FORMAT_HINT];
            }
  
            console.log("header", header);
  
            if (/^[a-z]+\([^)]+\):/.test(header)) {
              errors.push(
                'PR title must not include a scope — use "type: description" (e.g. "feat: add login flow")'
              );
            }
  
            const match = header.match(/^([a-z]+):\s*(.+)$/);
            if (!match) {
              return [false, FORMAT_HINT];
            }
  
            const [, type, description] = match;
  
            if (!VALID_TYPES.includes(type)) {
              errors.push(`"${type}" is not a valid type. Valid types: ${VALID_TYPES.join(", ")}`);
            }
  
            if (!description.trim()) {
              errors.push(
                'PR title description is required after the colon (e.g. "feat: add login flow")'
              );
            }
  
            if (description.endsWith(".")) {
              errors.push("PR title description must not end with a fullstop");
            }
  
            if (/[A-Z]/.test(description.charAt(0))) {
              errors.push("PR title description must start with a lowercase letter");
            }
  
            if (header.length > 100) {
              errors.push("PR title must be 100 characters or less");
            }
  
            if (errors.length > 0) {
              return [false, ...errors];
            }
  
            return [true];
          },
        },
      },
    ],
    rules: {
      "pr-title-format": [2, "always"],
    },
  };