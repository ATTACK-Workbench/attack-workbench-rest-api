'use strict';

const uuid = require('uuid');
const userAccountsRepository = require('../repository/user-accounts-repository');
const teamsRepository = require('../repository/teams-repository');
const logger = require('../lib/logger');
const { MissingParameterError, DuplicateEmailError, NotFoundError } = require('../exceptions');


const addEffectiveRole = function (userAccount) {
  // Initially, this forces all pending and inactive accounts to have the role 'none'.
  // TBD: Make the role configurable
  if (userAccount?.status === 'pending' || userAccount?.status === 'inactive') {
      userAccount.role = 'none';
  }
}
// We separate the exports statement because the functions are used in this module
exports.addEffectiveRole = this.addEffectiveRole;

const userAccountAsIdentity = function (userAccount) {
  return {
      type: 'identity',
      spec_version: '2.1',
      id: userAccount.id,
      created: userAccount.created,
      modified: userAccount.modified,
      name: userAccount.displayName,
      identity_class: 'individual'
  }
}
exports.userAccountAsIdentity = userAccountAsIdentity;

exports.retrieveAll = async function (options) {

    let results;
    try {
        results = await userAccountsRepository.findAll(options);
    } catch (err) {
        logger.error('Failed to retrieve records from the userAccounts repository');
        throw err; // Let the DatabaseError bubble up
    }

    const userAccounts = results[0].documents;
        userAccounts.forEach(userAccount => {
            addEffectiveRole(userAccount);
            if (options.includeStixIdentity) {
                userAccount.identity = userAccountAsIdentity(userAccount);
            }
        });

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
                data: userAccounts
            };
            return returnValue;
        } else {
            return userAccounts;
        }
};

exports.retrieveById = async function (userAccountId, options) {
    if (!userAccountId) {
        throw new MissingParameterError({ parameterName: 'stixId' });
    }

    try {
        const userAccount = await userAccountsRepository.findOneById(userAccountId);

        if (!userAccount) {
            throw new NotFoundError({ message: 'UserAccount not found' });
        }

        addEffectiveRole(userAccount);
        if (options & options.includeStixIdentity) {
            userAccount.identity = userAccountAsIdentity(userAccount);
        }

        return userAccount;

    } catch (err) {
        logger.error('Failed to retrieve user account by ID');
        throw err;
    }
};

exports.retrieveByEmail = async function(email) {
    if (!email) {
        throw new MissingParameterError({ parameterName: 'email' });
    }

    try {
        const userAccount = await userAccountsRepository.findOneByEmail(email);
        if (!userAccount) {
            const error = 'UserAccount not found for the provided email.';
            logger.error(error);
            throw new NotFoundError({ message: error });
        }

        addEffectiveRole(userAccount);

        return userAccount;
    }
    catch(err) {
        logger.error('Failed to retrieve user account by email');
        throw err;
    }
};

exports.createIsAsync = true;
exports.create = async function(data) {
    // Check for a duplicate email
    if (data.email) {
        const existingUserAccount = await userAccountsRepository.findByEmail(data.email);
        if (existingUserAccount) {
            throw new DuplicateEmailError();
        }
    }

    // Create the document
    const userAccount = {
        ...data,
        id: data.id || `identity--${uuid.v4()}`,
        created: data.created || new Date().toISOString(),
        modified: data.modified || (data.created || new Date().toISOString())
    };

    // Save the document in the database
    try {
        const savedUserAccount = await userAccountsRepository.save(userAccount);
        addEffectiveRole(savedUserAccount);

        return savedUserAccount;
    } 
    catch (err) {
        logger.error('Failed to save user account');
        throw err;
    }
};

exports.updateFull = async function (userAccountId, data) {
    if (!userAccountId) {
        throw new MissingParameterError({ parameterName: 'userId' });
    }

    try {
        const updatedDocument = await userAccountsRepository.updateById(userAccountId, data);
        return updatedDocument;

    } catch (err) {
        logger.error('Function "updateFull" failed to update user account by ID');
        throw err;
    }
};

exports.delete = async function (userAccountId) {
    if (!userAccountId) {
        throw MissingParameterError({ parameterName: 'userId' });
    }

    try {
        return await userAccountsRepository.removeById(userAccountId);
    } catch (err) {
        logger.error('Function "delete" failed to remove user account by ID');
        throw err;
    }
};

async function getLatest(userAccountId) {
    const userAccount = await userAccountsRepository.findOneById(userAccountId);
    addEffectiveRole(userAccount);

    return userAccount;
}

const addCreatedByUserAccount = async function (attackObject) {
    if (attackObject?.workspace?.workflow?.created_by_user_account) {
        try {
            // eslint-disable-next-line require-atomic-updates
            attackObject.created_by_user_account = await getLatest(attackObject.workspace.workflow.created_by_user_account);
        }
        catch(err) {
            // Ignore lookup errors
        }
    }
}
exports.addCreatedByUserAccount = addCreatedByUserAccount;

exports.addCreatedByUserAccountToAll = async function(attackObjects) {
    for (const attackObject of attackObjects) {
        // eslint-disable-next-line no-await-in-loop
        await addCreatedByUserAccount(attackObject);
    }
}

exports.retrieveTeamsByUserId = async function (userAccountId, options) {
    if (!userAccountId) {
        throw new MissingParameterError({ parameterName: 'userId' });
    }

    try {
        const results = await teamsRepository.findTeamsByUserId(userAccountId, options);

        if (options.includePagination) {
            let derivedTotalCount = 0;
            if (results.totalCount.length > 0) {
                derivedTotalCount = results.totalCount[0].totalCount;
            }
            const returnValue = {
                pagination: {
                    total: derivedTotalCount,
                    offset: options.offset,
                    limit: options.limit
                },
                data: results.documents
            };
            return returnValue;
        } else {
            return results.documents;
        }
    } catch (err) {
        logger.error('Function "retrieveTeamsByUserId" failed to find teams by user ID');
        throw err;
    }
};