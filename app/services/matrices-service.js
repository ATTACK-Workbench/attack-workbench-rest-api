'use strict';

const uuid = require('uuid');
const util = require('util');
const Matrix = require('../models/matrix-model');
const systemConfigurationService = require('./system-configuration-service');
const identitiesService = require('./identities-service');
const attackObjectsService = require('./attack-objects-service');
const config = require('../config/config');
const regexValidator = require('../lib/regex');
const {lastUpdatedByQueryHelper} = require('../lib/request-parameter-helper');

const errors = {
    missingParameter: 'Missing required parameter',
    badlyFormattedParameter: 'Badly formatted parameter',
    duplicateId: 'Duplicate id',
    notFound: 'Document not found',
    invalidQueryStringParameter: 'Invalid query string parameter'
};
exports.errors = errors;

exports.retrieveAll = function(options, callback) {
    // Build the query
    const query = {};
    if (!options.includeRevoked) {
        query['stix.revoked'] = { $in: [null, false] };
    }
    if (!options.includeDeprecated) {
        query['stix.x_mitre_deprecated'] = { $in: [null, false] };
    }
    if (typeof options.state !== 'undefined') {
        if (Array.isArray(options.state)) {
            query['workspace.workflow.state'] = { $in: options.state };
        }
        else {
            query['workspace.workflow.state'] = options.state;
        }
    }
    if (typeof options.lastUpdatedBy !== 'undefined') {
      query['workspace.workflow.created_by_user_account'] = lastUpdatedByQueryHelper(options.lastUpdatedBy);
    }

    // Build the aggregation
    // - Group the documents by stix.id, sorted by stix.modified
    // - Use the last document in each group (according to the value of stix.modified)
    // - Then apply query, skip and limit options
    const aggregation = [
        { $sort: { 'stix.id': 1, 'stix.modified': 1 } },
        { $group: { _id: '$stix.id', document: { $last: '$$ROOT' }}},
        { $replaceRoot: { newRoot: '$document' }},
        { $sort: { 'stix.id': 1 }},
        { $match: query }
    ];

    if (typeof options.search !== 'undefined') {
        options.search = regexValidator.sanitizeRegex(options.search);
        const match = { $match: { $or: [
                    { 'stix.name': { '$regex': options.search, '$options': 'i' }},
                    { 'stix.description': { '$regex': options.search, '$options': 'i' }}
                ]}};
        aggregation.push(match);
    }

    const facet = {
        $facet: {
            totalCount: [ { $count: 'totalCount' }],
            documents: [ ]
        }
    };
    if (options.offset) {
        facet.$facet.documents.push({ $skip: options.offset });
    }
    else {
        facet.$facet.documents.push({ $skip: 0 });
    }
    if (options.limit) {
        facet.$facet.documents.push({ $limit: options.limit });
    }
    aggregation.push(facet);

    // Retrieve the documents
    Matrix.aggregate(aggregation, function(err, results) {
        if (err) {
            return callback(err);
        }
        else {
            identitiesService.addCreatedByAndModifiedByIdentitiesToAll(results[0].documents)
                .then(function() {
                    if (options.includePagination) {
                        let derivedTotalCount = 0;
                        if (results[0].totalCount.length > 0) {
                            derivedTotalCount = results[0].totalCount[0].totalCount;
                        }
                        const returnValue = {
                            pagination: {
                                total: derivedTotalCount,
                                offset: options.offset,
                                limit: options.limit
                            },
                            data: results[0].documents
                        };
                        return callback(null, returnValue);
                    }
                    else {
                        return callback(null, results[0].documents);
                    }
                });
        }
    });
};

exports.retrieveById = function(stixId, options, callback) {
    // versions=all Retrieve all matrices with the stixId
    // versions=latest Retrieve the matrix with the latest modified date for this stixId

    if (!stixId) {
        const error = new Error(errors.missingParameter);
        error.parameterName = 'stixId';
        return callback(error);
    }

    if (options.versions === 'all') {
        Matrix.find({'stix.id': stixId})
            .sort('-stix.modified')
            .lean()
            .exec(function (err, matrices) {
                if (err) {
                    if (err.name === 'CastError') {
                        const error = new Error(errors.badlyFormattedParameter);
                        error.parameterName = 'stixId';
                        return callback(error);
                    }
                    else {
                        return callback(err);
                    }
                }
                else {
                    identitiesService.addCreatedByAndModifiedByIdentitiesToAll(matrices)
                        .then(() => callback(null, matrices));
                }
            });
    }
    else if (options.versions === 'latest') {
        Matrix.findOne({ 'stix.id': stixId })
            .sort('-stix.modified')
            .lean()
            .exec(function(err, matrix) {
                if (err) {
                    if (err.name === 'CastError') {
                        const error = new Error(errors.badlyFormattedParameter);
                        error.parameterName = 'stixId';
                        return callback(error);
                    }
                    else {
                        return callback(err);
                    }
                }
                else {
                    // Note: document is null if not found
                    if (matrix) {
                        identitiesService.addCreatedByAndModifiedByIdentities(matrix)
                            .then(() => callback(null, [ matrix ]));
                    }
                    else {
                        return callback(null, []);
                    }
                }
            });
    }
    else {
        const error = new Error(errors.invalidQueryStringParameter);
        error.parameterName = 'versions';
        return callback(error);
    }
};

