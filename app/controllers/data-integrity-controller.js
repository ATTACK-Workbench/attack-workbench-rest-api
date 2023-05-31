'use strict';

const dataIntegrityService = require('../services/data-integrity-service');
const logger = require('../lib/logger');

exports.performDataIntegrityTest = async function(req, res) {
    try {
        const testResults = await dataIntegrityService.performDataIntegrityTest();
        logger.info(`Success: Performed data integrity test`);
        return res.status(200).send(testResults);
    }
    catch(err) {
        logger.error("Unable to perform data integrity test, failed with error: " + err);
        return res.status(500).send("Unable to perform data integrity test. Server error.");
    }
};
