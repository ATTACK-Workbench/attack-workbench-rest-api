const AbstractRepository = require('./repository.abstract');
const UserAccount = require('../models/user-account-model');
const regexValidator = require('../lib/regex');
const { DatabaseError, DuplicateIdError, BadlyFormattedParameterError } = require('../exceptions');

exports.findAll = async function (options) {
    // Build the query
    const query = {};
    if (typeof options.status !== 'undefined') {
        if (Array.isArray(options.status)) {
            query['status'] = { $in: options.status };
        }
        else {
            query['status'] = options.status;
        }
    }

    if (typeof options.role !== 'undefined') {
        if (Array.isArray(options.role)) {
            query['role'] = { $in: options.role };
        }
        else {
            query['role'] = options.role;
        }
    }

    // Build the aggregation
    // - Then apply query, skip, and limit options
    const aggregation = [
        { $sort: { 'username': 1 } },
        { $match: query }
    ];

    if (typeof options.search !== 'undefined') {
        options.search = regexValidator.sanitizeRegex(options.search);
        const match = {
            $match: {
                $or: [
                    { 'username': { '$regex': options.search, '$options': 'i' } },
                    { 'email': { '$regex': options.search, '$options': 'i' } },
                    { 'displayName': { '$regex': options.search, '$options': 'i' } }
                ]
            }
        };
        aggregation.push(match);
    }

    const facet = {
        $facet: {
            totalCount: [{ $count: 'totalCount' }],
            documents: []
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

    try {
        // Retrieve the documents
        return await UserAccount.aggregate(aggregation).exec();
    } catch (err) {
        throw new DatabaseError(err);
    }
};

exports.findOneById = async function (userAccountId) {
    try {
        // Note: The .lean().exec() parts are used in Mongoose for converting the returned document to a plain JavaScript object.
        // If you're not using Mongoose, you might not need them.
        return await UserAccount.findOne({ 'id': userAccountId }).lean().exec();
    } catch (err) {
        throw new DatabaseError(err);
    }
};

exports.findOneByEmail = function (email) {
    return UserAccount.findOne({ 'email': email }).lean().exec();
};

exports.findByEmail = function (email) {
    return UserAccount.findOne({ 'email': email }).lean().exec();
};

exports.save = function (userAccountData) {
    const userAccount = new UserAccount(userAccountData);
    return userAccount.save();
};

exports.updateById = async function (userAccountId, data) {
    const document = await UserAccount.findOne({ 'id': userAccountId });

    if (!document) {
        // document not found
        return null;
    }

    // Copy data to found document
    document.email = data.email;
    document.username = data.username;
    document.displayName = data.displayName;
    document.status = data.status;
    document.role = data.role;

    // Set the modified timestamp
    document.modified = new Date().toISOString();

    // Save and return the document
    return document.save();
};

exports.removeById = function (userAccountId) {
    return UserAccount.findOneAndRemove({ 'id': userAccountId }).exec();
};


/**
 * If a function is not directly found on the exports object in repository.abstract.js, 
 * JavaScript will look up its prototype chain to find it. If it exists on the abstractRepo, 
 * it will use that. This effectively allows the concrete repository to "inherit" methods 
 * from the abstract repository.
 */
Object.setPrototypeOf(exports, AbstractRepository);