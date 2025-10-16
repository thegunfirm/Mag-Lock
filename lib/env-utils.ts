/**
 * Parse boolean environment variables flexibly
 * Accepts: true, TRUE, True, 1, yes, YES, Yes, on, ON, On
 * Also handles values with leading "=" from misconfiguration  
 * Everything else is false
 */
export function parseEnvBoolean(value: string | undefined): boolean {
  if (!value) return false;
  
  // Remove leading "=" if present (common misconfiguration)
  const cleaned = value.trim().replace(/^=/, '');
  const normalized = cleaned.toLowerCase();
  
  return ['true', '1', 'yes', 'on'].includes(normalized);
}