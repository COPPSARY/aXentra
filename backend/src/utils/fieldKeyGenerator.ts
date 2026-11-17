// Converts a field label to a snake_case field key. Example: "RAM Size" -> "ram_size"
export function generateFieldKey(label: string): string {
  if (!label || typeof label !== "string") {
    throw new Error("Label must be a non-empty string");
  }

  return label
    .trim()
    // Convert to lowercase
    .toLowerCase()
    // Replace spaces with underscores
    .replace(/\s+/g, "_")
    // Remove or replace special characters (keep only alphanumeric and underscores)
    .replace(/[^a-z0-9_]/g, "")
    // Replace multiple underscores with single underscore
    .replace(/_+/g, "_")
    // Remove leading/trailing underscores
    .replace(/^_+|_+$/g, "");
}

