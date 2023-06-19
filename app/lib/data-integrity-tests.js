'use strict';

const attackObjectsService = require('../services/attack-objects-service');
const campaignsService = require('../services/campaigns-service');
const relationshipsService = require('../services/relationships-service');

const logger = require('./logger');

const Ajv2020 = require('ajv/dist/2020');
const util = require('util');
const fs = require('fs');
const path = require('path');

const ajv = new Ajv2020({ strict: false, allErrors: true });

function createAndLogIssue(rule, object, options) {
    const issue =  {
        rule,
        objectRef: {
            id: object.stix.id,
            modified: object.stix.modified
        }
    };

    if (!options.objectRefsOnly) {
        issue.object = object;
    }

    if (options.logIssues) {
        logger.verbose(`data integrity issue: ${issue.rule} ${issue.objectRef.id}`);
    }

    return issue;
}

exports.revokedObjectsHaveRevokedByRelationships = async function(options) {
    // Every revoked object must have a corresponding revoked-by relationship
    //   - The revoked-by relationship must not be deprecated or revoked
    const attackObjects = await attackObjectsService.retrieveAll({ versions: 'latest', includeRevoked: true });
    const revokedAttackObjects = attackObjects.filter(o => o.stix.revoked);

    const relationships = await relationshipsService.retrieveAll({ versions: 'latest', includeDeprecated: true, includeRevoked: true });
    const sourceObjectMap = new Map();
    for (const relationship of relationships) {
        if (relationship.stix.relationship_type === 'revoked-by') {
            sourceObjectMap.set(relationship.stix.source_ref, relationship);
        }
    }

    const issues = [];
    for (const attackObject of revokedAttackObjects) {
        const revokingRelationship = sourceObjectMap.get(attackObject.stix.id);
        if (!revokingRelationship) {
            const issue = createAndLogIssue('revoked-object-missing-revoked-by-relationship', attackObject, options);
            issues.push(issue);
        }
        else if (revokingRelationship.stix.revoked) {
            const issue = createAndLogIssue('revoked-object-has-revoked-revoked-by-relationship', attackObject, options);
            issues.push(issue);
        }
        else if (revokingRelationship.stix.x_mitre_deprecated) {
            const issue = createAndLogIssue('revoked-object-has-deprecated-revoked-by-relationship', attackObject, options);
            issues.push(issue);
        }
    }

    return issues;
}

exports.noDeprecatedRelationships = async function(options) {
    // Relationships may not be deprecated
    const relationships = await relationshipsService.retrieveAll({ versions: 'latest', includeDeprecated: true, includeRevoked: true });

    const issues = [];
    for (const relationship of relationships) {
        if (relationship.stix.x_mitre_deprecated) {
            const issue = createAndLogIssue('no-deprecated-relationships', relationship, options);
            issues.push(issue);
        }
    }

    return issues;
}

exports.noRevokedRelationships = async function(options) {
    // Relationships may not be revoked
    const relationships = await relationshipsService.retrieveAll({ versions: 'latest', includeDeprecated: true, includeRevoked: true });

    const issues = [];
    for (const relationship of relationships) {
        if (relationship.stix.revoked) {
            const issue = createAndLogIssue('no-revoked-relationships', relationship, options);
            issues.push(issue);
        }
    }

    return issues;
}

exports.modifiedNotBeforeCreated = async function(options) {
    // The modified property must be the same as or later than the created property
    const attackObjects = await attackObjectsService.retrieveAll({ versions: 'latest', includeRevoked: true });

    const issues = [];
    for (const attackObject of attackObjects) {
        if (attackObject.stix.type !== 'marking-definition') {
            try {
                if (attackObject.stix.created.getTime() > attackObject.stix.modified.getTime()) {
                    const issue = createAndLogIssue('modified-not-before-created', attackObject, options);
                    issues.push(issue);
                }
            }
            catch(err) {
                logger.warn(`Error during data integrity test for object ${ attackObject.stix.id }: ${ err.message }`);
                const issue = createAndLogIssue('error-while-testing-object', attackObject, options);
                issues.push(issue);
            }
        }
    }

    return issues;
}

function fixSchemaRef(schema) {
    const schemaRefUrl = new URL(schema.$schema);
    schemaRefUrl.protocol = 'https';
    schema.$schema = schemaRefUrl.href;
}

fs.readdirSync(path.join(__dirname, '../../stix-json-schemas/common')).forEach(function(filename) {
    if (filename.endsWith('.json')) {
        const schema = require(path.join('../../stix-json-schemas/common', filename));
        fixSchemaRef(schema);
        ajv.addSchema(schema);
    }
});

const campaignSchema = require('../../stix-json-schemas/sdos/campaign.json');
fixSchemaRef(campaignSchema);
ajv.addSchema(campaignSchema);

const attackCampaignSchema = require('../../attack-json-schemas/campaign.json');
ajv.addSchema(attackCampaignSchema);

const retrieveAllCampaigns = util.promisify(campaignsService.retrieveAll);
exports.campaignConformsToSchema = async function(options) {
    const campaignValidator = ajv.getSchema('https://mitre.org/attack-workbench/attack-workbench-rest-api/attackSpec3.1.0/attack-json-schemas/campaign.json');

    const campaigns = await retrieveAllCampaigns({ versions: 'latest', includeRevoked: true, includeDeprecated: true });
    console.log(`retrieved ${ campaigns.length } campaigns`)
    for (const campaign of campaigns) {
        if (campaign.stix.x_mitre_contributors.length === 0) {
            delete campaign.stix.x_mitre_contributors;
        }
        const valid = campaignValidator(JSON.parse(JSON.stringify(campaign.stix)));
        if (!valid) {
            console.log(campaign.stix.id);
            console.log(campaignValidator.errors);
            console.log(campaign.stix);
        }
    }
}
