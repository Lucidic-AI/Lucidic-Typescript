// Test setup file
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Set default test environment variables if not already set
process.env.LUCIDIC_DEBUG = process.env.LUCIDIC_DEBUG || 'False';
process.env.NODE_ENV = 'test';

// Increase timeout for API calls
jest.setTimeout(30000);