exports.retrieveVersionById = function(stixId, modified, callback) {
    // Retrieve the versions of the matrix with the matching stixId and modified date

    if (!stixId) {
        const error = new Error(errors.missingParameter);
        error.parameterName = 'stixId';
        return callback(error);
    }

    if (!modified) {
        const error = new Error(errors.missingParameter);
        error.parameterName = 'modified';
        return callback(error);
    }

    Matrix.findOne({ 'stix.id': stixId, 'stix.modified': modified }, function(err, matrix) {
        if (err) {
            if (err.name === 'CastError') {
                const error = new Error(errors.badlyFormattedParameter);
                error.parameterName = 'stixId';
                return callback(error);
            }
            else {
                return callback(err);
            }
        }
        else {
            // Note: document is null if not found
            if (matrix) {
                identitiesService.addCreatedByAndModifiedByIdentities(matrix)
                    .then(() => callback(null, matrix));
            }
            else {
                console.log('** NOT FOUND')
                return callback();
            }
        }
    });
};

let retrieveTacticById;
let retrieveTechniquesForTactic;
exports.retrieveVersionTechniquesById = async function(stixId, modified, callback) {
    // Retrieve the versions of the matrix techniques with the matching stixId and modified date
    
    // Late binding to avoid circular dependency between modules
    if (!retrieveTacticById) {
        const tacticsService = require('./tactics-service');
        retrieveTacticById = util.promisify(tacticsService.retrieveById);
    }
    if (!retrieveTechniquesForTactic) {
        const tacticsService = require('./tactics-service');
        retrieveTechniquesForTactic = tacticsService.retrieveTechniquesForTactic;
    }

    if (!stixId) {
        const error = new Error(errors.missingParameter);
        error.parameterName = 'stixId';
        return callback(error);
    }

    if (!modified) {
        const error = new Error(errors.missingParameter);
        error.parameterName = 'modified';
        return callback(error);
    }
    
    Matrix.findOne({ 'stix.id': stixId, 'stix.modified': modified }, async function(err, matrix) {
        if (err) {
            if (err.name === 'CastError') {
                const error = new Error(errors.badlyFormattedParameter);
                error.parameterName = 'stixId';
                return callback(error);
            }
            else {
                return callback(err);
            }
        }
        else {
            if (matrix) {
                // get tactics, then query for techniques and sub-techniques
                const options = { versions: 'latest', offset: 0, limit: 0 };
                let tactics_techniques = {};
                for (const tactic_id of matrix['stix']['tactic_refs']) {
                    let tactic = await retrieveTacticById(tactic_id, options);
                    if (tactic) {
                        tactic = tactic[0];
                        let techniques = await retrieveTechniquesForTactic(tactic_id, tactic['stix']['modified'], options);
                        // Organize sub-techniques under super techniques
                        let super_techniques = [];
                        let sub_techniques = [];
                        for (const technique of techniques) {
                            if (technique['stix']['x_mitre_is_subtechnique'] === false) {
                                super_techniques.push(technique);
                            }
                            else {
                                sub_techniques.push(technique);
                            }
                        }
                        for (const super_technique of super_techniques) {
                            super_technique['subtechniques'] = [];
                            for (const sub_technique of sub_techniques) {
                                if (sub_technique['workspace']['attack_id'].split(".")[0]  === super_technique['workspace']['attack_id']) {
                                    super_technique['subtechniques'].push(sub_technique);
                                }
                            }
                        }
                        // Add techniques to tactic
                        tactic['techniques'] = super_techniques;
                        tactics_techniques[tactic['stix']['name']] = tactic;
                    }
                }
                return callback(null, tactics_techniques);
            }
            else {
                console.log('** NOT FOUND');
                return callback();
            }
        }
    });
};

