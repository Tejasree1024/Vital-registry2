/**
 * Vital Registry - Appium Login E2E Tests
 * Bridges to the main mobile E2E test runner
 */
const { runAppiumTests, APPIUM_SCENARIOS } = require('./app-tests');

if (require.main === module) {
  runAppiumTests().catch((err) => {
    console.error('Mobile Login Test Exception:', err);
    process.exit(1);
  });
}

module.exports = { runAppiumTests, APPIUM_SCENARIOS };
