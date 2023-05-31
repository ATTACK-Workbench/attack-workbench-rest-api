'use strict';

const express = require('express');

const dataIntegrityController = require('../controllers/data-integrity-controller');
const authn = require('../lib/authn-middleware');
const authz = require('../lib/authz-middleware');

const router = express.Router();

router.route('/data-integrity')
    .get(
        authn.authenticate,
        authz.requireRole(authz.admin),
        dataIntegrityController.performDataIntegrityTest
    );

module.exports = router;
