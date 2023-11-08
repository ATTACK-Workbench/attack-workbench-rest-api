'use strict';

const BaseService = require('./_base.service');
const config = require('../config/config');
const techniquesRepository = require('../repository/techniques-repository');
const tacticsService = require('./tactics-service');

const { MissingParameterError, TacticsServiceError } = require('../exceptions');


class TechniquesService extends BaseService {

    static tacticMatchesTechnique(technique) {
        return function(tactic) {
            // A tactic matches if the technique has a kill chain phase such that:
            //   1. The phase's kill_chain_name matches one of the tactic's kill chain names (which are derived from the tactic's x_mitre_domains)
            //   2. The phase's phase_name matches the tactic's x_mitre_shortname

            // Convert the tactic's domain names to kill chain names
            const tacticKillChainNames = tactic.stix.x_mitre_domains.map(domain => config.domainToKillChainMap[domain]);
            return technique.stix.kill_chain_phases.some(phase => phase.phase_name === tactic.stix.x_mitre_shortname && tacticKillChainNames.includes(phase.kill_chain_name));
        }
    }

    static getPageOfData(data, options) {
        const startPos = options.offset;
        const endPos = (options.limit === 0) ? data.length : Math.min(options.offset + options.limit, data.length);

        return data.slice(startPos, endPos);
    }


    async retrieveTacticsForTechnique(stixId, modified, options, callback) {

        if (BaseService.isCallback(arguments[arguments.length - 1])) {
            callback = arguments[arguments.length - 1];
        }

        // Retrieve the tactics associated with the technique (the technique identified by stixId and modified date)
        if (!stixId) {
            const err = new MissingParameterError({ parameterName: 'stixId' });
            if (callback) {
                return callback(err);
            }
            throw err;
        }

        if (!modified) {
            const err = new MissingParameterError({ parameterName: 'modified' });
            if (callback) {
                return callback(err);
            }
            throw err;
        }

        let technique;
        try {
            // const technique = await Technique.findOne({ 'stix.id': stixId, 'stix.modified': modified });
            technique = await this.repository.retrieveOneByVersion(stixId, modified);
        }
        catch (err) {
            if (callback) {
                return callback(err);
            }
            throw err;
        }

        if (!technique) {
        // Note: document is null if not found
            if (callback) {
                return callback(null, null);
            }
            return null;
        }

        let allTactics;
        try {
            allTactics = await tacticsService.retrieveAll();
        } catch (err) {
            const tacticsServiceError = new TacticsServiceError(err);
            if (callback) {
                return callback(tacticsServiceError);
            }
            throw tacticsServiceError;
        }
        const filteredTactics = allTactics.filter(this.tacticMatchesTechnique(technique));
        const pagedResults = this.getPageOfData(filteredTactics, options);

        // if (options.includePagination) {
        //     const returnValue = {
        //         pagination: {
        //             total: pagedResults.length,
        //             offset: options.offset,
        //             limit: options.limit
        //         },
        //         data: pagedResults
        //     };
        //     return returnValue;
        // }
        // else {
        //     return pagedResults;
        // }

        const paginatedResults = BaseService.paginate(pagedResults);
        if (callback) {
            return callback(null, paginatedResults);
        }
        return paginatedResults;
    }

}
module.exports = new TechniquesService('x-mitre-technique', techniquesRepository);