exports.createIsAsync = true;
exports.create = async function(data, options) {
    // This function handles two use cases:
    //   1. This is a completely new object. Create a new object and generate the stix.id if not already
    //      provided. Set both stix.created_by_ref and stix.x_mitre_modified_by_ref to the organization identity.
    //   2. This is a new version of an existing object. Create a new object with the specified id.
    //      Set stix.x_mitre_modified_by_ref to the organization identity.

    // Create the document
    const matrix = new Matrix(data);

    options = options || {};
    if (!options.import) {
        // Set the ATT&CK Spec Version
        matrix.stix.x_mitre_attack_spec_version = matrix.stix.x_mitre_attack_spec_version ?? config.app.attackSpecVersion;

        // Record the user account that created the object
        if (options.userAccountId) {
            matrix.workspace.workflow.created_by_user_account = options.userAccountId;
        }

        // Set the default marking definitions
        await attackObjectsService.setDefaultMarkingDefinitions(matrix);

        // Get the organization identity
        const organizationIdentityRef = await systemConfigurationService.retrieveOrganizationIdentityRef();

        // Check for an existing object
        let existingObject;
        if (matrix.stix.id) {
            existingObject = await Matrix.findOne({ 'stix.id': matrix.stix.id });
        }

        if (existingObject) {
            // New version of an existing object
            // Only set the x_mitre_modified_by_ref property
            matrix.stix.x_mitre_modified_by_ref = organizationIdentityRef;
        }
        else {
            // New object
            // Assign a new STIX id if not already provided
            matrix.stix.id = matrix.stix.id || `x-mitre-matrix--${uuid.v4()}`;

            // Set the created_by_ref and x_mitre_modified_by_ref properties
            matrix.stix.created_by_ref = organizationIdentityRef;
            matrix.stix.x_mitre_modified_by_ref = organizationIdentityRef;
        }
    }

    // Save the document in the database
    try {
        const savedMatrix = await matrix.save();
        return savedMatrix;
    }
    catch (err) {
        if (err.name === 'MongoServerError' && err.code === 11000) {
            // 11000 = Duplicate index
            const error = new Error(errors.duplicateId);
            throw error;
        }
        else {
            throw err;
        }
    }
};

exports.updateFull = function(stixId, stixModified, data, callback) {
    if (!stixId) {
        const error = new Error(errors.missingParameter);
        error.parameterName = 'stixId';
        return callback(error);
    }

    if (!stixModified) {
        const error = new Error(errors.missingParameter);
        error.parameterName = 'modified';
        return callback(error);
    }

    Matrix.findOne({ 'stix.id': stixId, 'stix.modified': stixModified }, function(err, document) {
        if (err) {
            if (err.name === 'CastError') {
                var error = new Error(errors.badlyFormattedParameter);
                error.parameterName = 'stixId';
                return callback(error);
            }
            else {
                return callback(err);
            }
        }
        else if (!document) {
            // document not found
            return callback(null);
        }
        else {
            // Copy data to found document and save
            Object.assign(document, data);
            document.save(function(err, savedDocument) {
                if (err) {
                    if (err.name === 'MongoServerError' && err.code === 11000) {
                        // 11000 = Duplicate index
                        var error = new Error(errors.duplicateId);
                        return callback(error);
                    }
                    else {
                        return callback(err);
                    }
                }
                else {
                    return callback(null, savedDocument);
                }
            });
        }
    });
};

exports.deleteVersionById = function (stixId, stixModified, callback) {
    if (!stixId) {
        const error = new Error(errors.missingParameter);
        error.parameterName = 'stixId';
        return callback(error);
    }

    if (!stixModified) {
        const error = new Error(errors.missingParameter);
        error.parameterName = 'modified';
        return callback(error);
    }

    Matrix.findOneAndRemove({ 'stix.id': stixId, 'stix.modified': stixModified }, function (err, matrix) {
        if (err) {
            return callback(err);
        } else {
            //Note: matrix is null if not found
            return callback(null, matrix);
        }
    });
};

exports.deleteById = function (stixId, callback) {
    if (!stixId) {
        const error = new Error(errors.missingParameter);
        error.parameterName = 'stixId';
        return callback(error);
    }

    Matrix.deleteMany({ 'stix.id': stixId }, function (err, matrix) {
        if (err) {
            return callback(err);
        } else {
            //Note: matrix is null if not found
            return callback(null, matrix);
        }
    });
};



