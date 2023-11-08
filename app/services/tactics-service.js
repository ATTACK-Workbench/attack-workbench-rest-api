'use strict';

const config = require('../config/config');

const BaseService = require('./_base.service');
const techniquesService = require('./techniques-service');
const tacticsRepository = require('../repository/tactics-repository');

const {
    MissingParameterError,
    TechniquesServiceError } = require('../exceptions');


class TacticsService extends BaseService {

    static techniqueMatchesTactic(tactic) {
        return function(technique) {
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

    // Retrieve the techniques associated with the tactic (the tactic identified by stixId and modified date)
    async retrieveTechniquesForTactic(stixId, modified, options, callback) {
        if (BaseService.isCallback(arguments[arguments.length - 1])) {
            callback = arguments[arguments.length - 1];
        }

        if (!stixId) {
            throw new MissingParameterError({ parameterName: 'stixId' });
        }

        if (!modified) {
            throw new MissingParameterError({ parameterName: 'modified' });
        }

        let tactic;
        try {
            tactic = await this.repository.retrieveOneByVersion(stixId, modified);
        }
        catch (err) {
            if (callback) {
                return callback(err);
            }
            throw err;
        }

        // Note: document is null if not found
        if (!tactic) {
            if (callback) {
                return callback(null, null);
            }
            return null;
        }

        let allTechniques;
        try {
            allTechniques = await techniquesService.retrieveAll();
        } catch (err) {
            const techniquesServiceError = new TechniquesServiceError(err);
            if (callback) {
                return callback(techniquesServiceError);
            }
            throw techniquesServiceError;
        }

        const filteredTechniques = allTechniques.filter(this.techniqueMatchesTactic(tactic));
        const pagedResults = TacticsService.getPageOfData(filteredTechniques, options);
        const paginatedResults = BaseService.paginate(options, pagedResults);

        if (callback) {
            return callback(null, paginatedResults);
        }
        return paginatedResults;
    }

}

module.exports = new TacticsService('x-mitre-tactic', tacticsRepository);