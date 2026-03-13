/**
 * Global test setup for vitest.
 * Sets required env vars and stubs external dependencies.
 */

// Set test environment variables before any imports
process.env.JWT_SECRET = "test-jwt-secret-for-unit-tests";
process.env.ENCRYPTION_KEY = "a".repeat(64); // valid 64 hex chars = 32 bytes
process.env.DATABASE_URL = "postgresql://localhost:5432/skinkeeper_test";
process.env.ADMIN_SECRET = "test-admin-secret";
process.env.NODE_ENV = "test";
