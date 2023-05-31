'use strict';

const dataIntegrityTests = require('../lib/data-integrity-tests');

async function performDataIntegrityTest() {
    const options = { objectRefsOnly: true };
    const testResults = {};
    testResults.revokedObjectsHaveARevokedByRelationship = await dataIntegrityTests.revokedObjectsHaveRevokedByRelationships(options);
    // testResults.noDeprecatedRelationships = await dataIntegrityTests.noDeprecatedRelationships(options);
    testResults.noRevokedRelationships = await dataIntegrityTests.noRevokedRelationships(options);
    testResults.modifiedNotBeforeCreated = await dataIntegrityTests.modifiedNotBeforeCreated(options);

    return testResults;
}
exports.performDataIntegrityTest = performDataIntegrityTest;
