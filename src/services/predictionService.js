const mlService = require('./mlService');

class PredictionService {
  getIndiaDistrictRisks(filters = {}) {
    return mlService.getDistrictRisks(filters);
  }

  getDistrictRisk(state, district) {
    return mlService.getDistrictRisk(state, district);
  }

  getHighestRiskDistricts(limit = 10) {
    return mlService.getHighestRiskDistricts(limit);
  }

  getAverageRiskByState() {
    return mlService.getAverageRiskByState();
  }

  getStatistics() {
    return mlService.getPredictionStatistics();
  }
}

module.exports = new PredictionService();
