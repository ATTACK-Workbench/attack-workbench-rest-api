const AbstractRepository = require('./repository.abstract');
const UserAccount = require('../models/user-account-model');
const regexValidator = require('../lib/regex');
const { DatabaseError, BadlyFormattedParameterError, DuplicateIdError } = require('../exceptions');

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
        if (err.name === 'CastError') {
            throw new BadlyFormattedParameterError({ parameterName: 'stixId' });
        } else if (err.name === 'MongoServerError' && err.code === 11000) {
            throw new DuplicateIdError(err);
        }
        throw new DatabaseError(err);
    }
};

exports.findOneByEmail = async function (email) {
    try {
        return await UserAccount.findOne({ 'email': email }).lean().exec();
    } catch (err) {
        if (err.name === 'CastError') {
            throw BadlyFormattedParameterError({ parameterName: 'email' });
        }
        throw DatabaseError(err);
    }
};

exports.findByEmail = async function (email) {
    try {
        return await UserAccount.findOne({ 'email': email }).lean().exec();
    } catch (err) {
        throw DatabaseError(err);
    }
};

exports.save = async function (userAccountData) {
    try {
        const userAccount = new UserAccount(userAccountData);
        return await userAccount.save();
    } catch (err) {
        if (err.name === 'MongoServerError' && err.code === 11000) {
            // 11000 = Duplicate index
            throw DuplicateIdError(err);
        }
        throw DatabaseError(err);
    }
};

exports.updateById = async function (userAccountId, data) {
    try {
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
        return await document.save();
    } catch (err) {
        if (err.name === 'CastError') {
            throw BadlyFormattedParameterError(err);
        }
        else if (err.name === 'MongoServerError' && err.code === 11000) {
            // 11000 = Duplicate index
            throw DuplicateIdError(err);
        }
        throw DatabaseError(err);
    }
};

exports.removeById = async function (userAccountId) {
    try {
        return await UserAccount.findOneAndRemove({ 'id': userAccountId }).exec();
    } catch (err) {
        throw DatabaseError(err);
    }
};


/**
 * If a function is not directly found on the exports object in repository.abstract.js, 
 * JavaScript will look up its prototype chain to find it. If it exists on the abstractRepo, 
 * it will use that. This effectively allows the concrete repository to "inherit" methods 
 * from the abstract repository.
 */
Object.setPrototypeOf(exports, AbstractRepository);