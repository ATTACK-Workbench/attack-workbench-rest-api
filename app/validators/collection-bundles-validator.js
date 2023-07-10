'use strict';

const semver = require('semver');
const config = require('../config/config');
const rules = {
    bundleMayNotHaveZeroCollections: 'bundleMayNotHaveZeroCollections',
    bundleMayNotHaveMoreThanOneCollection: 'bundleMayNotHaveMoreThanOneCollection',
    collectionMustHaveAnId: 'collectionMustHaveAnId',
    objectRefMustBeUnique: 'objectRefMustBeUnique',
    attackSpecVersionMustBeValid: 'attackSpecVersionMustBeValid',
};
exports.rules = rules;

function createIssue(rule, stixObject) {
    if (stixObject) {
        return {
            rule,
            objectRef: {
                id: stixObject.id,
                modified: stixObject.modified
            }
        };
    }
    else {
        return { rule };
    }
}

function makeKey(stixId, modified) {
    return stixId + '/' + modified;
}

// Default ATT&CK Spec version to use for objects that do not have x_mitre_attack_spec_version set
// This isn't saved, but is used for comparisons
const defaultAttackSpecVersion = '2.0.0';

exports.validateCollectionBundle = function(collectionBundle) {
    const issues = [];

    const collections = collectionBundle.objects.filter(object => object.type === 'x-mitre-collection');

    // The bundle must have one x-mitre-collection object
    if (collections.length === 0) {
        issues.push(createIssue(rules.bundleMayNotHaveZeroCollections));
    }
    else if (collections.length > 1) {
        issues.push(createIssue(rules.bundleMayNotHaveMoreThanOneCollection));
    }

    // The collection must have an id.
    if (collections.length > 0 && !collections[0].id) {
        issues.push(createIssue(rules.collectionMustHaveAnId));
    }

    // Validate the objects in the bundle
    const objectMap = new Map();
    for (const stixObject of collectionBundle.objects) {
        // Check for a duplicate object
        const key = makeKey(stixObject.id, stixObject.modified);
        if (objectMap.has(key)) {
            // Object already in map: duplicate STIX id and modified date
            issues.push(createIssue(rules.objectRefMustBeUnique, stixObject));
        } else {
            objectMap.set(makeKey(stixObject.id, stixObject.modified), stixObject);
        }

        // Check the ATT&CK Spec version
        const objectAttackSpecVersion = stixObject.x_mitre_attack_spec_version ?? defaultAttackSpecVersion;
        if (!semver.valid(objectAttackSpecVersion)) {
            // Object's ATT&CK Spec version isn't a correctly formatted semantic version
            issues.push(createIssue(rules.attackSpecVersionMustBeValid, stixObject));
        }
        else if (semver.gt(objectAttackSpecVersion, config.app.attackSpecVersion)) {
            // Object's ATT&CK Spec version is newer than system can process
            issues.push(createIssue(rules.attackSpecVersionMustBeValid, stixObject));
        }
    }

    return issues;
}

