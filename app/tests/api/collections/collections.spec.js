const request = require('supertest');
const expect = require('expect');
const _ = require('lodash');

const logger = require('../../../lib/logger');
logger.level = 'debug';

const database = require('../../../lib/database-in-memory')

// modified and created properties will be set before calling REST API
const initialCollectionData = {
    workspace: {
        imported: new Date().toISOString(),
        import_categories: {
            additions: [],
            changes: [],
            minor_changes: [],
            revocations: [],
            deprecations: [],
            supersedes_user_edits: [],
            supersedes_collection_changes: [],
            duplicates: [],
            out_of_date: [],
            errors: []
        }
    },
    stix: {
        id: 'x-mitre-collection--30ee11cf-0a05-4d9e-ab54-9b8563669647',
        name: 'collection-1',
        spec_version: '2.1',
        type: 'x-mitre-collection',
        description: 'This is a collection.',
        external_references: [
            { source_name: 'source-1', external_id: 's1' }
        ],
        object_marking_refs: [ 'marking-definition--fa42a846-8d90-4e51-bc29-71d5b4802168' ],
        created_by_ref: "identity--c78cb6e5-0c4b-4611-8297-d1b8b55e40b5",
        x_mitre_contents: []
    }
};

const mitigationData = {
    workspace: {
        workflow: {
            state: 'work-in-progress'
        }
    },
    stix: {
        name: 'course-of-action-1',
        spec_version: '2.1',
        type: 'course-of-action',
        description: 'This is a mitigation.',
        external_references: [
            { source_name: 'mitre-attack', external_id: 'T9999', url: 'https://attack.mitre.org/mitigations/T9999' },
            { source_name: 'source-1', external_id: 's1' }
        ],
        object_marking_refs: [ 'marking-definition--fa42a846-8d90-4e51-bc29-71d5b4802168' ],
        created_by_ref: "identity--c78cb6e5-0c4b-4611-8297-d1b8b55e40b5",
        x_mitre_version: "1.1"
    }
};

const softwareData = {
    workspace: {
        workflow: {
            state: 'work-in-progress'
        }
    },
    stix: {
        name: 'software-1',
        spec_version: '2.1',
        type: 'malware',
        description: 'This is a malware type of software.',
        is_family: false,
        external_references: [
            { source_name: 'mitre-attack', external_id: 'S3333', url: 'https://attack.mitre.org/software/S3333' },
            { source_name: 'source-1', external_id: 's1' }
        ],
        object_marking_refs: [ 'marking-definition--fa42a846-8d90-4e51-bc29-71d5b4802168' ],
        created_by_ref: "identity--c78cb6e5-0c4b-4611-8297-d1b8b55e40b5",
        x_mitre_version: "1.1",
        x_mitre_aliases: [
            "software-1"
        ],
        x_mitre_platforms: [
            "platform-1"
        ],
        x_mitre_contributors: [
            "contributor-1",
            "contributor-2"
        ],
        x_mitre_domains: [
            "mobile-attack"
        ]
    }
};

