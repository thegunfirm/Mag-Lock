// Feature flags for enabling/disabling various integrations

// Zoho integration is disabled - not used in this system
// To re-enable, change this to true
export const ZOHO_ENABLED = false;

// SAML authentication is disabled - not used in this system
// To re-enable, change this to true
export const SAML_ENABLED = false;

// Log the feature states on startup
if (!ZOHO_ENABLED) {
  console.log('🚫 Zoho integration is DISABLED');
}

if (!SAML_ENABLED) {
  console.log('🚫 SAML authentication is DISABLED');
}

export const featureFlags = {
  zoho: ZOHO_ENABLED,
  saml: SAML_ENABLED
};