/**
 * Environment Bootstrap
 *
 * Conditionally loads environment variables based on ENV setting:
 * - ENV=workstation: Uses .env file (for local development)
 * - ENV=production|development|staging: Uses Doppler (for deployed environments)
 *
 * This file should be required before any other modules that depend on environment variables.
 */

const env = process.env.ENV || 'workstation';

console.log(`[Bootstrap] Environment mode: ${env}`);

if (env === 'workstation') {
    // Local development: Load from .env file
    console.log('[Bootstrap] Loading environment from .env file...');
    require('dotenv').config();
    console.log('[Bootstrap] ✓ Environment loaded from .env');
} else {
    // Production/Deployed environments: Doppler should inject environment variables
    console.log('[Bootstrap] Using Doppler-injected environment variables');

    // Verify critical environment variables are present
    const requiredVars = ['DB_URL'];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
        console.error('[Bootstrap] ✗ ERROR: Missing required environment variables:', missingVars.join(', '));
        console.error('[Bootstrap] Make sure Doppler is properly configured and running');
        process.exit(1);
    }

    console.log('[Bootstrap] ✓ All required environment variables present');
}

console.log('[Bootstrap] Environment initialization complete\n');
