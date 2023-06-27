'use strict';

const mongoose = require('mongoose');
const AttackObject = require('./attack-object-model');

const stixAsset = {
    // STIX asset specific properties
    modified: { type: Date, required: true },
    name: { type: String, required: true },
    description: String,

    // ATT&CK custom stix properties
    x_mitre_modified_by_ref: String,
    x_mitre_platforms: [ String ],
    x_mitre_deprecated: Boolean,
    x_mitre_domains: [ String ],
    x_mitre_version: String,
    x_mitre_attack_spec_version: String,
    x_mitre_contributors: [ String ],
    x_mitre_aliases: [ String ],
};

// Create the definition
const softwareDefinition = {
    stix: {
        ...stixMalware
    }
};

// Create the schema
const softwareSchema = new mongoose.Schema(softwareDefinition);

// Create the model
const SoftwareModel = AttackObject.discriminator('Software', softwareSchema);

module.exports = SoftwareModel;