describe('Collections (x-mitre-collection) Basic API', function () {
    let app;

    before(async function() {
        // Establish the database connection
        // Use an in-memory database that we spin up for the test
        await database.initializeConnection();

        // Initialize the express app
        app = await require('../../../index').initializeApp();
    });

    it('POST /api/mitigations creates a mitigation', function (done) {
        const timestamp = new Date().toISOString();
        mitigationData.stix.created = timestamp;
        mitigationData.stix.modified = timestamp;
        const body = mitigationData;
        request(app)
            .post('/api/mitigations')
            .send(body)
            .set('Accept', 'application/json')
            .expect(201)
            .expect('Content-Type', /json/)
            .end(function(err, res) {
                if (err) {
                    done(err);
                }
                else {
                    // We expect to get the created mitigation
                    const mitigation = res.body;
                    expect(mitigation).toBeDefined();
                    expect(mitigation.stix).toBeDefined();
                    expect(mitigation.stix.id).toBeDefined();

                    // Add this object to the collection data
                    const contentsObject = {
                        object_ref: mitigation.stix.id,
                        object_modified: mitigation.stix.modified
                    }
                    initialCollectionData.stix.x_mitre_contents.push(contentsObject);

                    done();
                }
            });
    });

    it('POST /api/software creates a software', function (done) {
        const timestamp = new Date().toISOString();
        softwareData.stix.created = timestamp;
        softwareData.stix.modified = timestamp;
        const body = softwareData;
        request(app)
            .post('/api/software')
            .send(body)
            .set('Accept', 'application/json')
            .expect(201)
            .expect('Content-Type', /json/)
            .end(function(err, res) {
                if (err) {
                    done(err);
                }
                else {
                    // We expect to get the created software
                    const software = res.body;
                    expect(software).toBeDefined();
                    expect(software.stix).toBeDefined();
                    expect(software.stix.id).toBeDefined();

                    // Add this object to the collection data
                    const contentsObject = {
                        object_ref: software.stix.id,
                        object_modified: software.stix.modified
                    }
                    initialCollectionData.stix.x_mitre_contents.push(contentsObject);

                    done();
                }
            });
    });

    it('GET /api/collections returns an empty array of collections', function (done) {
        request(app)
            .get('/api/collections')
            .set('Accept', 'application/json')
            .expect(200)
            .expect('Content-Type', /json/)
            .end(function (err, res) {
                if (err) {
                    done(err);
                } else {
                    // We expect to get an empty array
                    const collections = res.body;
                    expect(collections).toBeDefined();
                    expect(Array.isArray(collections)).toBe(true);
                    expect(collections.length).toBe(0);
                    done();
                }
            });
    });

    it('POST /api/collections does not create an empty collection', function (done) {
        const body = {};
        request(app)
            .post('/api/collections')
            .send(body)
            .set('Accept', 'application/json')
            .expect(400)
            .end(function (err, res) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    let collection1;
    it('POST /api/collections creates a collection', function (done) {
        const timestamp = new Date().toISOString();
        initialCollectionData.stix.created = timestamp;
        initialCollectionData.stix.modified = timestamp;
        const body = initialCollectionData;
        request(app)
            .post('/api/collections')
            .send(body)
            .set('Accept', 'application/json')
            .expect(201)
            .expect('Content-Type', /json/)
            .end(function (err, res) {
                if (err) {
                    done(err);
                } else {
                    // We expect to get the created collection
                    collection1 = res.body;
                    expect(collection1).toBeDefined();
                    expect(collection1.stix).toBeDefined();
                    expect(collection1.stix.id).toBeDefined();
                    expect(collection1.stix.created).toBeDefined();
                    expect(collection1.stix.modified).toBeDefined();
                    done();
                }
            });
    });

    it('GET /api/collections returns the added collection', function (done) {
        request(app)
            .get('/api/collections')
            .set('Accept', 'application/json')
            .expect(200)
            .expect('Content-Type', /json/)
            .end(function (err, res) {
                if (err) {
                    done(err);
                } else {
                    // We expect to get one collection in an array
                    const collections = res.body;
                    expect(collections).toBeDefined();
                    expect(Array.isArray(collections)).toBe(true);
                    expect(collections.length).toBe(1);
                    done();
                }
            });
    });

    it('GET /api/collections/:id should not return a collection when the id cannot be found', function (done) {
        request(app)
            .get('/api/collections/not-an-id')
            .set('Accept', 'application/json')
            .expect(404)
            .end(function (err, res) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it('GET /api/collections/:id returns the added collection', function (done) {
        request(app)
            .get('/api/collections/' + collection1.stix.id)
            .set('Accept', 'application/json')
            .expect(200)
            .expect('Content-Type', /json/)
            .end(function (err, res) {
                if (err) {
                    done(err);
                } else {
                    // We expect to get one collection in an array
                    const collections = res.body;
                    expect(collections).toBeDefined();
                    expect(Array.isArray(collections)).toBe(true);
                    expect(collections.length).toBe(1);

                    const collection = collections[0];
                    expect(collection).toBeDefined();
                    expect(collection.stix).toBeDefined();
                    expect(collection.stix.id).toBe(collection1.stix.id);
                    expect(collection.stix.type).toBe(collection1.stix.type);
                    expect(collection.stix.name).toBe(collection1.stix.name);
                    expect(collection.stix.description).toBe(collection1.stix.description);
                    expect(collection.stix.spec_version).toBe(collection1.stix.spec_version);
                    expect(collection.stix.object_marking_refs).toEqual(expect.arrayContaining(collection1.stix.object_marking_refs));
                    expect(collection.stix.created_by_ref).toBe(collection1.stix.created_by_ref);

                    expect(collection.contents).toBeUndefined();

                    done();
                }
            });
    });

    it('GET /api/collections/:id with retrieveContents flag returns the added collection with contents', function (done) {
        request(app)
            .get('/api/collections/' + collection1.stix.id + '?retrieveContents=true')
            .set('Accept', 'application/json')
            .expect(200)
            .expect('Content-Type', /json/)
            .end(function (err, res) {
                if (err) {
                    done(err);
                } else {
                    // We expect to get one collection in an array
                    const collections = res.body;
                    expect(collections).toBeDefined();
                    expect(Array.isArray(collections)).toBe(true);
                    expect(collections.length).toBe(1);

                    const collection = collections[0];
                    expect(collection).toBeDefined();
                    expect(collection.stix).toBeDefined();
                    expect(collection.stix.id).toBe(collection1.stix.id);
                    expect(collection.stix.type).toBe(collection1.stix.type);
                    expect(collection.stix.name).toBe(collection1.stix.name);
                    expect(collection.stix.description).toBe(collection1.stix.description);
                    expect(collection.stix.spec_version).toBe(collection1.stix.spec_version);
                    expect(collection.stix.object_marking_refs).toEqual(expect.arrayContaining(collection1.stix.object_marking_refs));
                    expect(collection.stix.created_by_ref).toBe(collection1.stix.created_by_ref);

                    expect(collection.contents).toBeDefined();
                    expect(Array.isArray(collection.contents)).toBe(true);
                    expect(collection.contents.length).toBe(2);

                    done();
                }
            });
    });

    it('POST /api/collections does not create a collection with the same id and modified date', function (done) {
        const body = collection1;
        request(app)
            .post('/api/collections')
            .send(body)
            .set('Accept', 'application/json')
            .expect(409)
            .end(function (err, res) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    let collection2;
    it('POST /api/collections should create a new version of a collection with a duplicate stix.id but different stix.modified date', function (done) {
        collection2 = _.cloneDeep(collection1);
        collection2._id = undefined;
        collection2.__t = undefined;
        collection2.__v = undefined;
        const timestamp = new Date().toISOString();
        collection2.stix.modified = timestamp;
        const body = collection2;
        request(app)
            .post('/api/collections')
            .send(body)
            .set('Accept', 'application/json')
            .expect(201)
            .expect('Content-Type', /json/)
            .end(function (err, res) {
                if (err) {
                    done(err);
                } else {
                    // We expect to get the created collection
                    const collection = res.body;
                    expect(collection).toBeDefined();
                    done();
                }
            });
    });

    it('GET /api/collections/:id returns the latest added collection', function (done) {
        request(app)
            .get('/api/collections/' + collection2.stix.id)
            .set('Accept', 'application/json')
            .expect(200)
            .expect('Content-Type', /json/)
            .end(function (err, res) {
                if (err) {
                    done(err);
                } else {
                    // We expect to get one collection in an array
                    const collections = res.body;
                    expect(collections).toBeDefined();
                    expect(Array.isArray(collections)).toBe(true);
                    expect(collections.length).toBe(1);
                    const collection = collections[0];
                    expect(collection.stix.id).toBe(collection2.stix.id);
                    expect(collection.stix.modified).toBe(collection2.stix.modified);
                    done();
                }
            });
    });

    it('GET /api/collections/:id/modified/:modified returns the proper collection', function (done) {
        request(app)
            .get('/api/collections/' + collection1.stix.id + '/modified/' + collection1.stix.modified)
            .set('Accept', 'application/json')
            .expect(200)
            .expect('Content-Type', /json/)
            .end(function (err, res) {
                if (err) {
                    done(err);
                } else {
                    // We expect to get one collection
                    const collection = res.body;
                    expect(collection).toBeDefined();
                    expect(collection.stix).toBeDefined();
                    expect(collection.stix.id).toBe(collection1.stix.id);
                    expect(collection.stix.modified).toBe(collection1.stix.modified);
                    done();
                }
            });
    });

    it('GET /api/collections/:id/modified/:modified with retrieveContents flag returns the added collection with contents', function (done) {
        request(app)
            .get('/api/collections/' + collection1.stix.id + '/modified/' + collection1.stix.modified + '?retrieveContents=true')
            .set('Accept', 'application/json')
            .expect(200)
            .expect('Content-Type', /json/)
            .end(function (err, res) {
                if (err) {
                    done(err);
                } else {
                    // We expect to get one collection
                    const collection = res.body;
                    expect(collection).toBeDefined();
                    expect(collection.stix).toBeDefined();
                    expect(collection.stix.id).toBe(collection1.stix.id);
                    expect(collection.stix.modified).toBe(collection1.stix.modified);

                    expect(collection.contents).toBeDefined();
                    expect(Array.isArray(collection.contents)).toBe(true);
                    expect(collection.contents.length).toBe(2);
                    done();
                }
            });
    });

    it('GET /api/collections returns all added collections', function (done) {
        request(app)
            .get('/api/collections/' + collection1.stix.id + '?versions=all')
            .set('Accept', 'application/json')
            .expect(200)
            .expect('Content-Type', /json/)
            .end(function (err, res) {
                if (err) {
                    done(err);
                } else {
                    // We expect to get two collections in an array
                    const collections = res.body;
                    expect(collections).toBeDefined();
                    expect(Array.isArray(collections)).toBe(true);
                    expect(collections.length).toBe(2);
                    done();
                }
            });
    });

    after(async function() {
        await database.closeConnection();
    });
});
