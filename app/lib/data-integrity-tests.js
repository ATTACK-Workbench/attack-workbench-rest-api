'use strict';

const attackObjectsService = require('../services/attack-objects-service');
const relationshipsService = require('../services/relationships-service');

const logger = require('./logger');

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
