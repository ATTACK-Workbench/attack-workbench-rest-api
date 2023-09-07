const AbstractRepository = require('../repository/repository.abstract');
const Team = require('../models/team-model'); // Import the Team model appropriately
const { DatabaseError } = require('../exceptions');

exports.findTeamsByUserId = async function (userAccountId, options) {
    const aggregation = [
        { $sort: { 'name': 1 } },
        { $match: { userIDs: { $in: [userAccountId] } } },
        {
            $facet: {
                totalCount: [{ $count: 'totalCount' }],
                documents: [
                    { $skip: options.offset || 0 },
                    ...options.limit ? [{ $limit: options.limit }] : []
                ]
            }
        }
    ];
    try {
        return await Team.aggregate(aggregation).exec();
    } catch (err) {
        throw new DatabaseError(err);
    }

};

/**
 * If a function is not directly found on the exports object in repository.abstract.js, 
 * JavaScript will look up its prototype chain to find it. If it exists on the abstractRepo, 
 * it will use that. This effectively allows the concrete repository to "inherit" methods 
 * from the abstract repository.
 */
Object.setPrototypeOf(exports, AbstractRepository);