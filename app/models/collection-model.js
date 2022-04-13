'use strict';

const mongoose = require('mongoose');
const AttackObject = require('./attack-object-model');
const workspaceDefinitions = require('./subschemas/workspace');

const xMitreContent = {
    object_ref: { type: String, required: true, trim: true },
    object_modified : { type: Date, required: true, trim: true }
};
const xMitreContentSchema = new mongoose.Schema(xMitreContent, { _id: false });

const xMitreCollection = {
    modified: { type: Date, required: true },
    name: { type: String, required: true, trim: true  },
    description: { type: String, trim: true },

    x_mitre_modified_by_ref: { type: String, trim: true },
    x_mitre_contents: [ xMitreContentSchema ],
    x_mitre_deprecated: Boolean,
    x_mitre_domains: [ { type: String, trim: true } ],
    x_mitre_version: { type: String, trim: true },
    x_mitre_attack_spec_version: { type: String, trim: true }
};

// Create the definition
const collectionDefinition = {
    workspace: {
        ...workspaceDefinitions.collection
    },
    stix: {
        ...xMitreCollection
    }
};

// Create the schema
const collectionSchema = new mongoose.Schema(collectionDefinition);

// Create the model
const CollectionModel = AttackObject.discriminator('Collection', collectionSchema);

module.exports = CollectionModel;
