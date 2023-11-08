'use strict';

const BaseRepository = require('./_base.repository');
const Technique = require('../models/technique-model');

class TechniquesRepository extends BaseRepository { }

module.exports = new TechniquesRepository(Technique);
